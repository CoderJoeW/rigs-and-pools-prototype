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
  const liveUnits = r => r.units;
  const rigLive = r => r.on && r.building<=0 && liveUnits(r).length>0;
  const rigHash = r => {
    if(!rigLive(r)) return 0;
    const gr=groupOf(r); const c=gr&&G.chain(gr.chain); if(!c) return 0;
    const f=G.site(r.site);
    const raw=liveUnits(r).reduce((a,u)=>a+PART(u.p).mh*(1-0.4*u.w),0)*(1+(r.tune||0));
    return raw*(f?throttleOf(f):1);
  };
  const chassisW = r => (r.kind==='gpu'
    ? PART(r.frame).w+PART(r.mobo).w+r.risers*RISER.w : PART(r.ctrl).w) + (r.cool?PART(r.cool).w:0);
  const rigCoreW = r => chassisW(r)+
    liveUnits(r).reduce((a,u)=>a+PART(u.p).w*(1+0.5*u.w),0)*(1+(r.tune||0)*1.9);
  const rigWallW = r => rigLive(r) ? rigCoreW(r)/PART(r.psu).eff : 0;
  const rigAir = r => (r.kind==='gpu'?PART(r.frame).air:1.30)*(r.cool?PART(r.cool).fac:1);
  const psuUsableW = p => p.w*C.PSU_HEADROOM;
  const psuCarrying = coreW =>
    (G.livePsus.find(x=>psuUsableW(x)>=coreW)||{}).name || 'Nothing here is big enough';
  const psuWithConn = conn =>
    (G.livePsus.find(x=>x.conn>=conn)||{}).name || 'No supply has enough';
  const siteDemand = f => siteRigs(f).reduce((a,r)=>a+rigWallW(r),0) + sitePlantW(f);
  const siteTemp = f => {
    const cool=siteCooling(f); if(cool<=0) return G.ambient.value+75;
    return G.ambient.value + Math.min(75, siteHeat(f)/cool*40);
  };
  const throttleOf = f => {
    const t=siteTemp(f);
    return t<=70 ? 1 : Math.max(0.5, 1-(t-70)/60);
  };
  const BATT_HORIZON=0.25;
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
    const shortfall=Math.max(0, deficit-paidCap);
    if(shortfall>0 && firm>0) disW=Math.min(shortfall, firm);
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
  /* O(1) via running totals maintained by sims.js — never scan the agent array. */
  const simHash = c => G.simHashOf ? G.simHashOf(c) : 0;
  const chainHash = c => simHash(c)+myHash(c);
  const diffOf = c => Math.max(c.floor, c.obs)*c.target;
  const easeOf = c => { const h=chainHash(c); return h<1 ? 1 : Math.max(c.floor,c.obs)/h; };
  const blockETA = c => Math.max(0, c.T-c.elapsed);
  const blockProg = c => c.T>0 ? Math.min(1, c.elapsed/c.T) : 0;
  const winChance = c => { const n=chainHash(c); return n>0 ? myHash(c)/n : 0; };
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
  function chainCeiling(c, extraMh){
    if(!c) return null;
    const mine=myHash(c)+(extraMh||0), net=chainHash(c)+(extraMh||0);
    if(net<=0) return null;
    const share=mine/net;
    if(net<=c.floor || share<0.5) return null;
    const grossCap=86400*c.reward*G.price(c)/c.target;
    return { share, grossCap, over:net/c.floor };
  }
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
  const poolHash = p => (G.simPoolHashOf ? G.simPoolHashOf(p) : 0)
    + G.s.groups.reduce((a,gr)=>a+(gr.pool===p.id?groupHash(gr):0),0);
  const revPerMh = c => (86400/diffOf(c))*c.reward*G.price(c);
  const blocksDay = c => 86400*myHash(c)/diffOf(c);
  const mttb = c => { const b=blocksDay(c); return b>0?1/b:Infinity; };

  const rigRev = r => { const gr=groupOf(r), c=gr&&G.chain(gr.chain);
    return (!c||!rigLive(r))?0:rigHash(r)*revPerMh(c)*G.evMult(G.poolOf(gr.pool)); };
  const rigPow = r => { const f=G.site(r.site); if(!f||!rigLive(r)) return 0;
    const d=siteDemand(f); return d>0 ? siteCostPerHour(f)*24*(rigWallW(r)/d) : 0; };
  const rigNet = r => rigRev(r)-rigPow(r);

  const rigWear = r => r.units.length ? r.units.reduce((a,u)=>a+u.w,0)/r.units.length : 0;
  const rigState = r =>
      r.building>0 ? {k:'build', dot:'build', label:'Building', sub:fmt.dur(r.building)}
    : !r.on ? {k:'off', dot:'off',
        label: r.cut==='broke' ? 'Stopped — no cash'
             : r.cut==='brownout' ? 'Shed — site over capacity' : 'Off', sub:''}
    : r.units.every(u=>u.w>=1) ? {k:'worn', dot:'bad', label:'Worn out', sub:'cards need replacing'}
    : rigNet(r)<0 ? {k:'losing', dot:'bad', label:'Losing money', sub:'costs more than it earns'}
    : rigWear(r)>0.6 ? {k:'wearing', dot:'warn', label:'Wearing', sub:'cards past 60%'}
    : {k:'run', dot:'run', label:'Running', sub:''};

  const DEFAULT_ELEC = 15.00; // matches SOURCES' flat grid baseline — see site-parts.js
  const margRate = f => {
    const d=siteDemand(f);
    return d>0 ? siteCostPerHour(f)/d*1000 : DEFAULT_ELEC;
  };
  const draftGroup = () => G.s.groups[0];
  const draftRate = () => {
    const gr=draftGroup(), c=gr&&G.chain(gr.chain);
    return c ? revPerMh(c)*G.evMult(G.poolOf(gr.pool)) : 0;
  };

  /* Rolling the day over stashes the day that just ended, so the Farm tab can
     say "vs yesterday" about a real closed day rather than about whichever
     sample the 0.75-day netHist cadence happened to land on. Only a day that
     actually ran is kept: a save resumed after a multi-day gap rolls straight
     past the empty days in between, and `yday.day` is what tells the view the
     stashed figures are the immediately preceding day and not a stale one. */
  const today = () => { const d=Math.floor(G.s.t/86400);
    if(!G.s.today||G.s.today.day!==d){
      if(G.s.today&&G.s.today.day===d-1) G.s.yday={...G.s.today,hash:totalHash.value};
      G.s.today={day:d,earned:0,power:0,blocks:0};
    }
    return G.s.today; };
  /* Yesterday's close for `k`, or null when there is no adjacent closed day to
     compare against (fresh save, or a resume that skipped days). 'net' is
     derived rather than stored — the snapshot keeps the two counters it is
     the difference of. */
  const yday = k => { const y=G.s.yday;
    if(!y || y.day!==Math.floor(G.s.t/86400)-1) return null;
    const v = k==='net' ? y.earned-y.power : y[k];
    return Number.isFinite(v) ? v : null; };
  /* Fractional change of an INSTANTANEOUS reading (hashrate, say) against
     yesterday's close. Null when there is nothing to compare against —
     including when yesterday was flat zero, where a percent change is not
     defined rather than infinite. */
  const dayDelta = (k, now) => { const was=yday(k);
    return was===null||was===0 ? null : (now-was)/Math.abs(was); };
  /* The same, for a CUMULATIVE counter — earnings, power spend. Those are only
     part-way through today, so comparing the running total against yesterday's
     finished one reads as a collapse every morning: an hour into a day
     identical to the last, the raw figures differ by 24x. Projecting today's
     total to a full day at its current pace is what makes the two comparable.

     Held back until the day is far enough along to mean anything: minutes in,
     one block landing or not swings the projection by multiples, and a chip
     that swings between +900% and -90% while nothing is actually happening is
     worse than no chip. */
  const DAY_PACE_FLOOR = 0.15;
  const dayPaceDelta = (k, now) => { const was=yday(k);
    const frac=(G.s.t%86400)/86400;
    return was===null||was===0||frac<DAY_PACE_FLOOR
      ? null : (now/frac-was)/Math.abs(was); };
  const revenueDay = computed(()=> today().earned);
  const powerDay = computed(()=> today().power);
  const netDay = computed(()=> today().earned-today().power);
  const expectedDay = computed(()=> G.s.rigs.reduce((a,r)=>a+rigRev(r),0));
  const powerRateDay = computed(()=> G.s.sites.reduce((a,f)=>a+siteCostPerHour(f)*24,0));
  const walletUsd = computed(()=> G.s.chains.reduce((a,c)=>a+G.s.wallet[c.id]*G.price(c),0));
  const runway = computed(()=> netDay.value>=0?Infinity:G.s.cash/-netDay.value);
  const poolEarned = computed(()=> G.s.pools.reduce((a,p)=>a+(p.owner==='you'?p.earned:0),0));
  const lifetimeNet = computed(()=> G.s.earned + poolEarned.value - G.s.powerPaid - G.s.spent);

  Object.assign(G, {touchHeat,BATT_HORIZON,DEFAULT_ELEC,battAdvice,battFirm,battKw,battKwh,binding,blockETA,blockProg,blocksDay,chainCeiling,chainHash,chassisW,diffOf,dayDelta,dayPaceDelta,draftGroup,draftRate,easeOf,effMhw,expectedDay,flowOf,fundOf,groupAdvice,groupHash,groupOf,groupRigs,headroom,idleCashAdvice,lifetimeNet,liveUnits,margRate,mttb,myHash,netDay,poolEarned,poolHash,powerDay,powerRateDay,psuCarrying,psuUsableW,psuWithConn,revPerMh,revenueDay,rigAir,rigCoreW,rigHash,rigLive,rigNet,rigPow,rigRev,rigState,rigWallW,rigWear,runway,simHash,siteCapacity,siteCooling,siteCostPerHour,siteDemand,siteHeat,sitePlan,sitePlantW,siteRigs,siteSlots,siteStorage,siteTemp,srcOut,throttleOf,today,totalCapacity,totalDemand,totalHash,walletUsd,winChance});
}
