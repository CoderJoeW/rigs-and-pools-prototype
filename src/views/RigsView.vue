<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import Compare from '../components/Compare.vue';

const g = useGameStore();
const f=computed(()=>g.active);

const avgWear=r=>r.units.length?r.units.reduce((a,u)=>a+u.w,0)/r.units.length:0;
/* One function decides a rig's state, and everything downstream — dot
   colour, chip counts, filters, the sheet's header — reads it. The old
   page derived "is this rig fine" three separate ways. */
const stateOf=r=>
    r.building>0 ? {k:'build', dot:'build', label:'Building', sub:fmt.dur(r.building)}
  : !r.on ? {k:'off', dot:'off',
      label: r.cut==='broke' ? 'Stopped — no cash'
           : r.cut==='brownout' ? 'Shed — site over capacity' : 'Off', sub:''}
  : r.units.every(u=>u.w>=1) ? {k:'worn', dot:'bad', label:'Worn out', sub:'cards need replacing'}
  : g.rigNet(r)<0 ? {k:'losing', dot:'bad', label:'Losing money', sub:'costs more than it earns'}
  : avgWear(r)>0.6 ? {k:'wearing', dot:'warn', label:'Wearing', sub:'cards past 60%'}
  : {k:'run', dot:'run', label:'Running', sub:''};
const needsEye=r=>['off','worn','losing','wearing'].includes(stateOf(r).k);

const siteRigs=computed(()=>g.siteRigs(f.value));
const FILTERS=[
  {k:'all',     label:'All',      test:()=>true},
  {k:'attention',label:'Needs attention', test:needsEye, alert:true},
  {k:'run',     label:'Running',  test:r=>stateOf(r).k==='run'},
  {k:'off',     label:'Off',      test:r=>stateOf(r).k==='off'},
  {k:'worn',    label:'Worn',     test:r=>['worn','wearing'].includes(stateOf(r).k)},
];
const filt=ref('all');
const counts=computed(()=>{
  const o={}; for(const x of FILTERS) o[x.k]=siteRigs.value.filter(x.test).length;
  return o;
});
const SORTS=[
  {k:'name', label:'Name',    cmp:(a,b)=>a.id-b.id},
  {k:'net',  label:'Net/day', cmp:(a,b)=>g.rigNet(b)-g.rigNet(a)},
  {k:'hash', label:'Hashrate',cmp:(a,b)=>g.rigHash(b)-g.rigHash(a)},
  {k:'wear', label:'Wear',    cmp:(a,b)=>avgWear(b)-avgWear(a)},
];
const sortBy=ref('name');
const sortOpen=ref(false);
const sortLabel=computed(()=>SORTS.find(x=>x.k===sortBy.value).label);
const shown=computed(()=>{
  const test=FILTERS.find(x=>x.k===filt.value).test;
  return siteRigs.value.filter(test).sort(SORTS.find(x=>x.k===sortBy.value).cmp);
});

/* selection ------------------------------------------------------- */
const picking=ref(false);
const chosen=reactive({});
const chosenIds=computed(()=>shown.value.filter(r=>chosen[r.id]).map(r=>r.id));
const toggleChoose=r=>{ chosen[r.id]=!chosen[r.id]; };
const chooseAll=()=>{ const all=chosenIds.value.length===shown.value.length;
  for(const r of shown.value) chosen[r.id]=!all; };
const stopPicking=()=>{ picking.value=false; for(const k in chosen) delete chosen[k]; };
/* Fleet actions act on the selection when there is one, and on the whole
   site otherwise — one rule, stated on screen, rather than two modes. */
const scopeId=computed(()=> picking.value && chosenIds.value.length
  ? chosenIds.value : (f.value?f.value.id:null));
const scopeLabel=computed(()=> picking.value && chosenIds.value.length
  ? chosenIds.value.length+' selected'
  : (f.value?'all '+siteRigs.value.length+' at '+f.value.name:''));

/* sheets ---------------------------------------------------------- */
const openRig=ref(null);
const rig=computed(()=> openRig.value==null ? null
  : g.s.rigs.find(r=>r.id===openRig.value) || null);
const fleetOpen=ref(false);
const fleetGroup=ref(1), fleetCard=ref('c8');
const specInfo=computed(()=> g.fleetSpecInfo(g.draftSpec(), scopeId.value));

const wornCost=(r,t)=>r.units.filter(u=>u.w>=t).reduce((a,u)=>a+g.PART(u.p).price,0);
const wornN=(r,t)=>r.units.filter(u=>u.w>=t).length;

/* rebuild sheet (unchanged behaviour, kept as-is) ------------------ */
const rbRig=computed(()=> g.s.rebuild ? g.s.rigs.find(x=>x.id===g.s.rebuild.rig) : null);
const rbD=computed(()=> g.s.rebuild ? g.s.rebuild.draft : null);
const rbInfo=computed(()=> rbRig.value ? g.rebuildInfo(rbRig.value, rbD.value) : {checks:[],lim:1});
const rbFields=computed(()=>{
  const r=rbRig.value, d=rbD.value; if(!r) return [];
  const P=g.PART;
  return [
    { slot:'unit', label:'Cards', name:P(d.unit).name, changed:d.unit!==r.units[0].p,
      sub:P(d.unit).mh+' MH · '+(P(d.unit).mh/P(d.unit).w).toFixed(2)+' MH/W' },
    { slot:'frame', label:'Frame', name:P(d.frame).name, changed:d.frame!==r.frame,
      sub:'fits '+P(d.frame).slots+' · airflow '+P(d.frame).air.toFixed(2) },
    { slot:'mobo', label:'Board', name:P(d.mobo).name, changed:d.mobo!==r.mobo,
      sub:'drives '+P(d.mobo).pcie+' · '+P(d.mobo).w+'W idle' },
    { slot:'cool', label:'Cooling', name:P(d.cool).name, changed:d.cool!==r.cool,
      sub:'÷'+P(d.cool).fac.toFixed(2)+' heat · '+P(d.cool).w+'W' },
    { slot:'psu', label:'Supply', name:P(d.psu).name, changed:d.psu!==r.psu,
      sub:fmt.w(P(d.psu).w)+' · '+P(d.psu).conn+' PCIe · '+(P(d.psu).eff*100).toFixed(0)+'%' },
  ];
});
const rbPickerRows=computed(()=>{
  const r=rbRig.value, d=rbD.value; if(!r) return [];
  const slot=g.s.rebuild.picker;
  if(slot==='unit'){
    return g.cards().map(c=>({ id:c.id, name:c.name,
      sub:c.mh+' MH · '+(c.mh/c.w).toFixed(2)+' MH/W · rig would make '+fmt.hash(d.n*c.mh),
      value:fmt.usd(c.price), valueSub:'each', current:c.id===d.unit }));
  }
  const lim=rbInfo.value.lim;
  return g.SLOT_OPTS[slot].map(p=>{
    let note='';
    if(slot==='frame'){ const would=Math.min(p.slots,g.PART(d.mobo).pcie);
      note=would!==lim?' · limit → '+would:''; }
    if(slot==='mobo'){ const would=Math.min(g.PART(d.frame).slots,p.pcie);
      note=would!==lim?' · limit → '+would:''; }
    let eff= slot==='frame'?'fits '+p.slots+' · airflow '+p.air.toFixed(2)
           : slot==='mobo'?'drives '+p.pcie+' · '+p.w+'W idle'
           : slot==='cool'?'÷'+p.fac.toFixed(2)+' heat · '+p.w+'W'
           : fmt.w(p.w)+' · '+p.conn+' PCIe · '+(p.eff*100).toFixed(0)+'%';
    return { id:p.id, name:p.name, sub:eff+note,
      value:p.price?fmt.usd(p.price):'free', valueSub:'',
      current:p.id===d[slot] };
  });
});
const rbChoose=id=>{
  const d=rbD.value; d[g.s.rebuild.picker]=id;
  const lim=Math.min(g.PART(d.frame).slots,g.PART(d.mobo).pcie);
  if(d.n>lim) d.n=lim;
  g.s.rebuild.picker=null;
};

const siteHash=computed(()=>siteRigs.value.reduce((a,r)=>a+g.rigHash(r),0));
const siteNet=computed(()=>siteRigs.value.reduce((a,r)=>a+g.rigNet(r),0));

// switching sites should not leave a stale selection or an open rig behind
watch(()=>f.value&&f.value.id, ()=>{ stopPicking(); openRig.value=null; filt.value='all'; });
</script>

<template>
  <div>
    <!-- ORIENT: is the farm healthy, and where am I -->
    <div class="card">
      <div class="card-hd"><span class="eyebrow">{{ f.name }}</span>
        <span class="eyebrow">{{ g.siteRigs(f).length }}/{{ g.siteSlots(f) }} positions used</span></div>
      <div class="statline">
        <div class="s"><div class="k">Rigs</div><div class="v">{{ siteRigs.length }}</div></div>
        <div class="s"><div class="k">Hashrate</div><div class="v">{{ fmt.hash(siteHash) }}</div></div>
        <div class="s"><div class="k">Net / day</div>
          <div class="v" :class="siteNet>=0?'pos':'neg'">{{ fmt.usd2(siteNet) }}</div></div>
      </div>
      <div v-if="g.s.sites.length>1" class="chips">
        <button v-for="st in g.s.sites" :key="st.id" class="chip"
                :class="{on:st.id===g.s.activeSite}" @click="g.s.activeSite=st.id">
          {{ st.name }} <span class="n">{{ g.siteRigs(st).length }}</span></button>
      </div>
    </div>

    <!-- FIND: chips carry their counts, so a problem shows before you look for it -->
    <div class="card" v-if="siteRigs.length">
      <div class="chips">
        <button v-for="x in FILTERS" :key="x.k" class="chip"
                :class="{on:filt===x.k, alert:x.alert&&counts[x.k]>0}"
                @click="filt=x.k">{{ x.label }} <span class="n">{{ counts[x.k] }}</span></button>
      </div>
      <div class="rowline" style="border-top:1px solid var(--line-2)">
        <button class="btn btn-sm btn-ghost" @click="sortOpen=!sortOpen">
          Sort: {{ sortLabel }} {{ sortOpen?'−':'+' }}</button>
        <span style="margin-left:auto">
          <button class="btn btn-sm" :class="picking?'btn-pri':'btn-ghost'"
                  @click="picking ? stopPicking() : picking=true">
            {{ picking?'Done':'Select' }}</button>
          <button class="btn btn-sm btn-ghost" style="margin-left:5px"
                  @click="fleetOpen=true">Fleet actions</button></span>
      </div>
      <div v-if="sortOpen" class="chips" style="border-top:1px solid var(--line-2)">
        <button v-for="x in SORTS" :key="x.k" class="chip" :class="{on:sortBy===x.k}"
                @click="sortBy=x.k; sortOpen=false">{{ x.label }}</button>
      </div>
    </div>

    <!-- the list: one compact row per rig -->
    <div class="card" v-if="shown.length">
      <button v-for="r in shown" :key="r.id" class="rigrow" :class="{sel:picking&&chosen[r.id]}"
              @click="picking ? toggleChoose(r) : openRig=r.id">
        <span v-if="picking" class="box" :class="{on:chosen[r.id]}">&#10003;</span>
        <span v-else class="dot" :class="stateOf(r).dot"></span>
        <span class="mid">
          <span class="nm">{{ r.name }}
            <span v-if="stateOf(r).k!=='run'" class="sb" style="margin:0">{{ stateOf(r).label }}</span></span>
          <div class="sb">{{ r.units.length }}× {{ g.PART(r.units[0].p).name }}
            · {{ g.groupOf(r).name }} · {{ g.chain(g.groupOf(r).chain).name }}</div>
          <div class="wearbar"><i :class="avgWear(r)>0.6?'b':avgWear(r)>0.35?'w':''"
            :style="{width:(avgWear(r)*100).toFixed(0)+'%'}"></i></div>
        </span>
        <span class="rt">
          <div class="v" :class="g.rigNet(r)>=0?'pos':'neg'">{{ fmt.usd2(g.rigNet(r)) }}</div>
          <div class="k">{{ fmt.hash(g.rigHash(r)) }}</div></span>
        <span v-if="!picking" class="ch" style="color:var(--ink-3);font-size:15px">&rsaquo;</span>
      </button>
      <div v-if="picking" class="selbar">
        <span class="c">{{ chosenIds.length }} selected</span>
        <button class="btn btn-sm btn-ghost" @click="chooseAll">
          {{ chosenIds.length===shown.length?'None':'All' }}</button>
        <button class="btn btn-sm btn-pri" :disabled="!chosenIds.length"
                @click="fleetOpen=true">Act on these</button>
      </div>
    </div>

    <div class="card" v-else><div class="empty">
      <p v-if="!siteRigs.length">No rigs at {{ f.name }} yet.</p>
      <p v-else>No rigs match &ldquo;{{ FILTERS.find(x=>x.k===filt).label }}&rdquo;.</p>
      <button v-if="!siteRigs.length" class="btn btn-pri" @click="g.s.tab='build'">Build one</button>
      <button v-else class="btn btn-ghost" @click="filt='all'">Show all {{ siteRigs.length }}</button>
    </div></div>

    <!-- ACT: one rig, full screen, nothing else competing -->
    <div v-if="rig" class="sheet">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="openRig=null">&lsaquo; Rigs</button>
        <span class="t">{{ rig.name }}</span></div>
      <div class="sheet-bd">
        <div class="card">
          <div class="rig-hd">
            <span style="flex:1;min-width:0">
              <span class="rig-nm">{{ rig.name }}</span>
              <div class="sb" style="margin-top:3px">
                <span class="dot" :class="stateOf(rig).dot"
                      style="display:inline-block;margin-right:5px"></span>
                {{ stateOf(rig).label }}{{ stateOf(rig).sub?' — '+stateOf(rig).sub:'' }}</div></span>
            <span style="flex:none;text-align:right">
              <div class="rig-net" :class="g.rigNet(rig)>=0?'pos':'neg'">{{ fmt.usd2(g.rigNet(rig)) }}</div>
              <div class="rig-net-l">per day</div></span>
          </div>
          <div class="rig-stats">
            <div class="s"><div class="k">Hashrate</div><div class="v">{{ fmt.hash(g.rigHash(rig)) }}</div></div>
            <div class="s"><div class="k">Draw</div><div class="v">{{ fmt.w(g.rigWallW(rig)) }}</div></div>
            <div class="s"><div class="k">Wear</div>
              <div class="v" :class="avgWear(rig)>0.6?'neg':avgWear(rig)>0.35?'amb':''">
                {{ fmt.pct(avgWear(rig),0) }}</div></div>
          </div>
          <div class="card-bd pt">
            <div class="dl"><dt>Built from</dt>
              <dd>{{ rig.units.length }} × {{ g.PART(rig.units[0].p).name }}</dd></div>
            <div class="dl"><dt>Chassis</dt>
              <dd>{{ g.PART(rig.frame).name }} · {{ g.PART(rig.mobo).name }}<br>
                <span class="sb">{{ g.PART(rig.cool).name }} · {{ g.PART(rig.psu).name }}</span></dd></div>
          </div>
        </div>

        <div class="card"><div class="card-bd pt">
          <div style="display:flex;gap:9px;align-items:center;margin-bottom:11px">
            <button class="switch" :class="{on:rig.on&&rig.building<=0}" @click="g.toggleRig(rig.id)"
                    aria-label="power"><i></i></button>
            <span style="font-size:13px;flex:1">{{ rig.on ? 'Powered on' : stateOf(rig).label }}
              <div v-if="!rig.on&&rig.cut" class="sb">Turning it back on will not hold until the
                cause clears.</div></span>
          </div>
          <div class="rigfld"><label>Mining group — chain and pool live on the group</label>
            <select :value="rig.group" @change="g.setRigGroup(rig,parseInt($event.target.value))">
              <option v-for="gr in g.s.groups" :key="gr.id" :value="gr.id">
                {{ gr.name }} — {{ g.chain(gr.chain).name }}</option>
            </select>
            <p class="hint">Moving between groups never forfeits anything — the window belongs to
              the group. Manage groups on the Farm tab.</p></div>
          <div class="rigfld"><label>Tune — quiet to pushed</label>
            <input type="range" min="-0.15" max="0.15" step="0.01" :value="rig.tune||0"
                   @input="rig.tune=parseFloat($event.target.value)">
            <div class="track-cap">
              <span>{{ ((rig.tune||0)*100).toFixed(0) }}% hash ·
                {{ ((rig.tune||0)*190).toFixed(0) }}% power</span>
              <b :class="(rig.tune||0)>0.05?'amb':''">wear ×{{ (1+Math.max(0,(rig.tune||0))*3).toFixed(1) }}</b></div>
            <p v-if="g.s.help" class="hint">Undervolt for efficiency when power-bound; push for
              hashrate when watts are spare. Pushing multiplies wear.</p></div>
        </div></div>

        <div class="card"><div class="list">
          <button class="pickrow" :disabled="rig.building>0"
                  @click="g.startRebuild(rig); openRig=null">
            <span class="lab">Retrofit</span>
            <span class="val"><div class="n">{{ rig.building>0
              ? 'Rebuilding — '+fmt.dur(rig.building) : 'Plan a rebuild' }}</div>
              <div class="s">Swap any parts, add or remove cards, one bill — the rig goes down
                for the assembly time.</div></span>
            <span class="ch">&rsaquo;</span></button>
          <button class="pickrow" :disabled="!wornN(rig,0.35)||g.s.cash<wornCost(rig,0.35)"
                  @click="g.swapWorn(rig.id,0.35)">
            <span class="lab">Repair</span>
            <span class="val"><div class="n">{{ wornN(rig,0.35)
              ? 'Replace '+wornN(rig,0.35)+' worn card'+(wornN(rig,0.35)===1?'':'s')
                +' · '+fmt.usd(wornCost(rig,0.35))
              : 'No cards worn past 35% yet' }}</div>
              <div class="s">Cards are swapped in place; the rig keeps running.</div></span></button>
          <button class="pickrow" @click="g.scrapRig(rig.id); openRig=null">
            <span class="lab">Strip</span>
            <span class="val"><div class="n" style="color:var(--red)">Strip this rig for parts</div>
              <div class="s">Frees its position and credits salvage.</div></span></button>
        </div></div>
      </div>
    </div>

    <!-- ACT: many rigs at once -->
    <div v-if="fleetOpen" class="sheet">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="fleetOpen=false">&lsaquo; Rigs</button>
        <span class="t">Fleet actions</span></div>
      <div class="sheet-bd">
        <div class="card"><div class="card-bd pt">
          <div class="dl" style="margin-top:0"><dt>Applies to</dt><dd>{{ scopeLabel }}</dd></div>
          <p class="hint" style="margin-top:0">Select rigs on the list to narrow this; with nothing
            selected every action covers the whole site.</p>
        </div></div>

        <div class="card"><div class="card-bd pt">
          <div class="rigfld"><label>Repair worn cards</label>
            <button class="btn btn-wide"
                    :class="g.fleetWorn(0.35,scopeId).n&&g.s.cash>=g.fleetWorn(0.35,scopeId).cost?'btn-pri':''"
                    :disabled="!g.fleetWorn(0.35,scopeId).n||g.s.cash<g.fleetWorn(0.35,scopeId).cost"
                    @click="g.fleetRepair(0.35,scopeId)">
              {{ g.fleetWorn(0.35,scopeId).n
                 ? 'Replace '+g.fleetWorn(0.35,scopeId).n+' card'+(g.fleetWorn(0.35,scopeId).n===1?'':'s')
                   +' across '+g.fleetWorn(0.35,scopeId).rigs+' rig'+(g.fleetWorn(0.35,scopeId).rigs===1?'':'s')
                   +' · '+fmt.usd(g.fleetWorn(0.35,scopeId).cost)
                 : 'Nothing worn past 35%' }}</button></div>

          <div class="rigfld"><label>Move to a group</label>
            <select v-model.number="fleetGroup">
              <option v-for="gr in g.s.groups" :key="gr.id" :value="gr.id">
                {{ gr.name }} — {{ g.chain(gr.chain).name }}{{ gr.pool==='solo'?' · solo'
                  :(g.poolOf(gr.pool)?' · '+g.poolOf(gr.pool).name:'') }}</option>
            </select>
            <button class="btn btn-wide" style="margin-top:6px"
                    :class="g.fleetMoveInfo(fleetGroup,scopeId).rigs?'btn-pri':''"
                    :disabled="!g.fleetMoveInfo(fleetGroup,scopeId).rigs"
                    @click="g.fleetMove(fleetGroup,scopeId)">
              {{ g.fleetMoveInfo(fleetGroup,scopeId).rigs
                 ? 'Move '+g.fleetMoveInfo(fleetGroup,scopeId).rigs+' rig'
                   +(g.fleetMoveInfo(fleetGroup,scopeId).rigs===1?'':'s')+' ('
                   +fmt.hash(g.fleetMoveInfo(fleetGroup,scopeId).hash)+')'
                 : 'Already there' }}</button>
            <p class="hint">Moving never forfeits a PPLNS window — it belongs to the group.</p></div>
        </div></div>

        <div class="card"><div class="card-bd pt">
          <div class="rigfld"><label>Swap cards, keeping each chassis</label>
            <select v-model="fleetCard">
              <option v-for="c in g.cards()" :key="c.id" :value="c.id">
                {{ c.name }} — {{ c.mh }} MH · {{ (c.mh/c.w).toFixed(2) }} MH/W · {{ fmt.usd(c.price) }}</option>
            </select>
            <button class="btn btn-wide" style="margin-top:6px"
                    :class="g.fleetRefitInfo(fleetCard,scopeId).rigs?'btn-pri':''"
                    :disabled="!g.fleetRefitInfo(fleetCard,scopeId).rigs||g.s.cash<g.fleetRefitInfo(fleetCard,scopeId).cost"
                    @click="g.fleetRefit(fleetCard,scopeId)">
              {{ g.fleetRefitInfo(fleetCard,scopeId).rigs
                 ? 'Refit '+g.fleetRefitInfo(fleetCard,scopeId).rigs+' rig'
                   +(g.fleetRefitInfo(fleetCard,scopeId).rigs===1?'':'s')
                   +' · '+fmt.usd(g.fleetRefitInfo(fleetCard,scopeId).cost)
                 : 'No eligible rigs' }}</button>
            <div class="warnbox" style="margin-top:6px">Every eligible rig goes down at once for
              its rebuild. The farm earns nothing until they are back.</div>
            <p class="hint">Rigs whose supply, connectors or site power cannot take the card are
              skipped, and say why in their own panel.</p></div>

          <div class="rigfld" style="margin-top:12px">
            <label>Rebuild to the Build tab's specification</label>
            <div class="dl" style="margin-top:0"><dt>Target</dt>
              <dd>{{ g.s.draft.n }} × {{ g.PART(g.s.draft.unit).name }}<br>
                <span class="sb">{{ g.PART(g.s.draft.frame).name }} · {{ g.PART(g.s.draft.mobo).name }}
                  · {{ g.PART(g.s.draft.cool).name }} · {{ g.PART(g.s.draft.psu).name }}</span></dd></div>
            <p class="hint" style="margin-top:0">Design it on Build, then stamp it across the farm.
              Unlike a card refit this replaces the chassis too, so a farm that grew in stages ends
              up uniform.</p>
            <div v-if="specInfo.already" class="track-cap">
              <span>Already on this spec</span><b>{{ specInfo.already }}</b></div>
            <div v-if="specInfo.blocked" class="track-cap">
              <span class="amb">Cannot take it — {{ specInfo.why }}</span>
              <b class="amb">{{ specInfo.blocked }}</b></div>
            <button class="btn btn-wide" style="margin-top:6px"
                    :class="specInfo.rigs&&g.s.cash>=specInfo.cost?'btn-pri':''"
                    :disabled="!specInfo.rigs||specInfo.cost>g.s.cash"
                    @click="g.fleetToSpec(g.draftSpec(),scopeId)">
              {{ !specInfo.rigs ? 'Nothing to rebuild'
                 : specInfo.cost>g.s.cash
                   ? 'Needs '+fmt.usd(specInfo.cost)+' for '+specInfo.rigs+' rig'+(specInfo.rigs===1?'':'s')
                   : 'Rebuild '+specInfo.rigs+' rig'+(specInfo.rigs===1?'':'s')+' · '+fmt.usd(specInfo.cost) }}</button>
          </div>
        </div></div>
      </div>
    </div>

    <!-- the rebuild planner, unchanged -->
    <div v-if="g.s.rebuild && rbRig" class="sheet">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost"
                @click="g.s.rebuild.picker ? g.s.rebuild.picker=null : g.s.rebuild=null">
          &lsaquo; {{ g.s.rebuild.picker ? 'Back' : 'Cancel' }}</button>
        <span class="t">{{ g.s.rebuild.picker
          ? {unit:'Cards',frame:'Frame',mobo:'Board',cool:'Cooling',psu:'Supply'}[g.s.rebuild.picker]
          : 'Rebuild '+rbRig.name }}</span></div>
      <div class="sheet-bd">
        <template v-if="g.s.rebuild.picker">
          <Compare title="Cheapest first" metric="price" :rows="rbPickerRows" :pick="rbChoose" />
        </template>
        <template v-else>
          <div class="card"><div class="list">
            <button v-for="fl in rbFields" :key="fl.slot" class="pickrow"
                    @click="g.s.rebuild.picker=fl.slot">
              <span class="lab">{{ fl.label }}</span>
              <span class="val"><div class="n">{{ fl.name }}
                <span v-if="fl.changed" class="tag b" style="margin-left:5px">CHANGED</span></div>
                <div class="s">{{ fl.sub }}</div></span>
              <span class="ch">&rsaquo;</span></button>
            <div class="pickrow"><span class="lab">Cards</span>
              <span class="val"><div class="n">{{ rbD.n }} × {{ g.PART(rbD.unit).name }}
                <span v-if="rbD.n!==rbRig.units.length" class="tag b" style="margin-left:5px">
                  {{ rbD.n>rbRig.units.length?'+':'' }}{{ rbD.n-rbRig.units.length }}</span></div>
                <div class="s">Limit {{ rbInfo.lim }} — worn cards are traded first when reducing</div></span>
              <span style="display:flex;align-items:center;border:1px solid var(--line);border-radius:8px">
                <button style="width:32px;height:32px;text-align:center"
                        @click="rbD.n=Math.max(1,rbD.n-1)">&minus;</button>
                <span class="num" style="min-width:24px;text-align:center">{{ rbD.n }}</span>
                <button style="width:32px;height:32px;text-align:center"
                        @click="rbD.n=Math.min(rbInfo.lim,rbD.n+1)">+</button></span></div>
          </div></div>

          <div class="totals">
            <div><div class="k">Hashrate</div><div class="v">{{ fmt.hash(g.rigHash(rbRig)) }}
              &rarr; {{ fmt.hash(rbInfo.hashNew) }}</div></div>
            <div><div class="k">Wall</div><div class="v">{{ fmt.w(g.rigWallW(rbRig)) }}
              &rarr; {{ fmt.w(rbInfo.wall) }}</div></div>
            <div><div class="k">Down for</div><div class="v">{{ fmt.dur(rbInfo.time) }}</div></div>
            <div><div class="k">{{ rbInfo.net>=0?'Net cost':'Returns' }}</div>
              <div class="v" :class="rbInfo.net<0?'pos':''">{{ fmt.usd(Math.abs(rbInfo.net)) }}</div></div>
          </div>
          <p class="hint" style="margin:-2px 0 8px">Buying {{ fmt.usd(rbInfo.buy) }},
            {{ fmt.usd(rbInfo.credit) }} credited for what comes out.</p>

          <div style="margin:6px 0">
            <div v-for="(c,i) in rbInfo.checks" :key="i" class="chk" :class="c.ok?'ok':'no'">
              <span class="ic">{{ c.ok?'✓':'✗' }}</span>
              <span>{{ c.label }}<div v-if="!c.ok" class="fix">{{ c.fix }}</div></span></div>
            <div v-if="!rbInfo.changed" class="chk no"><span class="ic">✗</span>
              <span>Nothing changed yet — pick a part or move the card count.</span></div>
          </div>

          <div v-if="rbRig.pending>0" class="warnbox" style="margin-bottom:8px">
            <b>Going down forfeits the PPLNS window</b> —
            {{ fmt.c(rbRig.pending) }} {{ g.chain(rbRig.chain).tick }} at risk.</div>

          <button class="btn btn-wide" :class="rbInfo.ok?'btn-pri':''" :disabled="!rbInfo.ok"
                  @click="g.applyRebuild()">
            {{ rbInfo.ok
               ? 'Take it down for '+fmt.dur(rbInfo.time)+' · '
                 +(rbInfo.net>=0?'pay '+fmt.usd(rbInfo.net):'collect '+fmt.usd(-rbInfo.net))
               : 'Fix the crosses above' }}</button>
        </template>
      </div>
    </div>
  </div>
</template>
