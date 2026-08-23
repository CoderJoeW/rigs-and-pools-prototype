import { computed } from 'vue';
import { fmt } from '../utils/format.js';
import type { Store } from './gameStore.js';

// The overview stat cards and deltas at the top of FarmView.
export function useFarmStats(g: Store) {
  const live = computed(() => g.s.rigs.filter(r => g.rigLive(r)).length);
  const trend = computed(() => {
    const h = g.s.netHist;
    if (h.length < 6) return '';
    const a = h[h.length - 6]!, b = h[h.length - 1]!;
    return b > a * 1.03 ? 'improving' : b < a * 0.97 ? 'slipping' : 'holding';
  });
  const hottest = computed(() => g.s.sites.reduce((a, f) => Math.max(a, g.siteTemp(f)), 0));
  const totalDemand = computed(() => g.s.sites.reduce((a, f) => a + g.siteDemand(f), 0));

  // "vs yesterday" chips: dayDelta/dayPaceDelta return null with nothing
  // honest to compare against, rather than an invented 0.0%. Hashrate
  // compares directly; profit/cost are still-filling counters, projected to
  // a full day first via dayPaceDelta. Profit compares 'net' to match the
  // headline above it.
  const hashDelta = computed(() => g.dayDelta('hash', g.totalHash));
  const netDelta = computed(() => g.dayPaceDelta('net', g.netDay));
  const costDelta = computed(() => g.dayPaceDelta('power', g.powerDay));
  const deltaText = (d: number) => (d >= 0 ? '▲ ' : '▼ ') + fmt.pct(Math.abs(d), 2);

  const blocksToday = computed(() => {
    const n = g.s.today && g.s.today.blocks;
    return Number.isFinite(n) ? fmt.n(n) : '—';
  });
  const bestBlock = computed(() => (Number.isFinite(g.s.bestBlock) ? fmt.usd2(g.s.bestBlock) : '—'));
  const uptime = computed(() => (g.s.rigs.length ? live.value / g.s.rigs.length : 0));
  const margin = computed(() => (g.revenueDay > 0 ? g.netDay / g.revenueDay : 0));
  const payoutDay = computed(() => g.expectedDay - g.powerRateDay);

  // "Payout progress" is the current block window on the chain the biggest
  // group points at — the farm's main earner, and the one whose next block
  // matters.
  const mainGroup = computed(() => g.s.groups.reduce(
    (a, gr) => (!a || g.groupHash(gr) > g.groupHash(a) ? gr : a), null as (typeof g.s.groups)[number] | null));
  const payoutProg = computed(() => {
    const gr = mainGroup.value, c = gr && g.chain(gr.chain);
    return c ? g.blockProg(c) : 0;
  });
  const autoRules = computed(() => (g.s.autoOff ? 1 : 0) + (g.s.autoFix ? 1 : 0));

  // A group's capacity is read against the whole farm's positions, not one
  // site's: a group spans sites, so "how much of what I own is pointed
  // here" is the question the number answers.
  const totalSlots = computed(() => g.s.sites.reduce((a, f) => a + g.siteSlots(f), 0));

  return { live, trend, hottest, totalDemand, hashDelta, netDelta, costDelta, deltaText,
    blocksToday, bestBlock, uptime, margin, payoutDay, mainGroup, payoutProg, autoRules, totalSlots };
}
