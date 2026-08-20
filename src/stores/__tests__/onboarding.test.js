import { describe, it, expect, beforeEach } from 'vitest';
import { freshStore } from '../../test/testStore.js';

describe('onboarding coach', () => {
  it('starts on "build" with no rigs', () => {
    const g = freshStore();
    expect(g.onboardingStep.id).toBe('build');
  });

  it('"build" clears once a rig exists, handing off to "power"', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.onboardingStep.id).toBe('power');
  });

  it('"power" clears once the first rig finishes building, handing off to "grow"', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
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
