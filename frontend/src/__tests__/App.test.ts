import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountWithStore } from '../test/mountWithStore.js';
import { freshStore } from '../test/testStore.js';
import { cssRule } from '../test/cssRule.js';
import App from '../App.vue';

/* App.vue's onMounted is async (it awaits loadSave() before starting the
   tick/autosave intervals). Each test flushes that before unmounting, so
   onUnmounted's clearInterval() clears a REAL timer instead of running
   before the async continuation ever set one — otherwise that interval
   is orphaned and keeps ticking a torn-down test's store afterward. */
let mounted: any[] = [];
beforeEach(() => {
  // App.vue keeps this meta tag (normally written once in index.html) in
  // sync at runtime; the test document needs it present to have something
  // to sync into, the same way the real page does.
  document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#F7F6F1">');
  // most of these tests mount App against a fresh, save-less store — a
  // save left in real localStorage by a test that writes one (the catch-up
  // coverage below) would otherwise leak into whichever test runs next and
  // have App boot from IT instead of a blank slate.
  try { localStorage.clear(); } catch (e) {}
});
afterEach(async () => {
  await flushPromises();
  for (const w of mounted) w.unmount();
  mounted = [];
  delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.remove();
});

describe('App', () => {
  it('renders the top bar, the default (Farm) tab, and the bottom nav', async () => {
    const { wrapper } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.text()).toContain('Rigs & Pools');
    expect(wrapper.text()).toContain('Nothing installed'); // FarmView is the default tab
    expect(wrapper.findAll('nav.tabs .tab')).toHaveLength(7);
  });

  it('shows a loading screen instead of a flash of default state before loadSave resolves', () => {
    // Vue paints the DEFAULT state on the very first frame regardless —
    // loadSave() hasn't resolved yet at that point. Without booting gating
    // the real UI, that shows as a flash of a fresh $500 start even for a
    // returning player, a beat before the real save lands on top of it.
    const { wrapper } = mountWithStore(App);
    mounted.push(wrapper);
    // deliberately NOT flushed yet — this is the exact gap being covered
    expect(wrapper.find('.boot')!.exists()).toBe(true);
    expect(wrapper.find('nav.tabs')!.exists()).toBe(false); // the real shell isn't there yet either
  });

  it('replaces the loading screen with the real app once loadSave resolves', async () => {
    const { wrapper } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.find('.boot')!.exists()).toBe(false);
    expect(wrapper.find('nav.tabs')!.exists()).toBe(true);
  });

  it('shows live catch-up progress on the loading screen during a long offline return', async () => {
    // seeded in real localStorage BEFORE mounting, so App's own onMounted
    // finds it via the normal loadSave() path — same as a real returning
    // player, not a shortcut around the mechanism being tested.
    const seed = freshStore();
    seed.generatePreset();
    seed.build();
    for (let i = 0; i < 60; i++) seed.stepTick(60);
    await seed.saveNow();
    const raw = JSON.parse(localStorage.getItem('rigs-and-pools-save')!);
    raw.savedAt = Date.now() - 24 * 3600 * 1000;
    localStorage.setItem('rigs-and-pools-save', JSON.stringify(raw));

    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);

    // give it a couple of real chunks to run, then check the loading
    // screen actually reflects progress rather than sitting inert
    await new Promise(r => setTimeout(r, 20));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.boot')!.exists()).toBe(true);
    expect(wrapper.text()).toContain('Catching up on');
    // Not '.boot .cd-bar i': App's template has two root-level v-if blocks
    // (.boot, and the real shell), so Vue always compiles it to a Fragment.
    // While booting, .boot is the ONLY element root vue-test-utils' find()
    // sees, and Element.querySelectorAll('.boot ...') never matches a
    // selector whose leftmost class is the query root itself — there is no
    // further .boot *inside* .boot. .cd-bar only ever renders inside .boot,
    // so scoping through .boot here would add nothing this check doesn't
    // already cover via the assertion just above.
    expect(wrapper.find('.cd-bar i')!.exists()).toBe(true);

    // let the real catch-up finish (real seconds — same cost as the
    // dedicated persistence.test.js coverage of the same 24h path) so
    // nothing is left mid-flight when afterEach unmounts
    while (store.s.catchUp) await new Promise(r => setTimeout(r, 50));
    await flushPromises();
    expect(wrapper.find('.boot')!.exists()).toBe(false);
  });

  it('credits real time missed while the tab was backgrounded, not just after a reload', async () => {
    // setInterval is throttled or fully suspended once a tab is hidden, so
    // without a visibilitychange-driven catch-up the tick loop just stalls
    // until the page is reloaded (the only other path that credits away
    // time). This exercises the mid-session path instead.
    const { wrapper, store } = mountWithStore(App, {
      seed: (g) => { g.generatePreset(); g.build(); },
    });
    mounted.push(wrapper);
    await flushPromises();
    expect(store.s.rigs.length).toBeGreaterThan(0);
    const tBefore = store.s.t;

    const visDesc = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    let now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));

      now += 3600 * 1000; // an hour passes while backgrounded, tab never reloaded
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      dateSpy.mockRestore();

      while (store.s.catchUp) await new Promise(r => setTimeout(r, 20));
      await flushPromises();

      // The real assertion: game time actually moved by close to the hour
      // that passed while hidden, instead of stalling until a reload.
      expect(store.s.t).toBeGreaterThanOrEqual(tBefore + 3500);
    } finally {
      dateSpy.mockRestore();
      if (visDesc) Object.defineProperty(document, 'visibilityState', visDesc);
      else delete (document as any).visibilityState;
    }
  });

  it('credits real time lost to a stall even with no visibilitychange at all (e.g. an OS sleep)', async () => {
    // An OS-level sleep/lock freezes setInterval exactly like a backgrounded
    // tab does, but never hides the tab — visibilitychange fires on neither
    // end of it, so onVisibility never engages at all. Only the tick loop's
    // own gap-from-Date.now() check can catch this one.
    const { wrapper, store } = mountWithStore(App, {
      seed: (g) => { g.generatePreset(); g.build(); },
    });
    mounted.push(wrapper);
    await flushPromises();
    expect(store.s.rigs.length).toBeGreaterThan(0);
    const tBefore = store.s.t;

    let now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      now += 2 * 3600 * 1000; // two hours pass with the tab never hidden
      // real (unmocked) wall-clock wait so the app's own real setInterval
      // actually fires at least once while the mocked jump is still live
      await new Promise(r => setTimeout(r, 150));

      while (store.s.catchUp) await new Promise(r => setTimeout(r, 20));
      await flushPromises();

      expect(store.s.t).toBeGreaterThanOrEqual(tBefore + 2 * 3600 - 60);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it('does not double-credit background time the tick loop already caught on its own', async () => {
    // A backgrounded tab isn't fully frozen, just throttled — onTick's own
    // stall backstop can fire (and credit part of the background span)
    // before the tab is ever revisited. If onVisibility credited the whole
    // hidden duration from an independent hidden-at mark instead of the
    // same shared checkpoint, it would re-pay the slice onTick already
    // caught.
    const { wrapper, store } = mountWithStore(App, {
      seed: (g) => { g.generatePreset(); g.build(); },
    });
    mounted.push(wrapper);
    await flushPromises();
    const tBefore = store.s.t;

    const visDesc = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    let now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));

      // 90 seconds pass while still hidden — enough for onTick's own gap
      // check (>60s) to fire and credit that span on its own.
      now += 90 * 1000;
      await new Promise(r => setTimeout(r, 150)); // let the real timer actually fire
      while (store.s.catchUp) await new Promise(r => setTimeout(r, 20));

      // another 30 minutes pass, still hidden, before the tab comes back
      now += 30 * 60 * 1000;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      dateSpy.mockRestore();

      while (store.s.catchUp) await new Promise(r => setTimeout(r, 20));
      await flushPromises();

      const totalAway = 90 + 30 * 60; // 1890s total, credited across both paths
      expect(store.s.t).toBeGreaterThanOrEqual(tBefore + totalAway - 60);
      // the regression this guards: double-crediting would land close to
      // tBefore + totalAway + 90 (the onTick slice paid out twice)
      expect(store.s.t).toBeLessThan(tBefore + totalAway + 60);
    } finally {
      dateSpy.mockRestore();
      if (visDesc) Object.defineProperty(document, 'visibilityState', visDesc);
      else delete (document as any).visibilityState;
    }
  });

  it('pins the overlay covering the whole screen during any catch-up, not just the loading one', () => {
    // jsdom doesn't do real hit-testing by z-index/position, so a click
    // dispatched at the "Restore from backup" button would fire its
    // handler regardless of what's visually on top of it — the CSS is
    // what actually blocks it in a real browser. This is also the
    // practical half of the fix for a real bug: two overlapping catch-ups
    // corrupt each other (see persistence.js's `hydrating` guard), and the
    // button that starts one is unreachable while this overlay covers it.
    const rule = cssRule('.boot');
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/inset:\s*0/);
    // higher than every other layered element in the app (.sheet 80,
    // .tour-spot 70, .toast 60, .rankflash 55) — the highest, not merely
    // "high enough for today's other layers"
    const z = Number(rule.match(/z-index:\s*(\d+)/)?.[1]);
    expect(z).toBeGreaterThanOrEqual(100);
  });

  it('a brand-new player sees the walkthrough tour over the empty farm', async () => {
    const { wrapper } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.text()).toContain('Welcome to Rigs & Pools');
  });

  it('switching tabs swaps the rendered view', async () => {
    const { wrapper } = mountWithStore(App, { seed: g => g.dismissTour() });
    mounted.push(wrapper);
    await flushPromises();
    const buildTab = wrapper.findAll('nav.tabs .tab').find(t => t.text().includes('Build'))!;
    await buildTab.trigger('click');
    expect(wrapper.text()).toContain('Design a rig, then order the parts.'); // BuildView, reached from the default Farm tab
  });

  it('a toast appears with the class matching its kind, announced as a polite status', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    store.s.toast = { n: 1, text: 'Test toast', amount: '', cls: 'grn' };
    await wrapper.vm.$nextTick();
    const toast = wrapper.find('.toast.grn')!;
    expect(toast.exists()).toBe(true);
    expect(toast.attributes('role')).toBe('status');
    expect(toast.attributes('aria-live')).toBe('polite');
    expect(wrapper.text()).toContain('Test toast');
  });

  it('a "dark"-kind toast (urgent news) is announced as an alert', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    store.s.toast = { n: 1, text: 'Out of cash', amount: '', cls: 'dark' };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.toast.dark')!.attributes('role')).toBe('alert');
  });

  // Issue #40: a rank-up is rare and permanent, so it carries its own class
  // rather than the 'grn' every ordinary milestone uses. The rank name rides
  // in on the amount slot, which .toast.rankup promotes to the headline.
  it('a rank-up toast gets its own class and leads with the rank name', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    store.s.toast = { n: 1, text: 'Rank up · 4 of 6', amount: 'Engineer', cls: 'rankup' };
    await wrapper.vm.$nextTick();
    const toast = wrapper.find('.toast.rankup')!;
    expect(toast.exists()).toBe(true);
    expect(toast.attributes('role')).toBe('status'); // celebratory, not urgent
    expect(toast.attributes('aria-live')).toBe('polite');
    expect(toast.find('.num')!.text()).toBe('Engineer');
    expect(toast.text()).toContain('Rank up · 4 of 6');
  });

  // Issue #47: the rank-up toast is accompanied by a brief screen-level
  // flourish. It is keyed off the toast counter and gated on the class, so
  // every other kind of toast stays unaccompanied.
  it('a rank-up toast brings a screen flourish with it; other toasts do not', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.find('.rankflash')!.exists()).toBe(false);

    store.s.toast = { n: 1, text: 'Milestone', amount: 'First block', cls: 'grn' };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.rankflash')!.exists()).toBe(false);

    store.s.toast = { n: 2, text: 'Rank up · 4 of 6', amount: 'Engineer', cls: 'rankup' };
    await wrapper.vm.$nextTick();
    const flash = wrapper.find('.rankflash')!;
    expect(flash.exists()).toBe(true);
    // Decoration only: it must not reach a screen reader (the toast's own
    // live region already announces the moment) or swallow a tap.
    expect(flash.attributes('aria-hidden')).toBe('true');
    // ...and it must not have replaced or displaced the toast itself.
    expect(wrapper.find('.toast.rankup')!.exists()).toBe(true);
  });

  it('the rank-up flourish clears itself, leaving the toast on screen', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper, store } = mountWithStore(App);
      mounted.push(wrapper);
      await flushPromises();
      store.s.toast = { n: 1, text: 'Rank up · 4 of 6', amount: 'Engineer', cls: 'rankup' };
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.rankflash')!.exists()).toBe(true);

      // Well inside the toast's own 4.6s hold: the flourish is an
      // accompaniment to its arrival, not a second thing to sit through.
      vi.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.rankflash')!.exists()).toBe(false);
      expect(wrapper.find('.toast.rankup')!.exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies data-theme to the document root, and clears it for auto', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    expect(document.documentElement.dataset.theme).toBeUndefined(); // default is auto

    store.s.theme = 'dark';
    await wrapper.vm.$nextTick();
    expect(document.documentElement.dataset.theme).toBe('dark');

    store.s.theme = 'auto';
    await wrapper.vm.$nextTick();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('keeps the theme-color meta tag in sync with the chosen theme', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    const meta = document.querySelector('meta[name="theme-color"]')!;
    expect(meta.getAttribute('content')).toBe('#F7F6F1'); // auto, no matchMedia in jsdom -> light

    store.s.theme = 'dark';
    await wrapper.vm.$nextTick();
    expect(meta.getAttribute('content')).toBe('#0A0D0A');

    store.s.theme = 'light';
    await wrapper.vm.$nextTick();
    expect(meta.getAttribute('content')).toBe('#F7F6F1');
  });
});
