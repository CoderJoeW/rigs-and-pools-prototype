import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mount.js';
import ChainsView from '../ChainsView.vue';

describe('ChainsView', () => {
  it('renders the five chain cards', () => {
    const { wrapper } = mountWithStore(ChainsView);
    const cards = wrapper.findAll('.chaincard');
    expect(cards.length).toBe(5);
    expect(wrapper.text()).toContain('Tessera');
    expect(wrapper.text()).toContain('Ferro');
    expect(wrapper.text()).toContain('Halcyon');
    expect(wrapper.text()).toContain('Nova');
    expect(wrapper.text()).toContain('Obelisk');
  });

  it('each chain card shows target, ticker, share and emission', () => {
    const { wrapper } = mountWithStore(ChainsView);
    const card = wrapper.findAll('.chaincard').find(c => c.text().includes('Tessera'));
    const gem = card.find('.cc-gem');
    // Decorative — the chain is named in text right beside it.
    expect(gem.attributes('aria-hidden')).toBe('true');
    expect(card.text()).toContain('Target: 20s');
    expect(card.text()).toContain('TSR');
    expect(card.text()).toContain('Your hashrate share');
    expect(card.text()).toContain('Emission / day');
    expect(card.text()).toContain('Current difficulty');
    // Tessera emits one 4.17 reward every 20s — 4,320 blocks a day.
    expect(card.text()).toContain('18,014.40');
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
    expect(svp.text()).toMatch(/Blocks \/ day you find/);
    expect(svp.text()).toMatch(/Blocks \/ day you share in/);
    expect(svp.text()).toMatch(/Payouts land/);
  });
});
