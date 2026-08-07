import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
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
});
