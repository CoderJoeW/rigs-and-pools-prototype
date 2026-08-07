import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import ChainsView from '../ChainsView.vue';

describe('ChainsView', () => {
  it('lists all five chains and the rival field', () => {
    const { wrapper } = mountWithStore(ChainsView);
    for (const name of ['Tessera', 'Ferro', 'Halcyon', 'Nova', 'Obelisk']) {
      expect(wrapper.text()).toContain(name);
    }
    expect(wrapper.text()).toContain('Rival detail');
    expect(wrapper.text()).toContain('Your pools');
  });

  it('expanding a chain row shows its detail', async () => {
    const { wrapper } = mountWithStore(ChainsView);
    const row = wrapper.findAll('.rowline').find(r => r.text().includes('Tessera'));
    await row.trigger('click');
    expect(wrapper.text()).toContain('Your hashrate');
    expect(wrapper.text()).toContain('Blocks found');
  });

  it('opens the found-a-pool form and reflects the chosen chain', async () => {
    const { wrapper } = mountWithStore(ChainsView);
    const foundBtn = wrapper.findAll('button').find(b => b.text().includes('Found a pool'));
    await foundBtn.trigger('click');
    expect(wrapper.text()).toContain('Bond required');
    expect(wrapper.text()).toContain('Post');
  });

  it('shows a founded pool under "Your pools"', () => {
    const { wrapper } = mountWithStore(ChainsView, {
      seed: g => g.foundPool('tessera', 'PPLNS', 0.02),
    });
    expect(wrapper.text()).toContain('Your Tessera pool');
    expect(wrapper.text()).not.toContain('None yet');
  });

  it('renaming your pool from its expanded panel updates the store', async () => {
    const { wrapper, store } = mountWithStore(ChainsView, {
      seed: g => g.foundPool('tessera', 'PPLNS', 0.02),
    });
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

  it('the fee slider and Close button carry a discriminating label per pool', async () => {
    const { wrapper, store } = mountWithStore(ChainsView, {
      seed: g => g.foundPool('tessera', 'PPLNS', 0.02),
    });
    await wrapper.find('.rig-hd').trigger('click');
    const pool = store.s.pools.find(p => p.owner === 'you');
    const feeSlider = wrapper.findAll('input[type="range"]')
      .find(i => i.attributes('aria-label') === 'Fee for ' + pool.name);
    expect(feeSlider).toBeTruthy();
    const closeBtn = wrapper.findAll('button').find(b => b.text() === 'Close');
    expect(closeBtn.attributes('aria-label')).toBe('Close ' + pool.name);
  });
});
