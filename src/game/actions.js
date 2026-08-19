import { C } from '../data/constants.js';
import { FRAMES, MOBOS, COOLERS, PART, RISER } from '../data/hardware.js';
import { fmt } from '../utils/format.js';
import { wearRate } from '../utils/random.js';

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
    const n=Math.min(want, G.maxBuildQty());
    if(n<1) return;
    const d=G.s.draft, p=G.dp.value;
    const total=p.cost*n;
    G.s.cash-=total; G.s.spent+=total;
    const firstId=G.s.nextId;
    for(let k=0;k<n;k++){
      const units=[]; for(let i=0;i<d.n;i++) units.push({p:d.unit,w:0,wr:wearRate()});
      G.s.rigs.push({ id:G.s.nextId, kind:d.kind, frame:d.frame, mobo:d.mobo, psu:d.psu, cool:d.cool,
        ctrl:d.ctrl, units, risers:d.kind==='gpu'?d.n:0, refurb:0,
        site:G.s.activeSite, group:G.s.groups[0].id, tune:0, on:true, building:G.buildTime.value,
        open:false, name:'Rig '+G.s.nextId });
      G.s.nextId++;
    }
    G.s.tab='rigs';                                  // and takes you to where it lives
    if(n===1){
      G.say('sys','Ordered parts for Rig '+firstId,'-'+fmt.usd(total),undefined,undefined,-total);
    } else {
      G.say('sys','Ordered parts for '+n+' rigs (#'+firstId+'–#'+(G.s.nextId-1)+')',
        '-'+fmt.usd(total),undefined,undefined,-total);
    }
  }
  function renameRig(id,name){
    const r=G.s.rigs.find(x=>x.id===id); if(!r) return;
    const n=(name||'').trim().slice(0,24);
    if(n) r.name=n;
  }
  function scrapRig(id){
    const r=G.s.rigs.find(x=>x.id===id); if(!r) return;
    const back=G.rigSalvage(r); G.s.cash+=back; G.s.rigs=G.s.rigs.filter(x=>x.id!==id);
    G.say('sys','Stripped '+r.name+' for parts','+'+fmt.usd(back),undefined,undefined,back);
  }
  function swapWorn(id,th){
    const r=G.s.rigs.find(x=>x.id===id); if(!r) return;
    const {n,cost}=G.rigWorn(r,th);          // one definition of worn, shared with the fleet sweep
    if(!n||G.s.cash<cost) return;
    G.s.cash-=cost; G.s.spent+=cost; G.s.repairs=(G.s.repairs||0)+n; r.deadNote=false;
    for(const u of r.units) if(u.w>=th) u.w=0;
    r.refurb++;
    G.say('sys','Replaced '+n+' card'+(n>1?'s':'')+' in '+r.name,'-'+fmt.usd(cost),undefined,undefined,-cost);
  }
  /* ---- rebuild planner ----
     A retrofit is a REBUILD: stage any set of changes to one rig, confirm the
     combined bill once, and the rig goes down once for the assembly time. The
     five instant swaps this replaces made retrofitting strictly free of the
     cost that makes it a decision. */
  const SLOT_OPTS={ frame:FRAMES, mobo:MOBOS, cool:COOLERS, psu:G.livePsus };
  const rebuildTime = n => C.BUILD_BASE*(0.5+0.1*n);   // wired already: a little faster than new
  function rebuildInfo(r,d){
    const F=PART(d.frame),M=PART(d.mobo),X=PART(d.cool),P=PART(d.psu),U=PART(d.unit);
    const lim=Math.min(F.slots,M.pcie);
    let buy=0, credit=0;
    for(const slot of ['frame','mobo','cool','psu']) if(d[slot]!==r[slot]){
      buy+=PART(d[slot]).price; credit+=Math.round(PART(r[slot]).price*0.5); }
    const typeChanged=d.unit!==r.units[0].p;
    if(typeChanged){
      buy+=d.n*U.price;
      credit+=Math.round(r.units.reduce((a,u)=>a+PART(u.p).price*Math.max(0,1-u.w)*0.5,0));
    } else if(d.n>r.units.length) buy+=(d.n-r.units.length)*U.price;
    else if(d.n<r.units.length){
      const drop=[...r.units].sort((a,b)=>b.w-a.w).slice(0,r.units.length-d.n);
      credit+=Math.round(drop.reduce((a,u)=>a+PART(u.p).price*Math.max(0,1-u.w)*0.5,0));
    }
    if(d.n>r.risers) buy+=(d.n-r.risers)*RISER.price;
    else if(d.n<r.risers) credit+=Math.round((r.risers-d.n)*RISER.price*0.5);
    const net=buy-credit;
    const core=F.w+M.w+X.w+d.n*RISER.w+d.n*U.w;
    const wall=core/P.eff;
    const f=G.site(r.site);
    const checks=[
      { ok:d.n>=1&&d.n<=lim, label:d.n+' cards into a limit of '+lim,
        fix:'The smaller of the frame and the board sets it.' },
      { ok:d.n*U.conn<=P.conn, label:(d.n*U.conn)+' PCIe connectors, supply has '+P.conn,
        fix:G.psuWithConn(d.n*U.conn)+' would fit.' },
      { ok:core<=G.psuUsableW(P), label:fmt.w(core)+' draw against '+fmt.w(G.psuUsableW(P))+' usable',
        fix:G.psuCarrying(core)+' would carry it.' },
      { ok:(()=>{
          const oldHeat=G.rigLive(r)?G.rigCoreW(r)/G.rigAir(r):0;
          const newHeat=core/Math.max(0.01, G.rigAir({kind:r.kind,frame:d.frame,cool:d.cool}));
          const coolDelta=G.sitePlantW(f,newHeat-oldHeat)-G.sitePlantW(f);
          return G.siteDemand(f)-G.rigWallW(r)+wall+coolDelta<=G.siteCapacity(f)+G.battFirm(f);
        })(),
        label:'Power at '+f.name+' when it comes back',
        fix:'Install another source at this site.' },
      { ok:net<=0||G.s.cash>=net,
        label:(net>=0?'Nets to ':'Returns ')+fmt.usd(Math.abs(net))+', you hold '+fmt.usd(G.s.cash),
        fix:'Short '+fmt.usd(net-G.s.cash)+'.' },
    ];
    const changed=buy>0||credit>0;
    return { buy,credit,net,core,wall,lim,checks, time:rebuildTime(d.n),
      ok:changed&&checks.every(c=>c.ok), changed, hashNew:d.n*U.mh };
  }
  const startRebuild = r => { G.s.rebuild={ rig:r.id, picker:null,
    draft:{ frame:r.frame, mobo:r.mobo, cool:r.cool, psu:r.psu,
            unit:r.units[0].p, n:r.units.length } }; };
  function applyRebuildTo(r,d,info){
    if(d.unit!==r.units[0].p) r.units=Array.from({length:d.n},()=>({p:d.unit,w:0}));
    else if(d.n>r.units.length){ while(r.units.length<d.n) r.units.push({p:d.unit,w:0}); }
    else if(d.n<r.units.length){ r.units.sort((a,b)=>a.w-b.w); r.units.length=d.n; }
    r.frame=d.frame; r.mobo=d.mobo; r.cool=d.cool; r.psu=d.psu; r.risers=d.n;
    G.s.cash-=info.net; if(info.net>0) G.s.spent+=info.net;
    r.refurb++; r.on=true; r.cut=null; r.deadNote=false; r.building=info.time; r.rb=1; G.s.rebuilds=(G.s.rebuilds||0)+1;
    G.say('sys','Rebuilding '+r.name+' — down for '+fmt.dur(info.time),
      info.net>=0?'-'+fmt.usd(info.net):'+'+fmt.usd(-info.net));
  }
  function applyRebuild(){
    const rb=G.s.rebuild; if(!rb) return;
    const r=G.s.rigs.find(x=>x.id===rb.rig); if(!r||r.building>0) return;
    const info=rebuildInfo(r,rb.draft);
    if(!info.ok) return;
    applyRebuildTo(r,rb.draft,info);
    G.s.rebuild=null;
  }
  const toggleRig = id => { const r=G.s.rigs.find(x=>x.id===id);
    if(r&&r.building<=0){ r.on=!r.on; r.cut=null; } };   // never touches the group's window
  const setRigGroup = (r,gid)=>{ r.group=gid; };



  Object.assign(G, {SLOT_OPTS,applyRebuild,applyRebuildTo,build,rebuildInfo,rebuildTime,renameRig,scrapRig,setRigGroup,startRebuild,swapWorn,toggleRig});
}
