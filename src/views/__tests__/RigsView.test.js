import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import RigsView from '../RigsView.vue';

describe('RigsView', () => {
  it('shows the empty state before anything is built', () => {
    const { wrapper } = mountWithStore(RigsView);
    expect(wrapper.text()).toContain('No rigs at');
  });

  it('lists a built rig with its filter chips and counts', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.find('.rigrow').exists()).toBe(true);
    expect(wrapper.text()).toContain('Rig 1');
    expect(wrapper.text()).toContain('Running'); // it's on, mid-assembly counts as its own state
  });

  it('opening a rig shows its detail sheet, with dialog semantics', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('.rigrow').trigger('click');
    const sheet = wrapper.find('.sheet');
    expect(sheet.exists()).toBe(true);
    expect(sheet.attributes('role')).toBe('dialog');
    expect(sheet.attributes('aria-modal')).toBe('true');
    expect(sheet.attributes('aria-labelledby')).toBeTruthy();
    expect(wrapper.text()).toContain('Retrofit');
    expect(wrapper.text()).toContain('Repair');
    expect(wrapper.text()).toContain('Strip');
  });

  it('Escape closes the rig detail sheet', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
      attachTo: document.body,
    });
    await wrapper.find('.rigrow').trigger('click');
    expect(wrapper.find('.sheet').exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.sheet').exists()).toBe(false);
    wrapper.unmount();
  });

  it('the fleet-actions sheet opens and shows scope-aware previews', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const fleetBtn = wrapper.findAll('button').find(b => b.text().includes('Fleet actions'));
    await fleetBtn.trigger('click');
    expect(wrapper.text()).toContain('Applies to');
    expect(wrapper.text()).toContain('Repair worn cards');
    expect(wrapper.text()).toContain('Move to a group');
  });

  it('renaming a rig from its detail sheet updates the store', async () => {
    const { wrapper, store } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('.rigrow').trigger('click');
    const renameBtn = wrapper.findAll('button').find(b => b.text() === 'Rename');
    await renameBtn.trigger('click');

    const input = wrapper.find('input[placeholder="Rig name"]');
    await input.setValue('Tessera Miner');
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save name');
    await saveBtn.trigger('click');

    expect(store.s.rigs[0].name).toBe('Tessera Miner');
    expect(wrapper.text()).toContain('Tessera Miner');
  });

  it('the compact wear bar exposes wear as an accessible label, not just color', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const bar = wrapper.find('.wearbar');
    expect(bar.attributes('aria-label')).toBe('Wear 0%');
  });

  /* The Sites floor plan opens the real rig sheet rather than a second,
     lesser copy of it — the handoff is one id parked on the store. */
  it('opens straight into the sheet for a rig handed over from the floor plan', async () => {
    const { wrapper, store } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.focusRig = g.s.rigs[0].id; },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.sheet').exists()).toBe(true);
    expect(wrapper.find('.sheet').text()).toContain(store.s.rigs[0].name);
    expect(store.s.focusRig).toBeNull();   // read once, never a stale ambush
  });

  it('ignores a handoff for a rig that is not at the active site', () => {
    const { wrapper, store } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].site = 999; g.s.focusRig = g.s.rigs[0].id; },
    });
    expect(wrapper.find('.sheet').exists()).toBe(false);
    expect(store.s.focusRig).toBeNull();
  });

  it('the mining-group select in the rig sheet is a real labeled control', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('.rigrow').trigger('click');
    const select = wrapper.find('#rig-group-select');
    expect(select.exists()).toBe(true);
    expect(wrapper.find('label[for="rig-group-select"]').exists()).toBe(true);
  });
});
