import { SIM_CHAINS, SIM_PLAYERS, SIM_RATIO, C, TX_FEES, PPLNS_COVER, SIM_FEE_MIN, SIM_FEE_MAX } from '../data/constants.js';
import { reactive } from 'vue';
import { CHAINS } from '../data/chains.js';
import { gauss } from '../utils/random.js';
import { nextRivalName } from './rivals.js';
import type { Game, ChainState, Sim, Pool } from './types.js';

// Economic simulated players (cash, hashrate, chain, pool, style, decision
// timer, coin inventory) that reinvest, switch chains/pools, sell, and
// occasionally found live pools the player competes with. Design model:
// design-spec.md §6o/§6e. Derivations/perf/bug history: docs/economy.md#simulated-miner-population-model-srcgamesimsjs, docs/implementation-notes.md#simulated-economy-srcgamesimsjs.

export const SIM_START = SIM_PLAYERS;          // 100 — the network on day one
export const SIM_SOFT_CAP = 16000;             // logistic ceiling on the population
// Arrivals model rationale: docs/economy.md#simulated-miner-population-model-srcgamesimsjs.
export const SIM_JOIN_BASE = 5;                // newcomers/day who arrive on their own
export const SIM_JOIN_WORD = 0.05;             // newcomers/day per miner already here
export const SIM_DECIDE_BUDGET = 80;           // max decisions processed per hourly pulse
export const SIM_POWER_PER_MH = 0.55;          // implicit $/day power cost per MH
export const SIM_HASH_COST = 4.8;              // $/MH to expand
export const SIM_SELL_FRAC = 0.45;             // fraction of coin inventory sold on a sell decision
export const SWITCH_EDGE = 1.85;
export const SIM_MIN_HASH = 20;                // one RX-470 — see docs/economy.md
export const SIM_SEATS_MIN = 12;               // per-chain floor so small chains keep a pool market
export const SIM_EXPAND_MAX_DAY = 0.25;        // lead-time cap on a sim's daily hashrate growth
export const SIM_TRIM_AT = 1.15;               // dead band before over-built chains retire cards
export const SIM_DECIDE_MAX_H = 336;           // a fortnight — decision-gap ceiling, see docs/economy.md

let simSeq = 0;
let poolSeq = 0;

// Every chain a sim can operate on: SIM_CHAINS itself deliberately excludes
// tessera ("Tessera stays a newcomer refuge"), but the per-chain trackers
// below still need a zeroed slot for it.
const ALL_SIM_CHAINS = [...SIM_CHAINS, 'tessera'];

// Reactivity rationale: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
function zeroPerChain(): Record<string, number> {
  const map = Object.create(null);
  for (const chainId of ALL_SIM_CHAINS) map[chainId] = 0;
  return map;
}

interface SimPoolOptions { id: string; chain: string; sim: Sim; name: string; scheme: 'PPS' | 'PPLNS'; fee: number; bond: number; born: number }

// A sim-owned pool's shape, shared by seedStarterPools (day-one market) and
// tryFoundPool (pools sims open later) — they differ only in bond sizing
// and scheme/fee choice, not in what a pool object is.
function makeSimPool({ id, chain, sim, name, scheme, fee, bond, born }: SimPoolOptions): Pool {
  return { id, chain, owner: 'sim', ownerSim: sim.id, name, scheme, fee,
    bond, bond0: bond, cap: 0, born, live: true,
    earned: 0, found: 0, feeMoved: -1e9, lapse: 0 };
}

export function installSims(G: Game): void {
  G._simChainHash = zeroPerChain();
  G._simChainN = reactive(zeroPerChain());
  G._simPoolHash = Object.create(null);
  G._simSoloHash = zeroPerChain();
  G._poolMembers = new Map<string, number[]>();
  G._soloMembers = Object.create(null);
  for (const chainId of ALL_SIM_CHAINS) G._soloMembers[chainId] = [];
  G._membersDirty = true;

  function rebuildMembers(): void {
    G._poolMembers.clear();
    for (const chainId of Object.keys(G._soloMembers)) G._soloMembers[chainId] = [];
    const tally = zeroPerChain();
    const sims: Sim[] = G.s.sims;
    for (let i = 0; i < sims.length; i++) {
      const sim = sims[i]!;
      tally[sim.chain] = (tally[sim.chain] || 0) + 1;
      if (sim.pool === 'solo' || !sim.pool) {
        (G._soloMembers[sim.chain] || (G._soloMembers[sim.chain] = [])).push(i);
      } else {
        let members = G._poolMembers.get(sim.pool);
        if (!members) { members = []; G._poolMembers.set(sim.pool, members); }
        members.push(i);
      }
    }
    // Published in one pass over the union of both key sets, so a chain that
    // has emptied goes to 0 rather than keeping its last count.
    for (const chainId of new Set([...Object.keys(G._simChainN), ...Object.keys(tally)]))
      G._simChainN[chainId] = tally[chainId] || 0;
    G._membersDirty = false;
  }
  function bumpChainCount(chainId: string, delta: number): void { G._simChainN[chainId] = (G._simChainN[chainId] || 0) + delta; }
  function ensureMembers(): void { if (G._membersDirty) rebuildMembers(); }

  function addHash(sim: Sim, delta: number): void {
    if (!delta) return;
    G._simChainHash[sim.chain] = (G._simChainHash[sim.chain] || 0) + delta;
    if (sim.pool === 'solo' || !sim.pool) {
      G._simSoloHash[sim.chain] = (G._simSoloHash[sim.chain] || 0) + delta;
    } else {
      G._simPoolHash[sim.pool] = (G._simPoolHash[sim.pool] || 0) + delta;
    }
  }
  function setSimHash(sim: Sim, newHash: number): void {
    const delta = newHash - sim.hash;
    sim.hash = newHash;
    addHash(sim, delta);
  }
  function setSimChain(sim: Sim, chainId: string): void {
    if (chainId === sim.chain) return;
    addHash(sim, -sim.hash);
    bumpChainCount(sim.chain, -1);
    sim.chain = chainId;
    sim.pool = 'solo';
    bumpChainCount(sim.chain, 1);
    addHash(sim, sim.hash);
    G._membersDirty = true;
  }
  function setSimPool(sim: Sim, poolId: string): void {
    const next = poolId || 'solo';
    if (next === sim.pool) return;
    addHash(sim, -sim.hash);
    sim.pool = next;
    addHash(sim, sim.hash);
    G._membersDirty = true;
  }

  // Seat/target model: design-spec.md §6o; derivation: docs/economy.md.
  const FLOOR_TOTAL = SIM_CHAINS.reduce((sum, chainId) => {
    const chainDef = CHAINS.find(entry => entry.id === chainId);
    return sum + (chainDef ? chainDef.floor : 0);
  }, 0);

  function seatsFor(chainId: string, population?: number): number {
    const chain = CHAINS.find(entry => entry.id === chainId);
    if (!chain || FLOOR_TOTAL <= 0) return 0;
    const pop = population == null ? G.s.sims.length : population;
    const spare = Math.max(0, pop - SIM_SEATS_MIN * SIM_CHAINS.length);
    return SIM_SEATS_MIN + spare * chain.floor / FLOOR_TOTAL;
  }
  function simTargetOf(chainId: string, population?: number, seats?: number): number {
    const chain = CHAINS.find(entry => entry.id === chainId);
    if (!chain) return 0;
    const pop = population == null ? G.s.sims.length : population;
    const fill = Math.min(1, pop / SIM_SOFT_CAP);
    const seatCount = seats == null ? (G._simChainN[chainId] || 0) : seats;
    return Math.max(seatCount * SIM_MIN_HASH, SIM_RATIO * chain.floor * fill);
  }
  // 1 while a chain has room its economics support, 0 once built out — the
  // reinvestment brake; see docs/economy.md.
  function simRoomOf(chainId: string): number {
    const target = simTargetOf(chainId);
    if (target <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - (G._simChainHash[chainId] || 0) / target));
  }
  function overBuilt(chainId: string): boolean {
    const target = simTargetOf(chainId);
    return target > 0 && (G._simChainHash[chainId] || 0) > target * SIM_TRIM_AT;
  }
  // Crowding term (people vs seats, not just pay): docs/economy.md.
  function chainDraw(chainId: string): number {
    const seats = seatsFor(chainId);
    const have = G._simChainN[chainId] || 0;
    return Math.max(0.25, Math.min(1.6, seats / Math.max(1, have)));
  }
  // A newcomer picks the chain furthest below its seat entitlement — see design-spec.md §6o.
  function pickJoinChain(population: number): string {
    let best = SIM_CHAINS[0]!, bestGap = -Infinity;
    for (const chainId of SIM_CHAINS) {
      const gap = seatsFor(chainId, population) - (G._simChainN[chainId] || 0);
      if (gap > bestGap) { bestGap = gap; best = chainId; }
    }
    return best;
  }

  function mkSim(options: { style?: number; chain?: string; hash?: number; cash?: number; time?: number }): Sim {
    const style = options.style != null ? options.style : Math.min(1, Math.max(0, 0.5 + gauss() * 0.28));
    const chain = options.chain || SIM_CHAINS[Math.floor(Math.random() * SIM_CHAINS.length)]!;
    const hash = options.hash != null ? options.hash : newcomerHash();
    const cash = options.cash != null ? options.cash : 80 + Math.random() * 420 + style * 600;
    return {
      id: ++simSeq,
      cash,
      hash,
      chain,
      pool: 'solo',
      style,
      next: (options.time || 0) + Math.random() * 3600 * 6,
      coins: 0,
    };
  }

  function newcomerHash(): number { return SIM_MIN_HASH * (1 + Math.random() * 1.15); }   // one card, sometimes two

  function seedSims(now: number): Sim[] {
    simSeq = 0;
    poolSeq = 0;
    G._simChainHash = zeroPerChain();
    G._simPoolHash = Object.create(null);
    G._simSoloHash = zeroPerChain();
    G._poolMembers.clear();
    for (const chainId of Object.keys(G._soloMembers)) G._soloMembers[chainId] = [];
    G._membersDirty = true;

    const sims: Sim[] = [];
    const addSim = (sim: Sim) => { sims.push(sim); bumpChainCount(sim.chain, 1); addHash(sim, sim.hash); };
    // Largest-remainder allocation: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
    const rawSeats = SIM_CHAINS.map(chainId => seatsFor(chainId, SIM_START));
    const seats = rawSeats.map(Math.floor);
    let left = SIM_START - seats.reduce((sum, seatCount) => sum + seatCount, 0);
    const order = rawSeats.map((_, i) => i).sort((indexA, indexB) => (rawSeats[indexB]! - seats[indexB]!) - (rawSeats[indexA]! - seats[indexA]!));
    for (let k = 0; left > 0; k++, left--) { const i = order[k % order.length]!; seats[i] = seats[i]! + 1; }

    SIM_CHAINS.forEach((chainId, chainIndex) => {
      const seatCount = Math.max(1, seats[chainIndex]!);
      const target = simTargetOf(chainId, SIM_START, seatCount);
      // Lognormal spare split rationale: docs/implementation-notes.md.
      const spare = Math.max(0, target - seatCount * SIM_MIN_HASH);
      const weights: number[] = [];
      let weightTotal = 0;
      for (let i = 0; i < seatCount; i++) {
        const weight = Math.exp(gauss() * 0.85);
        weights.push(weight); weightTotal += weight;
      }
      for (let i = 0; i < seatCount; i++) {
        const hash = SIM_MIN_HASH + spare * weights[i]! / weightTotal;
        // Reserve sizing rationale: docs/economy.md#simulated-miner-population-model-srcgamesimsjs.
        const reserve = hash * SIM_POWER_PER_MH * (14 + Math.random() * 16);
        addSim(mkSim({ chain: chainId, hash, time: now, style: Math.random(),
                    cash: reserve + 80 + Math.random() * 300 }));
      }
    });
    G.s.sims = sims;
    seedStarterPools(now);
    rebuildMembers();
    return sims;
  }

  function seedStarterPools(now: number): void {
    for (const chainId of SIM_CHAINS) {
      const chain = CHAINS.find(entry => entry.id === chainId)!;
      const candidates = G.s.sims.filter((sim: Sim) => sim.chain === chainId).sort((simA: Sim, simB: Sim) => simB.cash - simA.cash);
      for (let k = 0; k < 2 && k < candidates.length; k++) {
        const sim = candidates[k]!;
        if (sim.cash < 200) continue;
        const scheme: 'PPS' | 'PPLNS' = Math.random() < 0.4 ? 'PPS' : 'PPLNS';
        const fee = scheme === 'PPS' ? 0.02 + Math.random() * 0.03 : 0.006 + Math.random() * 0.02;
        const bond = Math.min(sim.cash * 0.55, Math.round(
          sim.hash * C.PAY * chain.mult * (scheme === 'PPS' ? 1.0 : PPLNS_COVER) * 1.2
          + (scheme === 'PPS' ? 400 : 80)
        ));
        if (bond < 50) continue;
        sim.cash -= bond;
        const id = 's' + sim.id + 'p' + (++poolSeq);
        const pool = makeSimPool({ id, chain: chainId, sim, scheme, fee, bond,
          name: nextRivalName(poolSeq), born: now || 0 });
        G.s.pools.push(pool);
        setSimPool(sim, id);
      }
    }
  }

  function reindexSims(): void {
    G._simChainHash = zeroPerChain();
    G._simPoolHash = Object.create(null);
    G._simSoloHash = zeroPerChain();
    let maxId = 0;
    for (const sim of G.s.sims as (Sim & { coins?: number; style?: number; next?: number; pool?: string })[]) {
      if (sim.id > maxId) maxId = sim.id;
      if (sim.coins == null) sim.coins = 0;
      if (sim.style == null) sim.style = 0.5;
      if (sim.next == null) sim.next = G.s.t + Math.random() * 7200;
      if (!sim.pool) sim.pool = 'solo';
      addHash(sim as Sim, sim.hash);
    }
    simSeq = Math.max(simSeq, maxId);
    for (const pool of G.s.pools) {
      if (pool.owner === 'sim' && pool.id) {
        const poolNum = parseInt(String(pool.id).replace(/\D/g, ''), 10);
        if (poolNum > poolSeq) poolSeq = poolNum;
      }
    }
    rebuildMembers();
  }

  const simHashOf = (chain: ChainState) => G._simChainHash[chain.id] || 0;
  const simPoolHashOf = (pool: any) => G._simPoolHash[pool.id] || 0;
  const simSoloHashOf = (chainId: string) => G._simSoloHash[chainId] || 0;

  function drawSimWinner(chain: ChainState, budget: number): { pool: string; mine: boolean; sim?: Sim } {
    ensureMembers();
    let remainingHash = budget;
    for (const pool of G.s.pools) {
      if (!pool.live || pool.chain !== chain.id) continue;
      const poolHashAmount = G._simPoolHash[pool.id] || 0;
      if (poolHashAmount <= 0) continue;
      remainingHash -= poolHashAmount;
      if (remainingHash <= 0) {
        const members = G._poolMembers.get(pool.id) || [];
        return pickMember(members, pool.id);
      }
    }
    const soloHash = G._simSoloHash[chain.id] || 0;
    if (soloHash > 0) {
      const members = G._soloMembers[chain.id] || [];
      return pickMember(members, 'solo');
    }
    return { pool: 'solo', mine: false };
  }
  function pickMember(indices: number[], poolId: string): { pool: string; mine: boolean; sim?: Sim } {
    if (!indices.length) return { pool: poolId, mine: false };
    let total = 0;
    for (const index of indices) total += G.s.sims[index]!.hash;
    if (total <= 0) return { pool: poolId, mine: false, sim: G.s.sims[indices[0]!] };
    let remainingHash = Math.random() * total;
    for (const index of indices) {
      remainingHash -= G.s.sims[index]!.hash;
      if (remainingHash <= 0) return { pool: poolId, mine: false, sim: G.s.sims[index]! };
    }
    return { pool: poolId, mine: false, sim: G.s.sims[indices[indices.length - 1]!] };
  }

  function creditSim(sim: Sim | undefined, usd: number): void {
    if (!sim) return;
    sim.coins = (sim.coins || 0) + usd;
  }
  function creditSimPoolShare(pool: any, fullCoin: number, price: number): void {
    if (!pool || !pool.live) return;
    const poolHashAmount = (G._simPoolHash[pool.id] || 0);
    if (poolHashAmount <= 0) return;
    const shareCoin = fullCoin * (1 - pool.fee);
    ensureMembers();
    const members = G._poolMembers.get(pool.id) || [];
    for (const index of members) {
      const sim = G.s.sims[index]!;
      const memberShare = shareCoin * (sim.hash / poolHashAmount);
      sim.coins += memberShare * price;
    }
    if (pool.owner === 'sim') {
      const take = pool.scheme === 'PPS' ? fullCoin * price : fullCoin * price * pool.fee;
      pool.bond += take;
      pool.earned = (pool.earned || 0) + take;
    }
  }

  function hashCost(): number {
    const gen = G.s.gen || 0;
    return SIM_HASH_COST * Math.pow(1.12, Math.min(gen, 12));
  }
  function powerCostDay(sim: Sim): number { return sim.hash * SIM_POWER_PER_MH; }
  function expectedNetDay(sim: Sim): number {
    const chain = G.chain(sim.chain);
    if (!chain) return 0;
    const rev = sim.hash * G.revPerMh(chain);
    let mult = 1;
    if (sim.pool && sim.pool !== 'solo') {
      const pool = G.poolOf(sim.pool);
      if (pool && pool.live) mult = (1 - pool.fee) * (pool.scheme === 'PPS' ? 1 : 1 + TX_FEES * 0.5);
    }
    return rev * mult - powerCostDay(sim);
  }

  function decide(sim: Sim): void {
    const now = G.s.t;
    sellSomeCoins(sim);
    const hoursSince = payPowerBillAndCoverShortfall(sim, now);
    reinvestOrTrimHash(sim, hoursSince);
    switchToBetterChain(sim);
    pickSimPool(sim);
    if (sim.style > 0.62 && sim.cash > 400 && Math.random() < 0.008 + sim.style * 0.012) {
      tryFoundPool(sim);
    }
    manageOwnedPools(sim);

    const base = 3600 * (2.5 - sim.style * 1.4);
    sim.next = now + base * (0.55 + Math.random() * 0.9);
  }

  function sellSomeCoins(sim: Sim): void {
    if (sim.coins > 5 && Math.random() < 0.35 + sim.style * 0.25) {
      const sell = sim.coins * (SIM_SELL_FRAC * (0.6 + Math.random() * 0.8));
      sim.coins -= sell;
      sim.cash += sell * (1 - C.EXCH_FEE);
    }
  }

  function payPowerBillAndCoverShortfall(sim: Sim, now: number): number {
    const hoursSince = Math.min(SIM_DECIDE_MAX_H,
      Math.max(0.5, (sim._lastDecide) ? (now - sim._lastDecide) / 3600 : 6));
    sim._lastDecide = now;
    const powerBill = powerCostDay(sim) * (hoursSince / 24);
    sim.cash -= powerBill;
    if (sim.cash < 0) {
      if (sim.coins > 0) { sim.cash += sim.coins * (1 - C.EXCH_FEE); sim.coins = 0; }
      if (sim.cash < 0 && sim.hash > 15) {
        const cut = Math.min(sim.hash * 0.15, sim.hash - 10);
        setSimHash(sim, sim.hash - cut);
        sim.cash += cut * hashCost() * 0.35;
      }
      if (sim.cash < 0) sim.cash = 0;
    }
    return hoursSince;
  }

  function reinvestOrTrimHash(sim: Sim, hoursSince: number): void {
    const net = expectedNetDay(sim);
    const cost = hashCost();
    // Room + lead-time binds on reinvestment: docs/economy.md.
    const room = simRoomOf(sim.chain);
    if (room > 0 && sim.cash > cost * 40 && net > 0 &&
       Math.random() < (0.12 + sim.style * 0.28) * room) {
      const pace = Math.max(SIM_MIN_HASH, sim.hash * SIM_EXPAND_MAX_DAY) * (hoursSince / 24);
      const want = Math.floor(Math.min(pace, sim.cash * (0.08 + sim.style * 0.18) * room / cost));
      const buy = Math.max(0, Math.min(want, Math.floor(sim.cash / cost)));
      // Buy-floor of 1 MH, not a rounder number: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
      if (buy >= 1) {
        sim.cash -= buy * cost;
        setSimHash(sim, sim.hash + buy);
      }
    } else if (overBuilt(sim.chain) && sim.hash > SIM_MIN_HASH && Math.random() < 0.05) {
      const cut = Math.min(sim.hash * 0.08, sim.hash - SIM_MIN_HASH);
      setSimHash(sim, sim.hash - cut);
      sim.cash += cut * hashCost() * 0.35;
    }
  }

  function switchToBetterChain(sim: Sim): void {
    let best = sim.chain;
    let bestRevenue = G.revPerMh(G.chain(sim.chain)) * chainDraw(sim.chain) * SWITCH_EDGE;
    for (const chainId of SIM_CHAINS) {
      const chain = G.chain(chainId);
      const chainSimHash = G._simChainHash[chainId] || 0;
      // Whale check measured against current hashrate, not the floor: docs/implementation-notes.md.
      if (chainId !== sim.chain && chainSimHash + sim.hash > simTargetOf(chainId) && sim.hash > 0.25 * Math.max(1, chainSimHash))
        continue;
      const revenue = G.revPerMh(chain) * chainDraw(chainId) * (0.88 + Math.random() * 0.24);
      if (revenue > bestRevenue) { bestRevenue = revenue; best = chainId; }
    }
    if (best !== sim.chain) setSimChain(sim, best);
  }

  function pickSimPool(sim: Sim): void {
    const poolOptions = G.s.pools.filter((pool: any) => pool.live && pool.chain === sim.chain &&
      (G.poolCapLimit ? (G._simPoolHash[pool.id] || 0) + sim.hash <= G.poolCapLimit(pool) * 1.02 : true));
    if (!poolOptions.length) { setSimPool(sim, 'solo'); return; }
    // Scores through poolMarket's own poolScore(), not a third hand-rolled
    // copy of the formula — a pool's worth must mean the same thing
    // regardless of which rule moved a miner.
    let best: any = null, bestScore = -1;
    for (const pool of poolOptions) {
      const score = G.poolScore(pool);
      if (score > bestScore) { bestScore = score; best = pool; }
    }
    const soloScore = 0.72 * G.scoreJitter();
    if (soloScore > bestScore) setSimPool(sim, 'solo');
    else if (best) setSimPool(sim, best.id);
  }

  function tryFoundPool(sim: Sim): void {
    const chain = G.chain(sim.chain);
    if (!chain || chain.id === 'tessera') return;
    const liveCount = G.s.pools.filter((pool: any) => pool.live && pool.chain === sim.chain).length;
    if (liveCount > 14) return;
    const scheme: 'PPS' | 'PPLNS' = sim.style > 0.75 && sim.cash > 2000 ? (Math.random() < 0.45 ? 'PPS' : 'PPLNS') : 'PPLNS';
    const fee = scheme === 'PPS' ? 0.018 + Math.random() * 0.04 : 0.004 + Math.random() * 0.025;
    const bond = Math.round(Math.min(
      sim.cash * 0.4,
      Math.max(120, sim.hash * C.PAY * chain.mult * (scheme === 'PPS' ? 0.8 : PPLNS_COVER) + (scheme === 'PPS' ? 300 : 60))
    ));
    if (bond < 80 || sim.cash < bond + 50) return;
    sim.cash -= bond;
    const id = 's' + sim.id + 'p' + (++poolSeq);
    const pool = makeSimPool({ id, chain: sim.chain, sim, scheme, fee, bond,
      name: nextRivalName(poolSeq), born: G.s.t });
    G.s.pools.push(pool);
    setSimPool(sim, id);
    if (G.say) G.say('pool', pool.name + ' has opened on ' + chain.name + ' at ' + (fee * 100).toFixed(1) + '%');
  }

  // G.setPoolFee (pools.ts) isn't installed yet when a test drives installSims
  // on its own, so this falls back to a bare assignment — same clamped value
  // either way, just without the trust-affecting side effects setPoolFee has.
  function adjustPoolFee(pool: any, newFee: number): void {
    if (G.setPoolFee) G.setPoolFee(pool, newFee);
    else pool.fee = newFee;
  }

  function manageOwnedPools(sim: Sim): void {
    for (const pool of G.s.pools) {
      if (pool.owner !== 'sim' || pool.ownerSim !== sim.id || !pool.live) continue;
      const poolHashAmount = G._simPoolHash[pool.id] || 0;
      const cap = G.poolCapLimit ? G.poolCapLimit(pool) : Infinity;
      const full = poolHashAmount >= cap * 0.95;
      const share = poolHashAmount / Math.max(1, G._simChainHash[pool.chain] || 1);
      if (full && Math.random() < 0.25) {
        adjustPoolFee(pool, Math.min(SIM_FEE_MAX, pool.fee * 1.05));
        const bondTopUp = Math.min(pool.earned * 0.1, sim.cash * 0.05);
        if (bondTopUp > 10) { pool.bond += bondTopUp; pool.bond0 = Math.max(pool.bond0, pool.bond); pool.earned -= bondTopUp; }
      } else if (share < 0.05 && Math.random() < 0.3) {
        adjustPoolFee(pool, Math.max(SIM_FEE_MIN, pool.fee * 0.92));
      }
      pool.lapse = poolHashAmount < 1 ? (pool.lapse || 0) + 1 : 0;
      if (pool.lapse > 96 && Math.random() < 0.2) {
        closeSimPool(pool, 'when ' + pool.name + ' folded');
        sim.cash += pool.bond;
        pool.bond = 0;
        if (G.say) G.say('pool', pool.name + ' has closed — not enough members');
      }
      if (pool.bond > pool.bond0 * 1.3 && Math.random() < 0.15) {
        const room = pool.bond - pool.bond0;
        const take = room * 0.4;
        pool.bond -= take;
        sim.cash += take;
      }
    }
  }

  // Consolidates 5 previously-separate, drifted closure paths: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
  function closeSimPool(pool: any, why: string): void {
    pool.live = false;
    for (const sim of G.s.sims as Sim[]) if (sim.pool === pool.id) setSimPool(sim, 'solo');
    for (const group of G.s.groups) if (group.pool === pool.id) {
      if (G.forfeitGroup) G.forfeitGroup(group, why);
      group.pool = 'solo';
    }
  }

  function simPulse(): void {
    const now = G.s.t;
    const sims: Sim[] = G.s.sims;
    let budget = SIM_DECIDE_BUDGET;
    const start = Math.floor(Math.random() * Math.max(1, sims.length));
    for (let k = 0; k < sims.length && budget > 0; k++) {
      const index = (start + k) % sims.length;
      const sim = sims[index]!;
      if (sim.next > now) continue;
      decide(sim);
      budget--;
    }

    const population = sims.length;
    if (population < SIM_SOFT_CAP) {
      const sat = 1 - population / SIM_SOFT_CAP;
      const expect = (SIM_JOIN_BASE + SIM_JOIN_WORD * population) * sat / 24;
      let spawn = Math.floor(expect);
      if (Math.random() < expect - spawn) spawn++;
      for (let spawnIndex = 0; spawnIndex < spawn; spawnIndex++) {
        const newSim = mkSim({
          chain: pickJoinChain(sims.length),
          hash: newcomerHash(),
          cash: 60 + Math.random() * 280,
          time: now,
        });
        sims.push(newSim);
        bumpChainCount(newSim.chain, 1);
        addHash(newSim, newSim.hash);
        G._membersDirty = true;
      }
    }

    // Departure sampling scaled to population: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
    const looks = Math.max(1, Math.round(sims.length / SIM_START));
    for (let k = 0; k < looks; k++) {
      if (sims.length <= SIM_START || Math.random() >= 0.08) continue;
      const index = Math.floor(Math.random() * sims.length);
      const sim = sims[index]!;
      if (sim.cash < 15 && sim.hash < 20 && sim.coins < 10) {
        // Zero hashrate through setSimHash before releasing pools: docs/implementation-notes.md.
        setSimHash(sim, 0);
        for (const pool of G.s.pools) {
          if (pool.owner === 'sim' && pool.ownerSim === sim.id && pool.live) {
            closeSimPool(pool, 'when ' + pool.name + ' shut down');
            if (G.say) G.say('pool', pool.name + ' has closed — its operator has left mining');
          }
        }
        sims.splice(index, 1);
        bumpChainCount(sim.chain, -1);
        G._membersDirty = true;
      }
    }
  }

  function simFlatDrip(chain: ChainState, dt: number): void {
    const price = G.price(chain);
    const diff = G.diffOf(chain);
    if (diff <= 0) return;
    ensureMembers();
    for (const pool of G.s.pools) {
      if (!pool.live || pool.chain !== chain.id || pool.scheme !== 'PPS') continue;
      const members = G._poolMembers.get(pool.id);
      if (!members || !members.length) continue;
      for (const index of members) {
        const sim = G.s.sims[index]!;
        const drip = (dt * sim.hash / diff) * chain.reward * (1 - pool.fee);
        sim.coins += drip * price;
      }
      if (pool.owner === 'sim') {
        const poolHashAmount = G._simPoolHash[pool.id] || 0;
        const owed = (dt * poolHashAmount / diff) * chain.reward * price * (1 - pool.fee);
        pool.bond -= owed;
        pool.earned -= owed;
        if (pool.bond <= 0) {
          pool.bond = 0;
          closeSimPool(pool, 'when the pool failed');
        }
      }
    }
  }

  Object.assign(G, {
    seedSims, reindexSims, simPulse, simHashOf, simPoolHashOf, simSoloHashOf,
    drawSimWinner, creditSim, creditSimPoolShare, simFlatDrip,
    setSimHash, setSimChain, setSimPool, addHash, ensureMembers, rebuildMembers,
    mkSim, seatsFor, simTargetOf, simRoomOf, overBuilt, closeSimPool,
    SIM_SOFT_CAP, SIM_START,
  });
}
