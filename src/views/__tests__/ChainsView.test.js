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
});
