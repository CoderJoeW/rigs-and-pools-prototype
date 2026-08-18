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
    expect(wrapper.text()).toContain('Net hashrate');
    expect(wrapper.text()).toContain('Profit / loss today');
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

  it('issue #7: nudges toward the next purchase once cash sits idle past what the farm can deploy', async () => {
    const { wrapper, store } = mountWithStore(FarmView, {
      seed: g => {
        g.generatePreset();
        g.build();
        for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
        g.s.cash = 1e6;
        const cost = g.idleCashAdvice.cost;
        g.s.cash = cost * 2;
      },
    });
    expect(wrapper.text()).toContain('sitting idle');
    const buildBtn = wrapper.findAll('button').find(b => b.text() === 'Build one');
    expect(buildBtn).toBeTruthy();
    await buildBtn.trigger('click');
    expect(store.s.tab).toBe('build');
  });

  it('stays quiet about idle cash right after building, before it has re-accumulated', () => {
    const { wrapper } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.text()).not.toContain('sitting idle');
  });

  it('surfaces a NaN "blocks today"/"best block" instead of silently rendering it as a plausible 0 (issue #14)', () => {
    const { wrapper } = mountWithStore(FarmView, {
      seed: g => {
        g.generatePreset(); g.build();
        g.s.today.blocks = NaN;
        g.s.bestBlock = NaN;
      },
    });
    expect(wrapper.text()).toContain('Blocks today');
    expect(wrapper.text()).toMatch(/Blocks today\s*—/);
    expect(wrapper.text()).toContain('Best block ever');
    expect(wrapper.text()).toMatch(/Best block ever\s*—/);
  });

  it('each site row shows a large industrial hardware shot', () => {
    const { wrapper } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    const row = wrapper.find('button.siterow');
    expect(row.exists()).toBe(true);
    const shot = row.find('.rackshot');
    expect(shot.exists()).toBe(true);
    expect(row.find('.rs-img').attributes('src')).toBeTruthy();
    // the shot carries the row's status, so it is not a decorative image
    expect(shot.attributes('aria-label')).toMatch(/ONLINE|IDLE|HOT/);
    expect(row.text()).toMatch(/ONLINE|IDLE|HOT/);
  });

  it('a site row shows the three headline metrics and its utilization', () => {
    const { wrapper } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    const row = wrapper.find('button.siterow');
    expect(row.text()).toContain('Hash rate');
    expect(row.text()).toContain('Power');
    expect(row.text()).toContain('Temp');
    expect(row.text()).toContain('Utilization');
    expect(row.find('.ubar i').attributes('style')).toMatch(/width:/);
  });

  it('the day ledger reports the figures the overview cards leave out', () => {
    const { wrapper } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const text = wrapper.text();
    for (const k of ['Gross revenue', 'Power cost', 'Net / day', 'Net to date',
                     'Rig uptime', 'Active rigs', 'Net margin', 'Est. payout (24h)',
                     'Payout progress']) {
      expect(text).toContain(k);
    }
  });

  it('a group\'s chain and pool read as pickers but stay real selects', () => {
    const { wrapper, store } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const gr = store.s.groups[0];
    const pill = wrapper.find('.gsel');
    expect(pill.exists()).toBe(true);
    // the visible pill mirrors the select's current value
    expect(pill.text()).toContain(store.chain(gr.chain).name);
    const native = pill.find('select.gsel-native');
    expect(native.exists()).toBe(true);
    expect(native.attributes('aria-label')).toBe('Chain for ' + gr.name);
  });

  it('holds back the "vs yesterday" chips until a full day has actually closed', () => {
    const { wrapper } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    // a fresh save has no closed day behind it, so there is nothing to compare
    // against and the chip must not invent a 0.0%
    expect(wrapper.text()).not.toContain('vs yesterday');
    expect(wrapper.find('.delta').exists()).toBe(false);
  });

  it('shows the "vs yesterday" chips once the previous day has closed', () => {
    const { wrapper } = mountWithStore(FarmView, {
      seed: g => {
        g.generatePreset(); g.build();
        // close a day with real figures on it, then step into the next one
        g.s.today = { day: 0, earned: 100, power: 40, blocks: 2 };
        g.s.t = 86400 + 3600;
        g.revenueDay; // reading the day rolls it over and stashes yesterday
        g.s.today.earned = 150; g.s.today.power = 30;
      },
    });
    expect(wrapper.text()).toContain('vs yesterday');
    expect(wrapper.find('.delta').exists()).toBe(true);
  });

  it('counts the automation rules that are actually switched on', async () => {
    const { wrapper, store } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); g.s.autoOff = true; g.s.autoFix = false; },
    });
    expect(wrapper.text()).toContain('1 rule active');
    store.s.autoFix = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('2 rules active');
  });

  it('tapping a site row opens that site on the Sites tab', async () => {
    const { wrapper, store } = mountWithStore(FarmView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const row = wrapper.find('button.siterow');
    expect(row.exists()).toBe(true);
    await row.trigger('click');
    expect(store.s.tab).toBe('sites');
    expect(store.s.activeSite).toBe(store.s.sites[0].id);
  });

});
