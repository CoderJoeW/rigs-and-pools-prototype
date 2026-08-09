import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountWithStore } from '../test/mountWithStore.js';
import App from '../App.vue';

/* App.vue's onMounted is async (it awaits loadSave() before starting the
   tick/autosave intervals). Each test flushes that before unmounting, so
   onUnmounted's clearInterval() clears a REAL timer instead of running
   before the async continuation ever set one — otherwise that interval
   is orphaned and keeps ticking a torn-down test's store afterward. */
let mounted = [];
beforeEach(() => {
  // App.vue keeps this meta tag (normally written once in index.html) in
  // sync at runtime; the test document needs it present to have something
  // to sync into, the same way the real page does.
  document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#F7F6F1">');
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
  it('renders the top bar, the default (Build) tab, and the bottom nav', async () => {
    const { wrapper } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.text()).toContain('Rigs & Pools');
    expect(wrapper.text()).toContain('Build a rig'); // BuildView is the default tab
    expect(wrapper.findAll('nav.tabs .tab')).toHaveLength(7);
  });

  it('switching tabs swaps the rendered view', async () => {
    const { wrapper } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    const farmTab = wrapper.findAll('nav.tabs .tab').find(t => t.text().includes('Farm'));
    await farmTab.trigger('click');
    expect(wrapper.text()).toContain('Nothing installed'); // FarmView's empty state
  });

  it('a toast appears with the class matching its kind, announced as a polite status', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    store.s.toast = { n: 1, text: 'Test toast', amount: '', cls: 'grn' };
    await wrapper.vm.$nextTick();
    const toast = wrapper.find('.toast.grn');
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
    expect(wrapper.find('.toast.dark').attributes('role')).toBe('alert');
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
    const toast = wrapper.find('.toast.rankup');
    expect(toast.exists()).toBe(true);
    expect(toast.attributes('role')).toBe('status'); // celebratory, not urgent
    expect(toast.attributes('aria-live')).toBe('polite');
    expect(toast.find('.num').text()).toBe('Engineer');
    expect(toast.text()).toContain('Rank up · 4 of 6');
  });

  // Issue #47: the rank-up toast is accompanied by a brief screen-level
  // flourish. It is keyed off the toast counter and gated on the class, so
  // every other kind of toast stays unaccompanied.
  it('a rank-up toast brings a screen flourish with it; other toasts do not', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.find('.rankflash').exists()).toBe(false);

    store.s.toast = { n: 1, text: 'Milestone', amount: 'First block', cls: 'grn' };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.rankflash').exists()).toBe(false);

    store.s.toast = { n: 2, text: 'Rank up · 4 of 6', amount: 'Engineer', cls: 'rankup' };
    await wrapper.vm.$nextTick();
    const flash = wrapper.find('.rankflash');
    expect(flash.exists()).toBe(true);
    // Decoration only: it must not reach a screen reader (the toast's own
    // live region already announces the moment) or swallow a tap.
    expect(flash.attributes('aria-hidden')).toBe('true');
    // ...and it must not have replaced or displaced the toast itself.
    expect(wrapper.find('.toast.rankup').exists()).toBe(true);
  });

  it('the rank-up flourish clears itself, leaving the toast on screen', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper, store } = mountWithStore(App);
      mounted.push(wrapper);
      await flushPromises();
      store.s.toast = { n: 1, text: 'Rank up · 4 of 6', amount: 'Engineer', cls: 'rankup' };
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.rankflash').exists()).toBe(true);

      // Well inside the toast's own 4.6s hold: the flourish is an
      // accompaniment to its arrival, not a second thing to sit through.
      vi.advanceTimersByTime(1000);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.rankflash').exists()).toBe(false);
      expect(wrapper.find('.toast.rankup').exists()).toBe(true);
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
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta.getAttribute('content')).toBe('#F7F6F1'); // auto, no matchMedia in jsdom -> light

    store.s.theme = 'dark';
    await wrapper.vm.$nextTick();
    expect(meta.getAttribute('content')).toBe('#0A0D0A');

    store.s.theme = 'light';
    await wrapper.vm.$nextTick();
    expect(meta.getAttribute('content')).toBe('#F7F6F1');
  });
});
