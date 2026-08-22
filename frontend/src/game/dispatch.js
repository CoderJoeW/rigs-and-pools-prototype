import { computed } from 'vue';
import { C } from '../data/constants.js';
import { dayIndexOf } from '../utils/calendar.js';
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
  const srcOut = (site,src) => {
    const sourcePart=SITEPART(src.p);
    const yieldFactor = sourcePart.kind==='solar' ? G.solarFactor.value : sourcePart.kind==='wind' ? site.wind : 1;
    return sourcePart.peak*(sourcePart.yield||1)*src.n*yieldFactor;
  };
  const siteCapacity = site => site.sources.reduce((sum,source)=>sum+srcOut(site,source),0);
  const siteCooling  = site => site.plants.reduce((sum,plant)=>sum+SITEPART(plant.p).cap*plant.n,0);
  let heatVer = 0;
  const heatMemo = new Map();
  const touchHeat = () => { heatVer++; };
  const siteHeatRaw = site => siteRigs(site).reduce((sum,rig)=>sum+(rigLive(rig)?rigCoreW(rig)/rigAir(rig):0),0);
  const siteHeat = site => {
    const cached = heatMemo.get(site.id);
    if(cached && cached.version === heatVer) return cached.heat;
    const heat = siteHeatRaw(site);
    heatMemo.set(site.id, { version:heatVer, heat });
    return heat;
  };
  const sitePlantW = (site, extraHeat) => {
    let need=siteHeat(site)+(extraHeat||0), draw=0;
    const order=[...site.plants].sort((plantA,plantB)=>SITEPART(plantA.p).pue-SITEPART(plantB.p).pue);
    for(const plant of order){
      if(need<=0) break;
      const plantPart=SITEPART(plant.p), capacity=plantPart.cap*plant.n, used=Math.min(capacity,need);
      draw += used*plantPart.pue; need -= used;
    }
    return draw;
  };
  const siteSlots    = site => SHELLS.find(shell=>shell.id===site.shell).slots;
  const siteRigs     = site => G.s.rigs.filter(rig=>rig.site===site.id);
  const liveUnits = rig => rig.units;
  const rigLive = rig => rig.on && rig.building<=0 && liveUnits(rig).length>0;
  const rigHash = rig => {
    if(!rigLive(rig)) return 0;
    const group=groupOf(rig); const chain=group&&G.chain(group.chain); if(!chain) return 0;
    const site=G.site(rig.site);
    const raw=liveUnits(rig).reduce((sum,unit)=>sum+PART(unit.p).mh*(1-0.4*unit.w),0)*(1+(rig.tune||0));
    return raw*(site?throttleOf(site):1);
  };
  const chassisW = rig => (rig.kind==='gpu'
    ? PART(rig.frame).w+PART(rig.mobo).w+rig.risers*RISER.w : PART(rig.ctrl).w) + (rig.cool?PART(rig.cool).w:0);
  const rigCoreW = rig => chassisW(rig)+
    liveUnits(rig).reduce((sum,unit)=>sum+PART(unit.p).w*(1+0.5*unit.w),0)*(1+(rig.tune||0)*1.9);
  const rigWallW = rig => rigLive(rig) ? rigCoreW(rig)/PART(rig.psu).eff : 0;
  const rigAir = rig => (rig.kind==='gpu'?PART(rig.frame).air:1.30)*(rig.cool?PART(rig.cool).fac:1);
  const psuUsableW = psu => psu.w*C.PSU_HEADROOM;
  const psuCarrying = coreW =>
    (G.livePsus.find(psu=>psuUsableW(psu)>=coreW)||{}).name || 'Nothing here is big enough';
  const psuWithConn = conn =>
    (G.livePsus.find(psu=>psu.conn>=conn)||{}).name || 'No supply has enough';
  const siteDemand = site => siteRigs(site).reduce((sum,rig)=>sum+rigWallW(rig),0) + sitePlantW(site);
  const siteTemp = site => {
    const cool=siteCooling(site); if(cool<=0) return G.ambient.value+75;
    return G.ambient.value + Math.min(75, siteHeat(site)/cool*40);
  };
  const throttleOf = site => {
    const temp=siteTemp(site);
    return temp<=70 ? 1 : Math.max(0.5, 1-(temp-70)/60);
  };
  const BATT_HORIZON=0.25;
  const siteStorage = site => site.storage||[];
  const battKwh = site => siteStorage(site).reduce((sum,unit)=>sum+SITEPART(unit.p).kwh*unit.n,0);
  const battKw  = site => siteStorage(site).reduce((sum,unit)=>sum+SITEPART(unit.p).kw*unit.n,0)*1000;
  const battFirm = site => Math.min(battKw(site), (site.batt||0)/BATT_HORIZON*1000);
  function sitePlan(site){
    const load=siteDemand(site);
    let renew=0; const paid=[];
    for(const src of site.sources){
      const sourcePart=SITEPART(src.p), out=srcOut(site,src);
      if(sourcePart.rate<=0) renew+=out; else paid.push({out,rate:G.rateAt(sourcePart)});
    }
    const batteryLevel=site.batt||0, kw=battKw(site), cap=battKwh(site);
    const firm=battFirm(site), paidCap=paid.reduce((sum,entry)=>sum+entry.out,0);
    let deficit=Math.max(0,load-renew), surplus=Math.max(0,renew-load);
    let chW=0, disW=0, gridChW=0;
    if(surplus>0 && cap>0 && batteryLevel<cap) chW=Math.min(surplus,kw);
    const shortfall=Math.max(0, deficit-paidCap);
    if(shortfall>0 && firm>0) disW=Math.min(shortfall, firm);
    if(firm-disW>0 && (site.disAny || G.band.value==='peak'))
      disW += Math.min(Math.max(0,deficit-disW), firm-disW);
    deficit-=disW;
    paid.sort((sourceA,sourceB)=>sourceA.rate-sourceB.rate);
    let need=deficit, cost=0, paidW=0;
    for(const source of paid){ if(need<=0) break;
      const used=Math.min(source.out,need); cost+=used/1000*source.rate; paidW+=used; need-=used; }
    const unserved=Math.max(0, load-renew-disW-paidW);
    if(site.gridCharge && G.band.value==='off' && cap>0 && batteryLevel<cap && chW+gridChW<kw){
      const paidHeadroom=paid.reduce((sum,entry)=>sum+entry.out,0)-paidW;
      const extra=Math.min(kw-chW, Math.max(0,paidHeadroom));
      if(extra>0 && paid.length){ gridChW=extra; cost+=extra/1000*paid[0].rate; }
    }
    return { load, renew, chW, disW, gridChW, paidW, cost, unserved, firm };
  }
  const siteCostPerHour = site => sitePlan(site).cost;
  function flowOf(site){
    const plan=sitePlan(site), cool=sitePlantW(site);
    return {
      load:plan.load, rigs:Math.max(0,plan.load-cool), cool,
      inRenew:Math.min(plan.renew,plan.load), inBatt:plan.disW, inPaid:plan.paidW,
      charge:plan.chW+plan.gridChW,
      spare:Math.max(0,plan.renew-plan.load-plan.chW),
      unserved:plan.unserved, cap:siteCapacity(site)+battFirm(site)
    };
  }
  function battAdvice(site){
    const kwh=battKwh(site); if(kwh<=0) return null;
    const kw=battKw(site), demand=siteDemand(site);
    let paidCap=0, renewPeak=0;
    for(const src of site.sources){
      const sourcePart=SITEPART(src.p);
      if(sourcePart.rate>0) paidCap+=srcOut(site,src);
      else renewPeak+=(sourcePart.peak||0)*(sourcePart.yield||1)*src.n;
    }
    const spareNight=Math.max(0, paidCap-demand);
    const surplus=Math.max(0, renewPeak*0.8-demand);
    const peakUse=Math.min(kwh, kw/1000*4, demand/1000*4);
    if(site.gridCharge && spareNight<kw*0.6)
      return { warn:true, text:'Charging is capped by '+fmt.w(spareNight)
        +' of spare night capacity — the battery could take '+fmt.w(kw)
        +'. A bigger service raises it.' };
    if(surplus<=0 && !site.gridCharge)
      return { warn:true, text:'Nothing charges it — no renewable surplus here, and off-peak grid charging is switched off.' };
    if(peakUse<kwh*0.5)
      return { warn:true, text:'Peak hours use only '+peakUse.toFixed(0)+' of its '
        +kwh+' kWh — oversized for this load'
        +(site.disAny?'.':' unless it discharges outside peak too.') };
    return { warn:false, text:'Well matched — soaking surplus and covering the peak.' };
  }

  const totalHash = computed(()=> G.s.rigs.reduce((sum,rig)=>sum+rigHash(rig),0));
  const totalDemand = computed(()=> G.s.sites.reduce((sum,site)=>sum+siteDemand(site),0));
  const totalCapacity = computed(()=> G.s.sites.reduce((sum,site)=>sum+siteCapacity(site),0));
  const headroom = computed(()=> totalCapacity.value>0 ? totalDemand.value/totalCapacity.value : 1);
  const binding = computed(()=> headroom.value>C.FLIP_AT ? 'power' : 'cash');
  const effMhw = computed(()=> totalDemand.value>0 ? totalHash.value/totalDemand.value : 0);

  const groupOf = rig => G.s.groups.find(group=>group.id===rig.group) || G.s.groups[0];
  const groupHash = group => G.s.rigs.reduce((sum,rig)=>sum+(rig.group===group.id?rigHash(rig):0),0);
  const groupRigs = group => G.s.rigs.filter(rig=>rig.group===group.id);
  const myHash = chain => G.s.groups.reduce((sum,group)=>sum+(group.chain===chain.id?groupHash(group):0),0);
  /* O(1) via running totals maintained by sims.js — never scan the agent array. */
  const simHash = chain => G.simHashOf ? G.simHashOf(chain) : 0;
  const chainHash = chain => simHash(chain)+myHash(chain);
  const diffOf = chain => Math.max(chain.floor, chain.obs)*chain.target;
  const easeOf = chain => { const hash=chainHash(chain); return hash<1 ? 1 : Math.max(chain.floor,chain.obs)/hash; };
  const blockETA = chain => Math.max(0, chain.T-chain.elapsed);
  const blockProg = chain => chain.T>0 ? Math.min(1, chain.elapsed/chain.T) : 0;
  const winChance = chain => { const networkHash=chainHash(chain); return networkHash>0 ? myHash(chain)/networkHash : 0; };
  function groupAdvice(group){
    const chain=G.chain(group.chain), groupHashAmount=groupHash(group);
    if(!chain||groupHashAmount<=0) return null;
    const networkHash=chainHash(chain);
    if(networkHash<=chain.floor*1.2 || groupHashAmount/networkHash<0.4) return null;
    const currentRevPerMh=revPerMh(chain);
    let best=null;
    for(const otherChain of G.s.chains){
      if(otherChain.id===chain.id) continue;
      const otherNet=Math.max(otherChain.floor, chainHash(otherChain));
      const projectedRevPerMh=revPerMh(otherChain)*otherNet/(otherNet+groupHashAmount);
      if(!best||projectedRevPerMh>best.revPerMh) best={chain:otherChain,revPerMh:projectedRevPerMh};
    }
    if(!best || best.revPerMh<currentRevPerMh*1.5) return null;
    return { share:groupHashAmount/networkHash, alt:best.chain.name, mult:best.revPerMh/Math.max(1e-9,currentRevPerMh) };
  }
  function chainCeiling(chain, extraMh){
    if(!chain) return null;
    const mineHash=myHash(chain)+(extraMh||0), networkHash=chainHash(chain)+(extraMh||0);
    if(networkHash<=0) return null;
    const share=mineHash/networkHash;
    if(networkHash<=chain.floor || share<0.5) return null;
    const grossCap=86400*chain.reward*G.price(chain)/chain.target;
    return { share, grossCap, over:networkHash/chain.floor };
  }
  const idleCashAdvice = computed(()=>{
    const site=G.active.value;
    if(!site) return null;
    const cost=G.openBuildCost(site);
    if(cost===null || G.s.cash<cost*C.IDLE_CASH_MULT) return null;
    return { site, cost, open:siteSlots(site)-siteRigs(site).length };
  });
  const fundOf = chain => {
    const anchor=chain.anchor||1;
    const ratio=Math.min(100, Math.max(1, chainHash(chain)/chain.floor)/anchor);
    return CHAIN_BASE[chain.id]*Math.pow(ratio,0.45);
  };
  const poolHash = pool => (G.simPoolHashOf ? G.simPoolHashOf(pool) : 0)
    + G.s.groups.reduce((sum,group)=>sum+(group.pool===pool.id?groupHash(group):0),0);
  const revPerMh = chain => (86400/diffOf(chain))*chain.reward*G.price(chain);
  const blocksDay = chain => 86400*myHash(chain)/diffOf(chain);
  const mttb = chain => { const blocks=blocksDay(chain); return blocks>0?1/blocks:Infinity; };

  const rigRev = rig => { const group=groupOf(rig), chain=group&&G.chain(group.chain);
    return (!chain||!rigLive(rig))?0:rigHash(rig)*revPerMh(chain)*G.evMult(G.poolOf(group.pool)); };
  const rigPow = rig => { const site=G.site(rig.site); if(!site||!rigLive(rig)) return 0;
    const demand=siteDemand(site); return demand>0 ? siteCostPerHour(site)*24*(rigWallW(rig)/demand) : 0; };
  const rigNet = rig => rigRev(rig)-rigPow(rig);

  const rigWear = rig => rig.units.length ? rig.units.reduce((sum,unit)=>sum+unit.w,0)/rig.units.length : 0;
  const rigState = rig =>
      rig.building>0 ? {k:'build', dot:'build', label:'Building', sub:fmt.dur(rig.building)}
    : !rig.on ? {k:'off', dot:'off',
        label: rig.cut==='broke' ? 'Stopped — no cash'
             : rig.cut==='brownout' ? 'Shed — site over capacity' : 'Off', sub:''}
    : rig.units.every(unit=>unit.w>=1) ? {k:'worn', dot:'bad', label:'Worn out', sub:'cards need replacing'}
    : rigNet(rig)<0 ? {k:'losing', dot:'bad', label:'Losing money', sub:'costs more than it earns'}
    : rigWear(rig)>0.6 ? {k:'wearing', dot:'warn', label:'Wearing', sub:'cards past 60%'}
    : {k:'run', dot:'run', label:'Running', sub:''};

  const DEFAULT_ELEC = 15.00; // matches SOURCES' flat grid baseline — see site-parts.js
  const margRate = site => {
    const demand=siteDemand(site);
    return demand>0 ? siteCostPerHour(site)/demand*1000 : DEFAULT_ELEC;
  };
  const draftGroup = () => G.s.groups[0];
  const draftRate = () => {
    const group=draftGroup(), chain=group&&G.chain(group.chain);
    return chain ? revPerMh(chain)*G.evMult(G.poolOf(group.pool)) : 0;
  };

  /* Rolling the day over stashes the day that just ended, so the Farm tab can
     say "vs yesterday" about a real closed day rather than about whichever
     sample the 0.75-day netHist cadence happened to land on. Only a day that
     actually ran is kept: a save resumed after a multi-day gap rolls straight
     past the empty days in between, and `yday.day` is what tells the view the
     stashed figures are the immediately preceding day and not a stale one. */
  const today = () => { const dayIdx=dayIndexOf(G.s.t);
    if(!G.s.today||G.s.today.day!==dayIdx){
      if(G.s.today&&G.s.today.day===dayIdx-1) G.s.yday={...G.s.today,hash:totalHash.value};
      G.s.today={day:dayIdx,earned:0,power:0,blocks:0};
    }
    return G.s.today; };
  /* Yesterday's close for `key`, or null when there is no adjacent closed day to
     compare against (fresh save, or a resume that skipped days). 'net' is
     derived rather than stored — the snapshot keeps the two counters it is
     the difference of. */
  const yday = key => { const yesterday=G.s.yday;
    if(!yesterday || yesterday.day!==dayIndexOf(G.s.t)-1) return null;
    const value = key==='net' ? yesterday.earned-yesterday.power : yesterday[key];
    return Number.isFinite(value) ? value : null; };
  /* Fractional change of an INSTANTANEOUS reading (hashrate, say) against
     yesterday's close. Null when there is nothing to compare against —
     including when yesterday was flat zero, where a percent change is not
     defined rather than infinite. */
  const dayDelta = (key, now) => { const was=yday(key);
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
  const dayPaceDelta = (key, now) => { const was=yday(key);
    const frac=(G.s.t%86400)/86400;
    return was===null||was===0||frac<DAY_PACE_FLOOR
      ? null : (now/frac-was)/Math.abs(was); };
  const revenueDay = computed(()=> today().earned);
  const powerDay = computed(()=> today().power);
  const netDay = computed(()=> today().earned-today().power);
  const expectedDay = computed(()=> G.s.rigs.reduce((sum,rig)=>sum+rigRev(rig),0));
  const powerRateDay = computed(()=> G.s.sites.reduce((sum,site)=>sum+siteCostPerHour(site)*24,0));
  const walletUsd = computed(()=> G.s.chains.reduce((sum,chain)=>sum+G.s.wallet[chain.id]*G.price(chain),0));
  const runway = computed(()=> netDay.value>=0?Infinity:G.s.cash/-netDay.value);
  const poolEarned = computed(()=> G.s.pools.reduce((sum,pool)=>sum+(pool.owner==='you'?pool.earned:0),0));
  const lifetimeNet = computed(()=> G.s.earned + poolEarned.value - G.s.powerPaid - G.s.spent);

  Object.assign(G, {touchHeat,BATT_HORIZON,DEFAULT_ELEC,battAdvice,battFirm,battKw,battKwh,binding,blockETA,blockProg,blocksDay,chainCeiling,chainHash,chassisW,diffOf,dayDelta,dayPaceDelta,draftGroup,draftRate,easeOf,effMhw,expectedDay,flowOf,fundOf,groupAdvice,groupHash,groupOf,groupRigs,headroom,idleCashAdvice,lifetimeNet,liveUnits,margRate,mttb,myHash,netDay,poolEarned,poolHash,powerDay,powerRateDay,psuCarrying,psuUsableW,psuWithConn,revPerMh,revenueDay,rigAir,rigCoreW,rigHash,rigLive,rigNet,rigPow,rigRev,rigState,rigWallW,rigWear,runway,simHash,siteCapacity,siteCooling,siteCostPerHour,siteDemand,siteHeat,sitePlan,sitePlantW,siteRigs,siteSlots,siteStorage,siteTemp,srcOut,throttleOf,today,totalCapacity,totalDemand,totalHash,walletUsd,winChance});
}
