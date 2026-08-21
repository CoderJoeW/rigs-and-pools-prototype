import { computed } from 'vue';
import { C } from '../data/constants.js';
import { FRAMES, MOBOS, COOLERS, PART, RISER } from '../data/hardware.js';
import { fmt } from '../utils/format.js';

// Installed into the shared context G — docs/implementation-notes.md#shared-context-g-module-pattern.
export function installBuildDraft(G){
  const dp = computed(()=>{
    const d=G.s.draft, x=PART(d.cool);
    let base;
    if(d.kind==='gpu'){
      const f=PART(d.frame), m=PART(d.mobo), p=PART(d.psu), u=PART(d.unit);
      base = { maxSlots:Math.min(f.slots,m.pcie), coreW:f.w+m.w+x.w+d.n*RISER.w+d.n*u.w,
        psu:p, unit:u, conn:d.n*u.conn, mh:d.n*u.mh, air:f.air*x.fac,
        cost:f.price+m.price+p.price+x.price+d.n*(u.price+RISER.price) };
    } else {
      const k=PART(d.ctrl), p=PART(d.psu), u=PART(d.unit);
      base = { maxSlots:k.boards, coreW:k.w+x.w+d.n*u.w, psu:p, unit:u, air:1.30*x.fac,
        conn:d.n*u.conn, mh:d.n*u.mh, cost:k.price+p.price+x.price+d.n*u.price };
    }
    // wall = core draw grossed up by supply efficiency, same relationship
    // rigWallW applies to a built rig — Build's hero and the Rigs list quote
    // the same figure for the same hardware.
    return { ...base, wall: base.coreW/base.psu.eff };
  });
  const checks = computed(()=>{
    const d=G.s.draft, p=dp.value, f=G.active.value, out=[];
    const lim = d.kind==='gpu'
      ? (PART(d.frame).slots<=PART(d.mobo).pcie?'the frame':'the motherboard') : 'the controller';
    out.push({ ok:d.n<=p.maxSlots, title:'Cards fit the slots',
      label:d.n+' units into '+p.maxSlots+' slots',
      fix:'The smaller of the frame and the board sets this — right now it is '+lim+'.' });
    const cap=G.psuUsableW(p.psu);
    out.push({ ok:p.coreW<=cap, title:'Supply carries the draw',
      label:fmt.w(p.coreW)+' draw against '+fmt.w(cap)+' usable',
      fix:G.psuCarrying(p.coreW)+' would carry it.' });
    out.push({ ok:p.conn<=p.psu.conn, title:'Enough PCIe connectors',
      label:p.conn+' PCIe connectors, supply has '+p.psu.conn,
      fix:G.psuWithConn(p.conn)+' would fit.' });
    out.push({ ok:G.siteRigs(f).length<G.siteSlots(f), title:'Free position on the floor',
      label:'Floor space at '+f.name+': '+G.siteRigs(f).length+' of '+G.siteSlots(f),
      fix:'A bigger shell has more positions.' });
    const coolDelta=G.sitePlantW(f, p.coreW/Math.max(0.01,p.air))-G.sitePlantW(f);
    const after=G.siteDemand(f)+p.coreW/p.psu.eff+coolDelta;
    out.push({ ok:after<=G.siteCapacity(f)+G.battFirm(f), title:'Power budget within limit',
      label:'Power at '+f.name+': '+fmt.w(after)+' of '
        +fmt.w(G.siteCapacity(f)+G.battFirm(f))+' available'
        +(coolDelta>1?' (incl. '+fmt.w(coolDelta)+' more cooling)':''),
      fix:'Install another source at this site.' });
    out.push({ ok:G.s.cash>=p.cost, title:'You can pay for it',
      label:'Parts cost '+fmt.usd(p.cost)+', you hold '+fmt.usd(G.s.cash),
      fix:'Short '+fmt.usd(p.cost-G.s.cash)+'.' });
    return out;
  });
  const canBuild = computed(()=> checks.value.every(c=>c.ok));
  const draftEff = computed(()=> dp.value.coreW>0 ? dp.value.mh/(dp.value.coreW/dp.value.psu.eff) : 0);
  const buildTime = computed(()=> G.s.rigs.length===0 ? 0 : C.BUILD_BASE*(0.6+G.s.draft.n*0.1));
  // Same shape as rigRev/rigPow so the pre-purchase estimate and the
  // running rig's netDay are the same calculation, never a separate
  // "sounds good" guess. Labelled 'expected' since netDay is realised.
  const draftExpected = computed(()=>{
    const p=dp.value, f=G.active.value;
    const rev=p.mh*G.draftRate();
    const pow=(p.coreW/p.psu.eff)/1000*24*G.margRate(f);
    const net=rev-pow;
    return { rev,pow,net, payback:net>0?p.cost/net:Infinity };
  });
  // Preset generator: tries real drafts against the real canBuild/checks
  // gate (cash-bound favours cheap cards, power-bound favours MH/W) — the
  // 16x rig-positions-vs-frame-slots bug and the rejected cooling-escalation
  // idea are both documented in design-spec.md §6n.
  // candidateBuilds is the one search both generatePreset and openBuildCost
  // run, replacing two copies that had silently diverged (issue #27):
  // generatePreset writes the draft and runs the full canBuild gate incl.
  // cash; openBuildCost skips cash and tests power headroom directly, read-only.
  function* candidateBuilds(f){
    const flip = G.siteDemand(f) >= G.siteCapacity(f)*C.FLIP_AT;
    const pool = G.cards();
    const order = flip ? [...pool].sort((a,b)=>(b.mh/b.w)-(a.mh/a.w)) : pool;
    const maxCards = Math.min(FRAMES[FRAMES.length-1].slots, MOBOS[MOBOS.length-1].pcie);
    for(const unit of order){
      for(let n=maxCards; n>=1; n--){
        const frame=FRAMES.find(x=>x.slots>=n);
        const mobo=MOBOS.find(x=>x.pcie>=n);
        if(!frame||!mobo) continue;
        const cool=COOLERS[0];
        const core=frame.w+mobo.w+cool.w+n*RISER.w+n*unit.w;
        const psu=G.livePsus.find(x=>G.psuUsableW(x)>=core && x.conn>=n*unit.conn);
        if(!psu) continue;
        yield {unit,n,frame,mobo,cool,core,psu};
      }
    }
  }
  function generatePreset(){
    const f=G.active.value;
    const before = { ...G.s.draft };                 // restore this if nothing fits
    for(const {unit,n,frame,mobo,cool,psu} of candidateBuilds(f)){
      G.s.draft.kind='gpu'; G.s.draft.frame=frame.id; G.s.draft.mobo=mobo.id;
      G.s.draft.cool=cool.id; G.s.draft.psu=psu.id; G.s.draft.unit=unit.id; G.s.draft.n=n;
      if(canBuild.value) return true;
    }
    Object.assign(G.s.draft, before);   // the search scribbles on the draft; put it back
    return false;
  }
  const unitEcon = u => {
    const f=G.active.value;
    const wall = u.w/PART(G.s.draft.psu).eff;
    const net  = u.mh*G.draftRate() - wall/1000*24*G.margRate(f);
    return { net, wall, payback:net>0?u.price/net:Infinity, perKw:net/(wall/1000), mhw:u.mh/u.w };
  };
  // openBuildCost answers issue #7's idle-cash advisory ("is something
  // buildable, and what would it cost") without depending on G.s.draft,
  // which only refreshes on BuildView's mount and goes stale the moment site
  // constraints move past it. Mirrors generatePreset()'s search read-only
  // and skips the cash check, since the point here is a cost to compare
  // cash against, not an affordability verdict.
  const siteRigsOpen = f => G.siteSlots(f)-G.siteRigs(f).length;
  const openBuildCost = f => {
    if(siteRigsOpen(f)<=0) return null;
    for(const {unit,n,frame,mobo,cool,core,psu} of candidateBuilds(f)){
      const coolDelta=G.sitePlantW(f, core/Math.max(0.01,frame.air*cool.fac))-G.sitePlantW(f);
      const after=G.siteDemand(f)+core/psu.eff+coolDelta;
      if(after>G.siteCapacity(f)+G.battFirm(f)) continue;
      return frame.price+mobo.price+cool.price+psu.price+n*(unit.price+RISER.price);
    }
    return null;
  };

  /* How many copies of the current draft fit right now — floor space,
     cash, and power (with cooling delta scaled by count). Used by bulk
     order on Build and by build(qty) itself so the clamp is one function. */
  function maxBuildQty(){
    if(!G.canBuild.value) return 0;
    const f=G.active.value, p=G.dp.value;
    const bySlots=G.siteSlots(f)-G.siteRigs(f).length;
    if(bySlots<=0) return 0;
    const byCash=Math.floor(G.s.cash/p.cost);
    if(byCash<=0) return 0;
    const heatEach=p.coreW/Math.max(0.01,p.air);
    const wallEach=p.coreW/p.psu.eff;
    const cap=G.siteCapacity(f)+G.battFirm(f);
    const baseDemand=G.siteDemand(f);
    const basePlant=G.sitePlantW(f);
    let maxPow=0;
    // Walk up rather than binary-search: site shells top out well under a
    // hundred positions, and sitePlantW is cheap enough that the loop is
    // invisible next to a click.
    for(let n=1;n<=Math.min(bySlots,byCash);n++){
      const coolDelta=G.sitePlantW(f, heatEach*n)-basePlant;
      const after=baseDemand+wallEach*n+coolDelta;
      if(after>cap) break;
      maxPow=n;
    }
    return maxPow;
  }

  Object.assign(G, {buildTime,canBuild,checks,dp,draftEff,draftExpected,generatePreset,maxBuildQty,openBuildCost,unitEcon});
}
