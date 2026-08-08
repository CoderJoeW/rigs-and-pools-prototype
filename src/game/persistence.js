import { C, TRUST_RAMP, SIM_RATIO, SIM_GROWTH, SIM_CHAINS, RIVAL_PER_CHAIN, RIVAL_NAMES, COVER_DAYS, PPLNS_COVER } from '../data/constants.js';
import { CHAINS } from '../data/chains.js';
import { SHELLS, SOURCES, PLANTS, STORAGE, SITEPART } from '../data/site-parts.js';
import { CARDS, PSUS, PART, RISER } from '../data/hardware.js';
import { MILESTONES, RANKS } from '../data/milestones.js';
import { fmt } from '../utils/format.js';
import { storage } from '../services/storage.js';

/* 13-persistence-and-exports.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installPersistence(G){
  /* ---- persistence ---- */
  let wiped=false;                 // once erased, nothing may write again
  // A second, independent `restoring` flag — the toast-gate in poolMarket.js
  // has its own closure-local copy, so this one only ever guards code within
  // this module. That mirrors the original single-file build: install_x
  // functions are siblings, not nested closures, so a bare (undeclared)
  // `restoring` there never actually reached pop()'s check either.
  let restoring=false;
  async function saveNow(){
    if(wiped) return;
    const mode=await storage.set({ ver:C.SAVE_VER, savedAt:Date.now(), state:G.s });
    G.s.saveInfo = mode==='memory' ? 'not saved — no storage here' : 'saved · '+mode;
  }
  /* Offline catch-up runs the REAL engine in 30-second chunks — solar cycles,
     wear, construction, pool settlement and block windows all simulate — so a
     return is a fast-forward of the same game, not a formula. Capped at one
     real day; the exact-arrival block model keeps chunked time accurate. */
  function advance(seconds){
    const credited=Math.min(seconds, C.OFFLINE_CAP);
    restoring=true;
    let left=credited;
    while(left>0){ const step=Math.min(30,left); G.stepTick(step); left-=step; }
    restoring=false;
    return credited;
  }
  async function loadSave(){
    const data=await storage.get();
    if(!data || data.ver!==C.SAVE_VER) return false;
    return hydrate(data);
  }
  /* Shared by loadSave (from storage) and importSave (from a picked file) —
     a backup is just a save payload that arrived by a different door, so it
     goes through the exact same migration and offline-catch-up path.
     Wrapped whole: a malformed state (hand-edited localStorage, a save from
     a build with a shape this migration doesn't anticipate, a corrupted
     backup file) must never brick the app on load. Falling back to a fresh
     game beats a blank screen — the same choice loadSave already makes for
     a bare version mismatch, just widened to cover mid-migration crashes. */
  function hydrate(data){
    try{ return hydrateUnsafe(data); }
    catch(e){
      restoring=false;
      console.warn('save failed to load, starting fresh:', e.message);
      resetState();
      G.pop('Save could not be read','starting a fresh game','dark',{always:true});
      return false;
    }
  }
  function hydrateUnsafe(data){
    restoring=true;
    Object.assign(G.s, data.state);
    G.s.toast={n:0,text:'',amount:'',cls:''};
    G.s.picker=null; G.s.sitePicker=null; G.s.rebuild=null; G.s.speed=1; G.s.wipeArm=false;
    G.s.unlocked=new Proxy({},{get:()=>true});   // a Proxy cannot survive JSON
    // v30 and earlier: assignment lived on the rig. Synthesize groups from the
    // distinct (chain, pool) combinations and pour each rig's pending into its
    // group, so nothing is lost crossing the version.
    // detect a legacy save by the RIGS, not by groups being absent —
    // Object.assign never deletes keys, so the fresh default group survives
    // a hydrate and would mask the old shape
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
    // v34 and earlier: autoSell was a boolean at a fixed 25%/day. Gate on the
    // LEGACY field, never on the new one — Object.assign leaves the fresh
    // default in place, so `if(!s.drip)` would silently never fire. Third time
    // this trap has appeared (groups v31, gens v27); see §13e.
    if('autoSell' in G.s){
      G.s.drip={ on:!!G.s.autoSell, frac:0.25, hours:24 }; G.s.dripAt=0;
      delete G.s.autoSell;
    }
    if(!G.s.drip) G.s.drip={ on:false, frac:0.25, hours:6 };
    if(!G.s.hold) G.s.hold={};
    // A save from before `today.blocks` existed carries a `today` object
    // without it — Object.assign leaves that shape in place, so blocks++
    // runs on undefined (-> NaN) until the next day boundary reinitializes
    // it. Same trap as autoSell/drip above: gate on the field being absent.
    if(G.s.today && typeof G.s.today.blocks!=='number') G.s.today.blocks=0;
    // v40 rebalanced the chain ladder — floors, rewards and network sizes all
    // moved. Bring an older world onto the new ladder rather than stranding it
    // on a chain whose difficulty no longer matches anything.
    for(const c of G.s.chains){
      const base=CHAINS.find(x=>x.id===c.id);
      if(!base || (c.floor===base.floor && c.reward===base.reward)) continue;
      c.floor=base.floor; c.reward=base.reward; c.target=base.target;
      c.mult=base.mult; c.depth=base.depth;
      c.anchor=Math.max(1, SIM_RATIO);
      const mine=G.s.sims.filter(m=>m.chain===c.id);
      const have=mine.reduce((a,m)=>a+m.hash,0);
      const want=SIM_RATIO*base.floor*Math.pow(1+SIM_GROWTH, G.s.t/86400);
      if(have>0 && want>0){ const k=want/have; for(const m of mine) m.hash*=k; }
      c.obs=Math.max(c.floor, want);
    }
    // v43 and earlier had permanent official pools. Retire them, seed a rival
    // field in their place, and move anyone who was pointed at one to solo.
    if(G.s.pools.some(p=>p.owner==='server')){
      const dead=new Set(G.s.pools.filter(p=>p.owner==='server').map(p=>p.id));
      G.s.pools=G.s.pools.filter(p=>p.owner!=='server');
      for(const m of G.s.sims) if(dead.has(m.pool)) m.pool='solo';
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
    G.ensureWeather(); G.ensureGens();      // rigs may hold generation cards; the
    restoring=false;                    // catalogue must exist before first render
    const away=Math.max(0,(Date.now()-data.savedAt)/1000);
    if(away>60 && G.s.rigs.length){
      const cashBefore=G.s.cash, coinsBefore=G.walletUsd.value;
      const credited=advance(away);
      const gain=(G.s.cash-cashBefore)+(G.walletUsd.value-coinsBefore);
      const hrs=(credited/3600);
      G.pop('Welcome back','+'+fmt.usd(Math.max(0,gain))+' while away '+
        (hrs>=1?hrs.toFixed(1)+'h':Math.round(credited/60)+'m')+
        (away>C.OFFLINE_CAP?' (capped at 24h)':''),'grn',{always:true});
      G.say('sys','Away '+fmt.dur(away)+' — '+fmt.dur(credited)+' of progress credited');
    }
    return true;
  }
  /* Erasing has to survive three things that all bit here:
     - `pagehide` fires DURING location.reload(), and its handler called
       saveNow() — which wrote the live state straight back under the key that
       had just been deleted. The wipe looked like it did nothing.
     - location.reload() is unreliable in a sandboxed frame, so a reset that
       depends on it never happens at all.
     - Object.assign cannot clear keys a fresh state does not define (§13e).
     So: latch the kill switch first, delete every key, rebuild state in place,
     and only then attempt a reload as a cosmetic extra. */
  function resetState(){
    const fresh=G.freshState();
    for(const k of Object.keys(G.s)) delete G.s[k];
    Object.assign(G.s, fresh);
    G.liveCards.length=0; G.liveCards.push(...CARDS);   // generation catalogue
    G.livePsus.length=0; G.livePsus.push(...PSUS);
    G.builtGen=0;
    G.lastToast=-1e9;
    for(const k of Object.keys(G.toastSeen)) delete G.toastSeen[k];
    G.say('sys','A spare bedroom, a 1.5 kW outlet and $500');
  }
  /* The payload matches what saveNow() writes to storage exactly, so a
     downloaded backup round-trips through importSave/loadSave identically
     to a real autosave. */
  function exportSave(){
    return JSON.stringify({ ver:C.SAVE_VER, savedAt:Date.now(), state:G.s });
  }
  async function importSave(text){
    let data;
    try{ data=JSON.parse(text); }catch(e){ return false; }
    if(!data || typeof data!=='object' || data.ver!==C.SAVE_VER || !data.state) return false;
    const ok=hydrate(data);
    if(ok) await saveNow();
    return ok;
  }
  async function wipeSave(){
    wiped=true;                    // latch BEFORE any await — pagehide can fire mid-wipe
    await storage.wipe();
    resetState();
    wiped=false;                   // the fresh run is allowed to save again
    await saveNow();
    G.s.saveInfo='erased';           // set AFTER the save, which writes its own chip
    try{ if(typeof location!=='undefined' && location.reload) location.reload(); }catch(e){}
  }

  G.say('sys','A spare bedroom, a 1.5 kW outlet and $500');

  G.__exports={ s:G.s,C,SHELLS,SOURCES,PLANTS,STORAGE,PSUS:G.livePsus,
    RISER,PART,SITEPART,chain:G.chain,poolOf:G.poolOf,active:G.active,price:G.price,revPerMh:G.revPerMh,
    solarFactor:G.solarFactor,ambient:G.ambient,band:G.band,cards:G.cards,battKwh:G.battKwh,battKw:G.battKw,sitePlan:G.sitePlan,srcOut:G.srcOut,siteCapacity:G.siteCapacity,siteCooling:G.siteCooling,sitePlantW:G.sitePlantW,siteHeat:G.siteHeat,throttleOf:G.throttleOf,siteSlots:G.siteSlots,siteRigs:G.siteRigs,siteDemand:G.siteDemand,siteTemp:G.siteTemp,
    siteCostPerHour:G.siteCostPerHour,rigLive:G.rigLive,rigHash:G.rigHash,rigWallW:G.rigWallW,rigNet:G.rigNet,totalHash:G.totalHash,totalCapacity:G.totalCapacity,headroom:G.headroom,binding:G.binding,effMhw:G.effMhw,
    revenueDay:G.revenueDay,powerDay:G.powerDay,netDay:G.netDay,walletUsd:G.walletUsd,runway:G.runway,lifetimeNet:G.lifetimeNet,poolEarned:G.poolEarned,myHash:G.myHash,diffOf:G.diffOf,mttb:G.mttb,
    dp:G.dp,checks:G.checks,canBuild:G.canBuild,draftEff:G.draftEff,buildTime:G.buildTime,unitEcon:G.unitEcon,draftExpected:G.draftExpected,generatePreset:G.generatePreset,
    blockValue:G.blockValue,bondReq:G.bondReq,poolTrust:G.poolTrust,TRUST_RAMP,poolCapLimit:G.poolCapLimit,poolHash:G.poolHash,poolProfit:G.poolProfit,withdrawProfit:G.withdrawProfit,
    battFirm:G.battFirm,flowOf:G.flowOf,chainHash:G.chainHash,easeOf:G.easeOf,blockETA:G.blockETA,blockProg:G.blockProg,winChance:G.winChance,fundOf:G.fundOf,groupAdvice:G.groupAdvice,chainCeiling:G.chainCeiling,idleCashAdvice:G.idleCashAdvice,draftGroup:G.draftGroup,battAdvice:G.battAdvice,myPools:G.myPools,foundPool:G.foundPool,setPoolFee:G.setPoolFee,renamePool:G.renamePool,simsOn:G.simsOn,poolRep:G.poolRep,repParts:G.repParts,rivalPools:G.rivalPools,poolDemand:G.poolDemand,poolProj:G.poolProj,nextTierBond:G.nextTierBond,poolPnl:G.poolPnl,addBond:G.addBond,releaseBond:G.releaseBond,capBinding:G.capBinding,bondFloor:G.bondFloor,topUpBond:G.topUpBond,closePool:G.closePool,
    stepTick:G.stepTick,build:G.build,scrapRig:G.scrapRig,swapWorn:G.swapWorn,expectedDay:G.expectedDay,powerRateDay:G.powerRateDay,
    SLOT_OPTS:G.SLOT_OPTS,rebuildInfo:G.rebuildInfo,startRebuild:G.startRebuild,applyRebuild:G.applyRebuild,toggleRig:G.toggleRig,setRigGroup:G.setRigGroup,groupOf:G.groupOf,groupHash:G.groupHash,groupRigs:G.groupRigs,setGroupChain:G.setGroupChain,setGroupPool:G.setGroupPool,addGroup:G.addGroup,dropGroup:G.dropGroup,renameGroup:G.renameGroup,newSite:G.newSite,addSitePart:G.addSitePart,rush:G.rush,rushCost:G.rushCost,upgradeShell:G.upgradeShell,renameSite:G.renameSite,renameRig:G.renameRig,decommissionSite:G.decommissionSite,sell:G.sell,buy:G.buy,fleetMove:G.fleetMove,fleetMoveInfo:G.fleetMoveInfo,draftSpec:G.draftSpec,fleetSpecInfo:G.fleetSpecInfo,fleetToSpec:G.fleetToSpec,dripCost:G.dripCost,dripWorst:G.dripWorst,setDrip:G.setDrip,toggleHold:G.toggleHold,MILESTONES,RANKS,fleetWorn:G.fleetWorn,fleetRepair:G.fleetRepair,fleetRefitInfo:G.fleetRefitInfo,fleetRefit:G.fleetRefit,onboardingStep:G.onboardingStep,dismissOnboarding:G.dismissOnboarding,saveNow,loadSave,wipeSave,exportSave,importSave};

  Object.assign(G, {advance,exportSave,importSave,loadSave,resetState,saveNow,wipeSave,wiped});
}
