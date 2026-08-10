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

  it('"grow" clears once a second site or a player-owned pool exists, handing off to "automate"', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
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

  it('"automate" clears once auto-shutdown is enabled', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.cash = 5000;
    g.newSite('shed');
    expect(g.onboardingStep.id).toBe('automate');
    g.s.autoOff = true;
    expect(g.onboardingStep).toBe(null);
  });

  it('"automate" clears just as well from auto-replace alone', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.foundPool('tessera', 'PPLNS', 0.02);
    expect(g.onboardingStep.id).toBe('automate');
    g.s.autoFix = true;
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

describe('the Chains-tab rival-pool nudge (issue #30)', () => {
  it('shows by default, independent of the global coach', () => {
    const g = freshStore();
    g.dismissOnboarding(); // the banner is gone...
    expect(g.showChainsNudge).toBe(true); // ...but this survives that
  });

  it('survives the "second site" exit that used to clear the whole banner', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.cash = 5000;
    g.newSite('shed'); // clears onboardingStep's old terminal condition
    expect(g.showChainsNudge).toBe(true);
  });

  it('dismissChainsNudge hides it on its own', () => {
    const g = freshStore();
    g.dismissChainsNudge();
    expect(g.showChainsNudge).toBe(false);
    expect(g.s.chainsNudgeDismissed).toBe(true);
  });

  it('clears once the player founds their own pool, without needing a dismissal', () => {
    const g = freshStore();
    g.foundPool('tessera', 'PPLNS', 0.02);
    expect(g.showChainsNudge).toBe(false);
  });

  it('a dismissal survives a save/load round trip', async () => {
    const g1 = freshStore();
    g1.dismissChainsNudge();
    await g1.saveNow();

    const { reopenStore } = await import('../../test/testStore.js');
    const g2 = reopenStore();
    await g2.loadSave();
    expect(g2.showChainsNudge).toBe(false);
  });
});

describe('the walkthrough tour', () => {
  it('shows for a brand-new player, before anything is built', () => {
    const g = freshStore();
    expect(g.showTour).toBe(true);
  });

  it('has four slides, ending on the one that offers to open Build', () => {
    const g = freshStore();
    expect(g.TOUR_SLIDES).toHaveLength(4);
    expect(g.TOUR_SLIDES[0].title).toMatch(/welcome/i);
    expect(g.TOUR_SLIDES[g.TOUR_SLIDES.length - 1].body).toMatch(/Order parts/);
  });

  it('dismissTour hides it without touching the current tab', () => {
    const g = freshStore();
    g.dismissTour();
    expect(g.showTour).toBe(false);
    expect(g.s.tourDismissed).toBe(true);
    expect(g.s.tab).toBe('farm');
  });

  it('beginFirstBuild opens Build and dismisses the tour in one action', () => {
    const g = freshStore();
    g.beginFirstBuild();
    expect(g.s.tab).toBe('build');
    expect(g.showTour).toBe(false);
  });

  it('clears once a first rig exists by any route, dismissed or not', () => {
    const g = freshStore();
    expect(g.showTour).toBe(true);
    g.generatePreset();
    g.build();
    expect(g.showTour).toBe(false);
  });

  it('does not resurface after the farm drops back to zero rigs (scrap, or an insolvency sell-off)', () => {
    // rigs.length is not monotonic — scrapping the only rig, or insolvency
    // liquidating the whole farm, both take it back to 0 on an established
    // save that legitimately never sees the tour again. Gating showTour on
    // that count alone would pop the full-screen tour back over a farm
    // that's already been run for a while.
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.s.rigs).toHaveLength(1);
    expect(g.showTour).toBe(false);

    g.scrapRig(g.s.rigs[0].id);
    expect(g.s.rigs).toHaveLength(0);
    expect(g.showTour).toBe(false);
  });

  it('does not resurface for a save that already has a rig', async () => {
    const g1 = freshStore();
    g1.generatePreset();
    g1.build();
    await g1.saveNow();

    const { reopenStore } = await import('../../test/testStore.js');
    const g2 = reopenStore();
    await g2.loadSave();
    expect(g2.showTour).toBe(false);
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

  it('the reactive coach stays quiet while the tour is up', () => {
    const g = freshStore();
    expect(g.showTour).toBe(true);
    expect(g.onboardingStep.id).toBe('build'); // the predicate still resolves...
    // ...but OnboardingBanner itself is the thing that checks showTour
    // before rendering it (see components/__tests__/OnboardingBanner.test.js)
  });
});
