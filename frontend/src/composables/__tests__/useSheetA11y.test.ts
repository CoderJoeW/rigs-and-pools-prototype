import { describe, it, expect, vi } from 'vitest';
import { defineComponent, ref, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useSheetA11y } from '../useSheetA11y.js';

/* A minimal stand-in for one of the app's real ".sheet" panels: a trigger
   button outside it, and two focusable buttons inside — enough to exercise
   open-focus, Tab-trap and Escape without dragging in a whole view. */
function makeHarness(closeSpy: () => void, { startOpen = false } = {}) {
  return defineComponent({
    setup() {
      const open = ref(startOpen);
      const sheetEl = ref(null);
      useSheetA11y(sheetEl, open, () => { open.value = false; closeSpy(); });
      return { open, sheetEl };
    },
    render() {
      return h('div', [
        h('button', { id: 'trigger', onClick: () => { this.open = true; } }, 'Open'),
        this.open
          ? h('div', { ref: 'sheetEl', class: 'sheet' }, [
              h('button', { id: 'first' }, 'First'),
              h('button', { id: 'last' }, 'Last'),
            ])
          : null,
      ]);
    },
  });
}

describe('useSheetA11y', () => {
  it('moves focus into the panel when it opens, and back to the trigger when it closes', async () => {
    const wrapper = mount(makeHarness(() => {}), { attachTo: document.body });
    const trigger = wrapper.find('#trigger')!.element as HTMLElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await wrapper.find('#trigger')!.trigger('click');
    await nextTick();
    await nextTick(); // the composable's own nextTick before focusing
    expect(document.activeElement).toBe(wrapper.find('#first')!.element);

    wrapper.vm.open = false;
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
  });

  it('Escape calls the close handler', async () => {
    const closeSpy = vi.fn();
    const wrapper = mount(makeHarness(closeSpy), { attachTo: document.body });
    await wrapper.find('#trigger')!.trigger('click');
    await nextTick();
    await nextTick();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closeSpy).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('Tab from the last focusable wraps to the first, trapping focus in the panel', async () => {
    const wrapper = mount(makeHarness(() => {}), { attachTo: document.body });
    await wrapper.find('#trigger')!.trigger('click');
    await nextTick();
    await nextTick();

    const last = wrapper.find('#last')!.element as HTMLElement;
    const first = wrapper.find('#first')!.element as HTMLElement;
    last.focus();
    expect(document.activeElement).toBe(last);

    const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(ev);
    expect(document.activeElement).toBe(first);
    wrapper.unmount();
  });

  // Every .sheet in the app today starts closed, so this covers a case
  // nothing currently hits — a sheet whose isOpen is already true when the
  // component mounts, with no click ever transitioning it false->true.
  // Without `immediate` on the watcher, that starting state would never be
  // seen as a transition and focus would never enter the dialog. Kept as a
  // defensive guarantee for whichever future sheet needs it.
  it('focuses the panel immediately when it starts already open, with no prior open transition', async () => {
    const wrapper = mount(makeHarness(() => {}, { startOpen: true }), { attachTo: document.body });
    await nextTick();
    await nextTick(); // the composable's own nextTick before focusing
    expect(document.activeElement).toBe(wrapper.find('#first')!.element);
    wrapper.unmount();
  });

  it('does nothing while closed — no error dispatching Escape with no panel mounted', () => {
    const closeSpy = vi.fn();
    const wrapper = mount(makeHarness(closeSpy), { attachTo: document.body });
    expect(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
      .not.toThrow();
    expect(closeSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
