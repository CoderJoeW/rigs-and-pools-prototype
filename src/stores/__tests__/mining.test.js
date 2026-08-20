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

    // bestBlock above a normal Tessera block so this stays a jackpot, not a record
    g.s.bestBlock = 100;
    g.s.recentBlockUsd = { tessera: [0.1, 0.1, 0.1, 0.1, 0.1] };

    const before = g.s.recentBlockUsd.tessera.length;
    let guard = 0;
    while (g.s.recentBlockUsd.tessera.length === before && guard++ < 400) g.stepTick(10);

    expect(g.s.feed.some(e => e.kind === 'jackpot')).toBe(true);
    expect(g.s.bestBlock).toBe(100);
  });
});
