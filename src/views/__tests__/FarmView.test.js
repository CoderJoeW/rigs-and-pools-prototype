import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import FarmView from '../FarmView.vue';

describe('FarmView', () => {
  it('shows the empty state before anything is built', () => {
    const { wrapper } = mountWithStore(FarmView);
    expect(wrapper.text()).toContain('Nothing installed');
    expect(wrapper.find('button').text()).toContain('Go shopping');
  });

  it('going shopping switches to the Build tab', async () => {
    const { wrapper, store } = mountWithStore(FarmView);
    await wrapper.find('button').trigger('click');
    expect(store.s.tab).toBe('build');
  });

  it('shows live stats and the mining-groups panel once a rig exists', () => {
    const { wrapper } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.text()).not.toContain('Nothing installed');
    expect(wrapper.text()).toContain('Mining groups');
    expect(wrapper.text()).toContain('Net today');
    expect(wrapper.text()).toContain('Main'); // the default group
  });

  it('adding a group creates a second one', async () => {
    const { wrapper, store } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const before = store.s.groups.length;
    const addBtn = wrapper.findAll('button').find(b => b.text().includes('New group'));
    await addBtn.trigger('click');
    expect(store.s.groups.length).toBe(before + 1);
  });

  it('renaming a group from its card updates the store', async () => {
    const { wrapper, store } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const renameBtn = wrapper.findAll('button').find(b => b.text() === 'Rename');
    await renameBtn.trigger('click');

    const input = wrapper.find('input[placeholder="Group name"]');
    await input.setValue('Night Shift');
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save name');
    await saveBtn.trigger('click');

    expect(store.s.groups[0].name).toBe('Night Shift');
    expect(wrapper.text()).toContain('Night Shift');
  });

  it('per-group chain/pool selects and the rename button carry a discriminating label', () => {
    const { wrapper, store } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const groupName = store.s.groups[0].name;
    const selects = wrapper.findAll('select');
    expect(selects.some(s => s.attributes('aria-label') === 'Chain for ' + groupName)).toBe(true);
    expect(selects.some(s => s.attributes('aria-label') === 'Pool for ' + groupName)).toBe(true);
    const renameBtn = wrapper.findAll('button').find(b => b.text() === 'Rename');
    expect(renameBtn.attributes('aria-label')).toBe('Rename ' + groupName);
  });
});
