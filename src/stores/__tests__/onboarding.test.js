import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

describe('onboarding coach', () => {
  it('starts on "build" — the first thing a brand-new player needs to do', () => {
    const g = freshStore();
    expect(g.onboardingStep.id).toBe('build');
  });

  it('advances to "earn" once a rig exists, before it clears 100 MH/s', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.onboardingStep.id).toBe('earn');
  });

  it('advances to "grow" once hashrate clears the h1 milestone bar', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
    expect(g.totalHash).toBeGreaterThanOrEqual(100);
    expect(g.onboardingStep.id).toBe('grow');
  });

  it('issue #8: "grow" names the rival-pool ecosystem specifically, not just a generic "found a pool" afterthought', () => {
    // The rival-pool layer (named competitors, live reputation, a
    // PPS/PPLNS mix) only exists on the non-Tessera chains, so a player
    // with no concrete reason to check Chains can go a whole session
    // without ever seeing it. Naming actual chains and what's on them
    // gives this step a specific pull instead of generic flavor text.
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    const text = g.onboardingStep.text;
    expect(text).toContain('rival pools');
    expect(text).toContain('reputation');
    // names at least one real non-Tessera chain, not just "Chains" in the abstract
    expect(g.s.chains.filter(c => c.id !== 'tessera').some(c => text.includes(c.name))).toBe(true);
  });

  it('clears once a second site or a player-owned pool exists', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.foundPool('tessera', 'PPLNS', 0.02);
    expect(g.onboardingStep).toBe(null);
  });

  it('a second site alone also clears it, without needing a pool', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.cash = 5000;
    g.newSite('shed');
    expect(g.onboardingStep).toBe(null);
  });

  it('dismissOnboarding hides it regardless of progress', () => {
    const g = freshStore();
    expect(g.onboardingStep).not.toBe(null);
    g.dismissOnboarding();
    expect(g.onboardingStep).toBe(null);
    expect(g.s.onboardingDismissed).toBe(true);
  });

  it('a dismissal survives a save/load round trip', async () => {
    const g1 = freshStore();
    g1.dismissOnboarding();
    await g1.saveNow();

    const { reopenStore } = await import('../../test/testStore.js');
    const g2 = reopenStore();
    await g2.loadSave();
    expect(g2.onboardingStep).toBe(null);
  });
});
