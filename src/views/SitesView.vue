<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import Compare from '../components/Compare.vue';
import { CHAIN_HUE } from '../data/chains.js';

const g = useGameStore();
const f=computed(()=>g.active);
const mix=computed(()=>{
  const site=f.value, out=[];
  for(const src of site.sources){
    const P=g.SITEPART(src.p);
    out.push({ id:src.p, name:P.name+(src.n>1?' ×'+src.n:''), kind:P.kind,
      out:g.srcOut(site,src), rate:P.rate });
  }
  return out.sort((a,b)=>b.out-a.out);
});
const sourceRows=computed(()=>g.SOURCES.filter(p=>p.price>0).map(p=>({
  id:p.id, name:p.name,
  sub:(p.yield
        ? fmt.w(p.peak*p.yield)+' real — '+fmt.w(p.peak)+' nameplate at '
          +(p.yield*100).toFixed(0)+'% yield'
        : fmt.w(p.peak)+' peak')
      +' · '+(p.rate>0?fmt.usd2(p.rate)+'/kWh':'no fuel cost')
      +' · '+p.hours+' h to build',
  value:fmt.usd(p.price),
  valueSub:p.rate>0?p.kind:fmt.usd2(p.price/(p.peak*(p.yield||1)))+'/W' })));
const storageRows=computed(()=>g.STORAGE.map(p=>({
  id:p.id, name:p.name,
  sub:p.kwh+' kWh · '+p.kw+' kW · '+p.hours+' h to build',
  value:fmt.usd(p.price), valueSub:'' })));
const chooseStorage=id=>{ g.addSitePart(f.value.id,id,'storage'); g.s.sitePicker=null; };
const plantRows=computed(()=>g.PLANTS.filter(p=>p.price>0).map(p=>({
  id:p.id, name:p.name,
  sub:fmt.w(p.cap)+' of heat · '+fmt.pct(p.pue,0)+' of it burned as power · '+p.hours+' h',
  value:fmt.usd(p.price),
  valueSub:'at '+fmt.w(g.siteHeat(f.value))+' it would draw '+fmt.w(g.siteHeat(f.value)*p.pue) })));
const shellRows=computed(()=>g.SHELLS.filter(p=>p.price>0).map(p=>({
  id:p.id, name:p.name, sub:p.slots+' rig positions · '+p.hours+' h to build',
  value:fmt.usd(p.price), valueSub:'', locked:g.s.cash<p.price })));
/* Expanding grows the site you're standing on; the site list's "+ New
   site" still founds a separate one from zero. Same SHELLS ladder, two
   different actions, so picking "bigger floor" never means starting the
   power and cooling bill over from nothing. */
const expandRows=computed(()=>{
  const cur=g.SITEPART(f.value.shell);
  return g.SHELLS.filter(p=>p.slots>cur.slots).map(p=>{
    const credit=Math.round(cur.price*0.5), cost=Math.max(0,p.price-credit);
    return { id:p.id, name:p.name,
      sub:cur.slots+' → '+p.slots+' rig positions · '+p.hours+' h to build',
      value:fmt.usd(cost), valueSub:credit?fmt.usd(credit)+' credited':'',
      locked:g.s.cash<cost };
  });
});
/* Same shape as expandRows: fab tiers only ever grow, and half the current
   tier's price is credited toward the next one. Unlike shells there's no
   from-nothing floor row missing here — FABS has no free tier, since the
   whole point is that this is the single biggest bet in the game. */
const fabRows=computed(()=>{
  const cur=f.value.fab?g.FAB(f.value.fab):null;
  return g.FABS.filter(p=>!cur||p.tier>cur.tier).map(p=>{
    const credit=cur?Math.round(cur.price*0.5):0, cost=Math.max(0,p.price-credit);
    return { id:p.id, name:p.name,
      sub:p.slots.join(', ')+' · '+p.budget+' design budget · '+p.hours+' h to build',
      value:fmt.usd(cost), valueSub:credit?fmt.usd(credit)+' credited':'',
      locked:g.s.cash<cost };
  });
});
const chooseSrc=id=>{ g.addSitePart(f.value.id,id,'source'); g.s.sitePicker=null; };
const choosePlant=id=>{ g.addSitePart(f.value.id,id,'plant'); g.s.sitePicker=null; };
const chooseShell=id=>{ g.newSite(id); g.s.sitePicker=null; };
const chooseFabPick=id=>{ g.chooseFab(f.value.id,id); g.s.sitePicker=null; };
const chooseExpand=id=>{ g.upgradeShell(f.value.id,id); g.s.sitePicker=null; };
const renameDraft=ref('');
const renameOpen=ref(false);
const startRename=()=>{ renameDraft.value=f.value.name; renameOpen.value=true; };
const saveRename=()=>{ g.renameSite(f.value.id,renameDraft.value); renameOpen.value=false; };
const decomArm=ref(false);
watch(()=>f.value&&f.value.id, ()=>{ decomArm.value=false; renameOpen.value=false; });
const canDecommission=computed(()=> g.s.sites.length>1 && g.siteRigs(f.value).length===0
  && f.value.queue.length===0);
const decommission=()=>{
  if(!decomArm.value){ decomArm.value=true; return; }
  g.decommissionSite(f.value.id); decomArm.value=false;
};
// the site page had grown to one very long scroll; each section now folds
// behind a summary line, with the dashboard at the top always visible
const sec=reactive({power:false,batt:false,cool:false,fab:false});
const FLOW_C={ solar:'var(--gold)', battery:'var(--blue)', grid:'var(--ink-3)',
  rigs:'var(--green)', cooling:'var(--blue)', charging:'var(--gold)', unserved:'var(--red)' };
const segs=(parts,total)=>parts.map(([k,w])=>({k,w,
  pct: total>0?Math.max(0,w)/total*100:0, c:FLOW_C[k]}));
/* sitePlan/flowOf each re-walk and re-sort the site's sources; the power and
   battery panels below used to call them (via these) up to 8 times combined
   per render. Computed once per site here. */
const plan=computed(()=> g.sitePlan(f.value));
const flow=computed(()=> g.flowOf(f.value));
const flowIn=computed(()=>{ const x=flow.value;
  const tot=x.inRenew+x.inBatt+x.inPaid+x.unserved;
  return segs([['solar',x.inRenew],['battery',x.inBatt],['grid',x.inPaid],
               ['unserved',x.unserved]],tot); });
const flowOut=computed(()=>{ const x=flow.value;
  const tot=x.rigs+x.cool+x.charge;
  return segs([['rigs',x.rigs],['cooling',x.cool],['charging',x.charge]],tot); });

/* ---- floor plan ----
   The first view in the game that draws a site as a PLACE rather than a
   count: one square per rig position, tinted by the same live status
   vocabulary (.dot.run/.bad/.warn/.build/.off) the Rigs list already uses,
   with unoccupied positions dashed. Purely a read of existing state — the
   store has no notion of WHICH position a rig sits in (a rig only carries
   `site`), so order in `siteRigs` is the position, and a position is simply
   occupied or free; there is no "built but unwired" tier to show. */
/* A warehouse bay is 140 positions. Drawing all of them stops being a glance
   and becomes a scroll, and drawing 125 empty squares is wallpaper, not
   information — the count in the header already says how much room is left.
   So: every rig up to a ceiling, then only enough empties to show that there
   IS room, and a plain sentence for the rest. */
const MAX_TILES=60, MAX_EMPTY=12;
const rigsHere=computed(()=>g.siteRigs(f.value));
const floorTemp=computed(()=>g.siteTemp(f.value));
const floorAmbient=computed(()=>{
  const t=floorTemp.value;
  return t>=70?'hot':t>=58?'warm':'cool';
});
const floor=computed(()=>{
  const rigs=rigsHere.value, slots=Math.max(g.siteSlots(f.value), rigs.length), cells=[];
  let running=0;
  for(const r of rigs){
    if(cells.length>=MAX_TILES) break;
    const st=g.rigState(r);
    if(st.dot==='run') running++;
    const gr=g.groupOf(r);
    const chain=gr?gr.chain:null;
    const cards=r.units?r.units.length:0;
    const size=cards>=9?'lg':cards>=5?'md':'sm';
    cells.push({ key:'r'+r.id, id:r.id, dot:st.dot, n:cells.length+1,
      chain, hue:chain!=null?CHAIN_HUE[chain]:undefined, size, cards,
      label:'Position '+(cells.length+1)+' — '+r.name+', '+st.label
            +(st.sub?' ('+st.sub+')':'') });
  }
  const empties=Math.min(MAX_EMPTY, MAX_TILES-cells.length, slots-rigs.length);
  for(let i=0;i<empties;i++) cells.push({ key:'e'+i, id:null });
  return { cells, rigs:rigs.length, slots, running,
           hidden:Math.max(0, slots-cells.length),
           temp:floorTemp.value, ambient:floorAmbient.value };
});
const DOT_LABEL={ run:'Running', build:'Building', warn:'Wearing',
                  bad:'Needs attention', off:'Off' };
// colour alone should not carry the reading; the legend names what is on screen
const legend=computed(()=>{
  const n={};
  for(const r of rigsHere.value){ const d=g.rigState(r).dot; n[d]=(n[d]||0)+1; }
  return ['run','build','warn','bad','off'].filter(k=>n[k])
    .map(k=>({ k, n:n[k], label:DOT_LABEL[k] }));
});
const openTile=id=>{ g.s.focusRig=id; g.s.tab='rigs'; };
// while a fab job is queued, f.fab hasn't moved yet — without this the
// section would keep reading "not installed" through the entire build
const fabQueued=computed(()=>f.value.queue.find(j=>j.kind==='fab'));

/* ---- designing a custom part ----
   Two small sheets, not one: `sitePicker==='design'` picks WHICH slot type
   (a plain list, not a Compare — there's no price to compare yet), then
   `g.s.design` (opened by openDesignKind) is the actual tuner. They're
   mutually exclusive by construction — opening the tuner always closes the
   picker sheet first — so only one is ever on screen. */
const KIND_LABEL={ frame:'Frame', mobo:'Board', cool:'Cooler', psu:'Supply', unit:'Card' };
const designKinds=computed(()=> f.value.fab ? g.FAB(f.value.fab).slots : []);
const openDesignKind=kind=>{ g.openDesign(f.value.id,kind); g.s.sitePicker=null; };
/* A design belongs to the SITE it was opened on (g.s.design.fid), not
   whichever site happens to be active right now — the tuner sheet traps
   focus and covers the site list, so switching sites mid-design isn't
   reachable today, but reading the wrong site's fab here would be a real
   bug the moment that ever changes, for the cost of one extra lookup.
   decommissionSite (game/sites.js) is the one that actually clears
   g.s.design when its site goes away, closing the sheet outright — so
   `.find` returning nothing shouldn't happen, but `|| f.value` costs one
   token to keep this computed itself from being the thing that throws if
   that guard is ever the one that regresses instead. */
const designPreview=computed(()=>{
  const d=g.s.design; if(!d) return null;
  const site=g.s.sites.find(x=>x.id===d.fid)||f.value, fab=g.FAB(site.fab);
  const liveTop=g.liveTopOf(d.kind);
  return { axes:g.DESIGN_AXES[d.kind], fab,
    totals:g.designTotals(d.kind,d.picks), stats:g.designStats(d.kind,d.picks,liveTop),
    cost:g.designCost(d.kind,d.picks,liveTop) };
});
// mirrors bumpDesignPick's own refusal condition, read-only — so the +
// stepper can go disabled right when a click would silently do nothing,
// the same way Build's own card-count stepper disables at its limit
const axisAtCap=ax=>{
  const d=g.s.design; if(!d) return true;
  const cur=d.picks[ax.key]||0;
  if(cur>=g.MAX_AXIS_POINTS) return true;
  return g.designTotals(d.kind,{ ...d.picks, [ax.key]:cur+1 }).budget>designPreview.value.fab.budget;
};
const designSheetEl=ref(null);
useSheetA11y(designSheetEl, computed(()=>!!g.s.design), ()=>{ g.closeDesign(); });

const pickerSheetEl=ref(null);
useSheetA11y(pickerSheetEl, computed(()=>!!g.s.sitePicker), ()=>{ g.s.sitePicker=null; });
</script>
