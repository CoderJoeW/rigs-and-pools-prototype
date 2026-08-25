import { computed } from 'vue';
import { CHAIN_HUE } from '../data/chains.js';
import type { ChainState, Pool } from '../game/types.js';
import type { Store } from './gameStore.js';

// Difficulty is a raw magnitude, not a hashrate, so it takes its own compact
// formatter rather than fmt.hash's MH/GH/TH ladder.
export const big = (x: number): string => !isFinite(x) ? '—'
  : x >= 1e12 ? (x / 1e12).toFixed(2) + ' T' : x >= 1e9 ? (x / 1e9).toFixed(2) + ' G'
  : x >= 1e6 ? (x / 1e6).toFixed(2) + ' M' : x >= 1e3 ? (x / 1e3).toFixed(2) + ' K' : x.toFixed(2);

export const coins = (x: number): string => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The verdict word, in the vocabulary this tab already used as RUNNING EASY /
// RUNNING HARD tags: difficulty is retargeted from what was last seen, so a
// chain gaining hashrate runs easy until it catches up.
export const easeWord = (e: number) => e > 1.02 ? { k: 'easy', label: 'Running easy' }
  : e < 0.98 ? { k: 'hard', label: 'Running hard' }
  : { k: 'steady', label: 'Steady' };

function bestPoolOn(g: Store, c: ChainState) {
  let best: Pool | null = null, bestH = -1;
  for (const p of g.s.pools) {
    if (!p.live || p.chain !== c.id) continue;
    const h = g.poolHash(p);
    if (h > bestH) { best = p; bestH = h; }
  }
  return best;
}

// One card's worth of derived figures per chain, and the solo-vs-pool
// frequency comparison — perf/scoring rationale:
// docs/implementation-notes.md#chains-view-srcviewschainsviewvue.
export function useChainCards(g: Store) {
  const hueOf = (c: ChainState) => CHAIN_HUE[c.id];

  const cards = computed(() => g.s.chains.map(c => {
    const groups = g.s.groups.filter(x => x.chain === c.id);
    // mine/net computed once and reused below — myHash/chainHash are each
    // an O(groups×rigs) scan, and winChance/easeOf/chainHash all recompute
    // them internally, so calling those directly here would redo that scan
    // up to 5x per card instead of once.
    const mine = g.myHash(c), net = g.chainHash(c);
    const ease = net < 1 ? 1 : Math.max(c.floor, c.obs) / net;
    return {
      c, groups,
      share: net > 0 ? mine / net : 0,   // winChance IS this share — mine over the chain's total
      mine, net,
      diff: g.diffOf(c),
      emission: 86400 / c.target * c.reward,   // chain's own daily payout, not your share of it
      rate: g.revPerMh(c),   // realized rate, not `mult` — chains.ts: the two diverge ~17% once price clamps
      ease, easeWord: easeWord(ease),
      outgrown: groups.some(gr => g.groupAdvice(gr)),   // Farm's advisories, restated as chain facts
      ceiling: g.chainCeiling(c),
      eta: g.blockETA(c), prog: g.blockProg(c),
      miners: g.simsOn(c.id),
      pools: g.s.pools.filter(x => x.live && x.chain === c.id).length,
    };
  }));

  // Solo-vs-pool comparison rationale (frequency not money):
  // docs/implementation-notes.md#chains-view-srcviewschainsviewvue.
  const payouts = computed(() => {
    let solo = 0, pooled = 0;
    const join = new Map();
    for (const gr of g.s.groups) {
      const h = g.groupHash(gr); if (h <= 0) continue;
      const c = g.chain(gr.chain); if (!c) continue;
      solo += 86400 * h / Math.max(1, g.diffOf(c));
      const p = gr.pool === 'solo' ? bestPoolOn(g, c) : g.poolOf(gr.pool);
      if (!p) { pooled += 86400 * h / Math.max(1, g.diffOf(c)); continue; }
      join.set(p, (join.get(p) || 0) + (gr.pool === p.id ? 0 : h));
    }
    for (const [p, extra] of join)
      pooled += 86400 * (g.poolHash(p) + extra) / Math.max(1, g.diffOf(g.chain(p.chain)!));
    return { solo, pooled, mult: solo > 0 ? pooled / solo : 0 };
  });

  return { hueOf, cards, payouts };
}
