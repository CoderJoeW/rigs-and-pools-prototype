import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import OnboardingBanner from '../OnboardingBanner.vue';

describe('OnboardingBanner', () => {
  it('shows the current coach step for a fresh game', () => {
    const { wrapper } = mountWithStore(OnboardingBanner);
    expect(wrapper.text()).toContain('Build your first rig');
  });

  it('dismissing it hides the banner', async () => {
    const { wrapper, store } = mountWithStore(OnboardingBanner);
    await wrapper.find('button').trigger('click');
    expect(store.s.onboardingDismissed).toBe(true);
    expect(wrapper.find('.card').exists()).toBe(false);
  });

  it('renders nothing once onboarding is already dismissed', () => {
    const { wrapper } = mountWithStore(OnboardingBanner, {
      seed: g => g.dismissOnboarding(),
    });
    expect(wrapper.find('.card').exists()).toBe(false);
  });
});
