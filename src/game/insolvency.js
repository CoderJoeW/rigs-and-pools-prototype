import { jobPart } from '../data/site-parts.js';
import { PART, RISER } from '../data/hardware.js';
import { fmt } from '../utils/format.js';

// Installed into the shared context G — docs/implementation-notes.md#shared-context-g-module-pattern.
export function installInsolvency(G){
  function rigSalvage(r){
    const ch = r.kind==='gpu'
      ? PART(r.frame).price+PART(r.mobo).price+r.risers*RISER.price : PART(r.ctrl).price;
    return Math.round(ch*0.4+PART(r.psu).price*0.5+(r.cool?PART(r.cool).price*0.4:0)
      + r.units.reduce((a,u)=>a+PART(u.p).price*Math.max(0,1-u.w)*0.6,0));
  }
  // Floor rig spec/cost, one source of truth for both: docs/implementation-notes.md#insolvency-floor-rig-spec-srcgameinsolvencyjs.
  const FLOOR_RIG = Object.freeze({ kind:'gpu', frame:'f2', mobo:'m2', psu:'p450',
    cool:'x0', unit:'c1', n:1 });
  const FLOOR_COST = PART(FLOOR_RIG.frame).price + PART(FLOOR_RIG.mobo).price
    + PART(FLOOR_RIG.psu).price + PART(FLOOR_RIG.cool).price
    + FLOOR_RIG.n * (PART(FLOOR_RIG.unit).price + RISER.price);
  // Escalating liquidation, never a dead end (worst earner shed before the farm dies): design-spec.md §6c.
  function insolvency(){
    G.s.cash=0;
    const live=G.s.rigs.filter(G.rigLive);
    // Never take the last machine — a fully dark farm can never pay its way back.
    if(live.length===1){
      if(!G.s.brokeNote){ G.s.brokeNote=1;
        G.say('bad','Running on your last rig — the bill is outrunning the farm'); }
      return;
    }
    if(live.length){
      let worst=live[0];
      for(const r of live) if(G.rigNet(r)<G.rigNet(worst)) worst=r;
      worst.on=false; worst.cut='broke';
      G.say('bad','Cannot cover the bill — '+worst.name+' powered down');
      G.pop('Out of cash',worst.name+' shut down','dark',{always:true});
      return;
    }
    for(const f of G.s.sites){
      if(f.queue.length){ const j=f.queue.pop();
        G.s.cash+=Math.round(jobPart(j).price*0.5);
        G.say('bad','Cancelled construction of '+jobPart(j).name+' at '+f.name); return; }
    }
    if(G.s.rigs.length){
      let worst=G.s.rigs[0];
      for(const r of G.s.rigs) if(rigSalvage(r)<rigSalvage(worst)) worst=r;
      const back=rigSalvage(worst); G.s.cash+=back;
      G.s.rigs=G.s.rigs.filter(x=>x.id!==worst.id);
      G.say('bad','Sold '+worst.name+' to cover the bill','+'+fmt.usd(back),undefined,undefined,back); return;
    }
    if(G.s.cash<FLOOR_COST){
      G.s.rigs.push({ id:G.s.nextId++, kind:FLOOR_RIG.kind, frame:FLOOR_RIG.frame,
        // ctrl is inert here: never read for kind 'gpu', and no controller
        // catalogue exists for PART() to find it in. Do not fold it into the
        // spec above — pricing it would throw.
        mobo:FLOOR_RIG.mobo, psu:FLOOR_RIG.psu, cool:FLOOR_RIG.cool, ctrl:'k3',
        units:Array.from({length:FLOOR_RIG.n},()=>({p:FLOOR_RIG.unit,w:0})),
        risers:FLOOR_RIG.n, refurb:0,          // one riser per card, as billed
        site:G.s.sites[0].id, group:G.s.groups[0].id, on:true, building:0,
        open:false, name:'Rig '+G.s.nextId });
      G.say('big','The room still has one working rig. Start again.');
      G.pop('Back to one rig','the room was always free','dark',{always:true});
    }
  }


  Object.assign(G, {FLOOR_COST,FLOOR_RIG,insolvency,rigSalvage});
}
