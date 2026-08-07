import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#F5F6F4">');
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

  it('a toast appears with the class matching its kind', async () => {
    const { wrapper, store } = mountWithStore(App);
    mounted.push(wrapper);
    await flushPromises();
    store.s.toast = { n: 1, text: 'Test toast', amount: '', cls: 'grn' };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.toast.grn').exists()).toBe(true);
    expect(wrapper.text()).toContain('Test toast');
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
    expect(meta.getAttribute('content')).toBe('#F5F6F4'); // auto, no matchMedia in jsdom -> light

    store.s.theme = 'dark';
    await wrapper.vm.$nextTick();
    expect(meta.getAttribute('content')).toBe('#14181A');

    store.s.theme = 'light';
    await wrapper.vm.$nextTick();
    expect(meta.getAttribute('content')).toBe('#F5F6F4');
  });
});
