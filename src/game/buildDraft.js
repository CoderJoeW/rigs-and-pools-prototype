import { computed } from 'vue';
import { C } from '../data/constants.js';
import { FRAMES, MOBOS, COOLERS, PART, RISER } from '../data/hardware.js';
import { fmt } from '../utils/format.js';

/* 06-build-draft.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installBuildDraft(G){
  /* ---- build draft ---- */
  const dp = computed(()=>{
    const d=G.s.draft, x=PART(d.cool);
    if(d.kind==='gpu'){
      const f=PART(d.frame), m=PART(d.mobo), p=PART(d.psu), u=PART(d.unit);
      return { maxSlots:Math.min(f.slots,m.pcie), coreW:f.w+m.w+x.w+d.n*RISER.w+d.n*u.w,
        psu:p, unit:u, conn:d.n*u.conn, mh:d.n*u.mh, air:f.air*x.fac,
        cost:f.price+m.price+p.price+x.price+d.n*(u.price+RISER.price) };
    }
    const k=PART(d.ctrl), p=PART(d.psu), u=PART(d.unit);
    return { maxSlots:k.boards, coreW:k.w+x.w+d.n*u.w, psu:p, unit:u, air:1.30*x.fac,
      conn:d.n*u.conn, mh:d.n*u.mh, cost:k.price+p.price+x.price+d.n*u.price };
  });
  const checks = computed(()=>{
    const d=G.s.draft, p=dp.value, f=G.active.value, out=[];
    const lim = d.kind==='gpu'
      ? (PART(d.frame).slots<=PART(d.mobo).pcie?'the frame':'the motherboard') : 'the controller';
    out.push({ ok:d.n<=p.maxSlots, label:d.n+' units into '+p.maxSlots+' slots',
      fix:'The smaller of the frame and the board sets this — right now it is '+lim+'.' });
    const cap=G.psuUsableW(p.psu);
    out.push({ ok:p.coreW<=cap, label:fmt.w(p.coreW)+' draw against '+fmt.w(cap)+' usable',
      fix:G.psuCarrying(p.coreW)+' would carry it.' });
    out.push({ ok:p.conn<=p.psu.conn, label:p.conn+' PCIe connectors, supply has '+p.psu.conn,
      fix:G.psuWithConn(p.conn)+' would fit.' });
    out.push({ ok:G.siteRigs(f).length<G.siteSlots(f),
      label:'Floor space at '+f.name+': '+G.siteRigs(f).length+' of '+G.siteSlots(f),
      fix:'A bigger shell has more positions.' });
    const coolDelta=G.sitePlantW(f, p.coreW/Math.max(0.01,p.air))-G.sitePlantW(f);
    const after=G.siteDemand(f)+p.coreW/p.psu.eff+coolDelta;
    out.push({ ok:after<=G.siteCapacity(f)+G.battFirm(f),
      label:'Power at '+f.name+': '+fmt.w(after)+' of '
        +fmt.w(G.siteCapacity(f)+G.battFirm(f))+' available'
        +(coolDelta>1?' (incl. '+fmt.w(coolDelta)+' more cooling)':''),
      fix:'Install another source at this site.' });
    out.push({ ok:G.s.cash>=p.cost, label:'Parts cost '+fmt.usd(p.cost)+', you hold '+fmt.usd(G.s.cash),
      fix:'Short '+fmt.usd(p.cost-G.s.cash)+'.' });
    return out;
  });
  const canBuild = computed(()=> checks.value.every(c=>c.ok));
  const draftEff = computed(()=> dp.value.coreW>0 ? dp.value.mh/(dp.value.coreW/dp.value.psu.eff) : 0);
  const buildTime = computed(()=> G.s.rigs.length===0 ? 60 : C.BUILD_BASE*(0.6+G.s.draft.n*0.1));
  /* The draft's worth before it exists. Same shape as rigRev/rigPow (best
     live chain, site's marginal $/kWh) so the number a rig is sold on before
     the order and the number expectedDay carries once it's running are the
     same calculation — never a separate "sounds good" estimate. Labelled
     'expected' on screen because netDay is realised earnings and this isn't. */
  const draftExpected = computed(()=>{
    const p=dp.value, f=G.active.value;
    const rev=p.mh*G.draftRate();
    const pow=(p.coreW/p.psu.eff)/1000*24*G.margRate(f);
    const net=rev-pow;
    return { rev,pow,net, payback:net>0?p.cost/net:Infinity };
  });
  /* ---- preset generator ----
     Tries real drafts against the real canBuild/checks gate rather than a
     parallel notion of "good" — the fastest way this project has shipped a
     preset that agrees with the field list is to make it use the exact same
     acceptance test. Cash-bound favours cheap cards (thin margin, fast
     payback); once the site is near its power ceiling it favours MH/W
     instead, matching the flip in Appendix A.

     v64 fixes two units being confused. `n` is cards-per-rig, bounded by the
     frame and board ladders. It used to also be bounded by the site's free
     RIG POSITIONS, which are a different thing entirely — so a garage with
     one position left offered a one-card rig at 24 MH where the frame would
     carry sixteen at 384, a 16x loss on the last position with 96 kW spare.
     Whether a position exists at all is checks[3]'s job and always was.

     Cooling is deliberately NOT escalated here. Trying coolers inside the
     card loop was measured and rejected — it bought a $420 immersion kit to
     add two $3 cards, turning a 0.51-day payback into 0.78 — and trying them
     only as a fallback was measured to be dead code: a better cooler adds
     its own watts while only dividing the plant's share, so below about
     three cards it always makes the power check HARDER, and "nothing fits"
     only ever happens at one card. See §6n. */
  /* The one search both generatePreset and openBuildCost run — used to be
     two ~13-line near-copies that had already silently diverged once
     (issue #27): openBuildCost's cool-delta expression was missing the
     divide-by-zero guard checks.value's has (now shared below). Yields
     buildable-on-paper candidates in strategy order; each caller applies
     its own acceptance test to the tail — generatePreset writes the draft
     and runs the full canBuild gate (incl. cash); openBuildCost skips cash
     and tests power headroom directly, read-only. */
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
  /* Issue #7's idle-cash advisory needs "is something buildable right now,
     and what would it cost" WITHOUT depending on the player having recently
     visited Build. G.s.draft is shared, global state that only refreshes on
     BuildView's mount (or a manual re-preset), so reading dp/canBuild
     directly is stale the instant the site's real constraints move past
     whatever was last drafted — concretely, right after the site's power
     headroom is mostly spent on rig one, the still-drafted rig-one preset no
     longer fits, and stays that way on Farm/every other tab forever, since
     nothing there ever calls generatePreset(). Mirrors generatePreset()'s
     own search (same site-aware strategy and order) but touches no state —
     it answers the query, it doesn't try to become the draft — and skips
     the cash check specifically, since the whole point here is a cost to
     compare cash against, not a "would this be affordable" verdict. */
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

  Object.assign(G, {buildTime,canBuild,checks,dp,draftEff,draftExpected,generatePreset,openBuildCost,unitEcon});
}
