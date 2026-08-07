import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import MarketView from '../MarketView.vue';

describe('MarketView', () => {
  it('shows the auto-sell drip controls and an empty ledger', () => {
    const { wrapper } = mountWithStore(MarketView);
    expect(wrapper.text()).toContain('Auto-sell drip');
    expect(wrapper.text()).toContain('Ledger');
    expect(wrapper.text()).toContain('Net to date');
  });

  it('lists every chain with its held balance', () => {
    const { wrapper } = mountWithStore(MarketView);
    for (const tick of ['TSR', 'FRO', 'HAL', 'NVA', 'OBL']) {
      expect(wrapper.text()).toContain(tick);
    }
  });

  it('toggling the drip switch flips it on the store', async () => {
    const { wrapper, store } = mountWithStore(MarketView);
    expect(store.s.drip.on).toBe(true);
    await wrapper.find('.switch').trigger('click');
    expect(store.s.drip.on).toBe(false);
  });

  it('the erase-save button requires a second tap to confirm', async () => {
    const { wrapper, store } = mountWithStore(MarketView);
    const eraseBtn = wrapper.findAll('button').find(b => b.text().includes('Erase save'));
    await eraseBtn.trigger('click');
    expect(store.s.wipeArm).toBe(true);
    expect(wrapper.text()).toContain('Tap again to erase everything');
  });

  it('defaults to Auto theme and switches on click', async () => {
    const { wrapper, store } = mountWithStore(MarketView);
    expect(store.s.theme).toBe('auto');
    const darkBtn = wrapper.findAll('button').find(b => b.text() === 'Dark');
    await darkBtn.trigger('click');
    expect(store.s.theme).toBe('dark');
  });
});
