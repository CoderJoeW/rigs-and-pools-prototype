import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PartTile from '../PartTile.vue';
import { FRAMES, MOBOS, COOLERS, PSUS, CARDS, genCardsFor, genPsuFor } from '../../data/hardware.js';

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

  it('gives the generated ladder the top card and supply, not a blank', () => {
    // hardware.js mints g<n>a / g<n>b / gp<n> every GEN_DAYS, forever — art
    // for that series is not a thing that can be finished, and before the
    // fallback the best hardware in the game showed an empty square.
    const top = mount(PartTile, { props: { part: 'c12' } }).find('img').attributes('src');
    const topPsu = mount(PartTile, { props: { part: 'p7500' } }).find('img').attributes('src');
    for (const n of [1, 3, 12, 40]) {
      for (const c of genCardsFor(n)) {
        expect(mount(PartTile, { props: { part: c.id } }).find('img').attributes('src'), c.id)
          .toBe(top);
      }
      expect(mount(PartTile, { props: { part: genPsuFor(n).id } }).find('img').attributes('src'))
        .toBe(topPsu);
    }
  });

  it('gives a fab-designed part the top of the family it extends', () => {
    // Minted as custom-<kind>-<stamp> by fab.js, and always above the top of
    // its ladder — so the top static tile is the honest picture.
    const cases = { unit: 'c12', psu: 'p7500', frame: 'f16', mobo: 'm16', cool: 'x6' };
    for (const [kind, expected] of Object.entries(cases)) {
      const got = mount(PartTile, { props: { part: `custom-${kind}-m1abc-x9y8z` } })
        .find('img').attributes('src');
      const want = mount(PartTile, { props: { part: expected } }).find('img').attributes('src');
      expect(got, kind).toBe(want);
    }
  });

  it('holds its space rather than collapsing the row on an id it cannot place', () => {
    const w = mount(PartTile, { props: { part: 'not-a-part-at-all' } });
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
