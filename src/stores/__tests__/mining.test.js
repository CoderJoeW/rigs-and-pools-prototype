import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

/* Mining is randomized (block arrival is drawn per-window), so these tests
   lean on large tick chunks against short-window chains rather than exact
   counts: Tessera's block window is well under two minutes for any rig-sized
   hashrate, so a single multi-hour tick should find many blocks with
   overwhelming probability, not flakily. */

describe('Tessera balance', () => {
  it('is no longer the single best-paying chain — a newcomer subsidy, not a permanent one', () => {
    // Tessera is deliberately generous (no simulated competition, a low
    // floor a starter rig clears fast) — but it should not ALSO be the
    // highest raw rate in the ladder, or there's never a reason to leave it.
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const others = g.s.chains.filter(c => c.id !== 'tessera');
    expect(others.some(c => c.mult >= tessera.mult)).toBe(true);
  });

  it('a starter rig outgrows Tessera\'s floor on its very first build, not after days idle', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeGreaterThan(tessera.floor);
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

    // a starter rig's hashrate sits nowhere near Tessera's 500 MH floor, so
    // once blocks land and obs retargets per block, it should have moved —
    // direction (up or down) isn't asserted, only that retargeting happened
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
