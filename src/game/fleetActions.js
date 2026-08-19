import { PART } from '../data/hardware.js';
import { fmt } from '../utils/format.js';

/* 12-fleet-actions.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installFleetActions(G){
  /* ---- fleet actions ---- */
  /* Every fleet action takes a scope: one site, or everywhere. Passing a site
     id narrows it; passing nothing means the whole operation. */
  /* Scope for every fleet action. One site (id), the whole farm (null), or —
     since v64 — an explicit list of rig ids. Because every fleet function
     routes through this one, selection came for free everywhere the moment
     this understood arrays: thread 6 was a UI problem, not a model one. */
  const fleetRigs = scope => Array.isArray(scope)
    ? G.s.rigs.filter(r=>scope.includes(r.id))
    : G.s.rigs.filter(r=>scope==null||r.site===scope);
  /* One rig's worn-card count and replacement bill. The single-rig detail sheet
     and the fleet-wide sweep below are the same question asked of a different
     number of rigs, so both ask it here — repair pricing has one definition. */
  const rigWorn = (r,th) => {
    const w=r.units.filter(u=>u.w>=th);
    return { n:w.length, cost:w.reduce((a,u)=>a+PART(u.p).price,0) };
  };
  const fleetWorn = (th,fid) => {
    let n=0, cost=0, rigs=0;
    for(const r of fleetRigs(fid)){ if(r.building>0) continue;
      const w=rigWorn(r,th);
      if(w.n){ rigs++; n+=w.n; cost+=w.cost; } }
    return {rigs,n,cost};
  };
  function fleetRepair(th,fid){
    const info=fleetWorn(th,fid); if(!info.n||G.s.cash<info.cost) return;
    for(const r of fleetRigs(fid)){ if(r.building>0) continue;
      if(rigWorn(r,th).n) G.swapWorn(r.id,th); }
  }
  const fleetDraft=(r,id)=>({ frame:r.frame, mobo:r.mobo, cool:r.cool, psu:r.psu,
    unit:id, n:r.units.length });
  const fleetRefitInfo = (id,fid) => {
    let rigs=0, cost=0;
    for(const r of fleetRigs(fid)){ if(r.building>0) continue;
      const info=G.rebuildInfo(r,fleetDraft(r,id));
      if(info.ok){ rigs++; cost+=Math.max(0,info.net); } }
    return {rigs,cost};
  };
  function fleetRefit(id,fid){                   // each rig goes DOWN for its own rebuild
    for(const r of fleetRigs(fid)){ if(r.building>0) continue;
      const d=fleetDraft(r,id), info=G.rebuildInfo(r,d);
      if(info.ok) G.applyRebuildTo(r,d,info); }
  }
  /* Refitting cards keeps whatever chassis each rig happens to have, so a farm
     that grew in stages stays mixed forever. This rebuilds every rig in scope to
     ONE full specification — frame, board, cooling, supply, card and count —
     regardless of what is installed now. The target is the Build tab's draft,
     so there is one place to design a rig rather than two. */
  const draftSpec = () => ({ frame:G.s.draft.frame, mobo:G.s.draft.mobo, cool:G.s.draft.cool,
    psu:G.s.draft.psu, unit:G.s.draft.unit, n:G.s.draft.n });
  const fleetSpecInfo = (d,fid) => {
    let rigs=0, cost=0, already=0, blocked=0, why=null;
    for(const r of fleetRigs(fid)){
      if(r.building>0) continue;
      const info=G.rebuildInfo(r,d);
      if(!info.changed){ already++; continue; }
      if(info.ok){ rigs++; cost+=Math.max(0,info.net); }
      else { blocked++; if(!why){ const bad=info.checks.find(c=>!c.ok); if(bad) why=bad.label; } }
    }
    return {rigs,cost,already,blocked,why};
  };
  function fleetToSpec(d,fid){
    const info=fleetSpecInfo(d,fid);
    if(!info.rigs || G.s.cash<info.cost) return;       // quote the whole job or do none of it
    for(const r of fleetRigs(fid)){
      if(r.building>0) continue;
      const i2=G.rebuildInfo(r,d);
      if(i2.ok && i2.changed) G.applyRebuildTo(r,d,i2);
    }
    G.say('sys','Rebuilding '+info.rigs+' rig'+(info.rigs===1?'':'s')+' to one specification',
      '-'+fmt.usd(info.cost));
  }
  /* Bulk group move. Assignment never forfeits anything (the window belongs to
     the group, not the rig), so this is safe to do to a whole farm at once. */
  const fleetMoveInfo = (gid,fid) => {
    const rigs=fleetRigs(fid).filter(r=>r.group!==gid);
    return { rigs:rigs.length, hash:rigs.reduce((a,r)=>a+G.rigHash(r),0) };
  };
  function fleetMove(gid,fid){
    if(!G.s.groups.some(gr=>gr.id===gid)) return;
    let moved=0;
    for(const r of fleetRigs(fid)) if(r.group!==gid){ r.group=gid; moved++; }
    if(moved) G.say('sys','Moved '+moved+' rig'+(moved===1?'':'s')+' to '
      +G.s.groups.find(gr=>gr.id===gid).name);
  }


  Object.assign(G, {draftSpec,fleetDraft,fleetMove,fleetMoveInfo,fleetRefit,fleetRefitInfo,fleetRepair,fleetRigs,fleetSpecInfo,fleetToSpec,fleetWorn,rigWorn});
}
