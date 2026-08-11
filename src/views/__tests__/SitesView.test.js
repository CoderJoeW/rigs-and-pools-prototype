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
    // the picker's v-if/else-if chain used to be split in two by a stray
    // element sitting between two branches, so an unrelated final v-else
    // (cooling plants) rendered alongside whichever sheet was actually open
    expect(wrapper.findAll('.sheet .cmp')).toHaveLength(1);
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

  describe('Fabrication', () => {
    const openFabSection = async wrapper => {
      const toggle = wrapper.findAll('button.rig-hd').find(b => b.text().includes('Fabrication'));
      await toggle.trigger('click');
    };

    it('shows not-installed by default, before expanding', () => {
      const { wrapper } = mountWithStore(SitesView);
      expect(wrapper.text()).toContain('Fabrication');
      expect(wrapper.text()).toContain('not installed');
    });

    it('expanding shows the pitch and an Install button, and opens the tier picker', async () => {
      const { wrapper } = mountWithStore(SitesView);
      await openFabSection(wrapper);
      expect(wrapper.text()).toContain('single biggest bet in the game');
      const installBtn = wrapper.findAll('button').find(b => b.text() === 'Install a fab');
      expect(installBtn.exists()).toBe(true);

      await installBtn.trigger('click');
      expect(wrapper.find('.sheet').exists()).toBe(true);
      expect(wrapper.text()).toContain('Bench fab');
      expect(wrapper.text()).toContain('Cleanroom fab');
      expect(wrapper.text()).toContain('Silicon foundry');
    });

    it('picking a tier queues it, and finishing construction shows the installed tier\'s details', async () => {
      const { wrapper, store } = mountWithStore(SitesView, { seed: g => { g.s.cash = 1000000; } });
      const f = store.s.sites[0];
      await openFabSection(wrapper);
      await wrapper.findAll('button').find(b => b.text() === 'Install a fab').trigger('click');
      const benchRow = wrapper.findAll('.cmp-r').find(r => r.text().includes('Bench fab'));
      await benchRow.trigger('click');

      expect(f.queue).toHaveLength(1);
      expect(f.fab).toBe(null);

      // same rush-style shortcut the store tests use — a fab's real build
      // time is hours too long to loop stepTick to in a test
      f.queue[0].left = 0.0001;
      store.stepTick(1);
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('Bench fab');
      expect(wrapper.text()).not.toContain('not installed');
      expect(wrapper.text()).toContain('1 of 3'); // tier
      expect(wrapper.text()).toContain('30'); // design budget
    });

    it('once installed, the action becomes Upgrade and the picker only offers strictly higher tiers', async () => {
      const { wrapper, store } = mountWithStore(SitesView, {
        seed: g => { g.s.cash = 1000000; g.s.sites[0].fab = 'fab-bench'; },
      });
      await openFabSection(wrapper);
      const upgradeBtn = wrapper.findAll('button').find(b => b.text() === 'Upgrade the fab');
      expect(upgradeBtn.exists()).toBe(true);
      expect(wrapper.findAll('button').some(b => b.text() === 'Install a fab')).toBe(false);

      await upgradeBtn.trigger('click');
      // the fab section header legitimately still shows the current tier's
      // name behind the sheet — only the picker's own offered rows matter here
      const sheetText = wrapper.find('.sheet').text();
      expect(sheetText).not.toContain('Bench fab'); // the current tier isn't offered again
      expect(sheetText).toContain('Cleanroom fab');
      expect(sheetText).toContain('Silicon foundry');
      // half the bench fab's $150,000 credited toward the $500,000 clean tier
      expect(sheetText).toContain('$75,000 credited');
    });

    it('while a fab job is queued, reads as under construction rather than not installed, and hides the dead Install button', async () => {
      const { wrapper, store } = mountWithStore(SitesView, { seed: g => { g.s.cash = 1000000; } });
      const f = store.s.sites[0];
      await openFabSection(wrapper);
      await wrapper.findAll('button').find(b => b.text() === 'Install a fab').trigger('click');
      const benchRow = wrapper.findAll('.cmp-r').find(r => r.text().includes('Bench fab'));
      await benchRow.trigger('click');
      expect(f.queue).toHaveLength(1);

      expect(wrapper.text()).toContain('under construction');
      expect(wrapper.text()).not.toContain('not installed');
      expect(wrapper.findAll('button').some(b => b.text() === 'Install a fab')).toBe(false);
    });

    it('once at the top tier, the picker explains there is nothing higher instead of showing an empty sheet', async () => {
      const { wrapper } = mountWithStore(SitesView, {
        seed: g => { g.s.cash = 1000000; g.s.sites[0].fab = 'fab-foundry'; },
      });
      await openFabSection(wrapper);
      await wrapper.findAll('button').find(b => b.text() === 'Upgrade the fab').trigger('click');

      expect(wrapper.text()).toContain('already at the top tier');
    });
  });
});
