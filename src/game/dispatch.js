import { computed } from 'vue';
import { C } from '../data/constants.js';
import { CHAIN_BASE } from '../data/chains.js';
import { SHELLS, SITEPART } from '../data/site-parts.js';
import { PART, RISER } from '../data/hardware.js';
import { fmt } from '../utils/format.js';

/* 04-sites-and-rigs.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installDispatch(G){
  /* ---- a site's live output, dispatched cheapest first ---- */
  const srcOut = (f,src) => {
    const P=SITEPART(src.p);
    const k = P.kind==='solar' ? G.solarFactor.value : P.kind==='wind' ? f.wind : 1;
    return P.peak*(P.yield||1)*src.n*k;
  };
  const siteCapacity = f => f.sources.reduce((a,x)=>a+srcOut(f,x),0);
  const siteCooling  = f => f.plants.reduce((a,x)=>a+SITEPART(x.p).cap*x.n,0);
  // heat the rigs actually put into the room, after each rig's own airflow
  /* Site heat, memoised.
     rigHash() asks throttleOf(), which asks siteTemp(), which asks siteHeat(),
     which walks every rig at the site. So a sweep over N rigs was N^2 calls to
     rigCoreW — profiling a 20-rig farm put throttleOf + PART + siteHeat at 75%
     of all simulation time, and the cost grows with the square of the farm.

     The memo is versioned, not time-based. `heatVer` is bumped by stepTick and
     by every function that changes what a site's heat depends on, so a cached
     value can never outlive the state it was computed from. The one gap is the
     tune slider, which writes r.tune straight from the template: heat is then
     stale until the next tick, i.e. under 100ms at DT=0.1, and self-corrects.
     Everything else routes through a function that bumps. */
  let heatVer = 0;
  const heatMemo = new Map();
  const touchHeat = () => { heatVer++; };
  const siteHeatRaw = f => siteRigs(f).reduce((a,r)=>a+(rigLive(r)?rigCoreW(r)/rigAir(r):0),0);
  const siteHeat = f => {
    const hit = heatMemo.get(f.id);
    if(hit && hit.v === heatVer) return hit.h;
    const h = siteHeatRaw(f);
    heatMemo.set(f.id, { v:heatVer, h });
    return h;
  };
  /* Cooling is dispatched cheapest-PUE-first, mirroring power. Its draw is a
     fraction of the heat removed, so it scales with the farm rather than
     sitting as a flat number that is absurd when small and trivial when big. */
  /* Cooling draw for this site, optionally including heat that is not there
     yet — so "what would this rig cost me?" can be answered with the same
     dispatch the tick actually uses, instead of an estimate that forgets
     cooling entirely. AC burns 42% of the heat it moves; ignoring that let a
     site be built and restored into permanent over-capacity. */
  const sitePlantW = (f, extraHeat) => {
    let need=siteHeat(f)+(extraHeat||0), draw=0;
    const order=[...f.plants].sort((a,b)=>SITEPART(a.p).pue-SITEPART(b.p).pue);
    for(const pl of order){
      if(need<=0) break;
      const P=SITEPART(pl.p), capacity=P.cap*pl.n, used=Math.min(capacity,need);
      draw += used*P.pue; need -= used;
    }
    return draw;
  };
  const siteSlots    = f => SHELLS.find(x=>x.id===f.shell).slots;
  const siteRigs     = f => G.s.rigs.filter(r=>r.site===f.id);

  /* A card at full wear still runs, badly — 25% of its hashrate for its full
     power draw. Total failure was an absorbing state: a farm whose cards all
     died had no income, so it could never fund the repair that would revive
     it, and the run was silently over. Limping keeps a recovery path open and
     makes the repair obviously worth doing. */
  const WORN_OUT = 0.25;
  const liveUnits = r => r.units;
  const rigLive = r => r.on && r.building<=0 && liveUnits(r).length>0;
  const rigHash = r => {
    if(!rigLive(r)) return 0;
    const gr=groupOf(r); const c=gr&&G.chain(gr.chain); if(!c) return 0;
    const f=G.site(r.site);
    const raw=liveUnits(r).reduce((a,u)=>a+PART(u.p).mh*(u.w>=1?WORN_OUT:1-0.4*u.w),0)*(1+(r.tune||0));
    return raw*(f?throttleOf(f):1);
  };
  const chassisW = r => (r.kind==='gpu'
    ? PART(r.frame).w+PART(r.mobo).w+r.risers*RISER.w : PART(r.ctrl).w) + (r.cool?PART(r.cool).w:0);
  const rigCoreW = r => chassisW(r)+
    liveUnits(r).reduce((a,u)=>a+PART(u.p).w*(1+0.5*u.w),0)*(1+(r.tune||0)*1.9);
  const rigWallW = r => rigLive(r) ? rigCoreW(r)/PART(r.psu).eff : 0;
  const rigAir = r => (r.kind==='gpu'?PART(r.frame).air:1.30)*(r.cool?PART(r.cool).fac:1);
  /* "Which supply would fix this?" — asked identically by the build checker
     and the rebuild checker. Both used to inline the same filter, so the
     headroom rule lived in four places and could drift in two of them. */
  const psuUsableW = p => p.w*C.PSU_HEADROOM;
  const psuCarrying = coreW =>
    (G.livePsus.find(x=>psuUsableW(x)>=coreW)||{}).name || 'Nothing here is big enough';
  const psuWithConn = conn =>
    (G.livePsus.find(x=>x.conn>=conn)||{}).name || 'No supply has enough';

  const siteDemand = f => siteRigs(f).reduce((a,r)=>a+rigWallW(r),0) + sitePlantW(f);
  const siteTemp = f => {
    const cool=siteCooling(f); if(cool<=0) return G.ambient.value+75;
    // clamped: badly over capacity is catastrophic without being absurd
    return G.ambient.value + Math.min(75, siteHeat(f)/cool*40);
  };
  /* Heat hurts immediately, not only through slow wear. Above 70C cards
     throttle, losing up to half their hashrate by 100C. */
  const throttleOf = f => {
    const t=siteTemp(f);
    return t<=70 ? 1 : Math.max(0.5, 1-(t-70)/60);
  };
  /* ---- battery + merit order, tariff-aware ----
     One pure planner decides everything for a site at this instant: how much
     free renewable covers, whether the battery charges (solar surplus, or
     cheap off-peak grid if enabled) or discharges (peak by default, any
     deficit if set), and what the remaining paid draw costs at this hour's
     band. The tick applies the energy delta; displays read the same plan. */
  /* A battery counts toward firm capacity only for what it can actually
     sustain: its kW rating, limited by the energy it holds over a short
     horizon. A cell with 0.05 kWh is not 3 kW of capacity. ONE function, used
     by both the dispatch plan and the brownout check — they disagreed before,
     which is how a site drew 1.52 kW from a 1.50 kW supply with no
     consequence and no bill. */
  const BATT_HORIZON=0.25;                 // hours it must be able to hold up
  const siteStorage = f => f.storage||[];
  const battKwh = f => siteStorage(f).reduce((a,x)=>a+SITEPART(x.p).kwh*x.n,0);
  const battKw  = f => siteStorage(f).reduce((a,x)=>a+SITEPART(x.p).kw*x.n,0)*1000;
  const battFirm = f => Math.min(battKw(f), (f.batt||0)/BATT_HORIZON*1000);
  function sitePlan(f){
    const load=siteDemand(f);
    let renew=0; const paid=[];
    for(const src of f.sources){
      const P=SITEPART(src.p), out=srcOut(f,src);
      if(P.rate<=0) renew+=out; else paid.push({out,rate:G.rateAt(P)});
    }
    const e=f.batt||0, kw=battKw(f), cap=battKwh(f);
    const firm=battFirm(f), paidCap=paid.reduce((a,x)=>a+x.out,0);
    let deficit=Math.max(0,load-renew), surplus=Math.max(0,renew-load);
    let chW=0, disW=0, gridChW=0;
    if(surplus>0 && cap>0 && e<cap) chW=Math.min(surplus,kw);
    // EMERGENCY first: if the paid sources cannot cover the deficit, the
    // battery covers what it can regardless of the peak-shaving preference —
    // that preference is about saving money, not about refusing to keep the
    // lights on. This is what carries a solar site through the night.
    const shortfall=Math.max(0, deficit-paidCap);
    if(shortfall>0 && firm>0) disW=Math.min(shortfall, firm);
    // ECONOMIC second: spend stored energy to dodge the expensive bands
    if(firm-disW>0 && (f.disAny || G.band.value==='peak'))
      disW += Math.min(Math.max(0,deficit-disW), firm-disW);
    deficit-=disW;
    paid.sort((a,b)=>a.rate-b.rate);
    let need=deficit, cost=0, paidW=0;
    for(const g of paid){ if(need<=0) break;
      const u=Math.min(g.out,need); cost+=u/1000*g.rate; paidW+=u; need-=u; }
    const unserved=Math.max(0, load-renew-disW-paidW);
    if(f.gridCharge && G.band.value==='off' && cap>0 && e<cap && chW+gridChW<kw){
      const head=paid.reduce((a,x)=>a+x.out,0)-paidW;
      const extra=Math.min(kw-chW, Math.max(0,head));
      if(extra>0 && paid.length){ gridChW=extra; cost+=extra/1000*paid[0].rate; }
    }
    return { load, renew, chW, disW, gridChW, paidW, cost, unserved, firm };
  }
  const siteCostPerHour = f => sitePlan(f).cost;
  /* The whole energy layer in one shape: what feeds the site and what consumes
     it. sitePlan has always computed this; only two numbers of it reached the
     screen. */
  function flowOf(f){
    const pl=sitePlan(f), cool=sitePlantW(f);
    return {
      load:pl.load, rigs:Math.max(0,pl.load-cool), cool,
      inRenew:Math.min(pl.renew,pl.load), inBatt:pl.disW, inPaid:pl.paidW,
      charge:pl.chW+pl.gridChW,
      spare:Math.max(0,pl.renew-pl.load-pl.chW),
      unserved:pl.unserved, cap:siteCapacity(f)+battFirm(f)
    };
  }
  /* Thread 28: a battery's value is gated by whatever binds — night headroom,
     nothing to charge it, or sheer oversizing — and the card should say which,
     the way the build checker names its constraint. */
  function battAdvice(f){
    const kwh=battKwh(f); if(kwh<=0) return null;
    const kw=battKw(f), demand=siteDemand(f);
    let paidCap=0, renewPeak=0;
    for(const src of f.sources){
      const P=SITEPART(src.p);
      if(P.rate>0) paidCap+=srcOut(f,src);
      else renewPeak+=(P.peak||0)*(P.yield||1)*src.n;
    }
    const spareNight=Math.max(0, paidCap-demand);
    const surplus=Math.max(0, renewPeak*0.8-demand);
    const peakUse=Math.min(kwh, kw/1000*4, demand/1000*4);
    if(f.gridCharge && spareNight<kw*0.6)
      return { warn:true, text:'Charging is capped by '+fmt.w(spareNight)
        +' of spare night capacity — the battery could take '+fmt.w(kw)
        +'. A bigger service raises it.' };
    if(surplus<=0 && !f.gridCharge)
      return { warn:true, text:'Nothing charges it — no renewable surplus here, and off-peak grid charging is switched off.' };
    if(peakUse<kwh*0.5)
      return { warn:true, text:'Peak hours use only '+peakUse.toFixed(0)+' of its '
        +kwh+' kWh — oversized for this load'
        +(f.disAny?'.':' unless it discharges outside peak too.') };
    return { warn:false, text:'Well matched — soaking surplus and covering the peak.' };
  }

  const totalHash = computed(()=> G.s.rigs.reduce((a,r)=>a+rigHash(r),0));
  const totalDemand = computed(()=> G.s.sites.reduce((a,f)=>a+siteDemand(f),0));
  const totalCapacity = computed(()=> G.s.sites.reduce((a,f)=>a+siteCapacity(f),0));
  const headroom = computed(()=> totalCapacity.value>0 ? totalDemand.value/totalCapacity.value : 1);
  const binding = computed(()=> headroom.value>C.FLIP_AT ? 'power' : 'cash');
  const effMhw = computed(()=> totalDemand.value>0 ? totalHash.value/totalDemand.value : 0);

  const groupOf = r => G.s.groups.find(gr=>gr.id===r.group) || G.s.groups[0];
  const groupHash = gr => G.s.rigs.reduce((a,r)=>a+(r.group===gr.id?rigHash(r):0),0);
  const groupRigs = gr => G.s.rigs.filter(r=>r.group===gr.id);
  const myHash = c => G.s.groups.reduce((a,gr)=>a+(gr.chain===c.id?groupHash(gr):0),0);
  const simHash = c => G.s.sims.reduce((a,m)=>a+(m.chain===c.id?m.hash:0),0);
  const chainHash = c => simHash(c)+myHash(c);
  /* Difficulty comes from OBSERVED hashrate, updated once per block, so it lags.
     Hashrate arriving finds it stale-low and the chain runs easy; hashrate
     leaving strands it stale-high and the chain runs hard. */
  const diffOf = c => Math.max(c.floor, c.obs)*c.target;
  const easeOf = c => { const h=chainHash(c); return h<1 ? 1 : Math.max(c.floor,c.obs)/h; };
  const blockETA = c => Math.max(0, c.T-c.elapsed);
  const blockProg = c => c.T>0 ? Math.min(1, c.elapsed/c.T) : 0;
  const winChance = c => { const n=chainHash(c); return n>0 ? myHash(c)/n : 0; };
  /* Thread 29: above the floor a chain pays its emission, not your hashrate.
     The nudge names the constraint AND projects the fix honestly: the target
     chain's rate is quoted AFTER your hash lands on it (its difficulty grows
     by exactly what you bring), so moving never looks better than it is. */
  function groupAdvice(gr){
    const c=G.chain(gr.chain), h=groupHash(gr);
    if(!c||h<=0) return null;
    const net=chainHash(c);
    if(net<=c.floor*1.2 || h/net<0.4) return null;
    const cur=revPerMh(c);
    let best=null;
    for(const o of G.s.chains){
      if(o.id===c.id) continue;
      const oNet=Math.max(o.floor, chainHash(o));
      const proj=revPerMh(o)*oNet/(oNet+h);
      if(!best||proj>best.proj) best={o,proj};
    }
    if(!best || best.proj<cur*1.5) return null;
    return { share:h/net, alt:best.o.name, mult:best.proj/Math.max(1e-9,cur) };
  }
  /* Thread 32: above its floor a chain pays its emission, not your hashrate.
     groupAdvice already said so — but ONLY when some other chain paid 1.5x
     more, so a farm sitting on the best chain available hit a hard ceiling
     in total silence and simply watched new rigs earn nothing. This owns the
     condition itself, with no reference to alternatives: are you taking
     enough of this chain that your own hash is setting its difficulty?
     grossCap is what the chain emits per day no matter how much you add. */
  function chainCeiling(c, extraMh){
    if(!c) return null;
    const mine=myHash(c)+(extraMh||0), net=chainHash(c)+(extraMh||0);
    if(net<=0) return null;
    const share=mine/net;
    if(net<=c.floor || share<0.5) return null;      // below the floor your hash still buys rate
    // The chain's whole daily emission in dollars. Derived from the same
    // primitives as revPerMh rather than from C.PAY*mult*floor, so it cannot
    // drift if the chains are ever recalibrated against PAY.
    const grossCap=86400*c.reward*G.price(c)/c.target;
    return { share, grossCap, over:net/c.floor };
  }
  /* Issue #7: nothing pulled cash toward the next purchase once a rig and
     site existed — the only nudge was onboarding.js's one-time, dismissible
     "grow" tip, so a player who dismissed it (or never saw it, having
     already grown past it) had no ongoing signal that cash was piling up
     with somewhere obvious to put it. This is a persistent companion, in
     the same "the game says what binds" idiom as chainCeiling/groupAdvice/
     battAdvice — a pure read of current state, not a stored dismissal.

     Deliberately does NOT read G.dp/G.canBuild (the Build tab's live draft):
     that state is shared and only refreshes when a player visits Build, so
     right after the first rig mostly fills the site's power headroom, the
     still-drafted first-rig preset no longer fits — and stays that way
     forever on Farm and every other tab, since nothing there re-drafts it.
     Verified this the hard way: an earlier version of this advisory used
     G.dp.value.cost and, in a real browser run, never fired even after
     cash had regrown well past IDLE_CASH_MULT, because the stale draft's
     power requirement alone kept G.canBuild false. G.openBuildCost(f)
     (buildDraft.js) answers "would ANYTHING fit here" without touching
     draft state, so this stays accurate regardless of what's drafted.
     IDLE_CASH_MULT gates how far past "affordable" cash has to sit before
     this is worth saying. */
  const idleCashAdvice = computed(()=>{
    const f=G.active.value;
    if(!f) return null;
    const cost=G.openBuildCost(f);
    if(cost===null || G.s.cash<cost*C.IDLE_CASH_MULT) return null;
    return { site:f, cost, open:siteSlots(f)-siteRigs(f).length };
  });
  const fundOf = c => {
    const anchor=c.anchor||1;
    const ratio=Math.min(100, Math.max(1, chainHash(c)/c.floor)/anchor);
    return CHAIN_BASE[c.id]*Math.pow(ratio,0.45);
  };
  const poolHash = p => G.s.sims.reduce((a,m)=>a+(m.pool===p.id?m.hash:0),0)
    + G.s.groups.reduce((a,gr)=>a+(gr.pool===p.id?groupHash(gr):0),0);
  const revPerMh = c => (86400/diffOf(c))*c.reward*G.price(c);
  const blocksDay = c => 86400*myHash(c)/diffOf(c);
  const mttb = c => { const b=blocksDay(c); return b>0?1/b:Infinity; };

  const rigRev = r => { const gr=groupOf(r), c=gr&&G.chain(gr.chain);
    return (!c||!rigLive(r))?0:rigHash(r)*revPerMh(c)*G.evMult(G.poolOf(gr.pool)); };
  const rigPow = r => { const f=G.site(r.site); if(!f||!rigLive(r)) return 0;
    const d=siteDemand(f); return d>0 ? siteCostPerHour(f)*24*(rigWallW(r)/d) : 0; };
  const rigNet = r => rigRev(r)-rigPow(r);

  /* ---- the two quantities every projection needs ----
     What a marginal watt costs at a site, and what a hash is worth to the
     group a new rig would join. Both were written out longhand in three
     places each — the exact shape §6f names as the source of the worst bugs
     here — so they are functions now and the projections call them.

     draftRate closes thread 38. It used to take the BEST chain on the
     network, which quoted a rig against a chain it was not going to be
     pointed at. build() puts every new rig in groups[0], so that group's
     chain and pool are what it will actually earn on — and pricing it that
     way makes draftExpected exactly parallel to rigRev, which is the whole
     reason draftExpected exists. */
  const DEFAULT_ELEC = 0.63;
  const margRate = f => {
    const d=siteDemand(f);
    return d>0 ? siteCostPerHour(f)/d*1000 : DEFAULT_ELEC;
  };
  const draftGroup = () => G.s.groups[0];
  const draftRate = () => {
    const gr=draftGroup(), c=gr&&G.chain(gr.chain);
    return c ? revPerMh(c)*G.evMult(G.poolOf(gr.pool)) : 0;
  };

  /* Earned and spent TODAY, not a rate projected from hashrate. Pointing 131 MH
     at solo Obelisk used to advertise $500 a day when a block there may not
     land for a year — the number promised an expectation, not an outcome. */
  const today = () => { const d=Math.floor(G.s.t/86400);
    if(!G.s.today||G.s.today.day!==d) G.s.today={day:d,earned:0,power:0,blocks:0};
    return G.s.today; };
  const revenueDay = computed(()=> today().earned);
  const powerDay = computed(()=> today().power);
  const netDay = computed(()=> today().earned-today().power);
  /* The old projection is still useful — it is what a rig is WORTH — so it stays
     available under an honest name for the build screen and rig cards. */
  const expectedDay = computed(()=> G.s.rigs.reduce((a,r)=>a+rigRev(r),0));
  const powerRateDay = computed(()=> G.s.sites.reduce((a,f)=>a+siteCostPerHour(f)*24,0));
  const walletUsd = computed(()=> G.s.chains.reduce((a,c)=>a+G.s.wallet[c.id]*G.price(c),0));
  const runway = computed(()=> netDay.value>=0?Infinity:G.s.cash/-netDay.value);
  // everything realised since the start: sales and pool fees in, power and parts out
  const poolEarned = computed(()=> G.s.pools.reduce((a,p)=>a+(p.owner==='you'?p.earned:0),0));
  const lifetimeNet = computed(()=> G.s.earned + poolEarned.value - G.s.powerPaid - G.s.spent);


  Object.assign(G, {touchHeat,BATT_HORIZON,DEFAULT_ELEC,WORN_OUT,battAdvice,battFirm,battKw,battKwh,binding,blockETA,blockProg,blocksDay,chainCeiling,chainHash,chassisW,diffOf,draftGroup,draftRate,easeOf,effMhw,expectedDay,flowOf,fundOf,groupAdvice,groupHash,groupOf,groupRigs,headroom,idleCashAdvice,lifetimeNet,liveUnits,margRate,mttb,myHash,netDay,poolEarned,poolHash,powerDay,powerRateDay,psuCarrying,psuUsableW,psuWithConn,revPerMh,revenueDay,rigAir,rigCoreW,rigHash,rigLive,rigNet,rigPow,rigRev,rigWallW,runway,simHash,siteCapacity,siteCooling,siteCostPerHour,siteDemand,siteHeat,sitePlan,sitePlantW,siteRigs,siteSlots,siteStorage,siteTemp,srcOut,throttleOf,today,totalCapacity,totalDemand,totalHash,walletUsd,winChance});
}
