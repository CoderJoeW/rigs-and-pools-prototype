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
    ? G.s.rigs.filter(rig=>scope.includes(rig.id))
    : G.s.rigs.filter(rig=>scope==null||rig.site===scope);
  /* One rig's worn-card count and replacement bill. The single-rig detail sheet
     and the fleet-wide sweep below are the same question asked of a different
     number of rigs, so both ask it here — repair pricing has one definition. */
  const rigWorn = (rig,threshold) => {
    const wornUnits=rig.units.filter(unit=>unit.w>=threshold);
    return { n:wornUnits.length, cost:wornUnits.reduce((sum,unit)=>sum+PART(unit.p).price,0) };
  };
  const fleetWorn = (threshold,scope) => {
    let wornCount=0, cost=0, rigs=0;
    for(const rig of fleetRigs(scope)){ if(rig.building>0) continue;
      const worn=rigWorn(rig,threshold);
      if(worn.n){ rigs++; wornCount+=worn.n; cost+=worn.cost; } }
    return {rigs,n:wornCount,cost};
  };
  function fleetRepair(threshold,scope){
    const info=fleetWorn(threshold,scope); if(!info.n||G.s.cash<info.cost) return;
    for(const rig of fleetRigs(scope)){ if(rig.building>0) continue;
      if(rigWorn(rig,threshold).n) G.swapWorn(rig.id,threshold); }
  }
  const fleetDraft=(rig,unitId)=>({ frame:rig.frame, mobo:rig.mobo, cool:rig.cool, psu:rig.psu,
    unit:unitId, n:rig.units.length });
  const fleetRefitInfo = (unitId,scope) => {
    let rigs=0, cost=0;
    for(const rig of fleetRigs(scope)){ if(rig.building>0) continue;
      const info=G.rebuildInfo(rig,fleetDraft(rig,unitId));
      if(info.ok){ rigs++; cost+=Math.max(0,info.net); } }
    return {rigs,cost};
  };
  function fleetRefit(unitId,scope){                   // each rig goes DOWN for its own rebuild
    for(const rig of fleetRigs(scope)){ if(rig.building>0) continue;
      const draft=fleetDraft(rig,unitId), info=G.rebuildInfo(rig,draft);
      if(info.ok) G.applyRebuildTo(rig,draft,info); }
  }
  /* Refitting cards keeps whatever chassis each rig happens to have, so a farm
     that grew in stages stays mixed forever. This rebuilds every rig in scope to
     ONE full specification — frame, board, cooling, supply, card and count —
     regardless of what is installed now. The target is the Build tab's draft,
     so there is one place to design a rig rather than two. */
  const draftSpec = () => ({ frame:G.s.draft.frame, mobo:G.s.draft.mobo, cool:G.s.draft.cool,
    psu:G.s.draft.psu, unit:G.s.draft.unit, n:G.s.draft.n });
  const fleetSpecInfo = (draft,scope) => {
    let rigs=0, cost=0, already=0, blocked=0, why=null;
    for(const rig of fleetRigs(scope)){
      if(rig.building>0) continue;
      const info=G.rebuildInfo(rig,draft);
      if(!info.changed){ already++; continue; }
      if(info.ok){ rigs++; cost+=Math.max(0,info.net); }
      else { blocked++; if(!why){ const failedCheck=info.checks.find(check=>!check.ok); if(failedCheck) why=failedCheck.label; } }
    }
    return {rigs,cost,already,blocked,why};
  };
  function fleetToSpec(draft,scope){
    const info=fleetSpecInfo(draft,scope);
    if(!info.rigs || G.s.cash<info.cost) return;       // quote the whole job or do none of it
    for(const rig of fleetRigs(scope)){
      if(rig.building>0) continue;
      const updatedInfo=G.rebuildInfo(rig,draft);
      if(updatedInfo.ok && updatedInfo.changed) G.applyRebuildTo(rig,draft,updatedInfo);
    }
    G.say('sys','Rebuilding '+info.rigs+' rig'+(info.rigs===1?'':'s')+' to one specification',
      '-'+fmt.usd(info.cost));
  }
  /* Bulk group move. Assignment never forfeits anything (the window belongs to
     the group, not the rig), so this is safe to do to a whole farm at once. */
  const fleetMoveInfo = (groupId,scope) => {
    const rigsToMove=fleetRigs(scope).filter(rig=>rig.group!==groupId);
    return { rigs:rigsToMove.length, hash:rigsToMove.reduce((sum,rig)=>sum+G.rigHash(rig),0) };
  };
  function fleetMove(groupId,scope){
    if(!G.s.groups.some(group=>group.id===groupId)) return;
    let moved=0;
    for(const rig of fleetRigs(scope)) if(rig.group!==groupId){ rig.group=groupId; moved++; }
    if(moved) G.say('sys','Moved '+moved+' rig'+(moved===1?'':'s')+' to '
      +G.s.groups.find(group=>group.id===groupId).name);
  }


  Object.assign(G, {draftSpec,fleetDraft,fleetMove,fleetMoveInfo,fleetRefit,fleetRefitInfo,fleetRepair,fleetRigs,fleetSpecInfo,fleetToSpec,fleetWorn,rigWorn});
}
