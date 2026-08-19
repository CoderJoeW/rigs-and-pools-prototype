import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PartTile from '../PartTile.vue';
import { FRAMES, MOBOS, COOLERS, PSUS, CARDS } from '../../data/hardware.js';

const CATALOGUE = [...FRAMES, ...MOBOS, ...COOLERS, ...PSUS, ...CARDS];

describe('PartTile', () => {
  it('has its own thumbnail for every part in the catalogue', () => {
    const missing = CATALOGUE
      .filter(p => !mount(PartTile, { props: { part: p.id } }).find('img').exists())
      .map(p => p.id);
    expect(missing).toEqual([]);
  });

  it('gives no two parts the same thumbnail', () => {
    // The bug this replaces: one picture per SLOT meant all twelve cards, and
    // all ten supplies, were the same square.
    const srcs = CATALOGUE.map(p =>
      mount(PartTile, { props: { part: p.id } }).find('img').attributes('src'));
    expect(new Set(srcs).size).toBe(CATALOGUE.length);
  });

  it('holds its space for a part with no art rather than collapsing the row', () => {
    // A fab-designed part carries its own object and has no catalogue id.
    const w = mount(PartTile, { props: { part: 'mfg-custom-1' } });
    expect(w.find('img').exists()).toBe(false);
    expect(w.classes()).toContain('blank');
  });

  it('stays decorative unless it is given a label', () => {
    const bare = mount(PartTile, { props: { part: 'c1' } });
    expect(bare.attributes('aria-hidden')).toBe('true');
    const named = mount(PartTile, { props: { part: 'c1', label: 'RX-470 4GB' } });
    expect(named.attributes('role')).toBe('img');
    expect(named.attributes('aria-label')).toBe('RX-470 4GB');
  });
});
