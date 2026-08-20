import { computed } from 'vue';
import { C, TX_FEES, BOND_MULT, TRUST_RAMP, COVER_DAYS, PPLNS_COVER, VAR_K, SIM_CHAINS, RIVAL_PER_CHAIN } from '../data/constants.js';
import { mkRival } from './rivals.js';
import { fmt } from '../utils/format.js';
import { cue } from '../services/audio.js';

/* 05-pools-and-market.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installPoolMarket(G){
  /* ---- pool market ---- */
  const blockValue = c => c.reward*G.price(c);
  const bondReq = (c,scheme) => Math.round(blockValue(c)*BOND_MULT[scheme]);
  /* Reputation is four things a miner can actually see: has it stayed solvent,
     how long has it survived, has it been finding blocks, and does it keep
     moving its fee. Solvency gates the rest — a pool that cannot pay is not
     reputable however lucky it has been. */
  const repParts = p => {
    const solvency=Math.min(1, p.bond/Math.max(1,p.bond0));
    const age=Math.min(1,(G.s.t-(p.born||0))/TRUST_RAMP);
    const luck=(p.found||0)/((p.found||0)+8);
    const feeStab=Math.min(1,(G.s.t-(p.feeMoved||-1e9))/(3*86400));
    return {solvency,age,luck,feeStab};
  };
  const poolRep = p => {
    const q=repParts(p);
    return Math.sqrt(q.solvency)*(0.40+0.22*q.age+0.22*q.luck+0.16*q.feeStab);
  };
  const poolTrust = poolRep;
  /* Members pick on price and solvency. A lower fee wins share; a thin bond
     costs you trust, so undercutting on an underfunded pool does not work. */
  /* A PPS operator cannot underwrite more than the bond covers. This is the real
     constraint on a pool's size — grow it by posting more capital, not by
     cutting the fee. PPLNS passes variance through, so it has no such cap. */
  /* A pool's capital has to satisfy TWO things, and the tighter one binds.

     FLOAT — settlement money. You are holding what members are owed, so this
     scales straight with the payouts you carry. PPS holds more of it because
     it owes a flat rate continuously; PPLNS only holds the rolling window.

     VARIANCE — dry-spell cover, and PPS only. A PPS operator owes members
     whether or not blocks land, so the exposure is how far actual block income
     can fall below expected. That depends entirely on how many blocks the pool
     expects in the window: income deviation is about sqrt(N) blocks' worth, so
     a pool finding 11,520 small blocks in four days is glued to expectation
     while one finding 1.6 huge ones can easily find none at all.

     This is why a $40 block matters. A flat "four days of payouts" bond priced
     Ferro and Obelisk identically even though Obelisk's income swings 42% of
     its liability against Ferro's 0.49%. Now the rare-big-block chains are
     properly expensive to underwrite and the fast-cheap ones properly are not. */
  const FLOAT_DAYS = { PPS:1.0, PPLNS:PPLNS_COVER };
  const floatPerHash = p => C.PAY*G.chain(p.chain).mult*FLOAT_DAYS[p.scheme];
  /* Bond needed to carry H of members, by each rule. */
  const floatBondFor = (p,H) => H*floatPerHash(p);
  const varBondFor = (p,H) => {
    if(p.scheme!=='PPS') return 0;
    const c=G.chain(p.chain);
    const N=Math.max(1e-9, 86400*COVER_DAYS*H/Math.max(1,G.diffOf(c)));
    return VAR_K*Math.sqrt(N)*blockValue(c)*(1+TX_FEES);
  };
  const bondFor = (p,H) => Math.max(floatBondFor(p,H), varBondFor(p,H));
  /* Capacity is the smaller of what each rule allows. */
  const poolCapLimit = p => {
    const byFloat = p.bond/Math.max(1e-9,floatPerHash(p));
    if(p.scheme!=='PPS') return byFloat;
    const c=G.chain(p.chain), bv=blockValue(c)*(1+TX_FEES);
    const byVar = Math.pow(p.bond/Math.max(1e-9,VAR_K*bv),2)
      *Math.max(1,G.diffOf(c))/(86400*COVER_DAYS);
    return Math.min(byFloat, byVar);
  };
  /* Which rule is holding you back — named, like every other constraint. */
  const capBinding = p => {
    if(p.scheme!=='PPS') return 'settlement float';
    const byFloat=p.bond/Math.max(1e-9,floatPerHash(p));
    return poolCapLimit(p)<byFloat*0.999 ? 'dry-spell cover' : 'settlement float';
  };
  /* Membership is now literal: cap is the hashrate actually pointed at a pool. */
  function refreshPools(){
    for(const p of G.s.pools){
      p.cap = p.live ? G.poolHash(p) : 0;
      p.capped = p.owner==='you' && p.scheme==='PPS' && p.cap >= poolCapLimit(p)*0.98;
    }
  }
  /* Opening a pool or moving its fee is news: every miner on that chain takes
     a look now rather than waiting for their slow hourly turn. Without this the
     fee lever has no visible effect for a day or more of real time, which reads
     as "there is no way to attract anyone". */
  /* One scoring function for both the hourly drift and the news-driven shake —
     they had two copies, which is how a lever silently stops matching its own
     description. FEE_BITE sharpens the fee's effect above the noise: at +-10%
     jitter a two-point fee difference was invisible, so cutting your fee did
     nothing a player could see. */
  const FEE_BITE = 3;
  /* Split into the half that is a property of the POOL and the half that is a
     property of the MINER looking at it, because the pool's half is identical
     for every miner on the chain and poolTrust is four derived quantities
     deep. Still one definition of each: poolScore is the two multiplied, and
     is what sims.js scores a pool with; pickPool reads the same base out of
     chainPoolTable and draws its own jitter, rather than either of them
     carrying a second copy of the formula. */
  const poolScoreBase = p => (1-Math.min(0.9,p.fee*FEE_BITE))*poolTrust(p);
  // Miners carry +-3% jitter, so a near-tie splits rather than going
  // winner-take-all. Drawn per miner per pool: that is what makes it a split.
  const scoreJitter = () => 0.97+Math.random()*0.06;
  const poolScore = p => poolScoreBase(p)*scoreJitter();
  /* The half of a pool's book that a miner moving cannot change: its capacity,
     and the player's own rigs pointed at it. poolHash walks every group and
     every rig to find the second, and poolOptsFor called it once per pool per
     MINER — fine at the few hundred sims the network used to reach, seconds
     once it reaches five figures. Built once per shake and passed down, so
     there is still one scoring function rather than a fast copy beside it. */
  function chainPoolTable(chainId){
    const playerIn = new Map();
    for(const gr of G.s.groups){
      if(!gr.pool || gr.pool==='solo') continue;
      playerIn.set(gr.pool, (playerIn.get(gr.pool)||0) + G.groupHash(gr));
    }
    const out=[];
    for(const p of G.s.pools){
      if(!p.live || p.chain!==chainId) continue;
      out.push({ p, cap:poolCapLimit(p), mine:playerIn.get(p.id)||0, base:poolScoreBase(p) });
    }
    return out;
  }
  /* The simulated half is still read live on every miner, so a pool that fills
     during a shake is full for everyone after it — capacity stays
     first-come-first-served, exactly as it was. */
  const simIn = p => G.simPoolHashOf ? G.simPoolHashOf(p) : 0;
  function pickPool(m, table){
    const opts = table || chainPoolTable(m.chain);
    let bp=null, bs=-1;
    for(const e of opts){
      if(simIn(e.p)+e.mine+m.hash > e.cap) continue;          // they are full
      const sc=e.base*scoreJitter();
      if(sc>bs){ bs=sc; bp=e.p; }
    }
    const pick = bp ? bp.id : 'solo';
    if(G.setSimPool) G.setSimPool(m, pick); else m.pool=pick;
  }
  function poolShake(chainId){
    if(G.ensureMembers) G.ensureMembers();
    const table = chainPoolTable(chainId);
    if(G._soloMembers && G._poolMembers){
      const seen = new Set();
      const touch = (idx) => {
        if(seen.has(idx)) return;
        seen.add(idx);
        const m = G.s.sims[idx];
        if(m) pickPool(m, table);
      };
      for(const i of (G._soloMembers[chainId] || [])) touch(i);
      for(const p of G.s.pools){
        if(p.chain!==chainId || !p.live) continue;
        for(const i of (G._poolMembers.get(p.id) || [])) touch(i);
      }
      return;
    }
    for(const m of G.s.sims) if(m.chain===chainId) pickPool(m, table);
  }
  /* O(1) off the head count sims.js keeps incrementally, not a scan. This is
     read from templates — three times per render on an open pool card, and
     once per chain inside ChainsView's `cards`, which recomputes every tick
     because it reads the block clock — so at a five-figure population the
     scan version was tens of milliseconds of every frame for a number the sim
     layer already has. No ensureMembers() here on purpose: the count is
     maintained by bumpN as miners arrive, leave and switch chains, so it is
     always current, and forcing the member-index rebuild from a render path
     would trade a scan for a bigger one. */
  const simsOn = cid => G._simChainN ? (G._simChainN[cid]||0) : 0;
  /* Rival operators are running a business too. Each hour they look at their
     own book: an empty pool cuts its fee to win members back, a full one raises
     it because capacity is the scarce thing, and a pool that sits empty long
     enough gives up and closes. Somebody always opens a new one. */
  function rivalTick(){
    for(const p of G.s.pools){
      if(p.owner!=='rival'||!p.live) continue;
      const share=G.poolHash(p)/Math.max(1,G.chainHash(G.chain(p.chain)));
      const full=G.poolHash(p)>=poolCapLimit(p)*0.95;
      if(full && Math.random()<0.30){
        // capacity is scarce; charge for it, and put earnings into more bond
        G.setPoolFee(p, Math.min(0.09, p.fee*1.06));
        p.bond*=1.02; p.bond0=Math.max(p.bond0,p.bond);
      } else if(share<0.06 && Math.random()<0.35){
        G.setPoolFee(p, Math.max(0.002, p.fee*0.90));
      }
      // an empty pool bleeds its operator; long enough and they fold
      p.lapse = G.poolHash(p)<1 ? (p.lapse||0)+1 : 0;
      if(p.lapse>72 && Math.random()<0.25){
        p.live=false;
        G.s.groups.filter(gr=>gr.pool===p.id).forEach(gr=>{ G.forfeitGroup(gr,'when '+p.name+' folded'); gr.pool='solo'; });
        for(const m of G.s.sims) if(m.pool===p.id){ if(G.setSimPool) G.setSimPool(m,'solo'); else m.pool='solo'; }
        say('pool',p.name+' has closed — it never found enough members');
      }
    }
    // New pools are founded by economic sims in simPulse.
  }
  /* Miners move slowly and imperfectly: a few reconsider each hour. */
  function reshuffle(){
    if(!G.s.sims.length) return;
    for(let k=0;k<3;k++){
      const m=G.s.sims[Math.floor(Math.random()*G.s.sims.length)];
      pickPool(m);
    }
  }
  /* Projections run the REAL scoring function with the jitter switched off,
     so what the slider promises is what the market actually does. A parallel
     estimate would drift from the thing it describes — that mistake has been
     made three times in this codebase already. */
  const soften = r => { const x=Math.max(0,Math.min(1,(r-0.94)/0.12));
    return x*x*(3-2*x); };
  /* Moving your fee resets fee-stability, so a preview that kept today's
     reputation would be quoting a price you cannot actually get. Any fee other
     than the one you are already charging is scored with that component at
     zero — the cost of changing is part of the quote. */
  const repAt = (p,fee) => {
    if(fee===undefined||Math.abs(fee-p.fee)<0.0005) return poolRep(p);
    const q=repParts(p);
    return Math.sqrt(q.solvency)*(0.40+0.22*q.age+0.22*q.luck);
  };
  const scoreAt = (p,fee) =>
    (1-Math.min(0.9,(fee===undefined?p.fee:fee)*FEE_BITE))*repAt(p,fee);
  /* Hashrate that would choose this pool at a given fee, ignoring its own
     capacity — this is DEMAND, which is what tells you whether more bond is
     worth posting. */
  function poolDemand(p,fee){
    const mine=scoreAt(p,fee);
    /* Score and remaining room per rival, once. Both are the same for every
       miner on the chain, but they used to be recomputed inside the loop —
       with poolHash walking every group and every rig each time — so a call
       on a busy chain cost seconds, and the pool card makes several per
       render. Nothing here depends on the miner but the capacity comparison. */
    const rivals=[];
    for(const q of G.s.pools){
      if(!q.live||q.chain!==p.chain||q.id===p.id) continue;
      rivals.push({ score:scoreAt(q), room:poolCapLimit(q)-G.poolHash(q) });
    }
    /* The rivals a miner can actually join are exactly those with room for it,
       so sorted by room they are a SUFFIX of this list — and the best offer
       among them is a running maximum from the back. One binary search per
       miner instead of walking every pool for every miner. */
    rivals.sort((a,b)=>a.room-b.room);
    const bestFrom=new Array(rivals.length+1);
    bestFrom[rivals.length]=0;
    for(let i=rivals.length-1;i>=0;i--)
      bestFrom[i]=Math.max(bestFrom[i+1], rivals[i].score);
    const bestFor = mh => {
      let lo=0, hi=rivals.length;
      while(lo<hi){ const mid=(lo+hi)>>1; if(rivals[mid].room<mh) lo=mid+1; else hi=mid; }
      return bestFrom[lo];
    };
    let h=0;
    for(const m of G.s.sims){
      if(m.chain!==p.chain) continue;
      /* Read the miner's hashrate ONCE. G.s is reactive(), so every `m.hash`
         is a proxy trap and a dependency registration — inside the old rival
         loop that was 390k of them at 13k miners against 30 pools, and it
         measured 42 ms of this function's 48. */
      const mh=m.hash;
      const best=bestFor(mh);
      // miners carry +-3% jitter, so a near-tie splits rather than going
      // winner-take-all. Without this the preview showed a cliff where the
      // real market shows a slope, and the number on the slider would have
      // been a promise the market does not keep.
      h += mh*(best<=0 ? 1 : soften(mine/best));
    }
    for(const gr of G.s.groups) if(gr.pool===p.id) h+=G.groupHash(gr);
    return h;
  }
  const poolProj = (p,fee) => Math.min(poolDemand(p,fee), poolCapLimit(p));
  /* Bond needed to take everyone who already wants in. */
  const nextTierBond = p => Math.max(0,
    Math.ceil(bondFor(p, poolDemand(p)) - p.bond));
  /* The operator's book: what the fee actually earns against the capital it
     ties up, so running a pool can be compared with just mining instead. */
  function poolPnl(p){
    const c=G.chain(p.chain);
    const gross=G.poolHash(p)*G.revPerMh(c);            // what members produce daily
    const income=gross*p.fee + (p.scheme==='PPS'?gross*TX_FEES*0.5:0);
    const capital=p.bond;
    return { income, capital,
      roi: capital>0 ? income*365/capital : 0,
      payback: income>0 ? capital/income : Infinity };
  }
  const myPools = computed(()=> G.s.pools.filter(p=>p.owner==='you'&&p.live));
  const rivalPools = computed(()=> G.s.pools.filter(p=>p.live&&p.owner!=='you'));

  // A repeat's numeric total lives in ONE of two places, never both: `num`
  // (a coin quantity, paired with `unit`) or `usd` (a signed dollar amount
  // — positive in, negative out). `amount` is always the pre-formatted
  // display string re-derived from whichever one is present; callers with
  // neither (a fixed-string amount, or no amount at all) can still
  // collapse repeats into "xN", they just can't accumulate a total (issue
  // #16 — until now, USD-denominated events had no numeric channel at
  // all, so a call site with a real amount to sum could never be told
  // apart from one where the number was simply never captured).
  function say(kind,text,amount,num,unit,usd){
    const top=G.s.feed[0];
    if(top && top.kind===kind && top.text===text){
      if(num!==undefined && top.num!==undefined){
        top.n=(top.n||1)+1; top.num+=num; top.t=fmt.hm(G.s.t);
        top.amount='+'+fmt.c(top.num)+(unit?' '+unit:''); return;
      }
      if(usd!==undefined && top.usd!==undefined){
        top.n=(top.n||1)+1; top.usd+=usd; top.t=fmt.hm(G.s.t);
        top.amount=(top.usd<0?'-':'+')+fmt.usd(Math.abs(top.usd)); return;
      }
      // Same event, no quantity to accumulate AND no dollar amount either
      // (e.g. "Orphaned on X") — still worth collapsing into one "×N" line
      // rather than one line per repeat. Gated on amount too, not just
      // num/usd: plenty of calls (rush, site installs) carry a fixed-string
      // amount with no num/usd — those differ order to order and must stay
      // separate lines, or the feed would silently under-report what was
      // spent.
      if(num===undefined && top.num===undefined && usd===undefined && top.usd===undefined
         && !amount && !top.amount){
        top.n=(top.n||1)+1; top.t=fmt.hm(G.s.t); return;
      }
    }
    G.s.feed.unshift({id:G.s.feedId++,t:fmt.hm(G.s.t),kind,text,amount:amount||'',num,usd,n:1});
    if(G.s.feed.length>70) G.s.feed.length=70;
  }
  /* Toasts are gated in REAL time, so a speed multiplier cannot turn a fast
     chain into a strobe. Each kind is also capped: the first few land while you
     are learning, then the activity feed carries it silently. Critical events
     and record blocks always get through. */
  let lastToast=-1e9, restoring=false;
  const toastSeen={};
  function pop(text,amount,cls,opts){
    if(restoring) return;
    opts=opts||{};
    const kind=opts.kind||text;
    /* Issue #46: sound hangs off pop(), not off the twenty-odd individual
       event sites, because pop() is already the single place the game says
       "this moment is worth interrupting the player for" — and its cls/kind
       vocabulary already separates the exact three moments that earn a cue.
       Nothing new has to be threaded through tick.js, and no future event can
       be silently missed.

       Placed ABOVE the caps deliberately. TOAST_CAP is a TEACHING cap — "the
       first few land while you are learning, then the activity feed carries
       it silently" — and it applies because a toast covers the screen. Sound
       does the opposite job: it is for the player who is NOT looking, which
       is precisely later in the run, so a block cue that went quiet after the
       third block would be a bug rather than restraint. The real hazard the
       cap also happens to guard — a fast-forward burst turning income into a
       machine gun — is handled instead by audio.js's own per-cue cooldowns,
       measured in the same real (not game) milliseconds as TOAST_GAP, so no
       speed multiplier can outrun them. TOAST_GAP itself still applies to the
       toast below, unchanged. */
    cue(cls, kind);
    toastSeen[kind]=(toastSeen[kind]||0)+1;
    const now=Date.now();
    if(!opts.always){
      if(toastSeen[kind]>C.TOAST_CAP) return;
      if(now-lastToast < C.TOAST_GAP*1000) return;
    } else if(now-lastToast < 900) return;
    lastToast=now;
    G.s.toast={n:G.s.toast.n+1,text,amount:amount||'',cls:cls||''};
  }


  Object.assign(G, {FEE_BITE,FLOAT_DAYS,blockValue,bondFor,bondReq,capBinding,chainPoolTable,floatBondFor,floatPerHash,lastToast,myPools,nextTierBond,pickPool,poolCapLimit,poolDemand,poolPnl,poolProj,poolRep,poolScore,poolScoreBase,poolShake,poolTrust,pop,refreshPools,repAt,repParts,reshuffle,rivalPools,rivalTick,say,scoreAt,scoreJitter,simsOn,soften,toastSeen,varBondFor});
}
