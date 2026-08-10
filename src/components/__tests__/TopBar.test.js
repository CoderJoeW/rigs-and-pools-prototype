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

  it('the "tour" replay pill stays hidden while the tour is already up', () => {
    const { wrapper } = mountWithStore(TopBar); // fresh store: the tour is showing by default
    expect(wrapper.findAll('button').find(b => b.text() === 'tour')).toBeUndefined();
  });

  it('the "tour" pill appears once the tour is out of the way, and restarts it on click', async () => {
    const { wrapper, store } = mountWithStore(TopBar, {
      seed: g => { g.generatePreset(); g.build(); }, // past the tour's own gate
    });
    const tourBtn = wrapper.findAll('button').find(b => b.text() === 'tour');
    expect(tourBtn).toBeTruthy();

    await tourBtn.trigger('click');
    expect(store.showTour).toBe(true);
    expect(store.s.tourReplay).toBe(true);
  });
});
