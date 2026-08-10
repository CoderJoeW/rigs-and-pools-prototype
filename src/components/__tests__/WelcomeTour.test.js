import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import fs from 'node:fs';
import path from 'node:path';
import { mountWithStore } from '../../test/mountWithStore.js';
import WelcomeTour from '../WelcomeTour.vue';

// jsdom doesn't apply main.css, so real paint/stacking order and
// pointer-events behaviour can't be exercised at runtime — these read the
// actual stylesheet instead, so a rule regressing silently (e.g. someone
// bumping .tour-spot's z-index without noticing .tour needs to stay above
// it) fails a test instead of just fading into an unwitnessed bug again.
const mainCss = fs.readFileSync(path.resolve(import.meta.dirname, '../../assets/main.css'), 'utf8');
function cssRule(selector) {
  // negative lookahead so '.tour' doesn't also match '.tour-spot'
  const re = new RegExp('\\' + selector + '(?![\\w-])\\{([^}]*)\\}');
  return mainCss.match(re)?.[1] || '';
}
function cssNum(rule, prop) {
  const m = rule.match(new RegExp(prop + ':\\s*(-?\\d+)'));
  return m ? Number(m[1]) : null;
}

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

  it('manually switching tabs mid-tour resyncs the tour to that slide, instead of snapping back', async () => {
    // Every tab in the app is one of the tour's own slides, so following the
    // player is strictly more coherent than overriding them: the caption
    // never gets to describe a tab that isn't the one on screen.
    const { wrapper, store } = mountWithStore(WelcomeTour);
    store.s.tab = 'market'; // player looks around on their own, e.g. via the tab bar
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Market — turn coins into cash');
    expect(wrapper.text()).toContain('5 of 7');

    const next = wrapper.findAll('button').find(b => b.text() === 'Next');
    await next.trigger('click');
    expect(store.s.tab).toBe('stats'); // advances from wherever the player actually is
  });

  it('following a spotlighted CTA that jumps tabs on its own keeps the caption in sync', async () => {
    // FarmView's "Go shopping" and RigsView's "Build one" both live INSIDE
    // the highlighted card and both jump straight to Build on click — a
    // real, plausible thing to tap mid-tour, not just a hypothetical.
    // Simulated here as any other click that sets s.tab, since the actual
    // buttons live in components this test doesn't mount.
    const { wrapper, store } = mountWithStore(WelcomeTour);
    store.s.tab = 'build'; // what "Build one" or "Go shopping" would do
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Let’s build your first rig');
    expect(wrapper.text()).toContain('7 of 7');
    expect(wrapper.findAll('button').find(b => b.text() === "Got it — let's build")).toBeTruthy();
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

  it('re-tracks the spotlight on scroll without re-centering the target (would fight the player\'s own scroll)', async () => {
    // Real scroll events don't bubble, so this dispatches from a NESTED
    // element (not window itself) with bubbles:false — the only way for
    // window's listener to see it is the CAPTURING phase, which only a
    // `capture:true` listener receives. A weaker test (dispatching
    // directly on window, or only checking .tour-spot still .exists())
    // would stay green even with the listener deleted outright or its
    // `capture:true` silently dropped — this one mutation-tests both.
    const Harness = defineComponent({
      render: () => h('div', { id: 'scroll-container' }, [
        h('div', { 'data-tour': 'sites' }),
        h(WelcomeTour),
      ]),
    });
    const { wrapper } = mountWithStore(Harness, { attachTo: document.body });
    await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click'); // -> sites
    await settle();
    expect(wrapper.find('.tour-spot').exists()).toBe(true);

    // jsdom has no real scrollIntoView (the component itself guards for
    // that, see WelcomeTour.vue) — stub one so it's spyable here.
    const target = document.querySelector('[data-tour="sites"]');
    target.scrollIntoView = () => {};
    const scrollSpy = vi.spyOn(target, 'scrollIntoView');
    // simulate the target having actually moved, as a real scroll would
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      { top:999, left:5, width:100, height:50, bottom:1049, right:105 });

    document.getElementById('scroll-container')
      .dispatchEvent(new Event('scroll', { bubbles:false }));
    await settle();

    expect(scrollSpy).not.toHaveBeenCalled(); // re-measured in place, not re-scrolled-to
    const spot = wrapper.find('.tour-spot');
    expect(spot.exists()).toBe(true);
    expect(parseFloat(spot.element.style.top)).toBeCloseTo(999-6); // PAD=6, and it actually followed
    wrapper.unmount();
  });

  it('drops its own CSS transition while actively scrolling, so it tracks instead of chasing', async () => {
    const Harness = defineComponent({
      render: () => h('div', { id: 'scroll-container-2' }, [
        h('div', { 'data-tour': 'sites' }),
        h(WelcomeTour),
      ]),
    });
    const { wrapper } = mountWithStore(Harness, { attachTo: document.body });
    await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click'); // -> sites
    await settle();
    expect(wrapper.find('.tour-spot').element.style.transition).toBe(''); // normal (CSS-defined) by default

    document.getElementById('scroll-container-2')
      .dispatchEvent(new Event('scroll', { bubbles:false }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tour-spot').element.style.transition).toBe('none');

    // settles back to normal a moment after the scroll stops, not forever
    await new Promise(r => setTimeout(r, 200));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tour-spot').element.style.transition).toBe('');
    wrapper.unmount();
  });

  it('is marked purely decorative (aria-hidden) once lit', async () => {
    // jsdom doesn't apply main.css, so it can't exercise the actual
    // click-passthrough behaviour at runtime — that guarantee is
    // main.css's `.tour-spot{pointer-events:none}` rule itself, checked
    // statically below. This only confirms the element carries the
    // aria-hidden marker a purely visual overlay should have.
    const { wrapper } = mountWithTarget('farm');
    await settle();
    await wrapper.vm.$nextTick();
    const spot = wrapper.find('.tour-spot');
    expect(spot.exists()).toBe(true);
    expect(spot.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('main.css actually declares .tour-spot as pointer-events:none (the real click-passthrough guarantee)', () => {
    expect(cssRule('.tour-spot')).toMatch(/pointer-events:\s*none/);
  });

  it('main.css keeps the caption (.tour) stacked above the spotlight (.tour-spot)', () => {
    // Regression guard for a real bug caught in review: .card is ordinary
    // static content, and a positioned element with z-index >= 0 paints
    // above ALL static content regardless of DOM order (CSS2.1 Appendix
    // E) — so without .tour claiming its own stacking position, the
    // spotlight's box-shadow painted straight over the caption, dimming
    // it along with everything else. Confirmed by pixel-sampling a live
    // render before the fix: the caption's background read as its
    // blue-tint blended 60% toward black, same as any other dimmed area.
    const tour = cssRule('.tour');
    const spot = cssRule('.tour-spot');
    expect(tour).toMatch(/position:\s*relative/);
    expect(cssNum(tour, 'z-index')).toBeGreaterThan(cssNum(spot, 'z-index'));
  });

  it('a replay (restartTour) always starts over from slide 1, not wherever a previous run left off', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour, {
      seed: g => { g.generatePreset(); g.build(); }, // past the first-session gate already
    });
    expect(wrapper.find('.tour').exists()).toBe(false);

    store.restartTour();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Welcome to Rigs & Pools');
    expect(wrapper.text()).toContain('1 of 7');
  });

  it('a replay started from the last slide of a PRIOR run still resets to slide 1, not slide 7', async () => {
    const { wrapper, store } = mountWithStore(WelcomeTour);
    // walk to the end, then skip — same as a player who finished it once
    for (let i = 0; i < 6; i++) {
      await wrapper.findAll('button').find(b => b.text() === 'Next').trigger('click');
    }
    await wrapper.findAll('button').find(b => b.text() === "Got it — let's build").trigger('click');
    expect(wrapper.find('.tour').exists()).toBe(false);

    store.restartTour();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Welcome to Rigs & Pools');
    expect(wrapper.text()).toContain('1 of 7');
  });
});
