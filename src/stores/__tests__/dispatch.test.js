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

  it('returns null for a real starter rig on Tessera — the floor gives a genuine below-floor period', () => {
    // Tessera's floor is tuned to sit above a single starter rig's hashrate
    // on purpose (see chains.js): the newcomer subsidy should mean something
    // before it starts fading, not vanish the instant a rig finishes.
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeGreaterThan(0);
    expect(g.totalHash).toBeLessThan(tessera.floor);
    expect(g.chainCeiling(tessera)).toBeNull();
  });

  it('returns null for the draft rig on the Build tab before any rig is actually owned', () => {
    // BuildView.vue calls chainCeiling(chain, draftHash) to warn about the
    // rig being planned — that must not fire before the player owns
    // anything, or the very first screen of a new game tells them their
    // starting chain is already maxed out (docs/design-spec.md §10b:
    // "Starters below the floor are never nudged").
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    expect(g.s.rigs).toHaveLength(0);
    expect(g.chainCeiling(tessera, g.dp.mh)).toBeNull();
  });

  it('fires once a group genuinely holds most of a chain above its floor', () => {
    // isolate the guard's actual logic from whatever Tessera's floor is
    // currently tuned to — this pins the function's behavior at the
    // boundary, not a specific production balance number.
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    tessera.floor = 100;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeGreaterThan(tessera.floor);
    const ceiling = g.chainCeiling(tessera);
    expect(ceiling).not.toBeNull();
    expect(ceiling.share).toBe(1); // Tessera has no simulated miners
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

  it('returns null for a real starter rig on Tessera, still within its below-floor period', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeLessThan(tessera.floor);
    expect(g.groupAdvice(g.s.groups[0])).toBeNull();
  });

  it('nudges toward a better chain once a group has genuinely outgrown its own', () => {
    // Isolated from production tuning on two axes: floor, so the "above
    // floor, majority share" gate clears immediately, and reward — the
    // field revPerMh() actually reads at runtime (traced in dispatch.js).
    // mult is only ever read for pool float/bond sizing (poolMarket.js,
    // rivals.js) and the Chains tab's own pay-rate display, never by
    // revPerMh/diffOf, so overriding mult alone wouldn't change anything
    // here. Forcing a low reward makes this chain clearly the worst payer,
    // which is what it takes to clear groupAdvice's own >=1.5x-better bar —
    // Tessera's real tuning now sits close enough to the rest of the ladder
    // that it no longer clears that bar on its own (a good sign for the
    // balance, but it means this specific branch needs an isolated scenario
    // to reach).
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    tessera.floor = 10;
    tessera.reward = 1;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    const advice = g.groupAdvice(g.s.groups[0]);
    expect(advice).not.toBeNull();
    expect(advice.share).toBe(1);
    expect(g.s.chains.map(c => c.id)).toContain(advice.alt.toLowerCase());
  });
});
