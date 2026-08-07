import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import TopBar from '../TopBar.vue';

describe('TopBar', () => {
  it('shows the wordmark, starting cash, and the day/clock chip', () => {
    const { wrapper } = mountWithStore(TopBar);
    expect(wrapper.text()).toContain('Rigs & Pools');
    expect(wrapper.text()).toContain('$500.00');
    expect(wrapper.text()).toContain('d1');
  });

  it('the speed buttons switch the game speed', async () => {
    const { wrapper } = mountWithStore(TopBar);
    const buttons = wrapper.findAll('.speedbtn');
    expect(buttons.length).toBeGreaterThan(1);
    await buttons[1].trigger('click');
    expect(wrapper.text()).toContain('Fast-forward');
  });

  it('the help toggle flips its own label', async () => {
    const { wrapper } = mountWithStore(TopBar);
    const toggle = wrapper.find('.helptog');
    expect(toggle.text()).toBe('hide help'); // help defaults to on
    await toggle.trigger('click');
    expect(toggle.text()).toBe('help');
  });
});
