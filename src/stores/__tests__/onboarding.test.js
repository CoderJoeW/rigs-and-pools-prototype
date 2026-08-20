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
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(g.totalHash).toBeGreaterThanOrEqual(100);
    expect(g.onboardingStep.id).toBe('grow');
  });

  it('"grow" clears once a second site or a player-owned pool exists, handing off to "automate"', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.cash = Math.max(g.s.cash, 10000);
    g.foundPool('tessera', 'PPLNS', 0.02);
    expect(g.onboardingStep.id).toBe('automate');
  });

  it('a second site alone also clears "grow", without needing a pool', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.cash = 5000;
    g.newSite('shed');
    expect(g.onboardingStep.id).toBe('automate');
  });

  it('"automate" clears just as well from auto-replace alone', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.cash = Math.max(g.s.cash, 10000);
    g.foundPool('tessera', 'PPLNS', 0.02);
    expect(g.onboardingStep.id).toBe('automate');
    g.s.autoFix = true;
    expect(g.onboardingStep).toBe(null);
  });

  it('dismissing clears the coach permanently', () => {
    const g = freshStore();
    expect(g.onboardingStep).not.toBe(null);
    g.s.onboardingDismissed = true;
    expect(g.onboardingStep).toBe(null);
  });
});

describe('guided tour', () => {
  it('shows for a brand-new save', () => {
    const g = freshStore();
    expect(g.showTour).toBe(true);
  });

  it('does not resurface after the first rig is built', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.showTour).toBe(false);
  });

  it('does not resurface after all rigs are scrapped', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.s.rigs).toHaveLength(1);
    expect(g.showTour).toBe(false);
    g.scrapRig(g.s.rigs[0].id);
    expect(g.s.rigs).toHaveLength(0);
    expect(g.showTour).toBe(false);
  });

  it('a skip survives a save/load round trip', async () => {
    const g1 = freshStore();
    g1.dismissTour();
    await g1.saveNow();
    const { reopenStore } = await import('../../test/testStore.js');
    const g2 = reopenStore();
    await g2.loadSave();
    expect(g2.showTour).toBe(false);
  });

  it('restartTour brings it back', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.showTour).toBe(false);
    g.restartTour();
    expect(g.showTour).toBe(true);
    expect(g.s.tourReplay).toBe(true);
  });
});
