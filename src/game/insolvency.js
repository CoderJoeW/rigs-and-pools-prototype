import { jobPart } from '../data/site-parts.js';
import { PART, RISER } from '../data/hardware.js';
import { fmt } from '../utils/format.js';

/* 08-insolvency.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installInsolvency(G){
  /* ---- insolvency: escalating liquidation, never a dead end ---- */
  function rigSalvage(r){
    const ch = r.kind==='gpu'
      ? PART(r.frame).price+PART(r.mobo).price+r.risers*RISER.price : PART(r.ctrl).price;
    return Math.round(ch*0.4+PART(r.psu).price*0.5+(r.cool?PART(r.cool).price*0.4:0)
      + r.units.reduce((a,u)=>a+PART(u.p).price*Math.max(0,1-u.w)*0.6,0));
  }
  const FLOOR_COST = 12+16+32+26+9;
  /* Insolvency used to power the WHOLE farm down at once, and nothing ever
     brought it back: no rigs meant no income, no income meant no recovery, so
     one bad week ended the run permanently. It now sheds the worst earner
     only — the same graceful degradation as a brownout — and the restore pass
     brings rigs back as cash recovers. */
  function insolvency(){
    G.s.cash=0;
    const live=G.s.rigs.filter(G.rigLive);
    // never take the last machine. A fully dark farm earns nothing, so it can
    // never pay its way back — one rig left running is the floor that keeps a
    // run recoverable instead of quietly over.
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
      G.s.rigs.push({ id:G.s.nextId++, kind:'gpu', frame:'f2', mobo:'m2', psu:'p450', cool:'x0',
        ctrl:'k3', units:[{p:'c1',w:0}], risers:1, refurb:0,
        site:G.s.sites[0].id, group:G.s.groups[0].id, on:true, building:0,
        open:false, name:'Rig '+G.s.nextId });
      G.say('big','The room still has one working rig. Start again.');
      G.pop('Back to one rig','the room was always free','dark',{always:true});
    }
  }


  Object.assign(G, {FLOOR_COST,insolvency,rigSalvage});
}
