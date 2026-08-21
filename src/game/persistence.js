import { C, TRUST_RAMP, SIM_RATIO, SIM_CHAINS, RIVAL_PER_CHAIN, RIVAL_NAMES, COVER_DAYS, PPLNS_COVER } from '../data/constants.js';
import { CHAINS } from '../data/chains.js';
import { SHELLS, SOURCES, PLANTS, STORAGE, SITEPART, jobPart } from '../data/site-parts.js';
import { FABS, FAB } from '../data/fab.js';
import { CARDS, PSUS, PART, PART_MAP, RISER } from '../data/hardware.js';
import { DESIGN_AXES, MAX_AXIS_POINTS, designTotals, designStats, designCost } from '../data/customParts.js';
import { MILESTONES, RANKS } from '../data/milestones.js';
import { fmt } from '../utils/format.js';
import { allUnlocked } from './state.js';
import { storage } from '../services/storage.js';
import { sfx } from '../services/audio.js';

/* 13-persistence-and-exports.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installPersistence(G){
  /* ---- persistence ---- */
  let wiped=false;
  let restoring=false;
  let hydrating=false;
  async function saveNow(){
    if(wiped) return;
    const mode=await storage.set({ ver:C.SAVE_VER, savedAt:Date.now(), state:G.s });
    G.s.saveInfo = mode==='memory' ? 'not saved — no storage here' : 'saved · '+mode;
  }
  const nowMs = ()=> typeof performance==='object'&&performance.now ? performance.now() : Date.now();
  async function advance(seconds){
    const credited=Math.min(seconds, C.OFFLINE_CAP);
    restoring=true;
    sfx.busy=true;
    G.s.catchUp={ credited, done:0 };
    const cu=G.s.catchUp;
    try{
      let left=credited, sliceStart=nowMs();
      while(left>0){
        const step=Math.min(30,left);
        G.stepTick(step); left-=step;
        cu.done=credited-left;
        if(nowMs()-sliceStart>50){
          await new Promise(r=>setTimeout(r,0));
          sliceStart=nowMs();
        }
      }
    } finally {
      sfx.busy=false;
      restoring=false;
      G.s.catchUp=null;
    }
    return credited;
  }
  async function loadSave(){
    const data=await storage.get();
    if(!data || data.ver!==C.SAVE_VER) return false;
    return await hydrate(data);
  }
  /* Shared by both offline catch-up paths: a fresh load (away since savedAt)
     and a backgrounded tab resuming mid-session (away since it went hidden —
     see App.vue's visibilitychange handler). Browsers throttle or fully
     suspend a hidden tab's timers, so without this second call site the tick
     loop just stalls while the tab isn't in front, and only a reload (which
     already goes through loadSave) ever caught it up. Guarded against
     overlapping itself the same way hydrate() guards against overlapping
     hydrates — two catch-ups racing the same G.s would corrupt it. */
  async function creditAway(away){
    if(G.s.catchUp || away<=60 || !G.s.rigs.length) return 0;
    const cashBefore=G.s.cash, coinsBefore=G.walletUsd.value;
    const credited=await advance(away);
    const gain=(G.s.cash-cashBefore)+(G.walletUsd.value-coinsBefore);
    const hrs=(credited/3600);
    G.pop('Welcome back','+'+fmt.usd(Math.max(0,gain))+' while away '+
      (hrs>=1?hrs.toFixed(1)+'h':Math.round(credited/60)+'m')+
      (away>C.OFFLINE_CAP?' (capped at 24h)':''),'grn',{always:true});
    G.say('sys','Away '+fmt.dur(away)+' — '+fmt.dur(credited)+' of progress credited');
    return credited;
  }
  async function hydrate(data){
    if(hydrating) return false;
    hydrating=true;
    try{ return await hydrateUnsafe(data); }
    catch(e){
      restoring=false;
      G.s.catchUp=null;
      console.warn('save failed to load, starting fresh:', e.message);
      resetState();
      G.pop('Save could not be read','starting a fresh game','dark',{always:true});
      return false;
    }
    finally{ hydrating=false; }
  }
  async function hydrateUnsafe(data){
    restoring=true;
    Object.assign(G.s, data.state);
    G.s.toast={n:0,text:'',amount:'',cls:''};
    G.s.catchUp=null;
    G.s.picker=null; G.s.sitePicker=null; G.s.design=null;
    G.s.rebuild=null; G.s.focusRig=null; G.s.speed=1; G.s.wipeArm=false;
    if(!Array.isArray(G.s.customParts)) G.s.customParts=[];
    for(const p of G.s.customParts) PART_MAP.set(p.id, p);
    G.s.unlocked=allUnlocked();
    const needsSimReseed = !Array.isArray(G.s.sims) || !G.s.sims.length
      || G.s.sims.some(m => m.cash === undefined || m.style === undefined);
    if(needsSimReseed && G.seedSims){
      G.s.pools = (G.s.pools || []).filter(p => p.owner === 'you');
      G.seedSims(G.s.t || 0);
      for(const c of G.s.chains){
        const start = G.simHashOf(c);
        c.obs = Math.max(c.floor, start);
        /* Preserve an existing (possibly decayed-below-1) anchor as-is —
           only the fallback for a chain that has none yet gets the >=1
           floor, so this repair path can't undo anchor-decay progress on
           an otherwise-healthy save. */
        c.anchor = c.anchor || Math.max(1, start / Math.max(1, c.floor));
      }
      G.say('sys','The network re-formed — independent miners now earn, spend and compete');
    } else if(G.reindexSims){
      G.reindexSims();
    }

    const legacy=G.s.rigs.some(r=>!r.group || ('chain' in r) || ('pool' in r));
    if(legacy || !G.s.groups || !G.s.groups.length){
      G.s.groups=[]; G.s.nextGroup=1;
      const combos=new Map();
      for(const r of G.s.rigs){
        const key=(r.chain||'tessera')+'|'+(r.pool||'solo');
        if(!combos.has(key)){
          const gr={ id:G.s.nextGroup++, name:G.s.groups.length?'Group '+G.s.nextGroup:'Main',
            chain:r.chain||'tessera', pool:r.pool||'solo', pending:0 };
          G.s.groups.push(gr); combos.set(key,gr);
        }
        const gr=combos.get(key);
        gr.pending+=(r.pending||0);
        r.group=gr.id; delete r.chain; delete r.pool; delete r.pending;
      }
      if(!G.s.groups.length) G.s.groups.push({ id:G.s.nextGroup++, name:'Main',
        chain:'tessera', pool:'solo', pending:0 });
    }
    for(const r of G.s.rigs) if(!r.group) r.group=G.s.groups[0].id;
    if('autoSell' in G.s){
      G.s.drip={ on:!!G.s.autoSell, frac:0.25, hours:24 }; G.s.dripAt=0;
      delete G.s.autoSell;
    }
    if(!G.s.drip) G.s.drip={ on:false, frac:0.25, hours:6 };
    if(!G.s.hold) G.s.hold={};
    for(const site of G.s.sites) if(site.fab===undefined) site.fab=null;
    if(G.s.today && typeof G.s.today.blocks!=='number') G.s.today.blocks=0;
    if(typeof G.s.recentBlockUsd!=='object' || G.s.recentBlockUsd===null || Array.isArray(G.s.recentBlockUsd))
      G.s.recentBlockUsd={};
    for(const c of G.s.chains){
      const base=CHAINS.find(x=>x.id===c.id);
      if(!base || (c.floor===base.floor && c.reward===base.reward)) continue;
      c.floor=base.floor; c.reward=base.reward; c.target=base.target;
      c.mult=base.mult; c.depth=base.depth;
      c.anchor=Math.max(1, SIM_RATIO);
      /* A rebalance patch invalidates any decay progress too — the chain's
         economics just changed, so maturity restarts from this new
         baseline rather than chasing a floor computed from the old one. */
      c.anchor0=c.anchor;
      /* Rescale the miners on the chain to what the CURRENT model says the
         chain carries, which is a question about the population that has
         arrived — not SIM_RATIO*floor compounded by a daily growth rate.
         That was the old model's answer and it is the seed bug §6o removes:
         on a day-10 save it would have multiplied every Obelisk miner's
         hashrate by about 130x, handing the chain a finished network again
         through the back door. Unreachable while every v5 save's chains match
         CHAINS, which is exactly why it needs to be right before the next
         floor retune reaches it. */
      const mine=G.s.sims.filter(m=>m.chain===c.id);
      const have=mine.reduce((a,m)=>a+m.hash,0);
      const want=G.simTargetOf ? G.simTargetOf(c.id) : SIM_RATIO*base.floor;
      /* Through setSimHash, not `m.hash *= k`: the running totals sims.js
         keeps (_simChainHash and the solo/pool splits) are maintained
         incrementally, and reindexSims has already run by here — so a bare
         assignment would leave every one of them stale for the session. */
      if(have>0 && want>0){
        const k=want/have;
        for(const m of mine){
          if(G.setSimHash) G.setSimHash(m, m.hash*k); else m.hash*=k;
        }
      }
      c.obs=Math.max(c.floor, want);
    }
    if(G.s.pools.some(p=>p.owner==='server')){
      const dead=new Set(G.s.pools.filter(p=>p.owner==='server').map(p=>p.id));
      G.s.pools=G.s.pools.filter(p=>p.owner!=='server');
      // Through setSimPool for the same reason the rescale above goes through
      // setSimHash: a bare assignment strands the miner's hashrate in
      // _simPoolHash for a pool that no longer exists, and out of _simSoloHash.
      for(const m of G.s.sims) if(dead.has(m.pool)){
        if(G.setSimPool) G.setSimPool(m,'solo'); else m.pool='solo';
      }
      for(const gr of G.s.groups) if(dead.has(gr.pool)) gr.pool='solo';
      let seq=0;
      for(const cid of SIM_CHAINS){
        const c=CHAINS.find(x=>x.id===cid);
        for(let i=0;i<RIVAL_PER_CHAIN;i++){
          const scheme=Math.random()<0.35?'PPS':'PPLNS';
          const fee=scheme==='PPS'?0.015+Math.random()*0.045:0.005+Math.random()*0.035;
          const per=C.PAY*c.mult*(scheme==='PPS'?COVER_DAYS:PPLNS_COVER);
          const bond=Math.round(per*SIM_RATIO*c.floor*(0.12+Math.random()*0.45));
          G.s.pools.push({ id:'rm'+(++seq), chain:cid, owner:'rival',
            name:RIVAL_NAMES[seq%RIVAL_NAMES.length], scheme, fee, bond, bond0:bond,
            cap:0, born:G.s.t, live:true, earned:0, found:0, feeMoved:-1e9, lapse:0 });
        }
      }
      G.say('pool','The official pools have wound up — the market is all private operators now');
    }
    G.ensureWeather(); G.ensureGens();
    restoring=false;
    await creditAway(Math.max(0,(Date.now()-data.savedAt)/1000));
    return true;
  }
  function resetState(){
    const fresh=G.freshState();
    for(const k of Object.keys(G.s)) delete G.s[k];
    Object.assign(G.s, fresh);
    G.liveCards.length=0; G.liveCards.push(...CARDS);
    G.livePsus.length=0; G.livePsus.push(...PSUS);
    G.builtGen=0;
    G.lastToast=-1e9;
    for(const k of Object.keys(G.toastSeen)) delete G.toastSeen[k];
    if(G.seedSims){
      G.seedSims(0);
      for(const c of G.s.chains){
        const start = G.simHashOf(c);
        c.obs = Math.max(c.floor, start);
        c.anchor = Math.max(1, start / Math.max(1, c.floor));
        c.anchor0 = c.anchor;
      }
    }
    G.say('sys','A spare bedroom, a 1.5 kW outlet and $500');
  }
  function exportSave(){
    return JSON.stringify({ ver:C.SAVE_VER, savedAt:Date.now(), state:G.s });
  }
  async function importSave(text){
    let data;
    try{ data=JSON.parse(text); }catch(e){ return false; }
    if(!data || typeof data!=='object' || data.ver!==C.SAVE_VER || !data.state) return false;
    const ok=await hydrate(data);
    if(ok) await saveNow();
    return ok;
  }
  async function wipeSave(){
    wiped=true;
    await storage.wipe();
    resetState();
    wiped=false;
    await saveNow();
    G.s.saveInfo='erased';
    try{ if(typeof location!=='undefined' && location.reload) location.reload(); }catch(e){}
  }

  G.say('sys','A spare bedroom, a 1.5 kW outlet and $500');

  /* The flat surface components read. This list is hand-maintained: anything an
     install* module puts on G has to be repeated here or it never reaches the
     Pinia store, and reading it gives undefined rather than an error.
     src/stores/__tests__/exportSurface.test.js makes that loud — it fails if a
     key on G is neither published here nor declared private there. */
  G.__exports={ s:G.s,C,SHELLS,SOURCES,PLANTS,STORAGE,FABS,FAB,PSUS:G.livePsus,
    DESIGN_AXES,MAX_AXIS_POINTS,designTotals,designStats,designCost,
    openDesign:G.openDesign,closeDesign:G.closeDesign,bumpDesignPick:G.bumpDesignPick,manufacturePart:G.manufacturePart,liveTopOf:G.liveTopOf,
    RISER,PART,SITEPART,jobPart,chain:G.chain,poolOf:G.poolOf,active:G.active,price:G.price,revPerMh:G.revPerMh,
    solarFactor:G.solarFactor,ambient:G.ambient,band:G.band,cards:G.cards,battKwh:G.battKwh,battKw:G.battKw,sitePlan:G.sitePlan,srcOut:G.srcOut,siteCapacity:G.siteCapacity,siteCooling:G.siteCooling,sitePlantW:G.sitePlantW,siteHeat:G.siteHeat,throttleOf:G.throttleOf,siteSlots:G.siteSlots,siteRigs:G.siteRigs,siteDemand:G.siteDemand,siteTemp:G.siteTemp,
    siteCostPerHour:G.siteCostPerHour,rigLive:G.rigLive,rigHash:G.rigHash,rigWallW:G.rigWallW,rigNet:G.rigNet,rigState:G.rigState,rigWear:G.rigWear,totalHash:G.totalHash,totalCapacity:G.totalCapacity,headroom:G.headroom,binding:G.binding,effMhw:G.effMhw,
    revenueDay:G.revenueDay,powerDay:G.powerDay,netDay:G.netDay,dayDelta:G.dayDelta,dayPaceDelta:G.dayPaceDelta,walletUsd:G.walletUsd,runway:G.runway,lifetimeNet:G.lifetimeNet,poolEarned:G.poolEarned,myHash:G.myHash,diffOf:G.diffOf,mttb:G.mttb,
    dp:G.dp,checks:G.checks,canBuild:G.canBuild,draftEff:G.draftEff,buildTime:G.buildTime,unitEcon:G.unitEcon,draftExpected:G.draftExpected,generatePreset:G.generatePreset,maxBuildQty:G.maxBuildQty,
    blockValue:G.blockValue,bondReq:G.bondReq,poolTrust:G.poolTrust,TRUST_RAMP,poolCapLimit:G.poolCapLimit,poolHash:G.poolHash,poolProfit:G.poolProfit,withdrawProfit:G.withdrawProfit,
    battFirm:G.battFirm,flowOf:G.flowOf,chainHash:G.chainHash,easeOf:G.easeOf,blockETA:G.blockETA,blockProg:G.blockProg,winChance:G.winChance,fundOf:G.fundOf,groupAdvice:G.groupAdvice,chainCeiling:G.chainCeiling,idleCashAdvice:G.idleCashAdvice,draftGroup:G.draftGroup,battAdvice:G.battAdvice,myPools:G.myPools,foundPool:G.foundPool,setPoolFee:G.setPoolFee,renamePool:G.renamePool,simsOn:G.simsOn,poolRep:G.poolRep,repParts:G.repParts,rivalPools:G.rivalPools,poolDemand:G.poolDemand,poolProj:G.poolProj,nextTierBond:G.nextTierBond,poolPnl:G.poolPnl,addBond:G.addBond,releaseBond:G.releaseBond,capBinding:G.capBinding,bondFloor:G.bondFloor,topUpBond:G.topUpBond,closePool:G.closePool,
    stepTick:G.stepTick,build:G.build,scrapRig:G.scrapRig,swapWorn:G.swapWorn,expectedDay:G.expectedDay,powerRateDay:G.powerRateDay,
    SLOT_OPTS:G.SLOT_OPTS,rebuildInfo:G.rebuildInfo,startRebuild:G.startRebuild,applyRebuild:G.applyRebuild,toggleRig:G.toggleRig,setRigGroup:G.setRigGroup,groupOf:G.groupOf,groupHash:G.groupHash,groupRigs:G.groupRigs,setGroupChain:G.setGroupChain,setGroupPool:G.setGroupPool,addGroup:G.addGroup,dropGroup:G.dropGroup,renameGroup:G.renameGroup,newSite:G.newSite,addSitePart:G.addSitePart,chooseFab:G.chooseFab,rush:G.rush,rushCost:G.rushCost,rushRig:G.rushRig,rushRigCost:G.rushRigCost,upgradeShell:G.upgradeShell,renameSite:G.renameSite,renameRig:G.renameRig,decommissionSite:G.decommissionSite,sell:G.sell,buy:G.buy,fleetMove:G.fleetMove,fleetMoveInfo:G.fleetMoveInfo,draftSpec:G.draftSpec,fleetSpecInfo:G.fleetSpecInfo,fleetToSpec:G.fleetToSpec,dripCost:G.dripCost,dripWorst:G.dripWorst,setDrip:G.setDrip,toggleHold:G.toggleHold,MILESTONES,RANKS,fleetWorn:G.fleetWorn,rigWorn:G.rigWorn,fleetRepair:G.fleetRepair,fleetRefitInfo:G.fleetRefitInfo,fleetRefit:G.fleetRefit,onboardingStep:G.onboardingStep,dismissOnboarding:G.dismissOnboarding,showChainsNudge:G.showChainsNudge,dismissChainsNudge:G.dismissChainsNudge,TOUR_SLIDES:G.TOUR_SLIDES,showTour:G.showTour,dismissTour:G.dismissTour,restartTour:G.restartTour,saveNow,loadSave,wipeSave,exportSave,importSave,creditAway};

  Object.assign(G, {advance,creditAway,exportSave,importSave,loadSave,resetState,saveNow,wipeSave,wiped});
}
