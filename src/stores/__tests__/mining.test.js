import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

/* Mining is randomized (block arrival is drawn per-window), so these tests
   lean on large tick chunks against short-window chains rather than exact
   counts: Tessera's block window is well under two minutes for any rig-sized
   hashrate, so a single multi-hour tick should find many blocks with
   overwhelming probability, not flakily. */

describe('Tessera balance', () => {
  it('pays a $20 block at 20s target and stays above ladder rates while under floor', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const nova = g.s.chains.find(c => c.id === 'nova');
    expect(tessera.reward * tessera.price).toBeCloseTo(20, 1);
    expect(tessera.target).toBe(20);
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    for (let i = 0; i < 20; i++) g.stepTick(3600);

    expect(g.revPerMh(tessera)).toBeGreaterThan(g.revPerMh(nova));
    expect(g.revPerMh(tessera)).toBeGreaterThan(50);
  });

  it('does not permanently pin at the global $0.02 price floor (issue #18)', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    for (let i = 0; i < 5; i++) g.stepTick(3600);

    expect(g.price(tessera)).toBeGreaterThan(0.02);
    expect(tessera.impact).toBeLessThan(0.85);
  });

  it('the floor sits within reach of a modestly grown farm, not just a single rig forever', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    const oneRig = g.dp.mh;
    expect(g.chainCeiling(tessera)).toBeNull();
    expect(g.chainCeiling(tessera, oneRig)).not.toBeNull();
  });
});

describe('solo block finding', () => {
  it('a rig mining solo on Tessera finds blocks and gets paid', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(g.totalHash).toBeGreaterThan(0);
    expect(g.s.groups[0].chain).toBe('tessera');

    g.stepTick(3600);

    expect(g.s.blocksSolved).toBeGreaterThan(0);
    expect(g.s.wallet.tessera).toBeGreaterThan(0);
  });

  it("today's block count tracks real blocks found, not stuck at 0", () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.stepTick(3600);

    expect(g.s.today.blocks).toBeGreaterThan(0);
    expect(g.s.today.blocks).toBeLessThanOrEqual(g.s.blocksSolved);
    expect(Number.isNaN(g.s.today.blocks)).toBe(false);
  });

  it('repeated orphans collapse into one feed line instead of spamming one each', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    tessera.orphan = 2;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.stepTick(3600);

    expect(g.s.orphaned).toBeGreaterThan(1);
    const orphanLines = g.s.feed.filter(e => e.text === 'Orphaned on Tessera');
    expect(orphanLines.length).toBeGreaterThan(0);
    expect(orphanLines.length).toBeLessThan(g.s.orphaned);
    expect(orphanLines.reduce((a, e) => a + e.n, 0)).toBe(g.s.orphaned);
  });

  it('difficulty (obs) retargets away from the floor once blocks land', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    expect(tessera.obs).toBe(tessera.floor);

    g.generatePreset();
    g.build();
    g.stepTick(3600);

    expect(tessera.obs).not.toBe(tessera.floor);
    expect(Number.isFinite(tessera.obs)).toBe(true);
  });
});

describe('PPLNS payouts', () => {
  it('"blocks today" only counts a block once it actually pays, not the pending-lag block that credits nothing yet (issue #13)', () => {
    const g = freshStore();
    g.s.cash = 10000; // bond scales with $20 block value
    g.foundPool('tessera', 'PPLNS', 0.02);
    const pool = g.s.pools.find(p => p.owner === 'you');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.setGroupPool(g.s.groups[0], pool.id);
    expect(g.poolHash(pool)).toBeGreaterThan(0);

    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const walletBefore = g.s.wallet.tessera;
    g.s.today.blocks = 0;

    let guard = 0;
    while (g.s.groups[0].pending === 0 && guard++ < 20000) g.stepTick(1);
    expect(g.s.groups[0].pending).toBeGreaterThan(0);

    expect(g.s.wallet.tessera).toBe(walletBefore);
    expect(g.s.today.blocks).toBe(0);
  });
});

describe('jackpot blocks', () => {
  it("stays quiet until there's a real baseline (BLOCK_BASELINE_MIN samples) to compare against", () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.recentBlockUsd = {};
    g.s.bestBlock = 1;

    g.stepTick(40);

    const tesseraSamples = g.s.recentBlockUsd.tessera || [];
    expect(tesseraSamples.length).toBeLessThan(5);
    expect(g.s.feed.some(e => e.kind === 'jackpot')).toBe(false);
  });

  it('a block clearing 3x the recent median fires a jackpot instead of a routine toast', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    // bestBlock above a normal Tessera (~$20) block so this stays a jackpot, not a record
    g.s.bestBlock = 100;
    g.s.recentBlockUsd = { tessera: [0.1, 0.1, 0.1, 0.1, 0.1] };

    const before = g.s.recentBlockUsd.tessera.length;
    let guard = 0;
    while (g.s.recentBlockUsd.tessera.length === before && guard++ < 400) g.stepTick(10);

    expect(g.s.feed.some(e => e.kind === 'jackpot')).toBe(true);
    expect(g.s.bestBlock).toBe(100);
  });

  it('a new all-time record still wins over a jackpot for the same block', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.s.bestBlock = 0;
    g.s.recentBlockUsd = { tessera: [0.1, 0.1, 0.1, 0.1, 0.1] };

    const before = g.s.recentBlockUsd.tessera.length;
    let guard = 0;
    while (g.s.recentBlockUsd.tessera.length === before && guard++ < 400) g.stepTick(5);
    expect(g.s.recentBlockUsd.tessera.length).toBe(before + 1);

    expect(g.s.bestBlock).toBeGreaterThan(0);
    expect(g.s.feed.some(e => e.kind === 'jackpot')).toBe(false);
  });

  it('a low-value chain in the same save never drags down a bigger chain\'s own baseline', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.s.bestBlock = 1e9;
    g.s.recentBlockUsd = { tessera: [0.1, 0.1, 0.1, 0.1, 0.1] };
    g.setGroupChain(g.s.groups[0], 'ferro');
    const feedIdBefore = g.s.feedId;

    let guard = 0;
    while ((g.s.recentBlockUsd.ferro || []).length < 7 && guard++ < 4000) g.stepTick(30);
    expect((g.s.recentBlockUsd.ferro || []).length).toBeGreaterThanOrEqual(7);

    const newEntries = g.s.feed.filter(e => e.id >= feedIdBefore);
    expect(newEntries.some(e => e.kind === 'jackpot')).toBe(false);
    expect(g.s.recentBlockUsd.tessera).toEqual([0.1, 0.1, 0.1, 0.1, 0.1]);
  });

  it('recentBlockUsd rolls and stays capped at the baseline window', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.recentBlockUsd = { tessera: Array(20).fill(0.2) };

    g.stepTick(300);

    expect(g.s.recentBlockUsd.tessera.length).toBe(20);
  });

  it('a save (or a future smaller window) that leaves recentBlockUsd oversized settles back to the cap, not stuck above it', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.recentBlockUsd = { tessera: Array(23).fill(0.2) };

    g.stepTick(300);

    expect(g.s.recentBlockUsd.tessera.length).toBe(20);
  });

  it('orphaned blocks pay nothing and never count toward the baseline', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    tessera.orphan = 2;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.stepTick(300);

    expect(g.s.orphaned).toBeGreaterThan(0);
    expect(g.s.recentBlockUsd.tessera).toBeUndefined();
  });

  it('keys the baseline by chain+pool, not chain alone, so a PPLNS share never mixes with the solo window (issue #36)', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.s.bestBlock = 1e9;
    g.s.recentBlockUsd = { tessera: [0.1, 0.1, 0.1, 0.1, 0.1] };
    g.s.cash = 10000; // bond scales with $20 block value

    g.foundPool('tessera', 'PPLNS', 0.30);
    const pool = g.s.pools.find(p => p.owner === 'you');
    g.setGroupPool(g.s.groups[0], pool.id);
    expect(g.poolHash(pool)).toBeGreaterThan(0);

    const key = 'tessera|' + pool.id;
    let guard = 0;
    while (!g.s.recentBlockUsd[key] && guard++ < 4000) g.stepTick(5);

    expect(g.s.recentBlockUsd[key]).toBeTruthy();
    expect(g.s.recentBlockUsd.tessera).toEqual([0.1, 0.1, 0.1, 0.1, 0.1]);
  });

  it('tracks a PPLNS share credited to you even when your own group did not draw the winning ticket (issue #32)', () => {
    const g = freshStore();
    const pool = g.s.pools.find(p => p.chain === 'ferro' && p.owner !== 'you');
    pool.scheme = 'PPLNS'; pool.fee = 0.02; pool.live = true;
    const sim = g.s.sims.find(m => m.chain === 'ferro');
    if (g.setSimHash) g.setSimHash(sim, 1e6); else sim.hash = 1e6;
    if (g.setSimPool) g.setSimPool(sim, pool.id); else { sim.pool = pool.id; if (g.reindexSims) g.reindexSims(); }

    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.setGroupChain(g.s.groups[0], 'ferro');
    g.setGroupPool(g.s.groups[0], pool.id);
    expect(g.poolHash(pool)).toBeGreaterThan(0);

    g.s.recentBlockUsd = {};
    const key = 'ferro|' + pool.id;
    let guard = 0;
    while (!g.s.recentBlockUsd[key] && guard++ < 4000) g.stepTick(5);

    expect(g.s.groups[0].pending).toBeGreaterThan(0);
    expect(g.s.recentBlockUsd[key]).toBeTruthy();
  });
});

describe('chain price', () => {
  it('fundOf rises when a chain carries more hashrate than it did when it opened', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const parPrice = g.fundOf(tessera);
    expect(parPrice).toBeGreaterThan(0);

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
    expect(g.totalHash).toBeGreaterThanOrEqual(100);

    g.stepTick();
    expect(g.s.mile.done.h1).toBeTypeOf('number');

    const firstTimestamp = g.s.mile.done.h1;
    g.stepTick();
    expect(g.s.mile.done.h1).toBe(firstTimestamp);
  });

  it('ranks up once enough milestones are done', () => {
    const g = freshStore();
    g.s.mile.done = { fake1: 1, fake2: 1, fake3: 1 };
    expect(g.s.mile.rank).toBe(0);

    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.stepTick();

    expect(Object.keys(g.s.mile.done).length).toBeGreaterThanOrEqual(4);
    expect(g.s.mile.rank).toBeGreaterThanOrEqual(1);
  });

  it('pure block-count volume (b2/b3) does not clear from a single sim-day of passive, untouched play', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    for (let i = 0; i < 24; i++) g.stepTick(3600);

    expect(g.s.mile.done.b1).toBeTypeOf('number');
    expect(g.s.mile.done.b2).toBeUndefined();
    expect(g.s.mile.done.b3).toBeUndefined();
    // Earning milestones may also clear with the higher Tessera block value;
    // the point of this test is that pure block-count volume (b2/b3) does not.
    expect(g.s.mile.done.c2).toBeTypeOf('number');
    expect(g.s.mile.done.h1).toBeTypeOf('number');
  });
});
