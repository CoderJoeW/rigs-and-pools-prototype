import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

/* groupAdvice/chainCeiling drive the OUTGROWN / AT CEILING advisory tags on
   Farm — the warning that a group's own hashrate has grown large enough
   that it's setting the chain's difficulty rather than just buying a share
   of it. These guard clauses are what keeps that warning from firing on a
   perfectly normal, un-concentrated farm; a bug here would show players a
   misleading "you've outgrown this chain" nudge when they haven't. */
describe('chainCeiling', () => {
  it('returns null for a missing chain', () => {
    const g = freshStore();
    expect(g.chainCeiling(null)).toBeNull();
  });

  it('returns null before any hash is on the chain', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    expect(g.chainCeiling(tessera)).toBeNull();
  });

  it('returns null while the chain sits below its own floor', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    // isolate the guard clause from Tessera's actual tuned floor (deliberately
    // low enough that a real starter rig now sits ABOVE it — see chains.js)
    // so this test keeps meaning what it says regardless of balance tuning.
    tessera.floor = 1e9;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeGreaterThan(0);
    expect(g.totalHash).toBeLessThan(tessera.floor);
    expect(g.chainCeiling(tessera)).toBeNull();
  });

  it('fires for a real starter rig on Tessera — the floor is low enough to outgrow immediately', () => {
    // this is the actual point of Tessera's floor being tuned low: a single
    // starter rig should trip the OUTGROWN advisory in the first session,
    // not require days of unattended idling first (see chains.js).
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeGreaterThan(tessera.floor);
    const ceiling = g.chainCeiling(tessera);
    expect(ceiling).not.toBeNull();
    expect(ceiling.share).toBe(1); // Tessera has no simulated miners
    expect(ceiling.over).toBeGreaterThan(1);
  });
});

describe('groupAdvice', () => {
  it('returns null for a group with no live hash pointed at its chain', () => {
    const g = freshStore();
    expect(g.groupAdvice(g.s.groups[0])).toBeNull();
  });

  it('returns null for a small share of a chain with real traffic, even mid-build', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.setGroupChain(g.s.groups[0], 'halcyon'); // a chain with a real simulated network

    expect(g.groupAdvice(g.s.groups[0])).toBeNull();
  });

  it('nudges a real starter rig on Tessera toward a better chain immediately', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    const advice = g.groupAdvice(g.s.groups[0]);
    expect(advice).not.toBeNull();
    expect(advice.share).toBe(1);
    expect(advice.mult).toBeGreaterThan(1.5); // the alt chain genuinely pays enough more to move
    expect(g.s.chains.map(c => c.id)).toContain(advice.alt.toLowerCase());
  });
});
