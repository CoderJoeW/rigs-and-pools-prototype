import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

/* Mining is randomized (block arrival is drawn per-window), so these tests
   lean on large tick chunks against short-window chains rather than exact
   counts: Tessera's block window is well under two minutes for any rig-sized
   hashrate, so a single multi-hour tick should find many blocks with
   overwhelming probability, not flakily. */

describe('Tessera balance', () => {
  // mult is authoring-time only (used to derive `reward` by hand — see the
  // derivation comment in chains.js); revPerMh() never reads it at runtime,
  // so a mult comparison alone proves nothing about realized pay. This
  // drives the real simulation and compares the number a player actually
  // sees: Tessera should no longer be a strict giveaway (drastically better
  // than everything else, permanently, with zero competition), but it also
  // shouldn't fall below Nova — the chain deliberately designed to be the
  // ladder's worst payer (see chains.js: "the lowest pay per MH").
  it('settles to a realized rate comparable to the ladder, not the worst chain in it', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const nova = g.s.chains.find(c => c.id === 'nova');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
    for (let i = 0; i < 100; i++) g.stepTick(3600); // let price and difficulty settle

    expect(g.revPerMh(tessera)).toBeGreaterThan(g.revPerMh(nova));
  });

  it('the floor sits within reach of a modestly grown farm, not just a single rig forever', () => {
    // The lower-bound test above alone isn't enough: it's satisfied by the
    // OLD, over-powered numbers too (old Tessera also beat Nova on realized
    // rate), so on its own it wouldn't have caught what issue #2 is actually
    // about. A rank-based "is Tessera the best payer" check doesn't work
    // either — measured directly, Halcyon already realizes a higher rate
    // than Tessera under BOTH the old and the new numbers, so "not the max"
    // is true either way and proves nothing (the same vacuousness the first
    // version of this test had, from a different angle).
    //
    // What actually changed is whether the floor is reachable: under the
    // old floor (500) even two starter rigs' worth of hash (~384 MH) never
    // crossed it, so a farm that had genuinely grown — not just idled —
    // still never triggered the "you've outgrown this" advisory. The new
    // floor sits low enough that it does.
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    const oneRig = g.dp.mh;
    expect(oneRig * 2).toBeGreaterThan(tessera.floor);
  });
});

describe('solo block finding', () => {
  it('a rig mining solo on Tessera finds blocks and gets paid', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
    expect(g.totalHash).toBeGreaterThan(0);
    expect(g.s.groups[0].chain).toBe('tessera'); // the default starting chain

    g.stepTick(3600); // one game-hour in one chunk

    expect(g.s.blocksSolved).toBeGreaterThan(0);
    expect(g.s.wallet.tessera).toBeGreaterThan(0);
  });

  it("today's block count tracks real blocks found, not stuck at 0", () => {
    // today.blocks starts undefined on a legacy-shaped save and blocks++
    // silently produces NaN, which the UI's `|| 0` fallback then displays
    // as a plausible-looking but wrong zero — this pins the real count.
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.stepTick(3600);

    // blocksSolved counts every solo block found, including orphaned ones;
    // today.blocks only counts the ones actually credited, so it's <=, not ==.
    expect(g.s.today.blocks).toBeGreaterThan(0);
    expect(g.s.today.blocks).toBeLessThanOrEqual(g.s.blocksSolved);
    expect(Number.isNaN(g.s.today.blocks)).toBe(false);
  });

  it('repeated orphans collapse into one feed line instead of spamming one each', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    // The real roll is Math.random() < c.orphan*(1-CONN_Q) (tick.js) — CONN_Q
    // is 0.35, so orphan must clear 1/0.65 (~1.54) to make every solo find
    // orphan with certainty, not just orphan=1 (which is only p=0.65).
    tessera.orphan = 2;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.stepTick(3600); // plenty of blocks on a 20s-window chain

    expect(g.s.orphaned).toBeGreaterThan(1); // several orphan events really happened
    const orphanLines = g.s.feed.filter(e => e.text === 'Orphaned on Tessera');
    // other feed kinds (milestones etc.) can interleave and start a new run,
    // so this doesn't assert exactly one line — only that consecutive repeats
    // collapse rather than spamming one line per event, and none are lost.
    expect(orphanLines.length).toBeGreaterThan(0);
    expect(orphanLines.length).toBeLessThan(g.s.orphaned);
    expect(orphanLines.reduce((a, e) => a + e.n, 0)).toBe(g.s.orphaned);
  });

  it('difficulty (obs) retargets away from the floor once blocks land', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    expect(tessera.obs).toBe(tessera.floor); // nobody has mined it yet

    g.generatePreset();
    g.build();
    g.stepTick(3600); // finishes assembly and mines for about an hour in one chunk

    // a starter rig's hashrate sits below Tessera's floor (see chains.js),
    // so once blocks land and obs retargets per block, it should have
    // moved — direction (up or down) isn't asserted, only that retargeting
    // happened
    expect(tessera.obs).not.toBe(tessera.floor);
    expect(Number.isFinite(tessera.obs)).toBe(true);
  });
});

describe('chain price', () => {
  it('fundOf rises when a chain carries more hashrate than it did when it opened', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    // with no hash yet, ratio clamps to max(1, 0)/anchor = 1: fundOf is par
    const parPrice = g.fundOf(tessera);
    expect(parPrice).toBeGreaterThan(0);

    // anchor tracks where the chain's hashrate stood when it opened; a chain
    // now carrying twice what it opened with should command a premium
    tessera.anchor = 0.5;
    expect(g.fundOf(tessera)).toBeGreaterThan(parPrice);
  });

  it('the reference price relaxes toward the fundamental over time', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    for (let i = 0; i < 3; i++) {
      g.s.cash += 100000;
      if (g.generatePreset()) g.build();
    }

    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const refBefore = tessera.ref;
    // several game-days so the ~3-day relaxation constant has room to act
    for (let i = 0; i < 10; i++) g.stepTick(86400 / 3);
    expect(tessera.ref).not.toBe(refBefore);
    expect(Number.isFinite(tessera.ref)).toBe(true);
    expect(tessera.ref).toBeGreaterThan(0);
  });
});

describe('milestones', () => {
  it('fires a milestone once its condition is met, and never twice', () => {
    const g = freshStore();
    expect(g.s.mile.done.h1).toBeUndefined();

    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(g.totalHash).toBeGreaterThanOrEqual(100); // the preset clears h1's bar comfortably

    g.stepTick();
    expect(g.s.mile.done.h1).toBeTypeOf('number');

    const firstTimestamp = g.s.mile.done.h1;
    g.stepTick();
    expect(g.s.mile.done.h1).toBe(firstTimestamp); // unchanged, not re-fired
  });

  it('ranks up once enough milestones are done', () => {
    const g = freshStore();
    // seed 3 milestones as already done without touching real game state,
    // then let a 4th complete for real — RANKS[1] is 'Tinkerer' at 4 done
    g.s.mile.done = { fake1: 1, fake2: 1, fake3: 1 };
    expect(g.s.mile.rank).toBe(0);

    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.stepTick();

    expect(Object.keys(g.s.mile.done).length).toBeGreaterThanOrEqual(4);
    expect(g.s.mile.rank).toBeGreaterThanOrEqual(1);
  });
});
