import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import SitesView from '../SitesView.vue';

describe('SitesView', () => {
  it('lists the starting site and its manage panel', () => {
    const { wrapper } = mountWithStore(SitesView);
    expect(wrapper.text()).toContain('Spare bedroom');
    expect(wrapper.text()).toContain('Manage');
  });

  it('expanding the Power section renders the flow bars without throwing', async () => {
    const { wrapper } = mountWithStore(SitesView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const powerToggle = wrapper.findAll('button.rig-hd').find(b => b.text().includes('Power'));
    await powerToggle.trigger('click');
    expect(wrapper.text()).toContain('Coming from');
    expect(wrapper.text()).toContain('Going to');
  });

  it('opens the site picker sheet for a new site', async () => {
    const { wrapper } = mountWithStore(SitesView);
    const newSiteBtn = wrapper.findAll('button').find(b => b.text().includes('New site'));
    await newSiteBtn.trigger('click');
    expect(wrapper.find('.sheet').exists()).toBe(true);
    expect(wrapper.text()).toContain('New site');
  });

  it('renaming the active site updates its displayed name', async () => {
    const { wrapper, store } = mountWithStore(SitesView);
    const renameBtn = wrapper.findAll('button').find(b => b.text() === 'Rename');
    await renameBtn.trigger('click');
    const input = wrapper.find('input');
    await input.setValue('My Farm');
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save name');
    await saveBtn.trigger('click');
    expect(store.s.sites[0].name).toBe('My Farm');
  });

  it('marks the active site row with aria-current', () => {
    const { wrapper, store } = mountWithStore(SitesView);
    const row = wrapper.findAll('.rowline').find(r => r.text().includes(store.s.sites[0].name));
    expect(row.attributes('aria-current')).toBe('true');
  });
});
