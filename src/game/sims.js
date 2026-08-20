import { SIM_CHAINS, SIM_PLAYERS, SIM_RATIO, C, TX_FEES, PPLNS_COVER, RIVAL_NAMES } from '../data/constants.js';
import { CHAINS } from '../data/chains.js';
import { gauss } from '../utils/random.js';

/* Economic simulated players.
   Each sim is a lean agent: cash, hashrate, chain, pool, style, decision timer,
   and a single coin-inventory value. They reinvest, switch chains/pools, sell,
   and occasionally found live pools the player competes with.

   Performance rules (battery / 20k target):
   - Running totals G._simChainHash / _simPoolHash / _simSoloHash are updated
     incrementally. Hot-path simHash/poolHash never scan the array.
   - Decision work is budgeted: at most SIM_DECIDE_BUDGET agents wake per
     hourly pulse, staggered by each sim's `next` time.
   - Block winner sampling picks a bucket (pool or solo) via aggregates, then
     walks only that bucket's members — never the full 20k list.
   - No Vue reactivity on individual sims; they live in a plain array.

   The population is the model's clock. A world opens with SIM_START miners
   and fills toward SIM_SOFT_CAP over months; a chain's hashrate is what the
   miners who have arrived have built, not a number handed to it at t=0.
   seatsFor / simTargetOf / simRoomOf hold that shape together — see the
   comment above them. */

export const SIM_START = SIM_PLAYERS;          // 100 — the network on day one
export const SIM_SOFT_CAP = 16000;             // logistic ceiling on the population
/* Arrivals. Logistic, not a flat rate: a trickle who find the chains on their
   own, plus word of mouth from everybody already mining, tapering off as the
   network saturates. The old rule was a flat 18/day scaled by (1-n/cap)^2,
   which needed roughly 900 game-days to fill the network — far past the end of
   any farm's arc (GEN_DAYS caps the hardware ladder at 168), so the "miners
   arrive over time" half of the model never actually showed up in play. These
   two fill it over about four months instead. */
export const SIM_JOIN_BASE = 5;                // newcomers/day who arrive on their own
export const SIM_JOIN_WORD = 0.05;             // newcomers/day per miner already here
export const SIM_DECIDE_BUDGET = 80;           // max decisions processed per hourly pulse
export const SIM_POWER_PER_MH = 0.55;          // implicit $/day power cost per MH
export const SIM_HASH_COST = 4.8;              // $/MH to expand
export const SIM_SELL_FRAC = 0.45;             // fraction of coin inventory sold on a sell decision
export const SWITCH_EDGE = 1.85;
/* One RX-470. A simulated miner is a person with a farm, not a share of a
   chain's hashrate: they start at a card or two and build from there, so the
   floor on what one of them can hold is one card. */
export const SIM_MIN_HASH = 20;
/* Every chain keeps this many miners whatever its size, so the pool market on
   the bottom rungs always has somebody to recruit and a player who founds a
   Ferro pool is never told nobody mines there. */
export const SIM_SEATS_MIN = 12;
/* The most one miner can add to their own farm in a day. Space, power and lead
   times bind for them exactly as the build queue binds for the player; without
   it a sim converts cash to hashrate instantly and compounds at ~90%/day. */
export const SIM_EXPAND_MAX_DAY = 0.25;
/* How far over what a chain supports it has to run before miners there start
   retiring cards. A dead band, not a line: a world is seeded AT its target, so
   trimming at 1.0 had the opening network shrinking for its first fortnight
   while the population caught up — the retirement branch eating the seed
   faster than anybody could build. */
export const SIM_TRIM_AT = 1.15;
/* Ceiling on the gap a single decision may account for. Decisions are budgeted
   (SIM_DECIDE_BUDGET an hour, whatever the population), so at the soft cap a
   miner's turn comes round about every 190 hours — and the old 48-hour clamp
   meant they were billed for a quarter of the power they actually burned and
   allowed a quarter of the building they actually had time for. Still a
   clamp, because a save resumed after a long absence must not hand anybody a
   year's bill in one turn; just one set above the cadence the model reaches
   rather than under it. */
export const SIM_DECIDE_MAX_H = 336;      // a fortnight

let simSeq = 0;
let poolSeq = 0;

export function installSims(G){
  function emptyChainHash(){
    const o = Object.create(null);
    for(const cid of SIM_CHAINS) o[cid] = 0;
    o.tessera = 0;
    return o;
  }
  G._simChainHash = emptyChainHash();
  G._simChainN = emptyChainHash();
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
    for(const cid of Object.keys(G._simChainN)) G._simChainN[cid] = 0;
    const sims = G.s.sims;
    for(let i = 0; i < sims.length; i++){
      const m = sims[i];
      G._simChainN[m.chain] = (G._simChainN[m.chain] || 0) + 1;
      if(m.pool === 'solo' || !m.pool){
        (G._soloMembers[m.chain] || (G._soloMembers[m.chain] = [])).push(i);
      } else {
        let arr = G._poolMembers.get(m.pool);
        if(!arr){ arr = []; G._poolMembers.set(m.pool, arr); }
        arr.push(i);
      }
    }
    G._membersDirty = false;
  }
  /* Head count per chain, kept incrementally alongside the hashrate totals.
     simTargetOf is consulted on every sim decision, so it must never be the
     thing that forces a 16k-element rebuild. */
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

  /* ---- how big the independent network is -------------------------------
     SIM_RATIO * floor is where a chain's miners END UP, not where they start.
     A world opens with SIM_START of them and fills toward SIM_SOFT_CAP as word
     gets around (simPulse), and each chain's hashrate tracks the population
     that has actually arrived. Before this, seedSims handed every chain
     0.6 * floor at t=0 and split it among 25 accounts — which is how Obelisk
     came up reading 1.3 TH off the gate, 25 "new players" holding 48 GH each,
     about 250 starter rigs apiece.

     Seats per chain are weighted by floor, because the ladder IS the chain
     sizes: Obelisk is not a bigger version of Ferro, it is the chain that
     thousands of miners work. SIM_SEATS_MIN is held back for every chain first
     so the small rungs keep a pool market. The two rules agree at the soft
     cap — 16k miners spread by floor weight put about 96 MH on every seat of
     every chain, i.e. one small farm each, which is what a simulated miner is
     supposed to be. */
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
  /* 1 while the chain still has room its economics support, 0 once the miners
     on it have built that room out. This is the brake the model was missing:
     below a chain's floor the difficulty clamp means revenue per MH never
     falls however much hashrate piles in, so an agent that simply reinvests
     while `net > 0` compounds without limit — a 30-day run reached 27x
     Obelisk's floor and was still climbing toward the price cap at ~51x. */
  function simRoomOf(cid){
    const target = simTargetOf(cid);
    if(target <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - (G._simChainHash[cid] || 0) / target));
  }
  function overBuilt(cid){
    const target = simTargetOf(cid);
    return target > 0 && (G._simChainHash[cid] || 0) > target * SIM_TRIM_AT;
  }
  /* How crowded a chain is, in PEOPLE against the seats its size supports.
     Pay alone cannot rank chains here: below the floor the difficulty clamp
     holds revenue per MH flat at PAY * mult however much hashrate piles in,
     so a rule that compared only pay had no crowding term in it at all —
     one lucky swing in Halcyon's price (vol 0.060, the most violent book in
     the game) and every miner in the world moved there and none ever came
     back, leaving Ferro and Nova at literally zero hashrate within a week.
     The clamps keep it a nudge rather than a stampede in either direction. */
  function chainDraw(cid){
    const seats = seatsFor(cid);
    const have = G._simChainN[cid] || 0;
    return Math.max(0.25, Math.min(1.6, seats / Math.max(1, have)));
  }
  /* A newcomer goes where there is room — the chain furthest below the seats
     its size entitles it to. Arrivals alone therefore converge the split on
     the floor-weighted shares, without a migration pass and without ever
     emptying a small chain. */
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

  /* A newcomer's farm: one card, sometimes two. Everybody who arrives after
     the world opens starts here and builds up, so a chain's growth is miners
     turning up and buying cards rather than a number being raised. */
  function newcomerHash(){ return SIM_MIN_HASH * (1 + Math.random() * 1.15); }

  function seedSims(t){
    simSeq = 0;
    poolSeq = 0;
    G._simChainHash = emptyChainHash();
    G._simChainN = emptyChainHash();
    G._simPoolHash = Object.create(null);
    G._simSoloHash = emptyChainHash();
    G._poolMembers.clear();
    for(const cid of Object.keys(G._soloMembers)) G._soloMembers[cid] = [];
    G._membersDirty = true;

    const sims = [];
    const add = m => { sims.push(m); bumpN(m.chain, 1); addHash(m, m.hash); };
    /* Largest-remainder allocation, so the seats actually sum to SIM_START
       instead of leaving a remainder for a filler loop to dump on whichever
       chain happens to be next in the list. */
    const raw = SIM_CHAINS.map(cid => seatsFor(cid, SIM_START));
    const seats = raw.map(Math.floor);
    let left = SIM_START - seats.reduce((a, x) => a + x, 0);
    const order = raw.map((x, i) => i).sort((a, b) => (raw[b] - seats[b]) - (raw[a] - seats[a]));
    for(let k = 0; left > 0; k++, left--) seats[order[k % order.length]]++;

    SIM_CHAINS.forEach((cid, ci) => {
      const n = Math.max(1, seats[ci]);
      const target = simTargetOf(cid, SIM_START, n);
      /* Everyone gets their card first, and only what the chain carries ON TOP
         of that is split lognormally. Clamping a lognormal draw up to the
         minimum afterwards would have overshot the target by a third on the
         chains where the minimum binds. */
      const spare = Math.max(0, target - n * SIM_MIN_HASH);
      const weights = [];
      let tot = 0;
      for(let i = 0; i < n; i++){
        const w = Math.exp(gauss() * 0.85);
        weights.push(w); tot += w;
      }
      for(let i = 0; i < n; i++){
        const hash = SIM_MIN_HASH + spare * weights[i] / tot;
        /* A going concern's reserve, sized to its own power bill — a fortnight
           to a month of runway. mkSim's default is a NEWCOMER's few hundred
           dollars, which on Obelisk is a couple of days: seeded with that, the
           big chains' solo miners were selling cards to pay the power inside
           a week, every time, because one Obelisk block takes a small farm
           months to find and there is nothing else coming in until the seeded
           pools have aged into enough trust to recruit them. */
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
    G._simChainN = emptyChainHash();
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
    /* Two things bind that did not before.

       ROOM — a chain carries the hashrate its economics support, no more.
       Once the miners on it have built that out they stop adding, and the
       chain grows again only as new miners arrive. Reinvesting on `net > 0`
       alone has no stopping point at all here: below a chain's floor the
       difficulty clamp holds revenue per MH flat at PAY * mult against a
       power bill under a tenth of it, so every agent compounds at ~90%/day
       forever. That is what put Obelisk 27x over its floor inside a month.

       LEAD TIME — a farm is bought in cards and racked in a room, so
       SIM_EXPAND_MAX_DAY caps the pace, with a card a day as the floor for
       the small miners the cap would otherwise pin at zero. */
    const room = simRoomOf(m.chain);
    if(room > 0 && m.cash > cost * 40 && net > 0 &&
       Math.random() < (0.12 + m.style * 0.28) * room){
      const pace = Math.max(SIM_MIN_HASH, m.hash * SIM_EXPAND_MAX_DAY) * (hoursSince / 24);
      const want = Math.floor(Math.min(pace, m.cash * (0.08 + m.style * 0.18) * room / cost));
      const buy = Math.max(0, Math.min(want, Math.floor(m.cash / cost)));
      /* One MH, not five. `pace` is a rate times the elapsed hours, so the
         card-a-day floor it is supposed to guarantee the smallest miners comes
         out as 2.5 MH over a three-hour turn — under a five-MH minimum
         purchase, which silently pinned exactly the miners the floor exists
         for at zero. Ferro sat at its seed for the whole of a 30-day run. */
      if(buy >= 1){
        m.cash -= buy * cost;
        setSimHash(m, m.hash + buy);
      }
    } else if(overBuilt(m.chain) && m.hash > SIM_MIN_HASH && Math.random() < 0.05){
      // Over-built: retire cards rather than run a crowded chain at the margin.
      const cut = Math.min(m.hash * 0.08, m.hash - SIM_MIN_HASH);
      setSimHash(m, m.hash - cut);
      m.cash += cut * hashCost() * 0.35;
    }

    let best = m.chain;
    let bestR = G.revPerMh(G.chain(m.chain)) * chainDraw(m.chain) * SWITCH_EDGE;
    for(const cid of SIM_CHAINS){
      const c = G.chain(cid);
      const simH = G._simChainHash[cid] || 0;
      // Don't be the whale that swamps a small chain. Measured against what
      // the chain currently carries, not its floor: the floor is where it
      // ends up, and early on that is hundreds of times what is there now.
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
    const FEE_BITE = G.FEE_BITE || 3;
    let best = null, bestS = -1;
    for(const p of opts){
      const trust = G.poolTrust ? G.poolTrust(p) : 0.85;
      const sc = (1 - Math.min(0.9, p.fee * FEE_BITE)) * trust * (0.97 + Math.random() * 0.06);
      if(sc > bestS){ bestS = sc; best = p; }
    }
    const soloS = 0.72 * (0.97 + Math.random() * 0.06);
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

  /* Shutting a simulated operator's pool down. THREE places did this by hand —
     an operator folding an empty pool, a PPS bond running dry, and an owner
     giving up mining altogether — and they had drifted: the last one released
     the pool's simulated members but not the player's own groups, so a group
     left pointing at the corpse kept drawing the PPS flat rate out of a pool
     with a zero bond and nobody running it. Measured at 4.1 coins an hour off
     one starter rig, forever, because flatDrip only asked whether the pool was
     PPS and not whether it still existed. One function now, so a fourth caller
     cannot reopen the same hole. */
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

    /* Departures. This sampled ONE miner an hour, a rate written when there
       were a hundred of them: at the population the network now reaches, a
       farm that has failed sits derelict for years — still counted in
       _simChainN, so still inflating both chainDraw's crowding and
       simTargetOf's per-seat floor with people who left. Scaled with the
       population so the odds of any given broke miner giving up stay what
       they always were. */
    const looks = Math.max(1, Math.round(sims.length / SIM_START));
    for(let k = 0; k < looks; k++){
      if(sims.length <= SIM_START || Math.random() >= 0.08) continue;
      const i = Math.floor(Math.random() * sims.length);
      const m = sims[i];
      if(m.cash < 15 && m.hash < 20 && m.coins < 10){
        /* Zero the departing miner's hashrate THROUGH setSimHash first, so
           everything below is a no-op against the running totals. A bare
           addHash(m,-m.hash) here left m.hash intact and m still in G.s.sims,
           so if it owned a pool the release loop's setSimPool(m,'solo')
           subtracted the same hashrate from _simPoolHash a second time and
           stranded it in _simSoloHash permanently — and drawSimWinner reads
           _simSoloHash to size the solo bucket. */
        setSimHash(m, 0);
        for(const p of G.s.pools){
          if(p.owner === 'sim' && p.ownerSim === m.id && p.live)
            closeSimPool(p, 'when ' + p.name + ' shut down');
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
