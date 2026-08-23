import { computed, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { sparkPath } from '../utils/spark.js';

type Store = ReturnType<typeof useGameStore>;

// The "Market" tab's pool field, and the founding-form projections for the
// "Your pools" tab's new-pool sheet.
export function usePoolFounding(g: Store) {
  const spark = (x: any) => sparkPath(Array.isArray(x) ? x : x.hist, 32, 26);
  const fieldMine = ref(true);
  const field = computed(() => {
    const mine = new Set(g.s.groups.map(x => x.chain));
    return g.s.pools.filter(p => p.live && (!fieldMine.value || mine.has(p.chain) || p.owner === 'you'))
      .slice().sort((a, b) => g.poolHash(b) - g.poolHash(a));
  });

  const found = ref(false), fScheme = ref('PPLNS'), fFee = ref(0.02);
  const fChain = ref((g.s.groups[0] && g.s.groups[0].chain) || 'ferro');
  const bond = computed(() => g.bondReq(g.chain(fChain.value), fScheme.value));
  const projShare = computed(() => {
    const c = g.chain(fChain.value);
    const live = g.s.pools.filter(p => p.live && p.chain === c.id);
    const mine = Math.max(0, 1 - fFee.value);
    const tot = live.reduce((a, p) => a + Math.max(0, 1 - p.fee) * g.poolTrust(p), 0) + mine;
    return tot > 0 ? mine / tot : 0;
  });
  const projMargin = computed(() => {
    const c = g.chain(fChain.value);
    const h = c.floor * 0.70 * projShare.value;
    const lim = fScheme.value === 'PPS' ? bond.value / (g.C.PAY * c.mult * 4) : Infinity;
    return Math.min(h, lim) * g.C.PAY * c.mult * (fScheme.value === 'PPS' ? fFee.value + 0.06 : fFee.value);
  });

  return { spark, fieldMine, field, found, fScheme, fFee, fChain, bond, projShare, projMargin };
}
