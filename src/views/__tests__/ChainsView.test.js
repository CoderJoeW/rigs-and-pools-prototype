import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import ChainsView from '../ChainsView.vue';

/* The tab is split across three segments now, so anything below the chains
   themselves has to be switched to first — the same click a player makes. */
const seg = (wrapper, label) =>
  wrapper.findAll('.segtab').find(t => t.text().includes(label)).trigger('click');

describe('ChainsView', () => {
  it('lists all five chains as cards, with the other segments a click away', async () => {
    const { wrapper } = mountWithStore(ChainsView);
    expect(wrapper.findAll('.chaincard').length).toBe(5);
    for (const name of ['Tessera', 'Ferro', 'Halcyon', 'Nova', 'Obelisk']) {
      expect(wrapper.text()).toContain(name);
    }
    // The panels are v-show, so "which one am I on" is the display, not the DOM.
    const shown = () => wrapper.findAll('.chpanel')
      .map(p => !(p.attributes('style') || '').includes('display: none'));
    expect(shown()).toEqual([true, false, false]);
    await seg(wrapper, 'Market');
    expect(shown()).toEqual([false, true, false]);
    expect(wrapper.find('#chpan-market').text()).toContain('Rival detail');
    await seg(wrapper, 'Your pools');
    expect(shown()).toEqual([false, false, true]);
    expect(wrapper.find('#chpan-yours').text()).toContain('Found a pool');
  });

  it('a chain card carries its emblem, share, emission and difficulty', () => {
    const { wrapper } = mountWithStore(ChainsView);
    const card = wrapper.findAll('.chaincard').find(c => c.text().includes('Tessera'));
    const gem = card.find('.chaingem');
    expect(gem.exists()).toBe(true);
    expect(gem.find('img.cg-img').exists()).toBe(true);
    // Decorative — the chain is named in text right beside it.
    expect(gem.attributes('aria-hidden')).toBe('true');
    expect(card.text()).toContain('Target: 20s');
    expect(card.text()).toContain('TSR');
    expect(card.text()).toContain('Your hashrate share');
    expect(card.text()).toContain('Emission / day');
    expect(card.text()).toContain('Current difficulty');
    // Tessera emits one 833.333 reward every 20s — ~3,599,998.56 coins/day
    expect(card.text()).toContain('3,599,998.56');
    // The bar is decorative: the share it draws is printed as text beside it,
    // inside the same button, so labelling it too said the figure twice.
    expect(card.find('.cc-bar').attributes('aria-hidden')).toBe('true');
    // The realized rate, restored to the card after the review found it had
    // been dropped from the app entirely along with the old row.
    expect(card.text()).toMatch(/\d\.\d{4}\/MH/);
  });

  it('expanding a chain card shows its detail', async () => {
    const { wrapper } = mountWithStore(ChainsView);
    const card = wrapper.findAll('.chaincard').find(c => c.text().includes('Tessera'));
    await card.find('.cc-tap').trigger('click');
    expect(card.text()).toContain('Your mean time to a block');
    expect(card.text()).toContain('Blocks found');
  });

  it('the solo-vs-pool panel counts payout frequency, not earnings', () => {
    const { wrapper } = mountWithStore(ChainsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    const svp = wrapper.find('.svp');
    expect(svp.exists()).toBe(true);
    expect(svp.text()).toContain('Blocks / day you find');
    expect(svp.text()).toContain('Blocks / day you share in');
    expect(svp.text()).toContain('Payouts land');
  });

  it('with no pool to point at, the two sides agree rather than one going blank', () => {
    const { wrapper, store } = mountWithStore(ChainsView, {
      seed: g => {
        g.generatePreset(); g.build();
        g.s.rigs.forEach(r => { r.building = 0; });
        // Nothing else on the chain, so the arithmetic is fully determined.
        g.s.sims.length = 0; g.s.pools.length = 0;
      },
    });
    const g = store;
    const gr = g.s.groups[0];
    const rate = 86400 * g.groupHash(gr) / Math.max(1, g.diffOf(g.chain(gr.chain)));
    const text = wrapper.find('.svp').text();
    // Printed once per side, and the multiple is exactly one.
    expect(text.split(rate.toFixed(2)).length - 1).toBe(2);
    expect(text).toContain('1.00× as often');
  });

  it('a pool two of your groups share is counted once, not once per group', async () => {
    const { wrapper, store } = mountWithStore(ChainsView, {
      seed: g => {
        g.s.cash = 5e6; g.s.sites[0].shell = 'warehouse';
        g.generatePreset(); g.build(); g.build();
        g.s.rigs.forEach(r => { r.building = 0; });
        g.s.sims.length = 0; g.s.pools.length = 0;
        g.s.cash = 10000;
        g.foundPool(g.s.groups[0].chain, 'PPLNS', 0.02);
      },
    });
    const g = store;
    const pool = g.s.pools.find(p => p.owner === 'you');
    const chain = g.s.groups[0].chain;
    g.s.groups.push({ id: 99, name: 'Second', chain, pool: pool.id, pending: 0 });
    g.s.groups[0].pool = pool.id;
    g.s.rigs[1].group = 99;
    await wrapper.vm.$nextTick();

    const mine = g.s.rigs.reduce((a, r) => a + g.rigHash(r), 0);
    const once = 86400 * mine / Math.max(1, g.diffOf(g.chain(chain)));
    const text = wrapper.find('.svp').text();
    // Counting the pool per group would have doubled the pool side.
    expect(text.split(once.toFixed(2)).length - 1).toBe(2);
    expect(text).toContain('1.00× as often');
  });

  it('the pool side is never smaller than solo, whatever the field looks like', () => {
    const { wrapper } = mountWithStore(ChainsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs.forEach(r => { r.building = 0; }); },
    });
    const m = wrapper.find('.svp').text().match(/([\d.]+)× as often/);
    expect(m).toBeTruthy();
    expect(parseFloat(m[1])).toBeGreaterThanOrEqual(1);
  });

  it('the segmented control is a real tablist — panels, and arrow keys', async () => {
    const { wrapper } = mountWithStore(ChainsView);
    const tabs = wrapper.findAll('.segtab');
    expect(tabs.map(t => t.attributes('role'))).toEqual(['tab', 'tab', 'tab']);
    // One tab stop, on the selected tab.
    expect(tabs.map(t => t.attributes('tabindex'))).toEqual(['0', '-1', '-1']);
    for (const t of tabs) {
      const panel = wrapper.find('#' + t.attributes('aria-controls'));
      expect(panel.attributes('role')).toBe('tabpanel');
      expect(panel.attributes('aria-labelledby')).toBe(t.attributes('id'));
    }
    await wrapper.find('.segbar').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.findAll('.segtab')[1].attributes('aria-selected')).toBe('true');
    await wrapper.find('.segbar').trigger('keydown', { key: 'End' });
    expect(wrapper.findAll('.segtab')[2].attributes('aria-selected')).toBe('true');
    await wrapper.find('.segbar').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.findAll('.segtab')[0].attributes('aria-selected')).toBe('true');
  });

  it('the expanded detail keeps the figures the card has no room for', async () => {
    const { wrapper } = mountWithStore(ChainsView);
    const card = wrapper.findAll('.chaincard').find(c => c.text().includes('Tessera'));
    await card.find('.cc-tap').trigger('click');
    expect(card.text()).toContain('Pays');
    expect(card.text()).toContain('Network');
    expect(card.text()).toMatch(/\d+ miners?/);
    expect(card.text()).toMatch(/\d+ pools?/);
    expect(card.find('.cc-win').exists()).toBe(true);   // the block window
  });

  it('the ACTIVE CHAINS info note is its own disclosure', async () => {
    const { wrapper } = mountWithStore(ChainsView);
    expect(wrapper.find('.chaininfo').exists()).toBe(false);
    await wrapper.find('.secinfo').trigger('click');
    expect(wrapper.find('.chaininfo').text()).toContain('block window');
  });

  it('opens the found-a-pool form and reflects the chosen chain', async () => {
    const { wrapper } = mountWithStore(ChainsView);
    await seg(wrapper, 'Your pools');
    const foundBtn = wrapper.findAll('button').find(b => b.text().includes('Found a pool'));
    await foundBtn.trigger('click');
    expect(wrapper.text()).toContain('Bond required');
    expect(wrapper.text()).toContain('Post');
  });

  it('shows a founded pool under "Your pools"', async () => {
    const { wrapper } = mountWithStore(ChainsView, {
      seed: g => { g.s.cash = 10000; g.foundPool('tessera', 'PPLNS', 0.02); },
    });
    await seg(wrapper, 'Your pools');
    expect(wrapper.text()).toContain('Your Tessera pool');
    expect(wrapper.text()).not.toContain('None yet');
  });

  it('renaming your pool from its expanded panel updates the store', async () => {
    const { wrapper, store } = mountWithStore(ChainsView, {
      seed: g => { g.s.cash = 10000; g.foundPool('tessera', 'PPLNS', 0.02); },
    });
    await seg(wrapper, 'Your pools');
    await wrapper.find('.rig-hd').trigger('click'); // expand the one pool card
    const renameBtn = wrapper.findAll('button').find(b => b.text() === 'Rename');
    await renameBtn.trigger('click');

    const input = wrapper.find('input[placeholder="Pool name"]');
    await input.setValue('Night Shift');
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save name');
    await saveBtn.trigger('click');

    const pool = store.s.pools.find(p => p.owner === 'you');
    expect(pool.name).toBe('Night Shift');
    expect(wrapper.text()).toContain('Night Shift');
  });

  it('shows the rival-pool nudge above Rival detail until dismissed', async () => {
    const { wrapper, store } = mountWithStore(ChainsView);
    await seg(wrapper, 'Market');
    expect(wrapper.text()).toContain('running real businesses');

    const dismissBtn = wrapper.find('[aria-label="dismiss rival-pool nudge"]');
    await dismissBtn.trigger('click');

    expect(store.s.chainsNudgeDismissed).toBe(true);
    expect(wrapper.text()).not.toContain('running real businesses');
  });

  it('hides the nudge once the player already founded a pool', async () => {
    const { wrapper } = mountWithStore(ChainsView, {
      seed: g => { g.s.cash = 10000; g.foundPool('tessera', 'PPLNS', 0.02); },
    });
    await seg(wrapper, 'Market');
    expect(wrapper.text()).not.toContain('running real businesses');
  });

  it('the fee slider and Close button carry a discriminating label per pool', async () => {
    const { wrapper, store } = mountWithStore(ChainsView, {
      seed: g => { g.s.cash = 10000; g.foundPool('tessera', 'PPLNS', 0.02); },
    });
    await seg(wrapper, 'Your pools');
    await wrapper.find('.rig-hd').trigger('click');
    const pool = store.s.pools.find(p => p.owner === 'you');
    const feeSlider = wrapper.findAll('input[type="range"]')
      .find(i => i.attributes('aria-label') === 'Fee for ' + pool.name);
    expect(feeSlider).toBeTruthy();
    const closeBtn = wrapper.findAll('button').find(b => b.text() === 'Close');
    expect(closeBtn.attributes('aria-label')).toBe('Close ' + pool.name);
  });
});
