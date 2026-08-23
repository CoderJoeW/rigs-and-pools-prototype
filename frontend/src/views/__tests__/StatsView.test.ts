import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import StatsView from '../StatsView.vue';


/* Three segments now — anything below the summary has to be switched to. */
const seg = (wrapper: any, label: string) =>
  wrapper.findAll('.segtab').find((t: any) => t.text().includes(label))!.trigger('click');

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

  it('shows a six-segment rank ladder with the current rank marked (issue #51)', () => {
    const { wrapper, store } = mountWithStore(StatsView, {
      seed: g => { g.s.mile.rank = 2; }, // Operator — one rank up from the start
    });
    const segs = wrapper.findAll('.track i');
    expect(segs).toHaveLength(store.RANKS.length);
    // ranks 0,1 (Hobbyist, Tinkerer) already passed
    expect(segs[0].classes()).toContain('g');
    expect(segs[1].classes()).toContain('g');
    // rank 2 (Operator) is the current one — marked distinctly, not "past"
    expect(segs[2].classes()).toContain('b');
    expect(segs[2].classes()).not.toContain('g');
    // ranks not yet reached carry neither tone
    expect(segs[3].classes()).not.toContain('g');
    expect(segs[3].classes()).not.toContain('b');
  });

  it('falls back to rank 0 on a malformed (non-numeric) rank instead of indexing with it (issue #14)', () => {
    // g.RANKS is indexed by g.s.mile.rank. ||0 only catches falsy
    // corruption (NaN, undefined) — a truthy non-numeric value, like a
    // stringified rank from a mangled save, would sail through ||0
    // straight into the array index. Number.isFinite catches that too.
    const { wrapper } = mountWithStore(StatsView, {
      seed: (g: any) => { g.s.mile.rank = 'not-a-rank'; },
    });
    expect(wrapper.text()).toContain('Hobbyist');
  });

  it('the rank card carries its medallion, the rank number and progress into the next', () => {
    const { wrapper, store } = mountWithStore(StatsView);
    const badge = wrapper.find('.rankbadge')!;
    expect(badge.exists()).toBe(true);
    expect(badge.find('img')!.exists()).toBe(true);
    // Decorative — the rank is named in text right beside it.
    expect(badge.attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('.rc-name')!.text()).toBe(store.RANKS[0][1]);
    expect(wrapper.find('.rc-n')!.text()).toContain('Rank 1 of ' + store.RANKS.length);
    expect(wrapper.find('.rc-bar')!.attributes('aria-label')).toContain(store.RANKS[1][1]);
  });

  it('the rank bar measures the rung you are on, not the whole climb', async () => {
    const { wrapper, store } = mountWithStore(StatsView);
    // RANKS[1] needs 4 milestones; two of them is half of THAT rung, not
    // two-twentieths of the ladder.
    store.s.mile.done = { a: 1, b: 2 };
    await nextTick();
    expect(wrapper.find('.rc-cap')!.text()).toContain('2 / 4');
    expect(wrapper.find('.rc-cap')!.text()).toContain('50%');
  });

  it('the top rank is complete rather than dividing by a rung above it', async () => {
    const { wrapper, store } = mountWithStore(StatsView);
    store.s.mile.rank = store.RANKS.length - 1;
    await nextTick();
    expect(wrapper.find('.rc-cap')!.text()).toContain('Top rank');
    expect(wrapper.find('.rc-cap')!.text()).toContain('100%');
  });

  it('three headline tiles, and Best block reads empty before one lands', async () => {
    const { wrapper, store } = mountWithStore(StatsView);
    const tiles = wrapper.findAll('.stattile');
    expect(tiles.length).toBe(3);
    expect(tiles[2].text()).toContain('no blocks yet');
    store.s.bestBlock = 186.42;
    await nextTick();
    expect(wrapper.findAll('.stattile')[2].text()).toContain('$186');
  });

  it('the segments split the summary, the series and the milestones', async () => {
    const { wrapper } = mountWithStore(StatsView);
    const vis = () => wrapper.findAll('.stpanel')
      .map(p => !(p.attributes('style') || '').includes('display: none'));
    expect(vis()).toEqual([true, false, false]);
    // The three charts the mockup puts on the summary.
    expect(wrapper.find('#stpan-stats')!.findAll('.statchart').length).toBe(3);
    await seg(wrapper, 'History');
    expect(vis()).toEqual([false, true, false]);
    expect(wrapper.find('#stpan-history')!.text()).toContain('Coin prices');
    await seg(wrapper, 'Achievements');
    expect(vis()).toEqual([false, false, true]);
    expect(wrapper.find('#stpan-awards')!.text()).toContain('The ladder');
  });

  it('net to date reads the cumulative series, not a sum of daily snapshots', () => {
    // netHist samples today().earned-today().power, and today() resets at
    // every midnight — those are partial-day snapshots, so adding them up
    // gives a number with no meaning and roughly half the real total.
    const { wrapper } = mountWithStore(StatsView, {
      seed: g => { g.s.netHist = [10, 10, 10]; g.s.netCumHist = [100, 400, 900]; },
    });
    const chart = wrapper.find('#stpan-stats')!.findAll('.statchart')
      .find(c => c.text().includes('Net to date'))!;
    expect(chart.find('.sc-chip')!.text()).toContain('$900.00');
  });

  it('a per-day series states what a point is instead of averaging it', async () => {
    const { wrapper } = mountWithStore(StatsView, {
      seed: g => { g.s.netHist = [10, 30]; g.s.hashHist = [10, 30]; },
    });
    await seg(wrapper, 'History');
    const perDay = wrapper.find('#stpan-history')!.findAll('.statchart')
      .find(c => c.text().includes('Net per day'))!;
    expect(perDay.text()).toContain('So far that day');
    expect(perDay.text()).not.toContain('Average');
    // A level sampled at an instant keeps its average.
    const hash = wrapper.find('#stpan-stats')!.findAll('.statchart')
      .find(c => c.text().includes('Hashrate'))!;
    expect(hash.text()).toContain('Average');
  });

  it('the top-rank caption counts every milestone, not just the ones it needed', async () => {
    const { wrapper, store } = mountWithStore(StatsView);
    store.s.mile.rank = store.RANKS.length - 1;
    store.s.mile.done = Object.fromEntries(store.MILESTONES.slice(0, 20).map((m: any) => [m.id, 1]));
    await nextTick();
    // The top rank lands at 20 of the catalog's 24 — "all 20" would have been
    // a lie the Achievements segment contradicts on the same tab.
    expect(wrapper.find('.rc-cap')!.text())
      .toContain('20 of ' + store.MILESTONES.length + ' milestones');
  });

  it('the efficiency chart reads its own series, not hashrate over power spend', () => {
    const { wrapper } = mountWithStore(StatsView, {
      seed: g => { g.s.effHist = [0.4, 0.6, 0.842]; },
    });
    const eff = wrapper.findAll('.statchart').find(c => c.text().includes('EFFICIENCY')
      || c.text().includes('Efficiency'))!;
    expect(eff.find('.sc-chip')!.text()).toContain('0.842 MH/W');
  });
});
