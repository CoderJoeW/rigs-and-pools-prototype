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
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    const tessera = g.s.chains.find(c => c.id === 'tessera');
    expect(g.totalHash).toBeLessThan(tessera.floor); // one starter rig never reaches 500 MH
    expect(g.chainCeiling(tessera)).toBeNull();
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
});
