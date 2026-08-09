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

  /* The floor plan is the one place a site is drawn as a place rather than
     counted. Its whole contract is: a tile per position, occupied ones
     carrying the SAME status class the Rigs list uses, empty ones dashed. */
  it('draws one dashed tile per free position when nothing is installed', () => {
    const { wrapper, store } = mountWithStore(SitesView);
    const slots = store.siteSlots(store.s.sites[0]);
    const tiles = wrapper.findAll('.rigtile');
    expect(tiles).toHaveLength(slots);
    expect(tiles.every(t => t.classes().includes('empty'))).toBe(true);
    expect(wrapper.findAll('button.rigtile')).toHaveLength(0);
    expect(wrapper.text()).toContain('Nothing installed here yet');
  });

  it('gives an installed rig a tile carrying its live status class', () => {
    const { wrapper, store } = mountWithStore(SitesView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    const tile = wrapper.find('button.rigtile');
    expect(tile.exists()).toBe(true);
    // the same vocabulary .dot.* uses — not a parallel taxonomy
    expect(tile.classes()).toContain(store.rigState(store.s.rigs[0]).dot);
    expect(tile.attributes('aria-label')).toContain(store.s.rigs[0].name);
    // colour alone must not carry it: the legend names whatever is on screen
    expect(wrapper.find('.riglegend .dot').classes())
      .toContain(store.rigState(store.s.rigs[0]).dot);
    expect(wrapper.find('.riglegend').text()).toMatch(/\S/);
  });

  it('a rig still under assembly reads as building, not as running', () => {
    const { wrapper } = mountWithStore(SitesView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.find('button.rigtile').classes()).toContain('build');
  });

  it('tapping a tile hands that rig to the Rigs tab', async () => {
    const { wrapper, store } = mountWithStore(SitesView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('button.rigtile').trigger('click');
    expect(store.s.focusRig).toBe(store.s.rigs[0].id);
    expect(store.s.tab).toBe('rigs');
  });
});
