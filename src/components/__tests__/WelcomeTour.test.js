import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import WelcomeTour from '../WelcomeTour.vue';

// The spotlight targets a real DOM element via a data-tour selector, which
// only ever exists on the actual view components — not on WelcomeTour
// itself. These tests supply a stand-in target, attached to the live
// document (querySelector doesn't see a detached test tree), and give the
// requestAnimationFrame retry chain a real tick to resolve.
function mountWithTarget(dataTour) {
  const Harness = defineComponent({
    render: () => h('div', [
      h('div', { 'data-tour': dataTour }),
      h(WelcomeTour),
    ]),
  });
  return mountWithStore(Harness, { attachTo: document.body });
}
const settle = () => new Promise(r => setTimeout(r, 50));

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

  it('has no spotlight yet on the frame it mounts — nothing to darken before the target is even found', () => {
    const { wrapper } = mountWithStore(WelcomeTour);
    expect(wrapper.find('.tour-spot').exists()).toBe(false);
  });

  it('spotlights the real target element once the current slide\'s selector resolves', async () => {
    const { wrapper } = mountWithTarget('farm');
    await settle();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tour-spot').exists()).toBe(true);
    wrapper.unmount();
  });

  it('stays dark (no spotlight) when the current slide names a target that genuinely is not on the page', async () => {
    const { wrapper } = mountWithTarget('sites'); // slide 1 is 'farm', not 'sites'
    await settle();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tour-spot').exists()).toBe(false);
    wrapper.unmount();
  });

  it('re-targets the spotlight to the new slide\'s element after Next, once it resolves', async () => {
    const Harness = defineComponent({
      render: () => h('div', [
        h('div', { 'data-tour': 'farm' }),
        h('div', { 'data-tour': 'sites' }),
        h(WelcomeTour),
      ]),
    });
    const { wrapper } = mountWithStore(Harness, { attachTo: document.body });
    await settle();
    expect(wrapper.find('.tour-spot').exists()).toBe(true);

    await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click');
    await settle();
    expect(wrapper.find('.tour-spot').exists()).toBe(true); // still lit — 'sites' target exists too
    wrapper.unmount();
  });

  it('never blocks a click — the spotlight is decorative only (pointer-events:none)', async () => {
    const { wrapper } = mountWithTarget('farm');
    await settle();
    await wrapper.vm.$nextTick();
    const spot = wrapper.find('.tour-spot');
    expect(spot.exists()).toBe(true);
    expect(spot.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
});
