import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatChart from '../StatChart.vue';

describe('StatChart', () => {
  it('renders a title and the latest value, formatted as hashrate by default', () => {
    const wrapper = mount(StatChart, { props: { title: 'Hashrate', data: [100, 200, 300] } });
    expect(wrapper.text()).toContain('Hashrate');
    expect(wrapper.text()).toContain('MH/s');
  });

  it('formats as money when the money prop is set', () => {
    const wrapper = mount(StatChart, { props: { title: 'Cash', data: [500, 400, 300], money: true } });
    expect(wrapper.text()).toContain('$');
  });

  it('does not throw with no data at all', () => {
    const wrapper = mount(StatChart, { props: { title: 'Empty', data: [] } });
    expect(wrapper.find('path').attributes('d')).toBe('');
  });
});
