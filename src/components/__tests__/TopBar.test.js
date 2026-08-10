import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mountWithStore } from '../../test/mountWithStore.js';
import TopBar from '../TopBar.vue';

// jsdom doesn't apply main.css, so the actual overflow behavior can't be
// measured here (see the live-browser verification in the PR that added
// this) — this reads the stylesheet instead, as a regression guard against
// .top-left's wrap rule quietly disappearing again.
const mainCss = fs.readFileSync(path.resolve(import.meta.dirname, '../../assets/main.css'), 'utf8');
function cssRule(selector) {
  const re = new RegExp('\\' + selector + '(?![\\w-])\\{([^}]*)\\}');
  return mainCss.match(re)?.[1] || '';
}

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
    // Found by its own text, not the bare .helptog class — the "tour"
    // replay pill (below) shares that class and, wherever it renders
    // first in the DOM, .find('.helptog') would silently grab IT instead
    // whenever both are present, rather than the help toggle this test
    // means to exercise.
    const { wrapper } = mountWithStore(TopBar);
    const toggle = wrapper.findAll('.helptog').find(b => /help/.test(b.text()));
    expect(toggle.text()).toBe('hide help'); // help defaults to on
    await toggle.trigger('click');
    expect(toggle.text()).toBe('help');
  });

  it('the help toggle still finds itself correctly even once the "tour" pill is also on screen', async () => {
    const { wrapper } = mountWithStore(TopBar, {
      seed: g => { g.generatePreset(); g.build(); }, // makes the tour pill render too
    });
    expect(wrapper.findAll('button').find(b => b.text() === 'tour')).toBeTruthy(); // sanity: both really are present
    const toggle = wrapper.findAll('.helptog').find(b => /help/.test(b.text()));
    expect(toggle.text()).toBe('hide help');
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

  it('renders the wordmark and cash into two distinct groups the CSS can wrap independently', () => {
    // Structural precondition for the .top-left/.top-right CSS split
    // (main.css) — a regression here would silently undo the fix, since
    // the class names are all that ties this markup to those rules.
    const { wrapper } = mountWithStore(TopBar);
    expect(wrapper.find('.top-left').exists()).toBe(true);
    expect(wrapper.find('.top-right').exists()).toBe(true);
    expect(wrapper.find('.top-left').text()).toContain('Rigs & Pools');
    expect(wrapper.find('.top-right').text()).toContain('$500.00');
  });

  it('main.css lets .top-left wrap instead of pushing the cash figure off-screen on a narrow phone', () => {
    // Regression guard for a pre-existing bug the last review round found:
    // header.top overflowed at 320px with several weather/status chips
    // live at once, clipping the cash figure with no scroll to recover it
    // — the same failure class issue #46 already documents for .speedbar.
    expect(cssRule('.top-left')).toMatch(/flex-wrap:\s*wrap/);
    expect(cssRule('.top-right')).toMatch(/flex:\s*none/);
  });
});
