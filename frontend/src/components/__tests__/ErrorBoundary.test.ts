import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import ErrorBoundary from '../ErrorBoundary.vue';

const Boom = defineComponent({
  name: 'Boom',
  // eslint-disable-next-line vue/require-render-return -- always throws by design; there is no return path to test
  render(){ throw new Error('kaboom'); },
});
const Fine = defineComponent({
  name: 'Fine',
  render(){ return h('div', 'all good'); },
});

describe('ErrorBoundary', () => {
  it('renders slot content normally when nothing throws', () => {
    const { wrapper } = mountWithStore(ErrorBoundary, { slots: { default: Fine } });
    expect(wrapper.text()).toContain('all good');
    expect(wrapper.text()).not.toContain('hit an error');
  });

  it('catches a render error from its slot and shows a fallback instead of crashing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wrapper } = mountWithStore(ErrorBoundary, { slots: { default: Boom } });
    await nextTick(); // onErrorCaptured setting failed=true triggers an async re-render

    expect(wrapper.text()).toContain('This tab hit an error');
    expect(wrapper.text()).not.toContain('all good');
    spy.mockRestore();
  });

  it('the reload button reloads the page', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });

    const { wrapper } = mountWithStore(ErrorBoundary, { slots: { default: Boom } });
    await nextTick();
    const reloadBtn = wrapper.findAll('button').find(b => b.text() === 'Reload')!;
    await reloadBtn!.trigger('click');

    expect(reloadSpy).toHaveBeenCalledOnce();
    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});
