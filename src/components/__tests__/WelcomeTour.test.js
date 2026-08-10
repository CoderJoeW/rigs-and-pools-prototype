import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import WelcomeTour from '../WelcomeTour.vue';

describe('WelcomeTour', () => {
  it('shows the first slide for a brand-new player, on the Farm tab', () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    expect(wrapper.text()).toContain('Welcome to Rigs & Pools');
    expect(wrapper.text()).toContain('1 of 7');
    expect(store.s.tab).toBe('farm');
  });

  it('renders nothing once a rig already exists', () => {
    const { wrapper } = mountWithStore(WelcomeTour, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.find('.tour').exists()).toBe(false);
  });

  it('renders nothing once the tour has been skipped', () => {
    const { wrapper } = mountWithStore(WelcomeTour, {
      seed: g => g.dismissTour(),
    });
    expect(wrapper.find('.tour').exists()).toBe(false);
  });

  it('Next walks forward through the slides AND switches to the tab each one is about', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    const next = () => wrapper.findAll('button').find(b => b.text() === 'Next');
    const back = () => wrapper.findAll('button').find(b => b.text() === 'Back');

    expect(back()).toBeUndefined(); // no Back on the first slide

    await next().trigger('click'); // -> Sites
    expect(wrapper.text()).toContain('Sites — power and cooling you build');
    expect(store.s.tab).toBe('sites');

    await next().trigger('click'); // -> Rigs
    expect(store.s.tab).toBe('rigs');

    await back().trigger('click'); // back to Sites
    expect(wrapper.text()).toContain('Sites — power and cooling you build');
    expect(store.s.tab).toBe('sites');
  });

  it('manually switching tabs mid-tour does not stick — the next Next/Back reasserts the slide\'s tab', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    store.s.tab = 'market'; // player looks around on their own
    await wrapper.vm.$nextTick();

    const next = wrapper.findAll('button').find(b => b.text() === 'Next');
    await next.trigger('click');
    expect(store.s.tab).toBe('sites'); // the tour's own second slide, not 'market'
  });

  it('walks through all seven tabs in order, ending on Build', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    const order = ['farm', 'sites', 'rigs', 'chains', 'market', 'stats', 'build'];
    expect(store.s.tab).toBe(order[0]);
    for (let i = 1; i < order.length; i++) {
      await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click');
      expect(store.s.tab).toBe(order[i]);
    }
    expect(wrapper.text()).toContain('7 of 7');
    expect(wrapper.findAll('button').find(b => b.text() === 'Next')).toBeUndefined();
  });

  it('the last slide swaps Next for a finishing button that dismisses the tour', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    for (let i = 0; i < 6; i++) {
      await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click');
    }
    expect(store.s.tab).toBe('build');
    const finish = wrapper.findAll('button').find(b => b.text() === "Got it — let's build");
    expect(finish).toBeTruthy();

    await finish.trigger('click');
    expect(store.s.tourDismissed).toBe(true);
    expect(store.s.tab).toBe('build'); // stays put — the tour already navigated here
    expect(wrapper.find('.tour').exists()).toBe(false);
  });

  it('Skip is available on every slide and dismisses without forcing any particular tab', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click'); // -> sites
    const skip = wrapper.findAll('button').find(b => b.text() === 'Skip');
    await skip.trigger('click');
    expect(store.s.tourDismissed).toBe(true);
    expect(store.s.tab).toBe('sites'); // wherever the tour had them, left alone
    expect(wrapper.find('.tour').exists()).toBe(false);
  });

  it('building a rig mid-tour (via the real Build tab underneath) ends the tour on its own', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    for (let i = 0; i < 6; i++) {
      await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click');
    }
    expect(store.s.tab).toBe('build');
    store.generatePreset();
    store.build();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tour').exists()).toBe(false); // no click on the tour's own button needed
  });
});
