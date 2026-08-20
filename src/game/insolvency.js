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
  /* The rig insolvency hands back when the farm is completely gone, and what
     the player would pay to build it themselves.

     Both were stated twice: the parts inline at the push site below, and the
     price as a hardcoded sum that had drifted badly — 12+16+32+26+9 = $95
     against a rig that costs $60, because the board and the card were repriced
     ($16 -> $4, $26 -> $3) and the literal was never updated.

     Worth being exact about the impact: nothing observable changes today. The
     one place FLOOR_COST is read is only reachable with zero rigs and no
     construction queue, and every rung above it returns, so cash is still the
     0 set at the top of insolvency() — the comparison is true at $95 and true
     at $60 alike. The guard states an intent ("only give one away if they
     cannot buy one") that its position makes vacuous; it is kept because the
     intent is right and the ladder may grow a rung that leaves cash behind.

     So this is a latent-correctness fix, not a balance change. One spec now,
     priced with the formula the Build tab charges (buildDraft.js:
     frame + board + supply + cooling + n x (card + riser)). */
  const FLOOR_RIG = { frame:'f2', mobo:'m2', psu:'p450', cool:'x0', ctrl:'k3',
    unit:'c1', n:1, risers:1 };
  const FLOOR_COST = PART(FLOOR_RIG.frame).price + PART(FLOOR_RIG.mobo).price
    + PART(FLOOR_RIG.psu).price + PART(FLOOR_RIG.cool).price
    + FLOOR_RIG.n * (PART(FLOOR_RIG.unit).price + RISER.price);
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
      G.s.rigs.push({ id:G.s.nextId++, kind:'gpu', frame:FLOOR_RIG.frame, mobo:FLOOR_RIG.mobo,
        psu:FLOOR_RIG.psu, cool:FLOOR_RIG.cool, ctrl:FLOOR_RIG.ctrl,
        units:[{p:FLOOR_RIG.unit,w:0}], risers:FLOOR_RIG.risers, refurb:0,
        site:G.s.sites[0].id, group:G.s.groups[0].id, on:true, building:0,
        open:false, name:'Rig '+G.s.nextId });
      G.say('big','The room still has one working rig. Start again.');
      G.pop('Back to one rig','the room was always free','dark',{always:true});
    }
  }


  Object.assign(G, {FLOOR_COST,FLOOR_RIG,insolvency,rigSalvage});
}
