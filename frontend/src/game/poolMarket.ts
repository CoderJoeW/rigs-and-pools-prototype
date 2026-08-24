import { computed } from 'vue';
import { C, TX_FEES, BOND_MULT, TRUST_RAMP, COVER_DAYS, PPLNS_COVER, VAR_K, SIM_FEE_MIN, SIM_FEE_MAX } from '../data/constants.js';
import { fmt } from '../utils/format.js';
import { cue } from '../services/audio.js';
import type { Game, ChainState, Pool, Sim, FeedItem, PoolPnl } from './types.js';

// A chain's live pools scored for one sim's join/switch decision:
// chainPoolTable's row shape, reused by pickPool so it isn't recomputed.
interface PoolTableRow { p: Pool; cap: number; mine: number; base: number }

// Installed into the shared context G — docs/implementation-notes.md#shared-context-g-module-pattern.
export function installPoolMarket(G: Game): void {
  const blockValue = (c: ChainState) => c.reward * G.price(c);
  const bondReq = (c: ChainState, scheme: 'PPS' | 'PPLNS') => Math.round(blockValue(c) * BOND_MULT[scheme]);
  // Reputation formula: design-spec.md §5.
  const repParts = (p: Pool) => {
    const solvency = Math.min(1, p.bond / Math.max(1, p.bond0));
    const age = Math.min(1, (G.s.t - (p.born || 0)) / TRUST_RAMP);
    const luck = (p.found || 0) / ((p.found || 0) + 8);
    const feeStab = Math.min(1, (G.s.t - (p.feeMoved || -1e9)) / (3 * 86400));
    return { solvency, age, luck, feeStab };
  };
  const poolRep = (p: Pool) => {
    const q = repParts(p);
    return Math.sqrt(q.solvency) * (0.40 + 0.22 * q.age + 0.22 * q.luck + 0.16 * q.feeStab);
  };
  const poolTrust = poolRep;
  // Bond formula (float + dry-spell cover, the tighter one binds): design-spec.md §5.
  const FLOAT_DAYS: Record<'PPS' | 'PPLNS', number> = { PPS: 1.0, PPLNS: PPLNS_COVER };
  const floatPerHash = (p: Pool) => C.PAY * G.chain(p.chain)!.mult * FLOAT_DAYS[p.scheme as 'PPS' | 'PPLNS'];
  const floatBondFor = (p: Pool, H: number) => H * floatPerHash(p);
  const varBondFor = (p: Pool, H: number) => {
    if (p.scheme !== 'PPS') return 0;
    const c = G.chain(p.chain)!;   // a pool's chain always resolves
    const N = Math.max(1e-9, 86400 * COVER_DAYS * H / Math.max(1, G.diffOf(c)));
    return VAR_K * Math.sqrt(N) * blockValue(c) * (1 + TX_FEES);
  };
  const bondFor = (p: Pool, H: number) => Math.max(floatBondFor(p, H), varBondFor(p, H));
  // Capacity is the smaller of what each rule allows.
  const poolCapLimit = (p: Pool): number => {
    const byFloat = p.bond / Math.max(1e-9, floatPerHash(p));
    if (p.scheme !== 'PPS') return byFloat;
    const c = G.chain(p.chain)!, bv = blockValue(c) * (1 + TX_FEES);   // a pool's chain always resolves
    const byVar = Math.pow(p.bond / Math.max(1e-9, VAR_K * bv), 2)
      * Math.max(1, G.diffOf(c)) / (86400 * COVER_DAYS);
    return Math.min(byFloat, byVar);
  };
  const capBinding = (p: Pool) => {
    if (p.scheme !== 'PPS') return 'settlement float';
    const byFloat = p.bond / Math.max(1e-9, floatPerHash(p));
    return poolCapLimit(p) < byFloat * 0.999 ? 'dry-spell cover' : 'settlement float';
  };
  function refreshPools(): void {
    for (const p of G.s.pools) {
      p.cap = p.live ? G.poolHash(p) : 0;
      p.capped = p.owner === 'you' && p.scheme === 'PPS' && p.cap >= poolCapLimit(p) * 0.98;
    }
  }
  // Opening a pool or moving its fee triggers an immediate reshuffle on that
  // chain rather than waiting for the slow hourly drift (design-spec.md §5).
  // FEE_BITE tuning: docs/implementation-notes.md#pool-market-srcgamepoolmarketjs.
  const FEE_BITE = 3;
  // poolScoreBase/poolScore split rationale: docs/implementation-notes.md.
  const poolScoreBase = (p: Pool) => (1 - Math.min(0.9, p.fee * FEE_BITE)) * poolTrust(p);
  const scoreJitter = () => 0.97 + Math.random() * 0.06;   // +-3% so near-ties split rather than winner-take-all
  const poolScore = (p: Pool) => poolScoreBase(p) * scoreJitter();
  // chainPoolTable perf rationale: docs/implementation-notes.md.
  function chainPoolTable(chainId: string): PoolTableRow[] {
    const playerIn = new Map<string, number>();
    for (const gr of G.s.groups) {
      if (!gr.pool || gr.pool === 'solo') continue;
      playerIn.set(gr.pool, (playerIn.get(gr.pool) || 0) + G.groupHash(gr));
    }
    const out: PoolTableRow[] = [];
    for (const p of G.s.pools) {
      if (!p.live || p.chain !== chainId) continue;
      out.push({ p, cap: poolCapLimit(p), mine: playerIn.get(p.id) || 0, base: poolScoreBase(p) });
    }
    return out;
  }
  // simIn rationale: docs/implementation-notes.md.
  const simIn = (p: Pool) => G.simPoolHashOf ? G.simPoolHashOf(p) : 0;
  function pickPool(m: Sim, table?: PoolTableRow[]): void {
    const opts = table || chainPoolTable(m.chain);
    let bp: Pool | null = null, bs = -1;
    for (const e of opts) {
      if (simIn(e.p) + e.mine + m.hash > e.cap) continue;          // they are full
      const sc = e.base * scoreJitter();
      if (sc > bs) { bs = sc; bp = e.p; }
    }
    const pick = bp ? bp.id : 'solo';
    if (G.setSimPool) G.setSimPool(m, pick); else m.pool = pick;
  }
  function poolShake(chainId: string): void {
    if (G.ensureMembers) G.ensureMembers();
    const table = chainPoolTable(chainId);
    if (G._soloMembers && G._poolMembers) {
      const seen = new Set<number>();
      const touch = (idx: number) => {
        if (seen.has(idx)) return;
        seen.add(idx);
        const m = G.s.sims[idx];
        if (m) pickPool(m, table);
      };
      for (const i of (G._soloMembers[chainId] || [])) touch(i);
      for (const p of G.s.pools) {
        if (p.chain !== chainId || !p.live) continue;
        for (const i of (G._poolMembers.get(p.id) || [])) touch(i);
      }
      return;
    }
    for (const m of G.s.sims) if (m.chain === chainId) pickPool(m, table);
  }
  // simsOn perf rationale: docs/implementation-notes.md.
  const simsOn = (cid: string) => G._simChainN ? (G._simChainN[cid] || 0) : 0;
  // Rival operator behavior: design-spec.md §5.
  function rivalTick(): void {
    for (const p of G.s.pools) {
      if (p.owner !== 'rival' || !p.live) continue;
      const share = G.poolHash(p) / Math.max(1, G.chainHash(G.chain(p.chain)!));
      const full = G.poolHash(p) >= poolCapLimit(p) * 0.95;
      if (full && Math.random() < 0.30) {
        // capacity is scarce; charge for it, and put earnings into more bond
        G.setPoolFee(p, Math.min(SIM_FEE_MAX, p.fee * 1.06));
        p.bond *= 1.02; p.bond0 = Math.max(p.bond0, p.bond);
      } else if (share < 0.06 && Math.random() < 0.35) {
        G.setPoolFee(p, Math.max(SIM_FEE_MIN, p.fee * 0.90));
      }
      // an empty pool bleeds its operator; long enough and they fold
      p.lapse = G.poolHash(p) < 1 ? (p.lapse || 0) + 1 : 0;
      if (p.lapse > 72 && Math.random() < 0.25) {
        G.closeSimPool(p, 'when ' + p.name + ' folded');
        say('pool', p.name + ' has closed — it never found enough members');
      }
    }
    // New pools are founded by economic sims in simPulse.
  }
  function reshuffle(): void {
    if (!G.s.sims.length) return;
    for (let k = 0; k < 3; k++) {
      const m = G.s.sims[Math.floor(Math.random() * G.s.sims.length)];
      pickPool(m);
    }
  }
  // Fee-preview projections run the real scoring function (jitter softened,
  // not swapped for a parallel estimate) so the slider quotes an honest
  // price: design-spec.md §5.
  const soften = (r: number) => {
    const x = Math.max(0, Math.min(1, (r - 0.94) / 0.12));
    return x * x * (3 - 2 * x);
  };
  // Any fee other than the current one scores fee-stability at zero — the
  // cost of changing is part of the quote: design-spec.md §5.
  const repAt = (p: Pool, fee?: number) => {
    if (fee === undefined || Math.abs(fee - p.fee) < 0.0005) return poolRep(p);
    const q = repParts(p);
    return Math.sqrt(q.solvency) * (0.40 + 0.22 * q.age + 0.22 * q.luck);
  };
  const scoreAt = (p: Pool, fee?: number) =>
    (1 - Math.min(0.9, (fee === undefined ? p.fee : fee) * FEE_BITE)) * repAt(p, fee);
  // Demand: hashrate that would choose this pool at a given fee, ignoring
  // its own capacity — tells you whether more bond is worth posting.
  // Perf rationale for the rival pass below: docs/implementation-notes.md.
  function poolDemand(p: Pool, fee?: number): number {
    const mine = scoreAt(p, fee);
    const rivals: { score: number; room: number }[] = [];
    for (const q of G.s.pools) {
      if (!q.live || q.chain !== p.chain || q.id === p.id) continue;
      rivals.push({ score: scoreAt(q), room: poolCapLimit(q) - G.poolHash(q) });
    }
    rivals.sort((a, b) => a.room - b.room);
    const bestFrom: number[] = new Array(rivals.length + 1);
    bestFrom[rivals.length] = 0;
    for (let i = rivals.length - 1; i >= 0; i--)
      bestFrom[i] = Math.max(bestFrom[i + 1]!, rivals[i]!.score);
    const bestFor = (mh: number) => {
      let lo = 0, hi = rivals.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (rivals[mid]!.room < mh) lo = mid + 1; else hi = mid; }
      return bestFrom[lo]!;
    };
    let h = 0;
    for (const m of G.s.sims) {
      if (m.chain !== p.chain) continue;
      const mh = m.hash;   // read once — G.s is reactive(); see docs/implementation-notes.md
      const best = bestFor(mh);
      h += mh * (best <= 0 ? 1 : soften(mine / best));   // soften: near-ties split rather than winner-take-all
    }
    for (const gr of G.s.groups) if (gr.pool === p.id) h += G.groupHash(gr);
    return h;
  }
  const poolProj = (p: Pool, fee?: number) => Math.min(poolDemand(p, fee), poolCapLimit(p));
  const nextTierBond = (p: Pool) => Math.max(0,
    Math.ceil(bondFor(p, poolDemand(p)) - p.bond));
  /* The operator's book: what the fee actually earns against the capital it
     ties up, so running a pool can be compared with just mining instead. */
  function poolPnl(p: Pool): PoolPnl {
    const c = G.chain(p.chain)!;   // a pool's chain always resolves
    const gross = G.poolHash(p) * G.revPerMh(c);            // what members produce daily
    const income = gross * p.fee + (p.scheme === 'PPS' ? gross * TX_FEES * 0.5 : 0);
    const capital = p.bond;
    return {
      income, capital,
      roi: capital > 0 ? income * 365 / capital : 0,
      payback: income > 0 ? capital / income : Infinity,
    };
  }
  const myPools = computed(() => G.s.pools.filter((p: Pool) => p.owner === 'you' && p.live));
  const rivalPools = computed(() => G.s.pools.filter((p: Pool) => p.live && p.owner !== 'you'));

  // Repeat-accumulation rules (num vs usd vs neither): docs/implementation-notes.md#activity-feed-say-in-poolmarketjs.
  function say(kind: string, text: string, amount?: string, num?: number, unit?: string, usd?: number): void {
    const top: FeedItem | undefined = G.s.feed[0];
    if (top && top.kind === kind && top.text === text) {
      if (num !== undefined && top.num !== undefined) {
        top.n = (top.n || 1) + 1; top.num += num; top.t = fmt.hm(G.s.t);
        top.amount = '+' + fmt.c(top.num) + (unit ? ' ' + unit : ''); return;
      }
      if (usd !== undefined && top.usd !== undefined) {
        top.n = (top.n || 1) + 1; top.usd += usd; top.t = fmt.hm(G.s.t);
        top.amount = (top.usd < 0 ? '-' : '+') + fmt.usd(Math.abs(top.usd)); return;
      }
      if (num === undefined && top.num === undefined && usd === undefined && top.usd === undefined
         && !amount && !top.amount) {
        top.n = (top.n || 1) + 1; top.t = fmt.hm(G.s.t); return;
      }
    }
    G.s.feed.unshift({ id: G.s.feedId++, t: fmt.hm(G.s.t), kind, text, amount: amount || '', num, usd, n: 1 });
    if (G.s.feed.length > 70) G.s.feed.length = 70;
  }
  // Toasts gate in real time (so a speed multiplier can't turn a fast chain
  // into a strobe) and cap per kind, teaching early then falling back to the
  // activity feed. cue() placement above the caps: docs/implementation-notes.md#toasts-pop-in-poolmarketjs.
  let lastToast = -1e9;
  const toastSeen: Record<string, number> = {};
  function pop(text: string, amount?: string, cls?: string, opts?: { kind?: string; always?: boolean }): void {
    opts = opts || {};
    const kind = opts.kind || text;
    cue(cls, kind);
    toastSeen[kind] = (toastSeen[kind] || 0) + 1;
    const now = Date.now();
    if (!opts.always) {
      if (toastSeen[kind]! > C.TOAST_CAP) return;
      if (now - lastToast < C.TOAST_GAP * 1000) return;
    } else if (now - lastToast < 900) return;
    lastToast = now;
    G.s.toast = { n: G.s.toast.n + 1, text, amount: amount || '', cls: cls || '' };
  }

  Object.assign(G, { FEE_BITE, FLOAT_DAYS, blockValue, bondFor, bondReq, capBinding, chainPoolTable, floatBondFor, floatPerHash, lastToast, myPools, nextTierBond, pickPool, poolCapLimit, poolDemand, poolPnl, poolProj, poolRep, poolScore, poolScoreBase, poolShake, poolTrust, pop, refreshPools, repAt, repParts, reshuffle, rivalPools, rivalTick, say, scoreAt, scoreJitter, simsOn, soften, toastSeen, varBondFor });
}
