import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatChart from '../StatChart.vue';

describe('StatChart', () => {
  it('renders a title and the latest value, formatted as hashrate by default', () => {
    const wrapper = mount(StatChart, { props: { title: 'Hashrate', data: [100, 200, 300] } });
    expect(wrapper.text()).toContain('Hashrate');
    expect(wrapper.text()).toContain('MH/s');
    // One direct label, on the live end — not a number on every point.
    expect(wrapper.findAll('.sc-chip')).toHaveLength(1);
    expect(wrapper.find('.sc-chip').text()).toContain('300');
  });

  it('formats as money when the money prop is set', () => {
    const wrapper = mount(StatChart, { props: { title: 'Cash', data: [500, 400, 300], money: true } });
    expect(wrapper.text()).toContain('$');
  });

  it('formats with a unit and fixed digits when given one', () => {
    const wrapper = mount(StatChart, {
      props: { title: 'Efficiency', data: [0.4, 0.8421], unit: 'MH/W', digits: 3 },
    });
    expect(wrapper.find('.sc-chip').text()).toContain('0.842 MH/W');
  });

  it('does not throw with no data at all, and says so instead of drawing nothing', () => {
    const wrapper = mount(StatChart, { props: { title: 'Empty', data: [] } });
    expect(wrapper.find('path').exists()).toBe(false);
    expect(wrapper.find('.sc-empty').text()).toContain('Not enough history');
    // A single point is still not a line.
    const one = mount(StatChart, { props: { title: 'One', data: [5] } });
    expect(one.find('.sc-empty').exists()).toBe(true);
  });

  it('plots the series it is given — there is no sum-these-for-me mode', () => {
    // A cumulative chart has to be fed a cumulative series: the per-day
    // series here snapshot counters that reset at midnight, so adding them
    // up produces a number with no meaning.
    const wrapper = mount(StatChart, {
      props: { title: 'Net to date', data: [10, 30, 60], money: true },
    });
    expect(wrapper.find('.sc-chip').text()).toContain('$60.00');
  });

  it('offers an average only when asked, since it is wrong for a resetting counter', () => {
    const plain = mount(StatChart, { props: { title: 'Net per day', data: [10, 30] } });
    expect(plain.text()).not.toContain('Average');
    const asked = mount(StatChart, { props: { title: 'Hashrate', data: [10, 30], avg: true } });
    expect(asked.text()).toContain('Average');
    // An explicit note always wins over the average.
    const noted = mount(StatChart, {
      props: { title: 'Net per day', data: [10, 30], avg: true, note: 'So far that day' },
    });
    expect(noted.text()).toContain('So far that day');
    expect(noted.text()).not.toContain('Average');
  });

  it('the axis counts back from now, because the buffer drops its own start', () => {
    // 110-entry ring buffers: past ~82 days the leftmost sample is no longer
    // day 0, so "how long ago" is the only labelling that stays true.
    const wrapper = mount(StatChart, { props: { title: 'Hashrate', data: Array(41).fill(5) } });
    const ticks = wrapper.findAll('.sc-axis span').map(t => t.text());
    expect(ticks[ticks.length - 1]).toBe('now');
    expect(ticks[0]).toBe('30D');
    expect(ticks).toEqual(['30D', '23D', '15D', '8D', 'now']);
  });

  it('scrubbing moves the label to the point under the finger, and lets go', async () => {
    const wrapper = mount(StatChart, {
      props: { title: 'Hashrate', data: [100, 200, 300, 400, 500] },
      attachTo: document.body,
    });
    const plot = wrapper.find('.sc-plot');
    // jsdom gives every element a zero-width rect, so the scrub is driven
    // through a stubbed one — the arithmetic is what is under test.
    plot.element.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 86 });

    expect(wrapper.find('.sc-dot').classes()).toContain('live');
    await plot.trigger('pointerdown', { clientX: 0 });
    expect(wrapper.find('.sc-chip').text()).toContain('100');
    expect(wrapper.find('.sc-dot').classes()).not.toContain('live');
    expect(wrapper.find('.sc-cross').exists()).toBe(true);

    await plot.trigger('pointermove', { clientX: 50 });
    expect(wrapper.find('.sc-chip').text()).toContain('300');
    // Two samples back from the live end, at 0.75 days each.
    expect(wrapper.find('.sc-day').text()).toBe('2D ago');

    await plot.trigger('pointerup');
    // Back to the live end, and the crosshair goes with it.
    expect(wrapper.find('.sc-chip').text()).toContain('500');
    expect(wrapper.find('.sc-cross').exists()).toBe(false);
    wrapper.unmount();
  });

  it('states the shape in words for a reader that cannot see it', () => {
    const wrapper = mount(StatChart, { props: { title: 'Hashrate', data: [100, 200, 50] } });
    const label = wrapper.find('svg[role="img"]').attributes('aria-label');
    expect(label).toContain('Hashrate');
    expect(label).toContain('low');
    expect(label).toContain('high');
  });
});
