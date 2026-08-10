import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { cssSource } from '../../test/cssRule.js';
import Compare from '../Compare.vue';

const rows = [
  { id: 'a', name: 'Cheap part', sub: '1 MH/W', value: '$10', valueSub: 'each', current: true },
  { id: 'b', name: 'Better part', sub: '2 MH/W', value: '$20', valueSub: 'each', locked: true },
];

describe('Compare', () => {
  it('renders one row per item, marking the current and locked ones', () => {
    const wrapper = mount(Compare, { props: { title: 'Cheapest first', metric: 'cost', rows } });
    expect(wrapper.text()).toContain('Cheap part');
    expect(wrapper.text()).toContain('Better part');
    expect(wrapper.find('.cmp-r.cur').exists()).toBe(true);
    expect(wrapper.find('.cmp-r.locked').exists()).toBe(true);
  });

  it('renders rows as buttons when a pick handler is given, divs otherwise', () => {
    const withPick = mount(Compare, { props: { rows, pick: () => {} } });
    expect(withPick.findAll('button.cmp-r').length).toBe(rows.length);

    const withoutPick = mount(Compare, { props: { rows } });
    expect(withoutPick.findAll('button.cmp-r').length).toBe(0);
  });

  it('calls pick with the row id on click, but never for a locked row', async () => {
    const picked = [];
    const wrapper = mount(Compare, { props: { rows, pick: id => picked.push(id) } });
    const buttons = wrapper.findAll('button.cmp-r');

    await buttons[1].trigger('click'); // locked row
    expect(picked).toEqual([]);

    await buttons[0].trigger('click'); // unlocked row
    expect(picked).toEqual(['a']);
  });

  it('staggers each row’s reveal by 22ms, capped past the 9th row', () => {
    const longList = Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i, name: 'Part ' + i }));
    const wrapper = mount(Compare, { props: { rows: longList } });
    const cells = wrapper.findAll('.cmp-r');
    expect(cells[0].attributes('style')).toContain('animation-delay: 0ms');
    expect(cells[3].attributes('style')).toContain('animation-delay: 66ms');
    // rowDelay caps its index input at 8, so every row from the 9th on
    // (index 8) shares the same delay instead of the queue growing further
    expect(cells[8].attributes('style')).toContain('animation-delay: 176ms');
    expect(cells[11].attributes('style')).toContain('animation-delay: 176ms');
  });

  it('pins the reduced-motion rule that neutralizes the stagger above', () => {
    // jsdom never runs the animation, so nothing here can prove the delay is
    // VISUALLY gone under prefers-reduced-motion — this pins the mechanism
    // instead: the blanket rule that zeroes animation-delay!important is the
    // only thing standing between .cmp-r's inline delay and it still playing
    // out under that OS setting (an author-!important beats an inline style
    // with no !important of its own). It regressed once already by only
    // flattening duration; guard the specific declaration this time. There
    // are several `@media (prefers-reduced-motion:reduce)` blocks in the
    // file (the toast/rankflash ones scope to their own classes) — the one
    // that matters here is specifically the blanket `*{...}` rule.
    const reduceBlock = cssSource().match(/prefers-reduced-motion:reduce\)\{\*\{([^}]*)\}\}/)?.[1] || '';
    expect(reduceBlock).toMatch(/animation-delay:\s*0s\s*!important/);
  });
});
