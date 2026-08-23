import { C } from '../data/constants.js';
import { FRAMES, MOBOS, COOLERS, PART, RISER, gpuCoreW } from '../data/hardware.js';
import { fmt } from '../utils/format.js';
import { wearRate } from '../utils/random.js';
import { trimName } from './state.js';

/* 09-actions.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installActions(G){
  /* ---- actions ---- */
  /* Bulk order: qty copies of the current draft, clamped to floor space,
     cash, and power headroom (including cooling). Assembly is parallel —
     every ordered rig starts building at once for buildTime, matching the
     design rule that assembly is small friction, not a throughput queue. */
  function build(qty=1){
    if(!G.canBuild.value) return;
    const want=Math.max(1, Math.floor(Number(qty)||1));
    const qtyToBuild=Math.min(want, G.maxBuildQty());
    if(qtyToBuild<1) return;
    const draft=G.s.draft, draftPricing=G.dp.value;
    const total=draftPricing.cost*qtyToBuild;
    G.spend(total);
    const firstId=G.s.nextId;
    for(let k=0;k<qtyToBuild;k++){
      const units=[]; for(let i=0;i<draft.n;i++) units.push({p:draft.unit,w:0,wr:wearRate()});
      G.s.rigs.push({ id:G.s.nextId, kind:draft.kind, frame:draft.frame, mobo:draft.mobo, psu:draft.psu, cool:draft.cool,
        ctrl:draft.ctrl, units, risers:draft.kind==='gpu'?draft.n:0, refurb:0,
        site:G.s.activeSite, group:G.s.groups[0].id, tune:0, on:true, building:G.buildTime.value,
        open:false, name:'Rig '+G.s.nextId });
      G.s.nextId++;
    }
    G.s.tab='rigs';                                  // and takes you to where it lives
    if(qtyToBuild===1){
      G.say('sys','Ordered parts for Rig '+firstId,'-'+fmt.usd(total),undefined,undefined,-total);
    } else {
      G.say('sys','Ordered parts for '+qtyToBuild+' rigs (#'+firstId+'–#'+(G.s.nextId-1)+')',
        '-'+fmt.usd(total),undefined,undefined,-total);
    }
  }
  function renameRig(id,name){
    const rig=G.rig(id); if(!rig) return;
    const trimmedName=trimName(name);
    if(trimmedName) rig.name=trimmedName;
  }
  function scrapRig(id){
    const rig=G.rig(id); if(!rig) return;
    const back=G.rigSalvage(rig); G.s.cash+=back; G.s.rigs=G.s.rigs.filter(other=>other.id!==id);
    G.say('sys','Stripped '+rig.name+' for parts','+'+fmt.usd(back),undefined,undefined,back);
  }
  function swapWorn(id,th){
    const rig=G.rig(id); if(!rig) return;
    const {n:wornCount,cost}=G.rigWorn(rig,th);          // one definition of worn, shared with the fleet sweep
    if(!wornCount||G.s.cash<cost) return;
    G.spend(cost); G.s.repairs=(G.s.repairs||0)+wornCount; rig.deadNote=false;
    for(const unit of rig.units) if(unit.w>=th) unit.w=0;
    rig.refurb++;
    G.say('sys','Replaced '+wornCount+' card'+(wornCount>1?'s':'')+' in '+rig.name,'-'+fmt.usd(cost),undefined,undefined,-cost);
  }
  /* ---- rebuild planner ----
     A retrofit is a REBUILD: stage any set of changes to one rig, confirm the
     combined bill once, and the rig goes down once for the assembly time. The
     five instant swaps this replaces made retrofitting strictly free of the
     cost that makes it a decision. */
  const SLOT_OPTS={ frame:FRAMES, mobo:MOBOS, cool:COOLERS, psu:G.livePsus };
  const rebuildTime = cardCount => C.BUILD_BASE*(0.5+0.1*cardCount);   // wired already: a little faster than new
  function rebuildInfo(rig,draft){
    const framePart=PART(draft.frame),moboPart=PART(draft.mobo),coolPart=PART(draft.cool),psuPart=PART(draft.psu),unitPart=PART(draft.unit);
    const lim=Math.min(framePart.slots,moboPart.pcie);
    let buy=0, credit=0;
    for(const slot of ['frame','mobo','cool','psu']) if(draft[slot]!==rig[slot]){
      buy+=PART(draft[slot]).price; credit+=Math.round(PART(rig[slot]).price*0.5); }
    const typeChanged=draft.unit!==rig.units[0].p;
    if(typeChanged){
      buy+=draft.n*unitPart.price;
      credit+=Math.round(rig.units.reduce((sum,unit)=>sum+PART(unit.p).price*Math.max(0,1-unit.w)*0.5,0));
    } else if(draft.n>rig.units.length) buy+=(draft.n-rig.units.length)*unitPart.price;
    else if(draft.n<rig.units.length){
      const drop=[...rig.units].sort((unitA,unitB)=>unitB.w-unitA.w).slice(0,rig.units.length-draft.n);
      credit+=Math.round(drop.reduce((sum,unit)=>sum+PART(unit.p).price*Math.max(0,1-unit.w)*0.5,0));
    }
    if(draft.n>rig.risers) buy+=(draft.n-rig.risers)*RISER.price;
    else if(draft.n<rig.risers) credit+=Math.round((rig.risers-draft.n)*RISER.price*0.5);
    const net=buy-credit;
    const core=gpuCoreW(framePart,moboPart,coolPart,unitPart,draft.n);
    const wall=core/psuPart.eff;
    const site=G.site(rig.site);
    const checks=[
      { ok:draft.n>=1&&draft.n<=lim, label:draft.n+' cards into a limit of '+lim,
        fix:'The smaller of the frame and the board sets it.' },
      { ok:draft.n*unitPart.conn<=psuPart.conn, label:(draft.n*unitPart.conn)+' PCIe connectors, supply has '+psuPart.conn,
        fix:G.psuWithConn(draft.n*unitPart.conn)+' would fit.' },
      { ok:core<=G.psuUsableW(psuPart), label:fmt.w(core)+' draw against '+fmt.w(G.psuUsableW(psuPart))+' usable',
        fix:G.psuCarrying(core)+' would carry it.' },
      { ok:(()=>{
          const oldHeat=G.rigLive(rig)?G.rigCoreW(rig)/G.rigAir(rig):0;
          const newHeat=core/Math.max(0.01, G.rigAir({kind:rig.kind,frame:draft.frame,cool:draft.cool}));
          const coolDelta=G.sitePlantW(site,newHeat-oldHeat)-G.sitePlantW(site);
          return G.siteDemand(site)-G.rigWallW(rig)+wall+coolDelta<=G.siteCapacity(site)+G.battFirm(site);
        })(),
        label:'Power at '+site.name+' when it comes back',
        fix:'Install another source at this site.' },
      { ok:net<=0||G.s.cash>=net,
        label:(net>=0?'Nets to ':'Returns ')+fmt.usd(Math.abs(net))+', you hold '+fmt.usd(G.s.cash),
        fix:'Short '+fmt.usd(net-G.s.cash)+'.' },
    ];
    const changed=buy>0||credit>0;
    return { buy,credit,net,core,wall,lim,checks, time:rebuildTime(draft.n),
      ok:changed&&checks.every(check=>check.ok), changed, hashNew:draft.n*unitPart.mh };
  }
  const startRebuild = rig => { G.s.rebuild={ rig:rig.id, picker:null,
    draft:{ frame:rig.frame, mobo:rig.mobo, cool:rig.cool, psu:rig.psu,
            unit:rig.units[0].p, n:rig.units.length } }; };
  function applyRebuildTo(rig,draft,info){
    if(draft.unit!==rig.units[0].p) rig.units=Array.from({length:draft.n},()=>({p:draft.unit,w:0}));
    else if(draft.n>rig.units.length){ while(rig.units.length<draft.n) rig.units.push({p:draft.unit,w:0}); }
    else if(draft.n<rig.units.length){ rig.units.sort((unitA,unitB)=>unitA.w-unitB.w); rig.units.length=draft.n; }
    rig.frame=draft.frame; rig.mobo=draft.mobo; rig.cool=draft.cool; rig.psu=draft.psu; rig.risers=draft.n;
    G.s.cash-=info.net; if(info.net>0) G.s.spent+=info.net;
    rig.refurb++; rig.on=true; rig.cut=null; rig.deadNote=false; rig.building=info.time; rig.rb=1; G.s.rebuilds=(G.s.rebuilds||0)+1;
    G.say('sys','Rebuilding '+rig.name+' — down for '+fmt.dur(info.time),
      info.net>=0?'-'+fmt.usd(info.net):'+'+fmt.usd(-info.net));
  }
  function applyRebuild(){
    const rebuild=G.s.rebuild; if(!rebuild) return;
    const rig=G.rig(rebuild.rig); if(!rig||rig.building>0) return;
    const info=rebuildInfo(rig,rebuild.draft);
    if(!info.ok) return;
    applyRebuildTo(rig,rebuild.draft,info);
    G.s.rebuild=null;
  }
  const toggleRig = id => { const rig=G.rig(id);
    if(rig&&rig.building<=0){ rig.on=!rig.on; rig.cut=null; } };   // never touches the group's window
  const setRigGroup = (rig,groupId)=>{ rig.group=groupId; };

  /* Pay to finish a rig's assembly or retrofit early — the same trade the
     site construction queue already offers (sites.js: rush/rushCost), on
     the same $/hour rate. `building` is real SECONDS rather than the
     queue's hours, so the rate is applied to the hour-equivalent. Setting
     `building` to a hair above zero rather than 0 lets the next tick run its
     own completion path (the 'assembled'/'rebuilt' message, r.rb reset) —
     one place that finishes a rig, whether it got there by waiting or paying. */
  const rushRigCost = rig => Math.ceil(rig.building/3600*C.RUSH_PER_HOUR);
  function rushRig(id){
    const rig=G.rig(id); if(!rig||rig.building<=0) return;
    const cost=rushRigCost(rig); if(G.s.cash<cost) return;
    G.spend(cost); rig.building=0.0001;
    G.say('sys','Paid to rush '+rig.name,'-'+fmt.usd(cost),undefined,undefined,-cost);
  }

  Object.assign(G, {SLOT_OPTS,applyRebuild,applyRebuildTo,build,rebuildInfo,rebuildTime,renameRig,rushRig,rushRigCost,scrapRig,setRigGroup,startRebuild,swapWorn,toggleRig});
}
