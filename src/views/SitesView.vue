<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import Compare from '../components/Compare.vue';

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
const floor=computed(()=>{
  const rigs=rigsHere.value, slots=Math.max(g.siteSlots(f.value), rigs.length), cells=[];
  let running=0;
  for(const r of rigs){
    if(cells.length>=MAX_TILES) break;
    const st=g.rigState(r);
    if(st.dot==='run') running++;
    cells.push({ key:'r'+r.id, id:r.id, dot:st.dot, n:cells.length+1,
      label:'Position '+(cells.length+1)+' — '+r.name+', '+st.label
            +(st.sub?' ('+st.sub+')':'') });
  }
  const empties=Math.min(MAX_EMPTY, MAX_TILES-cells.length, slots-rigs.length);
  for(let i=0;i<empties;i++) cells.push({ key:'e'+i, id:null });
  return { cells, rigs:rigs.length, slots, running,
           hidden:Math.max(0, slots-cells.length) };
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
const designPreview=computed(()=>{
  const d=g.s.design; if(!d) return null;
  return { axes:g.DESIGN_AXES[d.kind], fab:g.FAB(f.value.fab),
    totals:g.designTotals(d.kind,d.picks), stats:g.designStats(d.kind,d.picks),
    cost:g.designCost(d.kind,d.picks) };
});
const designSheetEl=ref(null);
useSheetA11y(designSheetEl, computed(()=>!!g.s.design), ()=>{ g.closeDesign(); });

const pickerSheetEl=ref(null);
useSheetA11y(pickerSheetEl, computed(()=>!!g.s.sitePicker), ()=>{ g.s.sitePicker=null; });
</script>

<template>
  <div>
    <div class="card"><div class="list">
      <button v-for="st in g.s.sites" :key="st.id" class="rowline"
              :style="{background: st.id===g.s.activeSite?'var(--green-t)':''}"
              :aria-current="st.id===g.s.activeSite?'true':null"
              @click="g.s.activeSite=st.id">
        <span style="flex:1;min-width:0"><span class="nm">{{ st.name }}</span>
          <div class="sb">{{ fmt.w(g.siteDemand(st)) }} / {{ fmt.w(g.siteCapacity(st)) }}
            &middot; {{ g.siteRigs(st).length }}/{{ g.siteSlots(st) }} positions
            &middot; {{ g.siteTemp(st).toFixed(0) }}&deg;</div></span>
        <span class="rt blu" v-if="st.queue.length">{{ st.queue.length }} building</span>
      </button>
      <button class="rowline" @click="g.s.sitePicker='shell'">
        <span style="flex:1"><span class="nm blu">+ New site</span>
          <div class="sb">buy a shell, then install power and cooling yourself</div></span>
        <span class="ch">&rsaquo;</span></button>
    </div></div>

    <!-- the site as a place: one square per rig position, lit by live status -->
    <div class="card" data-tour="sites">
      <div class="card-hd"><span class="eyebrow">Floor</span>
        <span class="eyebrow">{{ floor.rigs }}/{{ floor.slots }} positions</span></div>
      <div class="rigwrap">
        <!-- a handful of tiles breathing reads as a farm running; twenty in
             lockstep reads as a strobing wall, so past that they hold still -->
        <div class="riggrid" :class="{calm:floor.running>20}">
          <template v-for="c in floor.cells" :key="c.key">
            <button v-if="c.id!==null" class="rigtile" :class="c.dot"
                    :title="c.label" :aria-label="c.label"
                    @click="openTile(c.id)">{{ c.n }}</button>
            <div v-else class="rigtile empty" aria-hidden="true"></div>
          </template>
        </div>
        <div v-if="legend.length" class="riglegend">
          <span v-for="l in legend" :key="l.k"><i class="dot" :class="l.k"></i>{{ l.label }}
            {{ l.n }}</span>
        </div>
        <div class="rigcap">
          <template v-if="floor.rigs">Tap a position to open that rig.</template>
          <template v-else>Nothing installed here yet &mdash; {{ floor.slots }}
            position{{ floor.slots===1?'':'s' }} waiting.</template>
          <span v-if="floor.hidden"> &middot; {{ floor.hidden }} further
            position{{ floor.hidden===1?'':'s' }} not drawn</span>
        </div>
      </div>
    </div>

    <div class="card"><div class="card-bd pt">
      <div class="card-hd" style="padding:0 0 7px"><span class="eyebrow">Manage {{ f.name }}</span>
        <span class="eyebrow">{{ g.siteRigs(f).length }}/{{ g.siteSlots(f) }} positions</span></div>
      <template v-if="renameOpen">
        <label class="sr-only" for="site-rename-input">Site name</label>
        <input id="site-rename-input" v-model="renameDraft" maxlength="24" placeholder="Site name"
               style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;
                      font:inherit;font-size:13px;margin-bottom:6px" @keyup.enter="saveRename">
        <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0">
          <button class="btn btn-ghost" @click="renameOpen=false">Cancel</button>
          <button class="btn btn-pri" @click="saveRename">Save name</button>
        </div>
      </template>
      <template v-else>
        <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0">
          <button class="btn btn-ghost btn-sm" @click="startRename">Rename</button>
          <button class="btn btn-ghost btn-sm" @click="g.s.sitePicker='expand'">Expand shell</button>
        </div>
        <p class="hint">Expanding grows the shell in place — power, cooling and rigs stay put,
          and the old shell's value is credited toward the new one.</p>
        <button class="btn btn-ghost btn-sm btn-wide" style="margin-top:8px"
                :disabled="!canDecommission" @click="decommission">
          {{ !canDecommission
             ? (g.s.sites.length<=1 ? 'Your only site — cannot decommission'
                : g.siteRigs(f).length>0 ? 'Move its rigs out first'
                : 'Finish construction first')
             : decomArm ? 'Tap again to confirm — this cannot be undone'
             : 'Decommission this site' }}</button>
      </template>
    </div></div>

    <div class="card">
      <button class="rig-hd" style="width:100%" @click="sec.power=!sec.power">
        <span style="flex:1;text-align:left"><span class="nm">Power</span>
          <div class="sb">{{ fmt.w(g.siteCapacity(f)) }} available ·
            {{ f.sources.length }} source{{ f.sources.length===1?'':'s' }} ·
            {{ fmt.usd2(g.siteCostPerHour(f)*24) }}/day</div></span>
        <span style="font-size:14px">{{ sec.power?'−':'+' }}</span></button>
      <div v-if="sec.power" class="card-bd">
        <div class="track" style="height:14px;display:flex;overflow:hidden">
          <i v-for="seg in flowIn" :key="seg.k" :title="seg.k"
             :style="{width:seg.pct+'%',background:seg.c,height:'100%',display:'block'}"></i>
        </div>
        <div class="track-cap"><span>Coming from</span>
          <b>{{ flowIn.filter(x=>x.pct>0).map(x=>x.k+' '+fmt.w(x.w)).join(' · ') || 'nothing drawn' }}</b></div>
        <div class="track" style="height:14px;display:flex;overflow:hidden;margin-top:6px">
          <i v-for="seg in flowOut" :key="seg.k" :title="seg.k"
             :style="{width:seg.pct+'%',background:seg.c,height:'100%',display:'block'}"></i>
        </div>
        <div class="track-cap"><span>Going to</span>
          <b>{{ flowOut.filter(x=>x.pct>0).map(x=>x.k+' '+fmt.w(x.w)).join(' · ') || '—' }}</b></div>
        <div class="track-cap" style="margin-top:4px"><span>Bill at this moment</span>
          <b>{{ fmt.usd2(g.siteCostPerHour(f)*24) }}/day</b></div>
        <div v-if="g.battFirm(f)>0" class="track-cap" style="margin-top:2px">
          <span>Battery adds {{ fmt.w(g.battFirm(f)) }} of firm capacity right now</span>
          <b>{{ fmt.w(g.siteCapacity(f)+g.battFirm(f)) }} usable</b></div>
        <div v-if="f.bill" class="totals" style="margin-top:9px">
          <div><div class="k">Off-peak today</div><div class="v">{{ fmt.usd2(f.bill.off) }}</div></div>
          <div><div class="k">Shoulder</div><div class="v">{{ fmt.usd2(f.bill.sh) }}</div></div>
          <div><div class="k">Peak</div>
            <div class="v" :class="f.bill.peak>f.bill.off+f.bill.sh?'neg':''">{{ fmt.usd2(f.bill.peak) }}</div></div>
          <div><div class="k">Of that, cooling</div><div class="v">{{ fmt.usd2(f.bill.cool) }}</div></div>
        </div>
        <div v-if="f.bill&&f.bill.saved>0.005" class="track-cap" style="margin-top:4px">
          <span>Free sources saved you today</span>
          <b class="pos">{{ fmt.usd2(f.bill.saved) }}</b></div>
        <button class="btn btn-sm btn-ghost btn-wide" style="margin-top:8px"
                @click="sec.power=!sec.power">
          {{ sec.power?'Hide':'Show' }} the {{ mix.length }} source{{ mix.length===1?'':'s' }}
          feeding this</button>
        <template v-if="sec.power">
          <div v-for="m in mix" :key="m.id" class="dl">
            <dt>{{ m.name }} <span class="tag" :class="m.kind==='solar'?'d':m.kind==='wind'?'b':m.kind==='gen'?'r':''">
              {{ m.kind }}</span></dt>
            <dd>{{ fmt.w(m.out) }}<span style="color:var(--ink-3)">
              {{ m.rate>0?' at '+fmt.usd2(m.rate):' free' }}</span></dd></div>
          <p v-if="g.s.help" class="hint">Sources are used cheapest first, so free solar and wind are
            consumed before metered grid. Solar output follows the clock — capacity falls at night,
            and rigs are shed if you have overbuilt on panels.</p>
        </template>
        <button class="btn btn-wide" style="margin-top:9px" @click="g.s.sitePicker='source'">
          Install a power source</button>
      </div>
    </div>

    <div class="card">
      <button class="rig-hd" style="width:100%" @click="sec.batt=!sec.batt">
        <span style="flex:1;text-align:left"><span class="nm">Battery</span>
          <div class="sb">{{ g.battKwh(f)>0
            ? (f.batt||0).toFixed(1)+' of '+g.battKwh(f)+' kWh · '+
              (plan.chW+plan.gridChW>0?'charging'
               :plan.disW>0?'discharging':'idle')
            : 'none installed' }}</div></span>
        <span style="font-size:14px">{{ sec.batt?'−':'+' }}</span></button>
      <div v-if="sec.batt" class="card-bd">
        <template v-if="g.battKwh(f)>0">
          <div class="track"><i class="b"
            :style="{width:Math.min(100,(f.batt||0)/g.battKwh(f)*100)+'%'}"></i></div>
          <div class="track-cap"><span>Stored</span>
            <b>{{ (f.batt||0).toFixed(1) }} kWh · {{ fmt.w(g.battKw(f)) }} rate</b></div>
          <div class="dl"><dt>Right now</dt><dd>
            <span v-if="plan.chW>0" class="pos">charging {{ fmt.w(plan.chW) }} from solar</span>
            <span v-else-if="plan.gridChW>0" class="blu">charging {{ fmt.w(plan.gridChW) }} off-peak</span>
            <span v-else-if="plan.disW>0" class="amb">discharging {{ fmt.w(plan.disW) }}</span>
            <span v-else>idle</span></dd></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:7px">
            <span style="font-size:13px">Charge from off-peak grid</span>
            <button class="switch" :class="{on:f.gridCharge}" @click="f.gridCharge=!f.gridCharge"
                    aria-label="grid charge" :aria-pressed="!!f.gridCharge"><i></i></button></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:7px">
            <span style="font-size:13px">Discharge outside peak too</span>
            <button class="switch" :class="{on:f.disAny}" @click="f.disAny=!f.disAny"
                    aria-label="discharge any" :aria-pressed="!!f.disAny"><i></i></button></div>
          <p v-if="g.battAdvice(f)" class="hint"
             :style="g.battAdvice(f).warn?'color:var(--amber)':''">{{ g.battAdvice(f).text }}</p>
          <p v-if="g.s.help" class="hint">Soaks free solar surplus, and can buy cheap off-peak
            grid to spend during the 17:00&ndash;21:00 peak. While charged it also counts toward
            capacity, carrying a renewable site through the night.</p>
        </template>
        <p v-else class="note">No battery installed. One soaks solar surplus, arbitrages the
          tariff, and keeps rigs alive after dark.</p>
        <button class="btn btn-wide" style="margin-top:9px" @click="g.s.sitePicker='storage'">
          Install a battery</button>
      </div>
    </div>

    <div class="card">
      <button class="rig-hd" style="width:100%" @click="sec.cool=!sec.cool">
        <span style="flex:1;text-align:left"><span class="nm">Cooling</span>
          <span v-if="(f.temp||0)>=70" class="tag"
                style="background:var(--red-t);color:var(--red);margin-left:5px">COOKING</span>
          <div class="sb">{{ (f.temp||0).toFixed(0) }}&deg;C ·
            {{ f.plants.length }} unit{{ f.plants.length===1?'':'s' }}</div></span>
        <span style="font-size:14px">{{ sec.cool?'−':'+' }}</span></button>
      <div v-if="sec.cool" class="card-bd">
        <div class="track">
          <i :class="g.siteHeat(f)>g.siteCooling(f)?'o':g.siteTemp(f)>58?'w':'g'"
             :style="{width:Math.min(100,g.siteHeat(f)/Math.max(1,g.siteCooling(f))*100)+'%'}"></i></div>
        <div class="track-cap"><span>Heat against capacity</span>
          <b>{{ fmt.w(g.siteHeat(f)) }} / {{ fmt.w(g.siteCooling(f)) }}</b></div>
        <div class="dl"><dt>Outside</dt><dd>{{ g.ambient.toFixed(0) }}&deg;C</dd></div>
        <div class="dl"><dt>Cooling draws</dt>
          <dd :class="g.sitePlantW(f)>g.siteDemand(f)*0.25?'neg':''">{{ fmt.w(g.sitePlantW(f)) }}
            <span style="color:var(--ink-3)">
              · {{ fmt.pct(g.sitePlantW(f)/Math.max(1,g.siteDemand(f)),0) }} of the bill</span></dd></div>
        <div class="dl" v-if="g.throttleOf(f)<1"><dt>Thermal throttle</dt>
          <dd class="neg">−{{ fmt.pct(1-g.throttleOf(f),0) }} hashrate</dd></div>
        <div v-for="pl in f.plants" :key="pl.p" class="dl">
          <dt>{{ g.SITEPART(pl.p).name }}{{ pl.n>1?' ×'+pl.n:'' }}</dt>
          <dd>{{ fmt.w(g.SITEPART(pl.p).cap*pl.n) }}
            <span style="color:var(--ink-3)"> · {{ fmt.pct(g.SITEPART(pl.p).pue,0) }} overhead</span></dd></div>
        <p v-if="g.s.help" class="hint">Cooling burns a share of the heat it removes, so a cheap
          plant is cheap to buy and expensive to run. Above 70&deg;C cards throttle; above 58&deg;C they
          wear faster. Outside temperature peaks a few hours after the sun does — the room is
          hottest shortly after your power is cheapest.</p>
        <button class="btn btn-wide" style="margin-top:9px" @click="g.s.sitePicker='plant'">
          Install cooling</button>
      </div>
    </div>

    <div class="card">
      <button class="rig-hd" style="width:100%" @click="sec.fab=!sec.fab">
        <span style="flex:1;text-align:left"><span class="nm">Fabrication</span>
          <div class="sb">{{ f.fab ? g.FAB(f.fab).name : fabQueued ? 'under construction' : 'not installed' }}</div></span>
        <span style="font-size:14px">{{ sec.fab?'−':'+' }}</span></button>
      <div v-if="sec.fab" class="card-bd">
        <template v-if="f.fab">
          <div class="dl"><dt>Tier</dt><dd>{{ g.FAB(f.fab).tier }} of {{ g.FABS.length }}</dd></div>
          <div class="dl"><dt>Design budget</dt><dd>{{ g.FAB(f.fab).budget }}</dd></div>
          <div class="dl"><dt>Can manufacture</dt><dd style="text-transform:capitalize">
            {{ g.FAB(f.fab).slots.join(', ') }}</dd></div>
          <p v-if="g.s.help" class="hint">The design budget is what a custom part's tuning can spend —
            pushing one stat further costs more of it the further you push. A bigger fab buys a bigger
            budget and more slot types, not better parts on its own.</p>
        </template>
        <p v-else-if="fabQueued" class="note">Under construction — see the queue below for progress.</p>
        <p v-else class="note">No fabrication bay here. Installing one is the single biggest bet in
          the game — expensive and slow to build — but it is what lets you design and manufacture
          parts with numbers nothing in any catalogue can match.</p>
        <button v-if="!fabQueued" class="btn btn-wide" style="margin-top:9px" @click="g.s.sitePicker='fab'">
          {{ f.fab?'Upgrade the fab':'Install a fab' }}</button>
        <button v-if="f.fab" class="btn btn-wide btn-ghost" style="margin-top:6px"
                @click="g.s.sitePicker='design'">Design a part</button>
      </div>
    </div>

    <div v-if="f.queue.length" class="card">
      <div class="card-hd"><span class="eyebrow">Under construction</span></div>
      <div class="list">
        <div v-for="(j,i) in f.queue" :key="i" class="rowline">
          <span style="flex:1;min-width:0"><span class="nm">{{ g.jobPart(j).name }}</span>
            <div class="sb">{{ j.left.toFixed(1) }} h remaining of {{ j.total }}</div>
            <div class="track" style="margin:6px 0 0"><i class="b"
              :style="{width:((1-j.left/j.total)*100).toFixed(0)+'%'}"></i></div></span>
          <button class="btn btn-sm btn-ghost" :disabled="g.s.cash<g.rushCost(j)"
                  @click="g.rush(f.id,i)">Rush {{ fmt.usd(g.rushCost(j)) }}</button>
        </div>
      </div>
    </div>

    <div v-if="g.s.sitePicker" class="sheet" ref="pickerSheetEl" role="dialog" aria-modal="true"
         aria-labelledby="site-picker-title">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="g.s.sitePicker=null">&lsaquo; Back</button>
        <span class="t" id="site-picker-title">{{ g.s.sitePicker==='shell'?'New site':
          g.s.sitePicker==='expand'?'Expand '+f.name:
          g.s.sitePicker==='source'?'Power sources':
          g.s.sitePicker==='storage'?'Batteries':
          g.s.sitePicker==='fab'?(f.fab?'Upgrade the fab':'Install a fab'):
          g.s.sitePicker==='design'?'Design a part':'Cooling' }}</span></div>
      <div class="sheet-bd">
        <Compare v-if="g.s.sitePicker==='shell'" title="Cheapest first" metric="cost"
                 :rows="shellRows" :pick="chooseShell" />
        <Compare v-else-if="g.s.sitePicker==='expand'" title="Cheapest first" metric="cost"
                 :rows="expandRows" :pick="chooseExpand" />
        <Compare v-else-if="g.s.sitePicker==='source'" title="Cheapest first" metric="cost"
                 :rows="sourceRows" :pick="chooseSrc" />
        <Compare v-else-if="g.s.sitePicker==='storage'" title="Cheapest first" metric="cost"
                 :rows="storageRows" :pick="chooseStorage" />
        <Compare v-else-if="g.s.sitePicker==='fab'" title="Cheapest first" metric="cost"
                 :rows="fabRows" :pick="chooseFabPick" />
        <template v-else-if="g.s.sitePicker==='design'">
          <div class="list">
            <button v-for="k in designKinds" :key="k" class="rowline" @click="openDesignKind(k)">
              <span style="flex:1"><span class="nm">{{ KIND_LABEL[k] }}</span></span>
              <span class="ch">&rsaquo;</span></button>
          </div>
        </template>
        <Compare v-else title="Cheapest first" metric="cost" :rows="plantRows" :pick="choosePlant" />
        <!-- kept outside the v-if/else-if chain above on purpose: a plain
             element with its own v-if between two v-else-if links would
             split that chain in two, and the second half's final v-else
             (plants) would then fire for every picker that isn't its own
             branch — the same bug that briefly existed here when the expand
             note lived inline between two Compare elements. -->
        <p v-if="g.s.sitePicker==='expand'&&!expandRows.length" class="note">
          {{ f.name }} is already at the largest shell there is.</p>
        <p v-if="g.s.sitePicker==='fab'&&!fabRows.length" class="note">
          {{ f.name }}'s fab is already at the top tier.</p>
        <p v-if="g.s.sitePicker==='expand'" class="hint" style="padding:0 2px">Only shells bigger than
          {{ f.name }}'s current one are listed. Half the old shell's price is credited toward the new
          one, and everything at the site — rigs, power, cooling — keeps running through the build.</p>
        <p v-else-if="g.s.sitePicker==='fab'" class="hint" style="padding:0 2px">Only tiers bigger than
          the current one are listed. Half the old fab's price is credited toward the new one.
          Construction takes real hours, same as everything else here — you can pay again to rush it.</p>
        <p v-else-if="g.s.sitePicker==='design'" class="hint" style="padding:0 2px">What you can spend
          tuning it comes from the fab's design budget, not your wallet — the next screen shows both.</p>
        <p v-else class="hint" style="padding:0 2px">Construction starts as soon as you pay, and takes
          real hours. You can pay again to rush it.</p>
      </div>
    </div>

    <div v-if="g.s.design" class="sheet" ref="designSheetEl" role="dialog" aria-modal="true"
         aria-labelledby="design-sheet-title">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="g.closeDesign()">&lsaquo; Back</button>
        <span class="t" id="design-sheet-title">Design a {{ KIND_LABEL[g.s.design.kind] }}</span></div>
      <div class="sheet-bd">
        <div class="track"><i class="b"
          :style="{width:Math.min(100,designPreview.totals.budget/designPreview.fab.budget*100)+'%'}"></i></div>
        <div class="track-cap"><span>Design budget spent</span>
          <b>{{ designPreview.totals.budget }} / {{ designPreview.fab.budget }}</b></div>

        <div v-for="ax in designPreview.axes" :key="ax.key" class="dl">
          <dt>{{ ax.label }}</dt>
          <dd>{{ designPreview.stats[ax.key] }}
            <span class="stepper">
              <button aria-label="Decrease" :disabled="!(g.s.design.picks[ax.key]>0)"
                      @click="g.bumpDesignPick(ax.key,-1)">&minus;</button>
              <span class="num">{{ g.s.design.picks[ax.key]||0 }}</span>
              <button aria-label="Increase" @click="g.bumpDesignPick(ax.key,1)">+</button>
            </span></dd>
        </div>

        <div class="dl"><dt>Manufacturing cost</dt><dd>{{ fmt.usd(designPreview.cost.buildCash) }}</dd></div>
        <div class="dl"><dt>Build time</dt><dd>{{ designPreview.cost.hours }} h</dd></div>
        <div class="dl"><dt>Price each time it's used to build a rig</dt>
          <dd>{{ fmt.usd(designPreview.cost.unitPrice) }}</dd></div>
        <p v-if="g.s.help" class="hint">Every point spent on one axis costs more than the last — the
          budget is what forces a real choice between axes, not a ceiling you're expected to hit.</p>

        <button class="btn btn-wide btn-pri" style="margin-top:9px"
                :disabled="g.s.cash<designPreview.cost.buildCash"
                @click="g.manufacturePart()">Manufacture &middot;
          {{ fmt.usd(designPreview.cost.buildCash) }}</button>
      </div>
    </div>
  </div>
</template>
