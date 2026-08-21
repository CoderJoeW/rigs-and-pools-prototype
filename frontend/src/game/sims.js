import { SIM_CHAINS, SIM_PLAYERS, SIM_RATIO, C, TX_FEES, PPLNS_COVER, RIVAL_NAMES } from '../data/constants.js';
import { reactive } from 'vue';
import { CHAINS } from '../data/chains.js';
import { gauss } from '../utils/random.js';

// Economic simulated players: cash, hashrate, chain, pool, style, decision
// timer, a coin-inventory value. They reinvest, switch chains/pools, sell,
// and occasionally found live pools the player competes with.
// Design model: design-spec.md §6o / §6e. Derivations, perf rules and bug
// history: docs/economy.md#simulated-miner-population-model-srcgamesimsjs
// and docs/implementation-notes.md#simulated-economy-srcgamesimsjs.

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

export function installSims(G){
  function emptyChainHash(){
    const o = Object.create(null);
    for(const cid of SIM_CHAINS) o[cid] = 0;
    o.tessera = 0;
    return o;
  }
  // Reactivity rationale: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
  const emptyChainN = () => {
    const o = {};
    for(const cid of SIM_CHAINS) o[cid] = 0;
    o.tessera = 0;
    return o;
  };
  G._simChainHash = emptyChainHash();
  G._simChainN = reactive(emptyChainN());
  G._simPoolHash = Object.create(null);
  G._simSoloHash = emptyChainHash();
  G._poolMembers = new Map();
  G._soloMembers = Object.create(null);
  for(const cid of SIM_CHAINS) G._soloMembers[cid] = [];
  G._soloMembers.tessera = [];
  G._membersDirty = true;

  function rebuildMembers(){
    G._poolMembers.clear();
    for(const cid of Object.keys(G._soloMembers)) G._soloMembers[cid] = [];
    const tally = emptyChainN();
    const sims = G.s.sims;
    for(let i = 0; i < sims.length; i++){
      const m = sims[i];
      tally[m.chain] = (tally[m.chain] || 0) + 1;
      if(m.pool === 'solo' || !m.pool){
        (G._soloMembers[m.chain] || (G._soloMembers[m.chain] = [])).push(i);
      } else {
        let arr = G._poolMembers.get(m.pool);
        if(!arr){ arr = []; G._poolMembers.set(m.pool, arr); }
        arr.push(i);
      }
    }
    // Published in one pass over the union of both key sets, so a chain that
    // has emptied goes to 0 rather than keeping its last count.
    for(const cid of new Set([...Object.keys(G._simChainN), ...Object.keys(tally)]))
      G._simChainN[cid] = tally[cid] || 0;
    G._membersDirty = false;
  }
  function bumpN(cid, d){ G._simChainN[cid] = (G._simChainN[cid] || 0) + d; }
  function ensureMembers(){ if(G._membersDirty) rebuildMembers(); }

  function addHash(m, delta){
    if(!delta) return;
    G._simChainHash[m.chain] = (G._simChainHash[m.chain] || 0) + delta;
    if(m.pool === 'solo' || !m.pool){
      G._simSoloHash[m.chain] = (G._simSoloHash[m.chain] || 0) + delta;
    } else {
      G._simPoolHash[m.pool] = (G._simPoolHash[m.pool] || 0) + delta;
    }
  }
  function setSimHash(m, newHash){
    const d = newHash - m.hash;
    m.hash = newHash;
    addHash(m, d);
  }
  function setSimChain(m, cid){
    if(cid === m.chain) return;
    addHash(m, -m.hash);
    bumpN(m.chain, -1);
    m.chain = cid;
    m.pool = 'solo';
    bumpN(m.chain, 1);
    addHash(m, m.hash);
    G._membersDirty = true;
  }
  function setSimPool(m, pid){
    const next = pid || 'solo';
    if(next === m.pool) return;
    addHash(m, -m.hash);
    m.pool = next;
    addHash(m, m.hash);
    G._membersDirty = true;
  }

  // Seat/target model: design-spec.md §6o; derivation: docs/economy.md.
  const FLOOR_TOTAL = SIM_CHAINS.reduce((a, cid) => {
    const c = CHAINS.find(x => x.id === cid);
    return a + (c ? c.floor : 0);
  }, 0);

  function seatsFor(cid, n){
    const c = CHAINS.find(x => x.id === cid);
    if(!c || FLOOR_TOTAL <= 0) return 0;
    const pop = n == null ? G.s.sims.length : n;
    const spare = Math.max(0, pop - SIM_SEATS_MIN * SIM_CHAINS.length);
    return SIM_SEATS_MIN + spare * c.floor / FLOOR_TOTAL;
  }
  function simTargetOf(cid, n, seats){
    const c = CHAINS.find(x => x.id === cid);
    if(!c) return 0;
    const pop = n == null ? G.s.sims.length : n;
    const fill = Math.min(1, pop / SIM_SOFT_CAP);
    const s = seats == null ? (G._simChainN[cid] || 0) : seats;
    return Math.max(s * SIM_MIN_HASH, SIM_RATIO * c.floor * fill);
  }
  // 1 while a chain has room its economics support, 0 once built out — the
  // reinvestment brake; see docs/economy.md.
  function simRoomOf(cid){
    const target = simTargetOf(cid);
    if(target <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - (G._simChainHash[cid] || 0) / target));
  }
  function overBuilt(cid){
    const target = simTargetOf(cid);
    return target > 0 && (G._simChainHash[cid] || 0) > target * SIM_TRIM_AT;
  }
  // Crowding term (people vs seats, not just pay): docs/economy.md.
  function chainDraw(cid){
    const seats = seatsFor(cid);
    const have = G._simChainN[cid] || 0;
    return Math.max(0.25, Math.min(1.6, seats / Math.max(1, have)));
  }
  // A newcomer picks the chain furthest below its seat entitlement — see design-spec.md §6o.
  function pickJoinChain(n){
    let best = SIM_CHAINS[0], bestGap = -Infinity;
    for(const cid of SIM_CHAINS){
      const gap = seatsFor(cid, n) - (G._simChainN[cid] || 0);
      if(gap > bestGap){ bestGap = gap; best = cid; }
    }
    return best;
  }

  function mkSim(opts){
    const style = opts.style != null ? opts.style : Math.min(1, Math.max(0, 0.5 + gauss() * 0.28));
    const chain = opts.chain || SIM_CHAINS[Math.floor(Math.random() * SIM_CHAINS.length)];
    const hash = opts.hash != null ? opts.hash : newcomerHash();
    const cash = opts.cash != null ? opts.cash : 80 + Math.random() * 420 + style * 600;
    return {
      id: ++simSeq,
      cash,
      hash,
      chain,
      pool: 'solo',
      style,
      next: (opts.t || 0) + Math.random() * 3600 * 6,
      coins: 0,
    };
  }

  function newcomerHash(){ return SIM_MIN_HASH * (1 + Math.random() * 1.15); }   // one card, sometimes two

  function seedSims(t){
    simSeq = 0;
    poolSeq = 0;
    G._simChainHash = emptyChainHash();
    G._simPoolHash = Object.create(null);
    G._simSoloHash = emptyChainHash();
    G._poolMembers.clear();
    for(const cid of Object.keys(G._soloMembers)) G._soloMembers[cid] = [];
    G._membersDirty = true;

    const sims = [];
    const add = m => { sims.push(m); bumpN(m.chain, 1); addHash(m, m.hash); };
    // Largest-remainder allocation: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
    const raw = SIM_CHAINS.map(cid => seatsFor(cid, SIM_START));
    const seats = raw.map(Math.floor);
    let left = SIM_START - seats.reduce((a, x) => a + x, 0);
    const order = raw.map((x, i) => i).sort((a, b) => (raw[b] - seats[b]) - (raw[a] - seats[a]));
    for(let k = 0; left > 0; k++, left--) seats[order[k % order.length]]++;

    SIM_CHAINS.forEach((cid, ci) => {
      const n = Math.max(1, seats[ci]);
      const target = simTargetOf(cid, SIM_START, n);
      // Lognormal spare split rationale: docs/implementation-notes.md.
      const spare = Math.max(0, target - n * SIM_MIN_HASH);
      const weights = [];
      let tot = 0;
      for(let i = 0; i < n; i++){
        const w = Math.exp(gauss() * 0.85);
        weights.push(w); tot += w;
      }
      for(let i = 0; i < n; i++){
        const hash = SIM_MIN_HASH + spare * weights[i] / tot;
        // Reserve sizing rationale: docs/economy.md#simulated-miner-population-model-srcgamesimsjs.
        const reserve = hash * SIM_POWER_PER_MH * (14 + Math.random() * 16);
        add(mkSim({ chain: cid, hash, t, style: Math.random(),
                    cash: reserve + 80 + Math.random() * 300 }));
      }
    });
    G.s.sims = sims;
    seedStarterPools(t);
    rebuildMembers();
    return sims;
  }

  function seedStarterPools(t){
    const names = RIVAL_NAMES;
    let ni = 0;
    for(const cid of SIM_CHAINS){
      const c = CHAINS.find(x => x.id === cid);
      const candidates = G.s.sims.filter(m => m.chain === cid).sort((a, b) => b.cash - a.cash);
      for(let k = 0; k < 2 && k < candidates.length; k++){
        const m = candidates[k];
        if(m.cash < 200) continue;
        const scheme = Math.random() < 0.4 ? 'PPS' : 'PPLNS';
        const fee = scheme === 'PPS' ? 0.02 + Math.random() * 0.03 : 0.006 + Math.random() * 0.02;
        const bond = Math.min(m.cash * 0.55, Math.round(
          m.hash * C.PAY * c.mult * (scheme === 'PPS' ? 1.0 : PPLNS_COVER) * 1.2
          + (scheme === 'PPS' ? 400 : 80)
        ));
        if(bond < 50) continue;
        m.cash -= bond;
        const id = 's' + m.id + 'p' + (++poolSeq);
        const p = {
          id, chain: cid, owner: 'sim', ownerSim: m.id,
          name: names[ni++ % names.length] + (ni > names.length ? ' ' + Math.ceil(ni / names.length) : ''),
          scheme, fee, bond, bond0: bond, cap: 0, born: t || 0, live: true,
          earned: 0, found: 0, feeMoved: -1e9, lapse: 0,
        };
        G.s.pools.push(p);
        setSimPool(m, id);
      }
    }
  }

  function reindexSims(){
    G._simChainHash = emptyChainHash();
    G._simPoolHash = Object.create(null);
    G._simSoloHash = emptyChainHash();
    let maxId = 0;
    for(const m of G.s.sims){
      if(m.id > maxId) maxId = m.id;
      if(m.coins == null) m.coins = 0;
      if(m.style == null) m.style = 0.5;
      if(m.next == null) m.next = G.s.t + Math.random() * 7200;
      if(!m.pool) m.pool = 'solo';
      addHash(m, m.hash);
    }
    simSeq = Math.max(simSeq, maxId);
    for(const p of G.s.pools){
      if(p.owner === 'sim' && p.id){
        const n = parseInt(String(p.id).replace(/\D/g, ''), 10);
        if(n > poolSeq) poolSeq = n;
      }
    }
    rebuildMembers();
  }

  const simHashOf = c => G._simChainHash[c.id] || 0;
  const simPoolHashOf = p => G._simPoolHash[p.id] || 0;
  const simSoloHashOf = cid => G._simSoloHash[cid] || 0;

  function drawSimWinner(c, budget){
    ensureMembers();
    let x = budget;
    for(const p of G.s.pools){
      if(!p.live || p.chain !== c.id) continue;
      const h = G._simPoolHash[p.id] || 0;
      if(h <= 0) continue;
      x -= h;
      if(x <= 0){
        const members = G._poolMembers.get(p.id) || [];
        return pickMember(members, p.id);
      }
    }
    const soloH = G._simSoloHash[c.id] || 0;
    if(soloH > 0){
      const members = G._soloMembers[c.id] || [];
      return pickMember(members, 'solo');
    }
    return { pool: 'solo', mine: false };
  }
  function pickMember(indices, poolId){
    if(!indices.length) return { pool: poolId, mine: false };
    let total = 0;
    for(const i of indices) total += G.s.sims[i].hash;
    if(total <= 0) return { pool: poolId, mine: false, sim: G.s.sims[indices[0]] };
    let x = Math.random() * total;
    for(const i of indices){
      x -= G.s.sims[i].hash;
      if(x <= 0) return { pool: poolId, mine: false, sim: G.s.sims[i] };
    }
    return { pool: poolId, mine: false, sim: G.s.sims[indices[indices.length - 1]] };
  }

  function creditSim(m, usd){
    if(!m) return;
    m.coins = (m.coins || 0) + usd;
  }
  function creditSimPoolShare(pool, fullCoin, price){
    if(!pool || !pool.live) return;
    const ph = (G._simPoolHash[pool.id] || 0);
    if(ph <= 0) return;
    const shareCoin = fullCoin * (1 - pool.fee);
    ensureMembers();
    const members = G._poolMembers.get(pool.id) || [];
    for(const i of members){
      const m = G.s.sims[i];
      const part = shareCoin * (m.hash / ph);
      m.coins += part * price;
    }
    if(pool.owner === 'sim'){
      const take = pool.scheme === 'PPS' ? fullCoin * price : fullCoin * price * pool.fee;
      pool.bond += take;
      pool.earned = (pool.earned || 0) + take;
    }
  }

  function hashCost(){
    const gen = G.s.gen || 0;
    return SIM_HASH_COST * Math.pow(1.12, Math.min(gen, 12));
  }
  function powerCostDay(m){ return m.hash * SIM_POWER_PER_MH; }
  function expectedNetDay(m){
    const c = G.chain(m.chain);
    if(!c) return 0;
    const rev = m.hash * G.revPerMh(c);
    let mult = 1;
    if(m.pool && m.pool !== 'solo'){
      const p = G.poolOf(m.pool);
      if(p && p.live) mult = (1 - p.fee) * (p.scheme === 'PPS' ? 1 : 1 + TX_FEES * 0.5);
    }
    return rev * mult - powerCostDay(m);
  }

  function decide(m){
    const t = G.s.t;
    if(m.coins > 5 && Math.random() < 0.35 + m.style * 0.25){
      const sell = m.coins * (SIM_SELL_FRAC * (0.6 + Math.random() * 0.8));
      m.coins -= sell;
      m.cash += sell * (1 - C.EXCH_FEE);
    }

    const hoursSince = Math.min(SIM_DECIDE_MAX_H,
      Math.max(0.5, (m._lastDecide) ? (t - m._lastDecide) / 3600 : 6));
    m._lastDecide = t;
    const powerBill = powerCostDay(m) * (hoursSince / 24);
    m.cash -= powerBill;
    if(m.cash < 0){
      if(m.coins > 0){ m.cash += m.coins * (1 - C.EXCH_FEE); m.coins = 0; }
      if(m.cash < 0 && m.hash > 15){
        const cut = Math.min(m.hash * 0.15, m.hash - 10);
        setSimHash(m, m.hash - cut);
        m.cash += cut * hashCost() * 0.35;
      }
      if(m.cash < 0) m.cash = 0;
    }

    const net = expectedNetDay(m);
    const cost = hashCost();
    // Room + lead-time binds on reinvestment: docs/economy.md.
    const room = simRoomOf(m.chain);
    if(room > 0 && m.cash > cost * 40 && net > 0 &&
       Math.random() < (0.12 + m.style * 0.28) * room){
      const pace = Math.max(SIM_MIN_HASH, m.hash * SIM_EXPAND_MAX_DAY) * (hoursSince / 24);
      const want = Math.floor(Math.min(pace, m.cash * (0.08 + m.style * 0.18) * room / cost));
      const buy = Math.max(0, Math.min(want, Math.floor(m.cash / cost)));
      // Buy-floor of 1 MH, not a rounder number: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
      if(buy >= 1){
        m.cash -= buy * cost;
        setSimHash(m, m.hash + buy);
      }
    } else if(overBuilt(m.chain) && m.hash > SIM_MIN_HASH && Math.random() < 0.05){
      const cut = Math.min(m.hash * 0.08, m.hash - SIM_MIN_HASH);
      setSimHash(m, m.hash - cut);
      m.cash += cut * hashCost() * 0.35;
    }

    let best = m.chain;
    let bestR = G.revPerMh(G.chain(m.chain)) * chainDraw(m.chain) * SWITCH_EDGE;
    for(const cid of SIM_CHAINS){
      const c = G.chain(cid);
      const simH = G._simChainHash[cid] || 0;
      // Whale check measured against current hashrate, not the floor: docs/implementation-notes.md.
      if(cid !== m.chain && simH + m.hash > simTargetOf(cid) && m.hash > 0.25 * Math.max(1, simH))
        continue;
      const r = G.revPerMh(c) * chainDraw(cid) * (0.88 + Math.random() * 0.24);
      if(r > bestR){ bestR = r; best = cid; }
    }
    if(best !== m.chain) setSimChain(m, best);

    pickSimPool(m);

    if(m.style > 0.62 && m.cash > 400 && Math.random() < 0.008 + m.style * 0.012){
      tryFoundPool(m);
    }
    manageOwnedPools(m);

    const base = 3600 * (2.5 - m.style * 1.4);
    m.next = t + base * (0.55 + Math.random() * 0.9);
  }

  function pickSimPool(m){
    const opts = G.s.pools.filter(p => p.live && p.chain === m.chain &&
      (G.poolCapLimit ? (G._simPoolHash[p.id] || 0) + m.hash <= G.poolCapLimit(p) * 1.02 : true));
    if(!opts.length){ setSimPool(m, 'solo'); return; }
    // Scores through poolMarket's own poolScore(), not a third hand-rolled
    // copy of the formula — a pool's worth must mean the same thing
    // regardless of which rule moved a miner.
    let best = null, bestS = -1;
    for(const p of opts){
      const sc = G.poolScore(p);
      if(sc > bestS){ bestS = sc; best = p; }
    }
    const soloS = 0.72 * G.scoreJitter();
    if(soloS > bestS) setSimPool(m, 'solo');
    else if(best) setSimPool(m, best.id);
  }

  function tryFoundPool(m){
    const c = G.chain(m.chain);
    if(!c || c.id === 'tessera') return;
    const liveN = G.s.pools.filter(p => p.live && p.chain === m.chain).length;
    if(liveN > 14) return;
    const scheme = m.style > 0.75 && m.cash > 2000 ? (Math.random() < 0.45 ? 'PPS' : 'PPLNS') : 'PPLNS';
    const fee = scheme === 'PPS' ? 0.018 + Math.random() * 0.04 : 0.004 + Math.random() * 0.025;
    const bond = Math.round(Math.min(
      m.cash * 0.4,
      Math.max(120, m.hash * C.PAY * c.mult * (scheme === 'PPS' ? 0.8 : PPLNS_COVER) + (scheme === 'PPS' ? 300 : 60))
    ));
    if(bond < 80 || m.cash < bond + 50) return;
    m.cash -= bond;
    const id = 's' + m.id + 'p' + (++poolSeq);
    const name = RIVAL_NAMES[poolSeq % RIVAL_NAMES.length] +
      (poolSeq >= RIVAL_NAMES.length ? ' ' + Math.ceil(poolSeq / RIVAL_NAMES.length) : '');
    const p = {
      id, chain: m.chain, owner: 'sim', ownerSim: m.id,
      name, scheme, fee, bond, bond0: bond, cap: 0, born: G.s.t, live: true,
      earned: 0, found: 0, feeMoved: -1e9, lapse: 0,
    };
    G.s.pools.push(p);
    setSimPool(m, id);
    if(G.say) G.say('pool', p.name + ' has opened on ' + c.name + ' at ' + (fee * 100).toFixed(1) + '%');
  }

  function manageOwnedPools(m){
    for(const p of G.s.pools){
      if(p.owner !== 'sim' || p.ownerSim !== m.id || !p.live) continue;
      const ph = G._simPoolHash[p.id] || 0;
      const cap = G.poolCapLimit ? G.poolCapLimit(p) : Infinity;
      const full = ph >= cap * 0.95;
      const share = ph / Math.max(1, G._simChainHash[p.chain] || 1);
      if(full && Math.random() < 0.25){
        if(G.setPoolFee) G.setPoolFee(p, Math.min(0.09, p.fee * 1.05));
        else p.fee = Math.min(0.09, p.fee * 1.05);
        const add = Math.min(p.earned * 0.1, m.cash * 0.05);
        if(add > 10){ p.bond += add; p.bond0 = Math.max(p.bond0, p.bond); p.earned -= add; }
      } else if(share < 0.05 && Math.random() < 0.3){
        if(G.setPoolFee) G.setPoolFee(p, Math.max(0.002, p.fee * 0.92));
        else p.fee = Math.max(0.002, p.fee * 0.92);
      }
      p.lapse = ph < 1 ? (p.lapse || 0) + 1 : 0;
      if(p.lapse > 96 && Math.random() < 0.2){
        closeSimPool(p, 'when ' + p.name + ' folded');
        m.cash += p.bond;
        p.bond = 0;
        if(G.say) G.say('pool', p.name + ' has closed — not enough members');
      }
      if(p.bond > p.bond0 * 1.3 && Math.random() < 0.15){
        const room = p.bond - p.bond0;
        const take = room * 0.4;
        p.bond -= take;
        m.cash += take;
      }
    }
  }

  // Consolidates 5 previously-separate, drifted closure paths: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
  function closeSimPool(p, why){
    p.live = false;
    for(const s of G.s.sims) if(s.pool === p.id) setSimPool(s, 'solo');
    for(const gr of G.s.groups) if(gr.pool === p.id){
      if(G.forfeitGroup) G.forfeitGroup(gr, why);
      gr.pool = 'solo';
    }
  }

  function simPulse(){
    const t = G.s.t;
    const sims = G.s.sims;
    let budget = SIM_DECIDE_BUDGET;
    const start = Math.floor(Math.random() * Math.max(1, sims.length));
    for(let k = 0; k < sims.length && budget > 0; k++){
      const i = (start + k) % sims.length;
      const m = sims[i];
      if(m.next > t) continue;
      decide(m);
      budget--;
    }

    const n = sims.length;
    if(n < SIM_SOFT_CAP){
      const sat = 1 - n / SIM_SOFT_CAP;
      const expect = (SIM_JOIN_BASE + SIM_JOIN_WORD * n) * sat / 24;
      let spawn = Math.floor(expect);
      if(Math.random() < expect - spawn) spawn++;
      for(let s = 0; s < spawn; s++){
        const m = mkSim({
          chain: pickJoinChain(sims.length),
          hash: newcomerHash(),
          cash: 60 + Math.random() * 280,
          t,
        });
        sims.push(m);
        bumpN(m.chain, 1);
        addHash(m, m.hash);
        G._membersDirty = true;
      }
    }

    // Departure sampling scaled to population: docs/implementation-notes.md#simulated-economy-srcgamesimsjs.
    const looks = Math.max(1, Math.round(sims.length / SIM_START));
    for(let k = 0; k < looks; k++){
      if(sims.length <= SIM_START || Math.random() >= 0.08) continue;
      const i = Math.floor(Math.random() * sims.length);
      const m = sims[i];
      if(m.cash < 15 && m.hash < 20 && m.coins < 10){
        // Zero hashrate through setSimHash before releasing pools: docs/implementation-notes.md.
        setSimHash(m, 0);
        for(const p of G.s.pools){
          if(p.owner === 'sim' && p.ownerSim === m.id && p.live){
            closeSimPool(p, 'when ' + p.name + ' shut down');
            if(G.say) G.say('pool', p.name + ' has closed — its operator has left mining');
          }
        }
        sims.splice(i, 1);
        bumpN(m.chain, -1);
        G._membersDirty = true;
      }
    }
  }

  function simFlatDrip(c, dt){
    const price = G.price(c);
    const diff = G.diffOf(c);
    if(diff <= 0) return;
    ensureMembers();
    for(const p of G.s.pools){
      if(!p.live || p.chain !== c.id || p.scheme !== 'PPS') continue;
      const members = G._poolMembers.get(p.id);
      if(!members || !members.length) continue;
      for(const i of members){
        const m = G.s.sims[i];
        const drip = (dt * m.hash / diff) * c.reward * (1 - p.fee);
        m.coins += drip * price;
      }
      if(p.owner === 'sim'){
        const ph = G._simPoolHash[p.id] || 0;
        const owed = (dt * ph / diff) * c.reward * price * (1 - p.fee);
        p.bond -= owed;
        p.earned -= owed;
        if(p.bond <= 0){
          p.bond = 0;
          closeSimPool(p, 'when the pool failed');
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
