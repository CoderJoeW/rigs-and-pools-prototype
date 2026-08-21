<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import DesignSheet from '../components/DesignSheet.vue';
import Compare from '../components/Compare.vue';
import RackTile from '../components/RackTile.vue';
import SiteFilm from '../components/SiteFilm.vue';
import { CHAIN_HUE } from '../data/chains.js';
import { sitePhase } from '../utils/siteArt.js';
import fabShot from '../assets/site/fab.webp';

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
const storageRows=computed(()=>g.STORAGE.map(p=>({ id:p.id, name:p.name,
  sub:p.kwh+' kWh · '+p.kw+' kW · '+p.hours+' h to build',
  value:fmt.usd(p.price), valueSub:'' })));
const chooseStorage=id=>{ g.addSitePart(f.value.id,id,'storage'); g.s.sitePicker=null; };
const plantRows=computed(()=>g.PLANTS.filter(p=>p.price>0).map(p=>({ id:p.id, name:p.name,
  sub:fmt.w(p.cap)+' of heat · '+fmt.pct(p.pue,0)+' of it burned as power · '+p.hours+' h',
  value:fmt.usd(p.price),
  valueSub:'at '+fmt.w(g.siteHeat(f.value))+' it would draw '+fmt.w(g.siteHeat(f.value)*p.pue) })));
const shellRows=computed(()=>g.SHELLS.filter(p=>p.price>0).map(p=>({ id:p.id, name:p.name, sub:p.slots+' rig positions · '+p.hours+' h to build',
  value:fmt.usd(p.price), valueSub:'', locked:g.s.cash<p.price })));
const expandRows=computed(()=>{ const cur=g.SITEPART(f.value.shell);
  return g.SHELLS.filter(p=>p.slots>cur.slots).map(p=>{ const credit=Math.round(cur.price*0.5), cost=Math.max(0,p.price-credit);
    return { id:p.id, name:p.name, sub:cur.slots+' → '+p.slots+' rig positions · '+p.hours+' h to build',
      value:fmt.usd(cost), valueSub:credit?fmt.usd(credit)+' credited':'', locked:g.s.cash<cost }; }); });
const fabRows=computed(()=>{ const cur=f.value.fab?g.FAB(f.value.fab):null;
  return g.FABS.filter(p=>!cur||p.tier>cur.tier).map(p=>{ const credit=cur?Math.round(cur.price*0.5):0, cost=Math.max(0,p.price-credit);
    return { id:p.id, name:p.name, sub:p.slots.join(', ')+' · '+p.budget+' design budget · '+p.hours+' h to build',
      value:fmt.usd(cost), valueSub:credit?fmt.usd(credit)+' credited':'', locked:g.s.cash<cost }; }); });
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
/* The switcher is a disclosure rather than a permanent list: on a farm with
   one site the list says nothing the trigger has not already said, and on a
   farm with ten it would push the site itself off the first screen. v-show
   rather than v-if so the rows keep their place in the document and the
   open/close is a paint, not a rebuild. */
const listOpen=ref(false);
watch(()=>f.value&&f.value.id, ()=>{ decomArm.value=false; renameOpen.value=false; listOpen.value=false; });
const pickSite=id=>{ g.s.activeSite=id; listOpen.value=false; };
const canDecommission=computed(()=> g.s.sites.length>1 && g.siteRigs(f.value).length===0 && f.value.queue.length===0);
const decomLabel=computed(()=> !canDecommission.value
  ? (g.s.sites.length<=1 ? 'Your only site' : g.siteRigs(f.value).length>0 ? 'Move its rigs out first' : 'Finish construction first')
  : decomArm.value ? 'Tap again — this cannot be undone' : 'Retire this site');
const decommission=()=>{ if(!decomArm.value){ decomArm.value=true; return; } g.decommissionSite(f.value.id); decomArm.value=false; };
const sec=reactive({power:false,batt:false,cool:false,fab:false});
const FLOW_C={ solar:'var(--gold)', battery:'var(--blue)', grid:'var(--ink-3)',
  rigs:'var(--green)', cooling:'var(--blue)', charging:'var(--gold)', unserved:'var(--red)' };
const segs=(parts,total)=>parts.map(([k,w])=>({k,w, pct: total>0?Math.max(0,w)/total*100:0, c:FLOW_C[k]}));
const plan=computed(()=> g.sitePlan(f.value));
const flow=computed(()=> g.flowOf(f.value));
const flowIn=computed(()=>{ const x=flow.value; const tot=x.inRenew+x.inBatt+x.inPaid+x.unserved;
  return segs([['solar',x.inRenew],['battery',x.inBatt],['grid',x.inPaid],['unserved',x.unserved]],tot); });
const flowOut=computed(()=>{ const x=flow.value; const tot=x.rigs+x.cool+x.charge;
  return segs([['rigs',x.rigs],['cooling',x.cool],['charging',x.charge]],tot); });
/* The headline beside each flow bar: the single biggest contributor, since a
   list of four is what the bar underneath is already for. */
const biggest=list=>{ const live=list.filter(x=>x.pct>0);
  if(!live.length) return null;
  return live.reduce((a,b)=>b.w>a.w?b:a); };
/* Unserved stays in the bar as its red segment, but it is demand that went
   unmet, not somewhere power arrived from — headlining it would name a source
   that does not exist. */
const flowInTop=computed(()=>biggest(flowIn.value.filter(x=>x.k!=='unserved')));
const flowOutTop=computed(()=>biggest(flowOut.value));
/* Today's metered spend at this site, and how it is pacing. f.bill only
   accumulates while the site draws, so a site that has not drawn yet has no
   bill object at all and the whole strip stays honest by reading zero. */
const billToday=computed(()=>{ const b=f.value.bill; return b?b.off+b.sh+b.peak:0; });
const billCoolShare=computed(()=>{ const b=f.value.bill;
  return b&&billToday.value>0 ? b.cool/billToday.value : 0; });

/* FLOOR_COLS has to be the number of columns .riggrid actually paints, or the
   row-column address contradicts the layout it claims to describe. The shell
   is capped at 440px, so the grid is a fixed three rather than auto-fill —
   one number, stated in both places, instead of a guess about reflow. */
const MAX_TILES=60, MAX_EMPTY=12, FLOOR_COLS=3;
const rigsHere=computed(()=>g.siteRigs(f.value));
const floorTemp=computed(()=>g.siteTemp(f.value));
const floorAmbient=computed(()=>{ const t=floorTemp.value; return t>=70?'hot':t>=58?'warm':'cool'; });
const siteHash=computed(()=>rigsHere.value.reduce((a,r)=>a+g.rigHash(r),0));
const siteStatus=computed(()=>{ const t=floorTemp.value;
  if(t>=70) return {label:'HOT',tone:'hot'};
  if(rigsHere.value.some(r=>g.rigLive(r))) return {label:'ONLINE',tone:'online'};
  return {label:'IDLE',tone:'idle'}; });
/* Positions are addressed the way a floor is walked rather than counted:
   row-column, both padded, so 01-04 is the fourth position of the first row
   and matches what a label on the actual rack would say. */
const posCode=i=>String(Math.floor(i/FLOOR_COLS)+1).padStart(2,'0')+'-'
  +String(i%FLOOR_COLS+1).padStart(2,'0');
const floor=computed(()=>{ const rigs=rigsHere.value, slots=Math.max(g.siteSlots(f.value), rigs.length), cells=[];
  let running=0;
  for(const r of rigs){ if(cells.length>=MAX_TILES) break; const st=g.rigState(r); if(st.dot==='run') running++;
    const gr=g.groupOf(r); const chain=gr?gr.chain:null; const cards=r.units?r.units.length:0;
    const code=posCode(cells.length);
    cells.push({ key:'r'+r.id, id:r.id, dot:st.dot, code, chain, hue:chain!=null?CHAIN_HUE[chain]:undefined, cards,
      label:'Position '+code+' — '+r.name+', '+st.label+(st.sub?' ('+st.sub+')':'') }); }
  const empties=Math.min(MAX_EMPTY, MAX_TILES-cells.length, slots-rigs.length);
  for(let i=0;i<empties;i++) cells.push({ key:'e'+i, id:null, code:posCode(cells.length) });
  return { cells, rigs:rigs.length, slots, running, hidden:Math.max(0, slots-cells.length), temp:floorTemp.value, ambient:floorAmbient.value }; });
const DOT_LABEL={ run:'Running', build:'Building', warn:'Warning', bad:'Bad', off:'Off' };
const legend=computed(()=>{ const n={}; for(const r of rigsHere.value){ const d=g.rigState(r).dot; n[d]=(n[d]||0)+1; }
  return ['run','build','warn','bad','off'].filter(k=>n[k]).map(k=>({ k, n:n[k], label:DOT_LABEL[k] })); });
/* Counted rather than inferred from legend.length: a full site draws no empty
   tiles and must not claim a key for them, and a site that is nothing BUT
   empty positions has no rig states yet and would otherwise lose the legend
   entirely. */
const emptyDrawn=computed(()=>floor.value.cells.filter(c=>c.id===null).length);
const openTile=id=>{ g.s.focusRig=id; g.s.tab='rigs'; };
/* The hero shows the shell you actually bought, in the light the simulation
   says it is — see utils/siteArt.js for both, and for why the previous scheme
   (three quarry photographs dealt out by site id) had to go. */
const heroPhase=computed(()=>sitePhase(g.s.t));
const siteDot=st=>{ if(g.siteTemp(st)>=70) return 'bad';
  if(g.siteRigs(st).some(r=>g.rigLive(r))) return 'run';
  return 'off'; };

const battKwh=computed(()=>g.battKwh(f.value));
const battPct=computed(()=>battKwh.value>0?Math.min(1,(f.value.batt||0)/battKwh.value):0);
const battMode=computed(()=>{ const p=plan.value;
  if(p.chW>0) return {k:'charging',text:'charging '+fmt.w(p.chW)+' from solar',cls:'pos'};
  if(p.gridChW>0) return {k:'charging',text:'charging '+fmt.w(p.gridChW)+' off-peak',cls:'blu'};
  if(p.disW>0) return {k:'discharging',text:'discharging '+fmt.w(p.disW),cls:'amb'};
  return {k:'idle',text:'idle',cls:''}; });
/* The heat trace is a reading drawn as a waveform, not decoration: how hard
   the wave swings is the site's heat against its cooling capacity, so a plant
   that is coping draws a flat line and one that is losing draws a ragged one.
   Deterministic — the same load always draws the same trace, so a change on
   screen means a change in the simulation. */
const heatLoad=computed(()=>{ const cap=g.siteCooling(f.value);
  return cap>0?Math.min(1.6,g.siteHeat(f.value)/cap):(g.siteHeat(f.value)>0?1.6:0); });
/* The three sine terms sum to 1.06, so an amplitude past ~10.4 would push the
   trace outside the 24-tall viewBox and CLIP FLAT — reading as calm at exactly
   the overload this is here to show. 2 + 5.2·load tops out at 10.3. */
const heatPath=computed(()=>{ const amp=2+heatLoad.value*5.2, pts=[];
  for(let i=0;i<=48;i++){ const x=i/48*100;
    const y=12 - (Math.sin(i*0.62)*0.62 + Math.sin(i*1.37+1.1)*0.28 + Math.sin(i*2.9+0.4)*0.16)*amp;
    pts.push((i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)); }
  return pts.join(' '); });
const coolTone=computed(()=> floorAmbient.value==='hot'?'hot':heatLoad.value>0.85?'warm':'cool');

const fabQueued=computed(()=>f.value.queue.find(j=>j.kind==='fab'));
const KIND_LABEL={ frame:'Frame', mobo:'Board', cool:'Cooler', psu:'Supply', unit:'Card' };
/* What a queued job IS. A site queue only ever holds infrastructure — see
   sites.js — so these are the whole vocabulary. */
const JOB_LABEL={ shell:'Shell', source:'Power', storage:'Battery', plant:'Cooling',
  fab:'Fab', mfg:'Parts' };
const designKinds=computed(()=> f.value.fab ? g.FAB(f.value.fab).slots : []);
const openDesignKind=kind=>{ g.openDesign(f.value.id,kind); g.s.sitePicker=null; };
const pickerSheetEl=ref(null);
useSheetA11y(pickerSheetEl, computed(()=>!!g.s.sitePicker), ()=>{ g.s.sitePicker=null; });
</script>

<template>
  <div>
    <!-- Which site am I looking at — a disclosure, closed until asked -->
    <div class="card sitepick">
      <button class="sitepick-hd" :aria-expanded="listOpen ? 'true' : 'false'"
              @click="listOpen=!listOpen">
        <span class="sitepick-ico" aria-hidden="true"><svg viewBox="0 0 24 24">
          <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>
          </svg></span>
        <span class="sitepick-cur">{{ f.name }}</span>
        <span class="sitepick-cv" :class="{open:listOpen}" aria-hidden="true"><svg viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6"/></svg></span>
      </button>
      <div class="list" v-show="listOpen">
        <button v-for="st in g.s.sites" :key="st.id" class="rowline sitepick-row"
                :class="{on:st.id===g.s.activeSite}"
                :aria-current="st.id===g.s.activeSite?'true':null"
                @click="pickSite(st.id)">
          <i class="dot" :class="siteDot(st)" aria-hidden="true"></i>
          <span style="flex:1;min-width:0"><span class="nm">{{ st.name }}</span>
            <div class="sb">{{ fmt.w(g.siteDemand(st)) }} / {{ fmt.w(g.siteCapacity(st)) }}
              &middot; {{ g.siteRigs(st).length }}/{{ g.siteSlots(st) }} positions
              &middot; {{ g.siteTemp(st).toFixed(0) }}&deg;</div></span>
          <span class="rt blu" v-if="st.queue.length">{{ st.queue.length }} building</span>
          <span class="ch">{{ st.id===g.s.activeSite ? '✓' : '›' }}</span>
        </button>
        <button class="rowline" @click="g.s.sitePicker='shell'">
          <span style="flex:1"><span class="nm blu">+ New site</span>
            <div class="sb">buy a shell, then install power and cooling yourself</div></span>
          <span class="ch">&rsaquo;</span></button>
      </div>
    </div>

    <!-- The site itself: its own face, its status, and the three readings -->
    <div class="card site-hero">
      <SiteFilm class="site-hero-bg" :shell="f.shell" :phase="heroPhase" />
      <div class="site-hero-in">
        <div class="site-hero-hd">
          <span class="site-hero-status" :class="siteStatus.tone">
            <i class="site-hero-dot"></i>{{ siteStatus.label }}</span>
          <button class="btn btn-sm btn-ghost site-hero-rename" @click="startRename">
            <svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 20 4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z"/></svg>Rename</button>
        </div>
        <div class="site-hero-name">{{ f.name }}</div>
        <div class="site-hero-stats">
          <div class="shs"><div class="k"><svg class="shs-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12h4l3-8 4 16 3-8h6"/></svg>Hashrate</div>
            <div class="v">{{ fmt.hash(siteHash) }}</div></div>
          <div class="shs"><div class="k"><svg class="shs-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/></svg>Power</div>
            <div class="v">{{ fmt.w(g.siteDemand(f)) }}</div></div>
          <div class="shs"><div class="k"><svg class="shs-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/></svg>Temp</div>
            <div class="v" :class="floor.ambient==='hot'?'neg':floor.ambient==='warm'?'amb':''">
              {{ floor.temp.toFixed(1) }}°C</div></div>
        </div>
      </div>
    </div>

    <div class="card floor-card" data-tour="sites">
      <div class="card-hd"><span class="eyebrow floor-k">
          <svg class="floor-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 21V6l7-3 7 3v15"/><path d="M4 21h16"/><path d="M9 21v-5h6v5"/></svg>
          Floor 01 &mdash; Main hall</span>
        <span class="eyebrow floor-r">{{ floor.rigs }}/{{ floor.slots }}
          <span class="floor-temp" :class="'t-'+floor.ambient"
                :title="'Site temperature '+floor.temp.toFixed(0)+'°C'">
            {{ floor.temp.toFixed(0) }}&deg; ambient</span></span></div>
      <div class="rigwrap" :class="'ambient-'+floor.ambient">
        <div class="riggrid">
          <RackTile v-for="c in floor.cells" :key="c.key"
                    :empty="c.id===null" :state="c.dot" :code="c.code"
                    :chain-hue="c.hue" :label="c.label"
                    @click="c.id!==null && openTile(c.id)" />
        </div>
        <div v-if="legend.length||emptyDrawn" class="riglegend">
          <span v-for="l in legend" :key="l.k"><i class="dot" :class="l.k"></i>{{ l.label }} {{ l.n }}</span>
          <span v-if="emptyDrawn"><i class="dot d-empty"></i>Empty {{ emptyDrawn }}</span>
        </div>
        <div class="rigcap">
          <template v-if="floor.rigs">Tap a position to open that rig.</template>
          <template v-else>Nothing installed here yet &mdash; {{ floor.slots }} position{{ floor.slots===1?'':'s' }} waiting.</template>
          <span v-if="floor.hidden"> &middot; {{ floor.hidden }} further position{{ floor.hidden===1?'':'s' }} not drawn</span>
        </div>
      </div>
    </div>

    <div class="card"><div class="card-bd pt">
      <div class="card-hd" style="padding:0 0 8px"><span class="eyebrow">Manage site</span>
        <span class="eyebrow">{{ g.siteRigs(f).length }}/{{ g.siteSlots(f) }} positions</span></div>
      <template v-if="renameOpen">
        <label class="sr-only" for="site-rename-input">Site name</label>
        <input id="site-rename-input" v-model="renameDraft" maxlength="24" placeholder="Site name"
               style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;font-size:13px;margin-bottom:6px" @keyup.enter="saveRename">
        <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0">
          <button class="btn btn-ghost" @click="renameOpen=false">Cancel</button>
          <button class="btn btn-pri" @click="saveRename">Save name</button>
        </div>
      </template>
      <template v-else>
        <div class="mgrid">
          <button class="mact" @click="startRename">
            <svg class="mact-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 20 4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z"/></svg>
            <span class="mact-t">Rename</span><span class="mact-s">Change site name</span></button>
          <button class="mact" @click="g.s.sitePicker='expand'">
            <svg class="mact-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>
            <span class="mact-t">Expand</span><span class="mact-s">Add rack positions</span></button>
          <button class="mact danger" :disabled="!canDecommission" @click="decommission">
            <svg class="mact-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>
            <span class="mact-t">Decommission</span><span class="mact-s">{{ decomLabel }}</span></button>
        </div>
        <p class="hint">Expanding grows the shell in place — power, cooling and rigs stay put, and the old shell's value is credited toward the new one.</p>
      </template>
    </div></div>

    <div class="card">
      <button class="rig-hd" style="width:100%" @click="sec.power=!sec.power">
        <span class="sec-ico blu" aria-hidden="true"><svg viewBox="0 0 24 24">
          <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/></svg></span>
        <span style="flex:1;text-align:left"><span class="nm">Power</span>
          <div class="sb">{{ fmt.w(g.siteCapacity(f)) }} available · {{ f.sources.length }} source{{ f.sources.length===1?'':'s' }} · {{ fmt.usd2(g.siteCostPerHour(f)*24) }}/day</div></span>
        <span class="sec-cv" :class="{open:sec.power}" aria-hidden="true"><svg viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6"/></svg></span></button>
      <div v-if="sec.power" class="card-bd">
        <div class="flowgrid">
          <div class="flowcol">
            <div class="flow-k">Coming from</div>
            <div class="flow-v"><template v-if="flowInTop"><b class="flow-src">{{ flowInTop.k }}</b>
              &mdash; {{ fmt.w(flowInTop.w) }}</template><template v-else>nothing drawn</template></div>
            <div class="track" style="height:12px;display:flex;overflow:hidden;margin:7px 0 0">
              <i v-for="seg in flowIn" :key="seg.k" :title="seg.k" :style="{width:seg.pct+'%',background:seg.c,height:'100%',display:'block'}"></i>
            </div>
          </div>
          <div class="flowcol">
            <div class="flow-k">Going to</div>
            <div class="flow-v"><template v-if="flowOutTop"><b class="flow-src">{{ flowOutTop.k }}</b>
              &mdash; {{ fmt.w(flowOutTop.w) }}</template><template v-else>&mdash;</template></div>
            <div class="track" style="height:12px;display:flex;overflow:hidden;margin:7px 0 0">
              <i v-for="seg in flowOut" :key="seg.k" :title="seg.k" :style="{width:seg.pct+'%',background:seg.c,height:'100%',display:'block'}"></i>
            </div>
          </div>
        </div>
        <div class="billrow">
          <div><div class="flow-k">Bill today</div>
            <div class="bill-v">{{ fmt.usd2(billToday) }}</div></div>
          <div class="bill-r"><div class="flow-k">Of that, cooling</div>
            <div class="bill-s" :class="billCoolShare>0.25?'neg':billCoolShare>0?'amb':''">
              {{ billToday>0 ? fmt.pct(billCoolShare,1) : 'nothing drawn yet' }}</div></div>
        </div>
        <div v-if="g.battFirm(f)>0" class="track-cap" style="margin-top:8px">
          <span>Battery adds {{ fmt.w(g.battFirm(f)) }} of firm capacity right now</span>
          <b>{{ fmt.w(g.siteCapacity(f)+g.battFirm(f)) }} usable</b></div>
        <div v-if="f.bill" class="totals" style="margin-top:9px">
          <div><div class="k">Off-peak today</div><div class="v">{{ fmt.usd2(f.bill.off) }}</div></div>
          <div><div class="k">Shoulder</div><div class="v">{{ fmt.usd2(f.bill.sh) }}</div></div>
          <div><div class="k">Peak</div><div class="v" :class="f.bill.peak>f.bill.off+f.bill.sh?'neg':''">{{ fmt.usd2(f.bill.peak) }}</div></div>
          <div><div class="k">Of that, cooling</div><div class="v">{{ fmt.usd2(f.bill.cool) }}</div></div>
        </div>
        <div v-if="f.bill&&f.bill.saved>0.005" class="track-cap" style="margin-top:4px">
          <span>Free sources saved you today</span><b class="pos">{{ fmt.usd2(f.bill.saved) }}</b></div>
        <div v-for="m in mix" :key="m.id" class="dl">
          <dt>{{ m.name }} <span class="tag" :class="m.kind==='solar'?'d':m.kind==='wind'?'b':m.kind==='gen'?'r':''">{{ m.kind }}</span></dt>
          <dd>{{ fmt.w(m.out) }}<span style="color:var(--ink-3)">{{ m.rate>0?' at '+fmt.usd2(m.rate):' free' }}</span></dd></div>
        <p v-if="g.s.help" class="hint">Sources are used cheapest first, so free solar and wind are consumed before metered grid. Solar output follows the clock — capacity falls at night, and rigs are shed if you have overbuilt on panels.</p>
        <button class="btn btn-wide" style="margin-top:9px" @click="g.s.sitePicker='source'">Install a power source</button>
      </div>
    </div>

    <!-- Battery and cooling: what keeps the floor alive between the meter and
         the racks. Stacked rather than paired side by side — the shell is
         capped at 440px, and two of these columns at ~200px each turn every
         reading into a two-line wrap. -->
    <div class="card">
        <button class="rig-hd" style="width:100%" @click="sec.batt=!sec.batt">
          <span class="sec-ico blu" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M3 8h14v8H3z"/><path d="M20 11v2"/></svg></span>
          <span style="flex:1;text-align:left"><span class="nm">Battery</span>
            <div class="sb">{{ battKwh>0 ? (f.batt||0).toFixed(1)+' of '+battKwh+' kWh · '+battMode.k : 'none installed' }}</div></span>
          <span class="sec-cv" :class="{open:sec.batt}" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6"/></svg></span></button>
        <div v-if="sec.batt" class="card-bd">
          <template v-if="battKwh>0">
            <div class="flow-k">Charge</div>
            <div class="pair-row">
              <span class="pair-v">{{ (f.batt||0).toFixed(0) }} kWh / {{ battKwh }} kWh</span>
              <b class="pair-pct">{{ (battPct*100).toFixed(0) }}%</b>
            </div>
            <div class="track" style="margin:7px 0 6px"><i class="b" :style="{width:(battPct*100)+'%'}"></i></div>
            <div class="dl"><dt>Right now</dt><dd><span :class="battMode.cls">{{ battMode.text }}</span></dd></div>
            <div class="swrow">
              <button class="switch" :class="{on:f.disAny}" @click="f.disAny=!f.disAny"
                      aria-label="discharge any" :aria-pressed="!!f.disAny"><i></i></button>
              <span class="swk">Discharge</span>
              <button class="switch" :class="{on:f.gridCharge}" @click="f.gridCharge=!f.gridCharge"
                      aria-label="grid charge" :aria-pressed="!!f.gridCharge"><i></i></button>
              <span class="swk">Grid charge</span>
            </div>
            <p v-if="g.battAdvice(f)" class="hint" :style="g.battAdvice(f).warn?'color:var(--amber)':''">{{ g.battAdvice(f).text }}</p>
            <p v-if="g.s.help" class="hint">Soaks free solar surplus, and can buy cheap off-peak grid to spend during the 17:00&ndash;21:00 peak. While charged it also counts toward capacity, carrying a renewable site through the night.</p>
          </template>
          <p v-else class="note">No battery installed. One soaks solar surplus, arbitrages the tariff, and keeps rigs alive after dark.</p>
          <button class="btn btn-wide" style="margin-top:9px" @click="g.s.sitePicker='storage'">Install a battery</button>
        </div>
    </div>

    <div class="card">
        <button class="rig-hd" style="width:100%" @click="sec.cool=!sec.cool">
          <span class="sec-ico blu" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M12 3v18"/><path d="m4.2 7.5 15.6 9"/><path d="m19.8 7.5-15.6 9"/></svg></span>
          <span style="flex:1;text-align:left"><span class="nm">Cooling</span>
            <span v-if="floor.temp>=70" class="tag" style="background:var(--red-t);color:var(--red);margin-left:5px">COOKING</span>
            <div class="sb">{{ floor.temp.toFixed(0) }}&deg;C · {{ f.plants.length }} unit{{ f.plants.length===1?'':'s' }}</div></span>
          <span class="sec-cv" :class="{open:sec.cool}" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6"/></svg></span></button>
        <div v-if="sec.cool" class="card-bd">
          <div class="flow-k">Heat track</div>
          <div class="heat" :class="'h-'+coolTone">
            <svg class="heat-wave" viewBox="0 0 100 24" preserveAspectRatio="none"
                 role="img" :aria-label="'Heat at '+fmt.pct(heatLoad,0)+' of cooling capacity'">
              <path :d="heatPath" fill="none" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
            </svg>
            <div class="heat-v">
              <b>{{ floor.temp.toFixed(0) }} &deg;C</b>
              <span>Max exhaust</span></div>
          </div>
          <div class="track" style="margin-top:9px"><i :class="g.siteHeat(f)>g.siteCooling(f)?'o':g.siteTemp(f)>58?'w':'g'" :style="{width:Math.min(100,g.siteHeat(f)/Math.max(1,g.siteCooling(f))*100)+'%'}"></i></div>
          <div class="track-cap"><span>Heat against capacity</span><b>{{ fmt.w(g.siteHeat(f)) }} / {{ fmt.w(g.siteCooling(f)) }}</b></div>
          <div class="dl"><dt>Outside</dt><dd>{{ g.ambient.toFixed(0) }}&deg;C</dd></div>
          <div class="dl"><dt>Cooling draws</dt>
            <dd :class="g.sitePlantW(f)>g.siteDemand(f)*0.25?'neg':''">{{ fmt.w(g.sitePlantW(f)) }}
              <span style="color:var(--ink-3)"> · {{ fmt.pct(g.sitePlantW(f)/Math.max(1,g.siteDemand(f)),0) }} of the bill</span></dd></div>
          <div class="dl" v-if="g.throttleOf(f)<1"><dt>Thermal throttle</dt><dd class="neg">−{{ fmt.pct(1-g.throttleOf(f),0) }} hashrate</dd></div>
          <div v-for="pl in f.plants" :key="pl.p" class="dl">
            <dt>{{ g.SITEPART(pl.p).name }}{{ pl.n>1?' ×'+pl.n:'' }}</dt>
            <dd>{{ fmt.w(g.SITEPART(pl.p).cap*pl.n) }}<span style="color:var(--ink-3)"> · {{ fmt.pct(g.SITEPART(pl.p).pue,0) }} overhead</span></dd></div>
          <p v-if="g.s.help" class="hint">Cooling burns a share of the heat it removes, so a cheap plant is cheap to buy and expensive to run. Above 70&deg;C cards throttle; above 58&deg;C they wear faster.</p>
          <button class="btn btn-wide" style="margin-top:9px" @click="g.s.sitePicker='plant'">Install cooling</button>
        </div>
    </div>

    <div class="card fab-card">
      <button class="rig-hd fab-hd" style="width:100%" @click="sec.fab=!sec.fab">
        <span class="sec-ico blu" aria-hidden="true"><svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3
            M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1"/></svg></span>
        <span style="flex:1;text-align:left"><span class="nm">Fabrication</span>
          <div class="sb">{{ f.fab ? g.FAB(f.fab).name
            : '3D printers, machine shop, assembly — ' + (fabQueued ? 'under construction' : 'not installed') }}</div></span>
        <img class="fab-shot" :src="fabShot" alt="" aria-hidden="true" />
        <span class="sec-cv" :class="{open:sec.fab}" aria-hidden="true"><svg viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6"/></svg></span></button>
      <div v-if="sec.fab" class="card-bd">
        <template v-if="f.fab">
          <div class="dl"><dt>Tier</dt><dd>{{ g.FAB(f.fab).tier }} of {{ g.FABS.length }}</dd></div>
          <div class="dl"><dt>Design budget</dt><dd>{{ g.FAB(f.fab).budget }}</dd></div>
          <div class="dl"><dt>Can manufacture</dt><dd style="text-transform:capitalize">{{ g.FAB(f.fab).slots.join(', ') }}</dd></div>
          <p v-if="g.s.help" class="hint">The design budget is what a custom part's tuning can spend — pushing one stat further costs more of it the further you push.</p>
        </template>
        <p v-else-if="fabQueued" class="note">Under construction — see the queue below for progress.</p>
        <p v-else class="note">No fabrication bay here. Installing one is the single biggest bet in the game — expensive and slow to build — but it is what lets you design and manufacture parts with numbers nothing in any catalogue can match.</p>
        <button v-if="!fabQueued" class="btn btn-wide" style="margin-top:9px" @click="g.s.sitePicker='fab'">{{ f.fab?'Upgrade the fab':'Install a fab' }}</button>
        <button v-if="f.fab" class="btn btn-wide btn-ghost" style="margin-top:6px" @click="g.s.sitePicker='design'">Design a part</button>
      </div>
    </div>

    <div v-if="f.queue.length" class="card">
      <div class="card-hd"><span class="eyebrow">Construction queue</span>
        <span class="eyebrow">{{ f.queue.length }} job{{ f.queue.length===1?'':'s' }}</span></div>
      <div class="list">
        <div v-for="(j,i) in f.queue" :key="i" class="qrow">
          <span class="qslot" aria-hidden="true">{{ JOB_LABEL[j.kind] || 'Build' }}</span>
          <span class="qmain">
            <span class="qhd"><span class="nm">{{ g.jobPart(j).name }}</span></span>
            <span class="qbar">
              <span class="track" style="margin:0;flex:1">
                <i class="b" :style="{width:((1-j.left/j.total)*100).toFixed(0)+'%'}"></i></span>
              <b class="qpct">{{ ((1-j.left/j.total)*100).toFixed(0) }}%</b></span>
            <span class="sb">{{ j.left.toFixed(1) }} h remaining of {{ j.total }}</span>
          </span>
          <button class="btn btn-sm qrush" :disabled="g.s.cash<g.rushCost(j)" @click="g.rush(f.id,i)">Rush {{ fmt.usd(g.rushCost(j)) }}</button>
        </div>
      </div>
    </div>

    <div v-if="g.s.sitePicker" class="sheet" ref="pickerSheetEl" role="dialog" aria-modal="true" aria-labelledby="site-picker-title">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="g.s.sitePicker=null">&lsaquo; Back</button>
        <span class="t" id="site-picker-title">{{ g.s.sitePicker==='shell'?'New site': g.s.sitePicker==='expand'?'Expand '+f.name: g.s.sitePicker==='source'?'Power sources': g.s.sitePicker==='storage'?'Batteries': g.s.sitePicker==='fab'?(f.fab?'Upgrade the fab':'Install a fab'): g.s.sitePicker==='design'?'Design a part':'Cooling' }}</span></div>
      <div class="sheet-bd">
        <Compare v-if="g.s.sitePicker==='shell'" title="Cheapest first" metric="cost" :rows="shellRows" :pick="chooseShell" />
        <Compare v-else-if="g.s.sitePicker==='expand'" title="Cheapest first" metric="cost" :rows="expandRows" :pick="chooseExpand" />
        <Compare v-else-if="g.s.sitePicker==='source'" title="Cheapest first" metric="cost" :rows="sourceRows" :pick="chooseSrc" />
        <Compare v-else-if="g.s.sitePicker==='storage'" title="Cheapest first" metric="cost" :rows="storageRows" :pick="chooseStorage" />
        <Compare v-else-if="g.s.sitePicker==='fab'" title="Cheapest first" metric="cost" :rows="fabRows" :pick="chooseFabPick" />
        <template v-else-if="g.s.sitePicker==='design'">
          <div class="list">
            <button v-for="k in designKinds" :key="k" class="rowline" @click="openDesignKind(k)">
              <span style="flex:1"><span class="nm">{{ KIND_LABEL[k] }}</span></span><span class="ch">&rsaquo;</span></button>
          </div>
        </template>
        <Compare v-else title="Cheapest first" metric="cost" :rows="plantRows" :pick="choosePlant" />
        <p v-if="g.s.sitePicker==='expand'&&!expandRows.length" class="note">{{ f.name }} is already at the largest shell there is.</p>
        <p v-if="g.s.sitePicker==='fab'&&!fabRows.length" class="note">{{ f.name }}'s fab is already at the top tier.</p>
        <p v-if="g.s.sitePicker==='expand'" class="hint" style="padding:0 2px">Only shells bigger than {{ f.name }}'s current one are listed. Half the old shell's price is credited toward the new one, and everything at the site — rigs, power, cooling — keeps running through the build.</p>
        <p v-else-if="g.s.sitePicker==='fab'" class="hint" style="padding:0 2px">Only tiers bigger than the current one are listed. Half the old fab's price is credited toward the new one. Construction takes real hours, same as everything else here — you can pay again to rush it.</p>
        <p v-else-if="g.s.sitePicker==='design'" class="hint" style="padding:0 2px">What you can spend tuning it comes from the fab's design budget, not your wallet — the next screen shows both.</p>
        <p v-else class="hint" style="padding:0 2px">Construction starts as soon as you pay, and takes real hours. You can pay again to rush it.</p>
      </div>
    </div>

    <DesignSheet :site="f" :kind-labels="KIND_LABEL" />
  </div>
</template>

<style scoped>
/* ---- site switcher ---- */
.sitepick{overflow:hidden}
.sitepick-hd{display:flex;align-items:center;gap:9px;width:100%;padding:11px 12px;text-align:left}
.sitepick-ico{flex:none;width:15px;height:15px;color:var(--ink-3)}
.sitepick-ico svg,.sitepick-cv svg{width:100%;height:100%;fill:none;stroke:currentColor;
  stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sitepick-cur{flex:1;min-width:0;font-size:14px;font-weight:500;letter-spacing:-.01em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sitepick-cv{flex:none;width:15px;height:15px;color:var(--ink-3);transition:transform .2s ease}
.sitepick-cv.open{transform:rotate(180deg)}
.sitepick-row.on{background:var(--green-t)}
.sitepick-row .ch{flex:none;color:var(--ink-3);font-size:13px}

/* ---- site hero ----
   The render is a backdrop, not a picture: it sits under a scrim heavy enough
   that the name and the three readings clear contrast on it whatever the shot
   is doing, and the card keeps its own border so it still reads as a card. */
.site-hero{position:relative;padding:0;overflow:hidden;isolation:isolate}
.site-hero-bg{position:absolute;inset:0;z-index:0;pointer-events:none}
/* Lighter overall than it used to be. The old plates were bright skies over a
   quarry and needed holding down; these are interiors already shot with their
   mid-tones up and their top third kept calm, so the same scrim buried the
   room the card exists to show.

   Two layers rather than one, because the two jobs are different. ::after is
   the overall wash, now gentle at the top. ::before is a short band behind the
   status pill alone — 9.5px uppercase, no plate of its own, and the one piece
   of type here that the lighter wash left short of 4.5:1. It decays inside
   74px, so it buys that row its contrast without touching the room below. */
.site-hero::before{content:'';position:absolute;inset:0 0 auto 0;height:74px;z-index:1;
  pointer-events:none;
  background:linear-gradient(180deg,rgba(4,6,9,.74) 0%,rgba(4,6,9,.34) 58%,rgba(4,6,9,0) 100%)}
.site-hero::after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;
  background:linear-gradient(180deg,rgba(4,6,9,.22) 0%,rgba(4,6,9,.50) 44%,rgba(4,6,9,.88) 100%)}
.site-hero-in{position:relative;z-index:2;padding:12px 14px 14px}
.site-hero-hd{display:flex;align-items:center;gap:10px;margin-bottom:7px}
.site-hero-status{display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:600;
  letter-spacing:.06em;text-transform:uppercase;color:#9AA6B2;flex:1;min-width:0}
.site-hero-status.online{color:#3BE08C}
.site-hero-status.hot{color:#FF7A6E}
.site-hero-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.site-hero-status.online .site-hero-dot{box-shadow:0 0 7px currentColor}
.site-hero-status.hot .site-hero-dot{box-shadow:0 0 7px currentColor}
.site-hero-rename{flex:none;display:inline-flex;align-items:center;gap:5px;
  border-color:rgba(255,255,255,.24);color:#EDF2F6;background:rgba(255,255,255,.08)}
.btn-ico{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round}
.site-hero-name{font-size:21px;font-weight:600;letter-spacing:-.025em;color:#F2F6F9;
  margin-bottom:12px;text-shadow:0 1px 12px rgba(0,0,0,.55)}
.site-hero-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;
  background:rgba(255,255,255,.13);border-radius:10px;overflow:hidden}
.site-hero-stats .shs{background:rgba(9,12,16,.72);padding:9px 11px;backdrop-filter:blur(3px)}
.site-hero-stats .k{display:flex;align-items:center;gap:4px;font-size:8.5px;font-weight:600;
  letter-spacing:.06em;text-transform:uppercase;color:#96A2AE}
.shs-ico{width:11px;height:11px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;
  stroke-linecap:round;stroke-linejoin:round}
.site-hero-stats .v{font-family:var(--mono);font-size:15px;font-weight:500;margin-top:3px;
  letter-spacing:-.02em;color:#F2F6F9}
.site-hero-stats .v.neg{color:#FF7A6E}
.site-hero-stats .v.amb{color:#FFB454}

/* ---- floor ---- */
.floor-card .card-hd{align-items:center;gap:8px}
.floor-k{display:inline-flex;align-items:center;gap:5px;min-width:0;white-space:nowrap}
.floor-r{flex:none;white-space:nowrap}
/* The legend's own swatch for an unoccupied position — a hollow ring, matching
   the dashed outline the tile itself uses. Deliberately NOT class "empty":
   that name is already an app-wide block-level empty-state rule. */
.riglegend .dot.d-empty{background:transparent;
  border:1px dashed color-mix(in srgb,var(--ink-3) 60%,transparent)}
.floor-ico{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round}
.floor-temp{display:inline-block;margin-left:8px;padding:1px 6px;border-radius:999px;
  font-family:var(--mono);font-size:10px;font-weight:600;background:var(--line-2);
  color:var(--ink-3);vertical-align:1px}
.floor-temp.t-warm{background:var(--amber-t);color:var(--amber)}
.floor-temp.t-hot{background:var(--red-t);color:var(--red);
  box-shadow:0 0 8px color-mix(in srgb,var(--red) 35%,transparent)}
.rigwrap{border-radius:0 0 12px 12px;transition:background-color .6s ease,box-shadow .6s ease}
.rigwrap.ambient-warm{background:linear-gradient(180deg,
  color-mix(in srgb,var(--amber-t) 55%,transparent),color-mix(in srgb,var(--amber-t) 15%,transparent))}
.rigwrap.ambient-hot{background:linear-gradient(180deg,
  color-mix(in srgb,var(--red-t) 70%,transparent),color-mix(in srgb,var(--red-t) 20%,transparent));
  box-shadow:inset 0 0 24px color-mix(in srgb,var(--red) 18%,transparent)}

/* ---- manage site ---- */
.mgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.mact{display:flex;flex-direction:column;align-items:center;gap:3px;padding:11px 6px 10px;
  border:1px solid var(--line);border-radius:9px;background:transparent;text-align:center;
  transition:var(--press),background-color .2s,border-color .2s}
.mact:active:not(:disabled){transform:scale(var(--press-scale));background:var(--line-2)}
.mact:disabled{opacity:.45;cursor:not-allowed}
.mact-ico{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round;color:var(--ink-2);margin-bottom:2px}
.mact-t{font-size:12.5px;font-weight:500;letter-spacing:-.01em}
.mact-s{font-size:9.5px;color:var(--ink-3);line-height:1.25}
.mact.danger{border-color:color-mix(in srgb,var(--red) 30%,var(--line))}
.mact.danger .mact-ico,.mact.danger .mact-t{color:var(--red)}
.mact.danger .mact-s{color:color-mix(in srgb,var(--red) 62%,var(--ink-3))}
.mact.danger:disabled{border-color:var(--line)}
.mact.danger:disabled .mact-ico,.mact.danger:disabled .mact-t,
.mact.danger:disabled .mact-s{color:var(--ink-3)}

/* ---- collapsible section chrome ---- */
.sec-ico{flex:none;width:16px;height:16px;margin-top:1px}
.sec-ico svg,.sec-cv svg{width:100%;height:100%;fill:none;stroke:currentColor;
  stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sec-ico.blu{color:var(--blue)}
.sec-cv{flex:none;width:15px;height:15px;color:var(--ink-3);margin-top:2px;
  transition:transform .2s ease}
.sec-cv.open{transform:rotate(180deg)}

/* ---- power flow ---- */
.flowgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.flow-k{font-size:9px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.flow-v{font-family:var(--mono);font-size:12px;color:var(--ink-2);margin-top:3px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Only the source's own name is title-cased — running capitalize over the
   whole line would turn "kW" into "KW". */
.flow-src{font-weight:400;text-transform:capitalize}
.billrow{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;
  margin-top:11px;padding-top:9px;border-top:1px solid var(--line-2)}
.bill-v{font-family:var(--mono);font-size:17px;font-weight:500;letter-spacing:-.02em;margin-top:2px}
.bill-r{text-align:right}
.bill-s{font-family:var(--mono);font-size:12px;margin-top:3px}
.bill-s.amb{color:var(--amber)}
.bill-s.neg{color:var(--red)}

/* ---- battery + cooling ---- */
.pair-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:3px}
.pair-v{font-family:var(--mono);font-size:13px;color:var(--ink-2)}
.pair-pct{font-family:var(--mono);font-size:13px;font-weight:500}
.swrow{display:grid;grid-template-columns:auto 1fr auto 1fr;align-items:center;gap:7px;margin-top:10px}
.swk{font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}
.heat{position:relative;margin-top:5px;border-radius:9px;padding:8px 10px;overflow:hidden;
  display:flex;align-items:center;gap:10px;background:var(--line-2)}
.heat-wave{flex:1;min-width:0;height:30px}
.heat-wave path{stroke:var(--blue)}
.heat-v{flex:none;text-align:right}
.heat-v b{display:block;font-family:var(--mono);font-size:14px;font-weight:500;color:var(--blue)}
.heat-v span{font-size:8.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.heat.h-warm{background:var(--amber-t)}
.heat.h-warm .heat-wave path,.heat.h-warm .heat-v b{stroke:var(--amber);color:var(--amber)}
.heat.h-hot{background:var(--red-t);box-shadow:inset 0 0 18px color-mix(in srgb,var(--red) 20%,transparent)}
.heat.h-hot .heat-wave path,.heat.h-hot .heat-v b{stroke:var(--red);color:var(--red)}

/* ---- fabrication ---- */
.fab-hd{align-items:center}
.fab-shot{flex:none;width:56px;height:42px;border-radius:7px;object-fit:cover;
  border:1px solid #22262d;background:#07080a}

/* ---- construction queue ---- */
.qrow{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--line-2)}
.qrow:first-child{border-top:none}
.qslot{flex:none;display:flex;align-items:center;justify-content:center;min-width:52px;height:30px;
  padding:0 7px;border:1px dashed color-mix(in srgb,var(--ink-3) 42%,transparent);border-radius:6px;
  font-size:9.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}
.qmain{flex:1;min-width:0}
.qhd{display:flex;align-items:baseline;gap:7px}
.qhd .nm{font-size:13px;font-weight:500;letter-spacing:-.01em}
.qbar{display:flex;align-items:center;gap:8px;margin:5px 0 3px}
.qpct{flex:none;font-family:var(--mono);font-size:10.5px;font-weight:500;color:var(--ink-3)}
.qmain .sb{display:block;font-size:10px;color:var(--ink-3)}
.qrush{flex:none;background:var(--amber-t);color:var(--amber);font-weight:500}
.qrush:active:not(:disabled){background:color-mix(in srgb,var(--amber) 25%,transparent)}
</style>
