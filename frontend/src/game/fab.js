import { FAB } from '../data/fab.js';
import { DESIGN_AXES, MAX_AXIS_POINTS, designTotals, designStats, designCost } from '../data/customParts.js';
import { fmt } from '../utils/format.js';

const PART_NAME = { frame:'Custom frame', mobo:'Custom board', cool:'Custom cooler',
  psu:'Custom supply', unit:'Custom card' };

// unit and psu are the two ladders that keep growing (generations.js); a
// design has to start from whatever's CURRENTLY on top of those, not the
// frozen catalogue customParts.js imports — see its own comment on why
const liveTopOf = (G,kind) => kind==='unit' ? G.cards()[G.cards().length-1]
  : kind==='psu' ? G.livePsus[G.livePsus.length-1] : undefined;

// Installed into the shared context G — docs/implementation-notes.md#shared-context-g-module-pattern.
// A fab bay (game/sites.js's chooseFab) unlocks which slot types can be
// designed and how big a budget a design may spend; G.s.design holds the
// in-progress design (same open/edit/close-or-commit lifecycle as
// G.s.picker), and manufacturing queues a real construction job through
// the same queue/completion path (tick.js) every other site part uses.
export function installFab(G){
  function openDesign(fid, kind){
    const f=G.site(fid), fb=f&&f.fab&&FAB(f.fab);
    if(!f||!fb||!fb.slots.includes(kind)) return;
    G.s.design={ fid, kind, picks:{} };
  }
  function closeDesign(){ G.s.design=null; }
  function bumpDesignPick(axisKey, delta){
    const d=G.s.design; if(!d) return;
    const ax=DESIGN_AXES[d.kind].find(a=>a.key===axisKey); if(!ax) return;
    const f=G.site(d.fid), fb=f&&f.fab&&FAB(f.fab); if(!fb) return;
    const cur=d.picks[axisKey]||0, next=Math.max(0, Math.min(MAX_AXIS_POINTS, cur+delta));
    if(next===cur) return;
    if(designTotals(d.kind, { ...d.picks, [axisKey]:next }).budget>fb.budget) return;
    d.picks[axisKey]=next;
  }
  function manufacturePart(){
    const d=G.s.design; if(!d) return;
    const f=G.site(d.fid), fb=f&&f.fab&&FAB(f.fab);
    if(!f||!fb||!fb.slots.includes(d.kind)) return;
    const totals=designTotals(d.kind, d.picks);
    if(totals.budget>fb.budget) return;
    if(totals.points<=0) return;   // nothing tuned: strictly worse than the catalogue part it's based on
    const liveTop=liveTopOf(G,d.kind);
    const { buildCash, hours, unitPrice }=designCost(d.kind, d.picks, liveTop);
    if(G.s.cash<buildCash) return;
    G.spend(buildCash);
    const stats=designStats(d.kind, d.picks, liveTop);
    // timestamp+random, not a saved counter: PART_MAP (data/hardware.js) is a
    // page-load-scoped singleton, so a persisted counter would collide across
    // multiple freshStore() instances sharing that module graph (e.g. tests).
    const id='custom-'+d.kind+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const part={ ...stats, id, name:PART_NAME[d.kind], kind:d.kind, price:unitPrice, custom:true };
    f.queue.push({ kind:'mfg', part, paidCash:buildCash, left:hours, total:hours });
    G.say('site','Manufacturing '+part.name+' at '+f.name+' — '+hours+' h',
      '-'+fmt.usd(buildCash),undefined,undefined,-buildCash);
    G.s.design=null;
  }

  Object.assign(G, {bumpDesignPick,closeDesign,liveTopOf:kind=>liveTopOf(G,kind),manufacturePart,openDesign});
}
