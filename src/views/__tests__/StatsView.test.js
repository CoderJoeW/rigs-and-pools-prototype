import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import StatsView from '../StatsView.vue';

describe('StatsView', () => {
  it('shows the starting rank and milestone tracks', () => {
    const { wrapper } = mountWithStore(StatsView);
    expect(wrapper.text()).toContain('Hobbyist'); // rank 0
    expect(wrapper.text()).toContain('0 /'); // no milestones done yet
    expect(wrapper.text()).toContain('Hashpower');
    expect(wrapper.text()).toContain('Blocks');
  });

  it('renders the three StatChart panels and per-chain price sparklines', () => {
    const { wrapper } = mountWithStore(StatsView);
    expect(wrapper.text()).toContain('Net per day');
    expect(wrapper.text()).toContain('Hashrate');
    expect(wrapper.text()).toContain('Cash');
    expect(wrapper.text()).toContain('Coin prices');
    for (const tick of ['TSR', 'FRO', 'HAL', 'NVA', 'OBL']) {
      expect(wrapper.text()).toContain(tick);
    }
  });

  it('reflects a completed milestone once one is done', () => {
    const { wrapper } = mountWithStore(StatsView, {
      seed: g => { g.s.mile.done.h1 = 12345; },
    });
    expect(wrapper.text()).toContain('1 /');
  });

  it('falls back to rank 0 on a malformed (non-numeric) rank instead of indexing with it (issue #14)', () => {
    // g.RANKS is indexed by g.s.mile.rank. ||0 only catches falsy
    // corruption (NaN, undefined) — a truthy non-numeric value, like a
    // stringified rank from a mangled save, would sail through ||0
    // straight into the array index. Number.isFinite catches that too.
    const { wrapper } = mountWithStore(StatsView, {
      seed: g => { g.s.mile.rank = 'not-a-rank'; },
    });
    expect(wrapper.text()).toContain('Hobbyist');
  });
});
