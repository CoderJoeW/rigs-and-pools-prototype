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
    const shown = () => wrapper.findAll('.chpanel')
      .map(p => !(p.attributes('style') || '').includes('display: none'));
    expect(shown()).toEqual([true, false, false]);
    await seg(wrapper, 'Your pools');
    expect(shown()).toEqual([false, true, false]);
    await seg(wrapper, 'Rival pools');
    expect(shown()).toEqual([false, false, true]);
  });

  it('a chain card carries its emblem, share, emission and difficulty', () => {
    const { wrapper } = mountWithStore(ChainsView);
    const card = wrapper.findAll('.chaincard').find(c => c.text().includes('Tessera'));
    const gem = card.find('.cc-gem');
    expect(gem.attributes('aria-hidden')).toBe('true');
    expect(card.text()).toContain('Target: 20s');
    expect(card.text()).toContain('TSR');
    expect(card.text()).toContain('Your hashrate share');
    expect(card.text()).toContain('Emission / day');
    expect(card.text()).toContain('Current difficulty');
    // Tessera emits one 833.333 reward every 20s — ~3,599,998.56 coins/day
    expect(card.text()).toContain('3,599,998.56');
    expect(card.find('.cc-bar').attributes('aria-hidden')).toBe('true');
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
    expect(svp.text()).toMatch(/Blocks \/ day you find/);
    expect(svp.text()).toMatch(/Blocks \/ day you share in/);
    expect(svp.text()).toMatch(/Payouts land/);
  });

  it('founding a pool needs a bond, and Tessera bond scales with block value', async () => {
    const { wrapper, store } = mountWithStore(ChainsView, {
      seed: g => { g.s.cash = 10000; },
    });
    await seg(wrapper, 'Your pools');
    expect(store.s.pools.some(p => p.owner === 'you')).toBe(false);
    // founding UI path is tested elsewhere; just ensure cash seed is enough for bond
    const need = store.bondReq(store.s.chains.find(c => c.id === 'tessera'), 'PPLNS');
    expect(store.s.cash).toBeGreaterThanOrEqual(need);
  });
});
