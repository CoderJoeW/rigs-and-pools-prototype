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

  it('opening a rig shows its detail sheet', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('.rigrow').trigger('click');
    expect(wrapper.find('.sheet').exists()).toBe(true);
    expect(wrapper.text()).toContain('Retrofit');
    expect(wrapper.text()).toContain('Repair');
    expect(wrapper.text()).toContain('Strip');
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
});
