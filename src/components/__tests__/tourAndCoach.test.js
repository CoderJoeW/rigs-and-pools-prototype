import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import OnboardingBanner from '../OnboardingBanner.vue';
import WelcomeTour from '../WelcomeTour.vue';

/* App.vue mounts these two as siblings; testing them in isolation (as their
   own test files do) proves each works alone but not that they stay
   mutually exclusive together — that's the actual property App.vue relies
   on. This harness renders them exactly as App.vue does, without going
   through App.vue's own async onMounted (loadSave/saveNow), which would
   otherwise read back whatever a PREVIOUS test in this run happened to
   leave in localStorage and make these assertions depend on test order. */
const Pair = defineComponent({
  render: () => h('div', [h(OnboardingBanner), h(WelcomeTour)]),
});

describe('the walkthrough tour and the reactive coach, mounted together', () => {
  it('a brand-new player sees only the tour, never both at once', () => {
    const { wrapper } = mountWithStore(Pair);
    expect(wrapper.find('.sheet').exists()).toBe(true);      // WelcomeTour
    expect(wrapper.find('.card').exists()).toBe(false);       // OnboardingBanner stays quiet
  });

  it('skipping the tour hands off to the coach in the same render', async () => {
    const { wrapper } = mountWithStore(Pair);
    const skip = wrapper.findAll('button').find(b => b.text() === 'Skip');
    await skip.trigger('click');
    expect(wrapper.find('.sheet').exists()).toBe(false);
    expect(wrapper.find('.card').exists()).toBe(true);
    expect(wrapper.text()).toContain('Build your first rig');
  });

  it('building via Open Build on the last slide hands off to the coach\'s "earn" step, not "build"', async () => {
    const { wrapper, store } = mountWithStore(Pair);
    for (let i = 0; i < 3; i++) {
      await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click');
    }
    await wrapper.findAll('button').find(b => b.text() === 'Open Build').trigger('click');
    expect(wrapper.find('.sheet').exists()).toBe(false);
    // Open Build only switches tabs — it doesn't build a rig itself, so the
    // coach still opens on 'build', same as any other skip.
    expect(wrapper.text()).toContain('Build your first rig');

    store.generatePreset();
    store.build();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.sheet').exists()).toBe(false); // stays gone, nextId>1 now
    expect(wrapper.text()).toContain('Rig ordered'); // the coach's 'earn' step
  });

  it('scrapping the only rig back to zero does not resurrect the tour over the coach', async () => {
    const { wrapper, store } = mountWithStore(Pair, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.find('.sheet').exists()).toBe(false);

    store.scrapRig(store.s.rigs[0].id);
    await wrapper.vm.$nextTick();
    expect(store.s.rigs).toHaveLength(0);
    expect(wrapper.find('.sheet').exists()).toBe(false); // tour stays gone
    expect(wrapper.find('.card').exists()).toBe(true);   // coach resumes normally
  });
});
