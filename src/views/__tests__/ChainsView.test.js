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
});
