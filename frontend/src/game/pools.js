import { C } from '../data/constants.js';
import { fmt } from '../utils/format.js';

/* 11-your-pool.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installPools(G){
  /* ---- running a pool ---- */
  function foundPool(chainId,scheme,fee){
    const c=G.chain(chainId), need=G.bondReq(c,scheme);
    if(G.s.cash<need) return;
    G.s.cash-=need;
    G.s.pools.push({ id:'you'+Math.random().toString(36).slice(2,7), chain:chainId,
      name:'Your '+c.name+' pool', scheme, fee, owner:'you',
      bond:need, bond0:need, cap:0, born:G.s.t, live:true, earned:0, _blocks:0 });
    G.say('sys','Founded a '+scheme+' pool on '+c.name+' at '+(fee*100).toFixed(1)+'%',
      '-'+fmt.usd(need));
    G.pop('Pool opened','bond posted: '+fmt.usd(need),'blu',{always:true});
    G.s.shakeAt=G.s.t+300; G.s.shakeOn=chainId;
    if(!G.simsOn(chainId))
      G.say('bad','No other miners work '+c.name+' — this pool can only ever hold your own rigs');
  }
  function renamePool(p,name){
    if(p.owner!=='you') return;               // a rival's pool is not yours to rename
    const n=(name||'').trim().slice(0,24);
    if(n) p.name=n;
  }
  function setPoolFee(p,fee){
    if(Math.abs(fee-p.fee)>0.0005) p.feeMoved=G.s.t;
    p.fee=Math.max(0,Math.min(0.15,fee));
    G.s.shakeAt=G.s.t+300;      // word gets around in five minutes; debounces a slider drag
    G.s.shakeOn=p.chain;
  }
  /* The bond is a lever, not a fixed opening stake. On PPS it is literally the
     capacity control — it is the capital backing four days of member payouts,
     so every dollar in buys a fixed slice of hashrate you may underwrite. On
     PPLNS members carry their own variance, so the bond buys no capacity at
     all; it only buys reputation, and the interface says so rather than
     implying a lever that is not there. */
  /* What the bond may not go below: on PPS, cover for the members you already
     have. Without this you could pull your capital the moment a dry spell
     started and leave members underwritten by nothing. */
  const bondFloor = p => Math.max(
    G.bondReq(G.chain(p.chain), p.scheme),        // never below the entry stake
    G.bondFor(p, G.poolHash(p)));                 // nor below cover for current members
  function addBond(p,amt){
    amt=Math.min(Math.round(amt), Math.floor(G.s.cash)); if(amt<=0) return;
    G.s.cash-=amt; p.bond+=amt; p.bond0=Math.max(p.bond0,p.bond);
    G.say('sys','Added '+fmt.usd(amt)+' to '+p.name+"'s bond",'-'+fmt.usd(amt),undefined,undefined,-amt);
  }
  function releaseBond(p,amt){
    const room=Math.max(0, p.bond-bondFloor(p));
    amt=Math.min(Math.round(amt), Math.floor(room)); if(amt<=0) return;
    p.bond-=amt; G.s.cash+=amt;
    p.bond0=p.bond;      // a deliberate downsize is an announcement, not a default:
    G.say('sys','Released '+fmt.usd(amt)+' from '+p.name+"'s bond",'+'+fmt.usd(amt),undefined,undefined,amt);
  }                      // losses still push bond below bond0 and cost you trust
  function topUpBond(p,amt){ addBond(p,amt); }
  const poolProfit = p => Math.max(0, p.bond - p.bond0);
  function withdrawProfit(p){
    const amt=Math.round(poolProfit(p));
    if(amt<=0) return;
    p.bond-=amt; G.s.cash+=amt; G.s.poolTake=(G.s.poolTake||0)+amt;
    G.say('sys','Withdrew profit from '+p.name,'+'+fmt.usd(amt),undefined,undefined,amt);
  }
  function closePool(p){
    const back=Math.round(p.bond);
    G.s.cash+=back;
    /* Through the shared closing path, which releases the pool's simulated
       members as well as your own groups. Releasing only the groups left
       every sim member still marked as being in a dead pool: their hashrate
       sat in _simPoolHash for a pool drawSimWinner skips, and was in neither
       bucket it walks — counted in the chain's hashrate, so the blocks kept
       coming, but unreachable, so the ones that should have been theirs fell
       through to solo. */
    G.closeSimPool(p,'when you closed the pool');
    G.say('sys','Closed '+p.name+' — bond returned','+'+fmt.usd(back),undefined,undefined,back);
  }
  function doSell(c,amt,quiet){
    if(!Number.isFinite(amt)||amt<=0) return;   // one bad argument must not poison a price forever
    if(amt<=0) return;
    const slip=Math.min(0.5,0.5*amt/c.depth);
    const net=amt*G.price(c)*(1-slip)*(1-C.EXCH_FEE);
    G.s.wallet[c.id]-=amt; G.s.cash+=net; G.s.earned+=net;
    c.impact=Math.min(0.85,c.impact+amt/c.depth);
    if(!quiet) G.say('pay','Sold '+fmt.c(amt)+' '+c.tick+
      (slip>0.005?' ('+fmt.pct(slip)+' slippage)':''),'+'+fmt.usd2(net));
  }
  const sell = (cid,frac)=> doSell(G.chain(cid), G.s.wallet[cid]*frac);
  /* Buying is doSell's mirror image, not a separate model: the same book
     depth sets slippage, the same exchange fee applies, and impact moves
     the same way — just signed the other direction. Selling pushes impact
     positive (price sags below ref); buying pushes it negative (price runs
     above ref). Both decay back toward 0 via the same per-tick relaxation
     in tick.js, so a premium fades exactly as a discount does. This is
     what completes the buy side the design spec's v33 fundamentals never
     shipped — no new price model, just the existing one used both ways. */
  function doBuy(c,usd){
    if(!Number.isFinite(usd)||usd<=0) return;
    const cost=Math.min(usd,G.s.cash);     // total cash committed, fee included
    if(cost<=0) return;
    const netUsd=cost/(1+C.EXCH_FEE);      // what actually buys coins, after the fee
    const coins=netUsd/G.price(c);         // what a frictionless fill would buy
    const slip=Math.min(0.5,0.5*coins/c.depth);
    const filled=coins*(1-slip);           // slippage: fewer coins for the same dollar
    G.s.cash-=cost; G.s.wallet[c.id]+=filled; G.s.spent+=cost;
    c.impact=Math.max(-0.85,c.impact-coins/c.depth);
    G.say('pay','Bought '+fmt.c(filled)+' '+c.tick+
      (slip>0.005?' ('+fmt.pct(slip)+' slippage)':''),'-'+fmt.usd2(cost));
  }
  const buy = (cid,frac)=> doBuy(G.chain(cid), G.s.cash*frac);
  function fireDrip(){
    for(const c of G.s.chains){
      if(G.s.hold&&G.s.hold[c.id]) continue;          // exempt what you are holding
      if(G.price(c)<G.s.minSell) continue;            // and what is below your floor
      const amt=G.s.wallet[c.id]*G.s.drip.frac;
      if(amt>0.0005) doSell(c,Math.min(amt,G.s.wallet[c.id]),true);
    }
  }
  /* What one order at the current setting would cost this coin, as a fraction.
     Same formula doSell charges, so the number on screen is the real one. */
  const dripCost = (c,frac)=>
    Math.min(0.5, 0.5*(G.s.wallet[c.id]*(frac!==undefined?frac:G.s.drip.frac))/c.depth);
  /* The coin the current setting treats worst — the one worth naming. */
  const dripWorst = ()=>{
    let worst=null;
    for(const c of G.s.chains){
      if(G.s.hold&&G.s.hold[c.id]) continue;
      const cost=dripCost(c);
      if(cost>0.01 && (!worst||cost>worst.cost)) worst={c,cost,at25:dripCost(c,0.25)};
    }
    return worst;
  };
  const setDrip=(k,v)=>{ G.s.drip[k]=v; G.s.dripAt=G.s.t+G.s.drip.hours*3600; };
  const toggleHold=cid=>{ G.s.hold=G.s.hold||{}; G.s.hold[cid]=!G.s.hold[cid]; };


  Object.assign(G, {addBond,bondFloor,buy,closePool,doBuy,doSell,dripCost,dripWorst,fireDrip,foundPool,poolProfit,releaseBond,renamePool,sell,setDrip,setPoolFee,toggleHold,topUpBond,withdrawProfit});
}
