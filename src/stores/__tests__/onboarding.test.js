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
