import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import WelcomeTour from '../WelcomeTour.vue';

describe('WelcomeTour', () => {
  it('shows the first slide for a brand-new player', () => {
    const { wrapper } = mountWithStore(WelcomeTour);
    expect(wrapper.text()).toContain('Welcome to Rigs & Pools');
    expect(wrapper.text()).toContain('1 of 4');
  });

  it('renders nothing once a rig already exists', () => {
    const { wrapper } = mountWithStore(WelcomeTour, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.find('.sheet').exists()).toBe(false);
  });

  it('renders nothing once the tour has been skipped', () => {
    const { wrapper } = mountWithStore(WelcomeTour, {
      seed: g => g.dismissTour(),
    });
    expect(wrapper.find('.sheet').exists()).toBe(false);
  });

  it('Next walks forward through the slides, Back walks back', async () => {
    const { wrapper } = mountWithStore(WelcomeTour);
    const next = () => wrapper.findAll('button').find(b => b.text() === 'Next');
    const back = () => wrapper.findAll('button').find(b => b.text() === 'Back');

    expect(back()).toBeUndefined(); // no Back on the first slide
    await next().trigger('click');
    expect(wrapper.text()).toContain('Starting small');
    expect(wrapper.text()).toContain('2 of 4');

    await back().trigger('click');
    expect(wrapper.text()).toContain('Welcome to Rigs & Pools');
    expect(wrapper.text()).toContain('1 of 4');
  });

  it('the last slide swaps Next for Open Build, which switches tab and dismisses the tour', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    for (let i = 0; i < 3; i++) {
      await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click');
    }
    expect(wrapper.text()).toContain('4 of 4');
    const openBuild = wrapper.findAll('button').find(b => b.text() === 'Open Build');
    expect(openBuild).toBeTruthy();

    await openBuild.trigger('click');
    expect(store.s.tab).toBe('build');
    expect(store.s.tourDismissed).toBe(true);
    expect(wrapper.find('.sheet').exists()).toBe(false);
  });

  it('Skip is available on every slide and dismisses without changing tab', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    const skip = wrapper.findAll('button').find(b => b.text() === 'Skip');
    await skip.trigger('click');
    expect(store.s.tourDismissed).toBe(true);
    expect(store.s.tab).toBe('farm');
    expect(wrapper.find('.sheet').exists()).toBe(false);
  });
});
