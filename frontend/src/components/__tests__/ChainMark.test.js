import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChainMark from '../ChainMark.vue';
import { CHAINS, CHAIN_HUE } from '../../data/chains.js';

describe('ChainMark', () => {
  it('paints the chain hue and stays out of the accessibility tree', () => {
    const wrapper = mount(ChainMark, { props: { chain: 'tessera' } });
    const mark = wrapper.find('i.cmk');
    expect(mark.exists()).toBe(true);
    expect(mark.attributes('style')).toContain('--chain-h: ' + CHAIN_HUE.tessera);
    // the chain's name is always rendered next to the mark, so announcing it
    // here would read the same word twice
    expect(mark.attributes('aria-hidden')).toBe('true');
    expect(wrapper.text()).toBe('');
  });

  it('gives every chain a hue, and no two the same', () => {
    const hues = CHAINS.map(c => c.hue);
    expect(hues.every(h => typeof h === 'number')).toBe(true);
    expect(new Set(hues).size).toBe(CHAINS.length);
  });

  it('keeps every chain clear of the four semantic hues', () => {
    // red 28, gold 78, green 162, blue 250 in OKLCH — see the note in chains.js.
    // A chain landing on one of these would read as a status, not a name.
    const semantic = [28, 78, 162, 250];
    const apart = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
    for (const c of CHAINS)
      for (const s of semantic)
        expect(apart(c.hue, s)).toBeGreaterThanOrEqual(30);
    // and clear of each other
    for (const a of CHAINS)
      for (const b of CHAINS)
        if (a.id !== b.id) expect(apart(a.hue, b.hue)).toBeGreaterThanOrEqual(30);
  });

  it('takes the larger form only when asked', () => {
    expect(mount(ChainMark, { props: { chain: 'nova' } }).find('.cmk.lg').exists()).toBe(false);
    expect(mount(ChainMark, { props: { chain: 'nova', lg: true } }).find('.cmk.lg').exists()).toBe(true);
  });

  it('renders nothing rather than a colourless mark for an unknown chain', () => {
    // a save can name a chain this build no longer ships
    expect(mount(ChainMark, { props: { chain: 'no-such-chain' } }).find('i').exists()).toBe(false);
  });
});
