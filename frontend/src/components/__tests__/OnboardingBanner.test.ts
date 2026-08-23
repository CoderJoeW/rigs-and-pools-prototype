import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import OnboardingBanner from '../OnboardingBanner.vue';

describe('OnboardingBanner', () => {
  it('shows the current coach step once the walkthrough tour is out of the way', () => {
    const { wrapper } = mountWithStore(OnboardingBanner, {
      seed: g => g.dismissTour(),
    });
    expect(wrapper.text()).toContain('Build your first rig');
  });

  it('stays quiet for a fresh game while the tour is still up, even though a coach step is ready', () => {
    const { wrapper, store } = mountWithStore(OnboardingBanner);
    expect(store.showTour).toBe(true);
    expect(store.onboardingStep!.id).toBe('build'); // the predicate resolves...
    expect(wrapper.find('.card')!.exists()).toBe(false); // ...but the banner defers to the tour
  });

  it('dismissing it hides the banner', async () => {
    const { wrapper, store } = mountWithStore(OnboardingBanner, {
      seed: g => g.dismissTour(),
    });
    await wrapper.find('button')!.trigger('click');
    expect(store.s.onboardingDismissed).toBe(true);
    expect(wrapper.find('.card')!.exists()).toBe(false);
  });

  it('renders nothing once onboarding is already dismissed', () => {
    const { wrapper } = mountWithStore(OnboardingBanner, {
      seed: g => { g.dismissTour(); g.dismissOnboarding(); },
    });
    expect(wrapper.find('.card')!.exists()).toBe(false);
  });
});
