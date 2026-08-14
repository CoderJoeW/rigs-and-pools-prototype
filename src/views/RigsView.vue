<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt, partSub } from '../utils/format.js';
import { C } from '../data/constants.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import Compare from '../components/Compare.vue';
import ChainMark from '../components/ChainMark.vue';
import Chassis from '../components/Chassis.vue';
import { CHAIN_HUE } from '../data/chains.js';

const g = useGameStore();
const f=computed(()=>g.active);

const avgWear=r=>g.rigWear(r);
const stateOf=r=>g.rigState(r);
const needsEye=r=>['off','worn','losing','wearing'].includes(stateOf(r).k);
const chassisOf=r=>{
  const n=r.units?r.units.length:0;
  const gr=g.groupOf(r);
  const chain=gr?gr.chain:null;
  const hue=chain!=null?CHAIN_HUE[chain]:undefined;
  return {
    state:stateOf(r).dot,
    size:n>=9?'lg':n>=5?'md':'sm',
    chainHue:hue,
    label:stateOf(r).label,
  };
};

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

const picking=ref(false);
const chosen=reactive({});
const chosenIds=computed(()=>shown.value.filter(r=>chosen[r.id]).map(r=>r.id));
const toggleChoose=r=>{ chosen[r.id]=!chosen[r.id]; };
const chooseAll=()=>{ const all=chosenIds.value.length===shown.value.length;
  for(const r of shown.value) chosen[r.id]=!all; };
const stopPicking=()=>{ picking.value=false; for(const k in chosen) delete chosen[k]; };
const scopeId=computed(()=> picking.value && chosenIds.value.length
  ? chosenIds.value : (f.value?f.value.id:null));
const scopeLabel=computed(()=> picking.value && chosenIds.value.length
  ? chosenIds.value.length+' selected'
  : (f.value?'all '+siteRigs.value.length+' at '+f.value.name:''));

const SW_ARM=10, SW_OPEN=34, SW_REST=108, SW_FIRE=134, SW_MAX=176;
const sw=reactive({id:null,x:0,drag:false});
let pt=null, swallowClick=false, closeT=null;
const canSwipe=r=>!picking.value && stateOf(r).k!=='build';
const swipeVerb=r=>r.on?'Power off':'Power on';
const clearCloseT=()=>{ if(closeT!=null){ clearTimeout(closeT); closeT=null; } };
const closeSwipe=()=>{ clearCloseT(); if(sw.id==null) return; const id=sw.id; sw.drag=false; sw.x=0;
  closeT=setTimeout(()=>{ closeT=null; if(sw.id===id&&sw.x===0) sw.id=null; },240); };
const resetSwipe=()=>{ clearCloseT(); sw.id=null; sw.x=0; sw.drag=false; };
const onSwipeDown=(e,r)=>{ swallowClick=false; if(sw.id!=null&&sw.id!==r.id) resetSwipe(); pt=null;
  if(!canSwipe(r)) return; if(e.pointerType==='mouse'&&e.button) return;
  pt={id:r.id, pid:e.pointerId, x0:e.clientX, y0:e.clientY, base:(sw.id===r.id?sw.x:0), claimed:false}; };
const onSwipeMove=(e,r)=>{ if(!pt||pt.id!==r.id||pt.pid!==e.pointerId) return;
  const dx=pt.x0-e.clientX, dy=e.clientY-pt.y0;
  if(!pt.claimed){ if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>SW_ARM){ pt=null; return; }
    if(Math.abs(dx)<=SW_ARM) return; pt.claimed=true; clearCloseT(); sw.id=r.id; sw.drag=true;
    const el=e.currentTarget; if(el&&el.setPointerCapture){ try{ el.setPointerCapture(e.pointerId); }catch(_){} } }
  sw.x=Math.max(0,Math.min(SW_MAX,pt.base+dx-(dx>0?SW_ARM:-SW_ARM))); };
const onSwipeUp=(e,r)=>{ if(!pt||pt.id!==r.id) return; const claimed=pt.claimed; pt=null;
  if(!claimed) return; swallowClick=true; sw.drag=false;
  if(sw.x>=SW_FIRE){ closeSwipe(); g.toggleRig(r.id); } else if(sw.x>=SW_OPEN) sw.x=SW_REST; else closeSwipe(); };
const onSwipeCancel=(e,r)=>{ if(pt&&pt.id===r.id) pt=null; if(sw.drag&&sw.id===r.id) closeSwipe(); };
const fireSwipe=r=>{ swallowClick=false; closeSwipe(); if(canSwipe(r)) g.toggleRig(r.id); };
const rowClick=r=>{ if(swallowClick){ swallowClick=false; return; }
  if(sw.id===r.id&&sw.x>0){ closeSwipe(); return; }
  if(picking.value) toggleChoose(r); else openRig.value=r.id; };
const onDocDown=e=>{ if(sw.id==null) return; const t=e.target;
  if(t&&t.closest&&t.closest('.rigswipe')) return; closeSwipe(); };
onMounted(()=>document.addEventListener('pointerdown',onDocDown,{passive:true}));
onBeforeUnmount(()=>{ document.removeEventListener('pointerdown',onDocDown); clearCloseT(); });
watch([picking,filt,sortBy],()=>resetSwipe());

const openRig=ref(null);
const rig=computed(()=> openRig.value==null ? null : g.s.rigs.find(r=>r.id===openRig.value) || null);
const renameOpen=ref(false);
const renameDraft=ref('');
watch(openRig, ()=>{ renameOpen.value=false; resetSwipe(); });
const startRenameRig=()=>{ renameDraft.value=rig.value.name; renameOpen.value=true; };
const saveRenameRig=()=>{ g.renameRig(rig.value.id,renameDraft.value); renameOpen.value=false; };
const fleetOpen=ref(false);
const fleetGroup=ref(1), fleetCard=ref('c8');
const specInfo=computed(()=> g.fleetSpecInfo(g.draftSpec(), scopeId.value));
const REPAIR_AT=C.REPAIR_AT;
const wornInfo=computed(()=> g.fleetWorn(REPAIR_AT, scopeId.value));
const moveInfo=computed(()=> g.fleetMoveInfo(fleetGroup.value, scopeId.value));
const refitInfo=computed(()=> g.fleetRefitInfo(fleetCard.value, scopeId.value));
const fleetCardOpts=computed(()=> g.cards().concat(g.s.customParts.filter(p=>p.kind==='unit')));
const wornCost=(r,t)=>r.units.filter(u=>u.w>=t).reduce((a,u)=>a+g.PART(u.p).price,0);
const wornN=(r,t)=>r.units.filter(u=>u.w>=t).length;

const rbRig=computed(()=> g.s.rebuild ? g.s.rigs.find(x=>x.id===g.s.rebuild.rig) : null);
const rbD=computed(()=> g.s.rebuild ? g.s.rebuild.draft : null);
const rbInfo=computed(()=> rbRig.value ? g.rebuildInfo(rbRig.value, rbD.value) : {checks:[],lim:1});
const rbFields=computed(()=>{ const r=rbRig.value, d=rbD.value; if(!r) return []; const P=g.PART;
  return [
    { slot:'unit', label:'Cards', name:P(d.unit).name, changed:d.unit!==r.units[0].p, sub:P(d.unit).mh+' MH · '+(P(d.unit).mh/P(d.unit).w).toFixed(2)+' MH/W' },
    { slot:'frame', label:'Frame', name:P(d.frame).name, changed:d.frame!==r.frame, sub:partSub('frame',P(d.frame)) },
    { slot:'mobo', label:'Board', name:P(d.mobo).name, changed:d.mobo!==r.mobo, sub:partSub('mobo',P(d.mobo)) },
    { slot:'cool', label:'Cooling', name:P(d.cool).name, changed:d.cool!==r.cool, sub:partSub('cool',P(d.cool)) },
    { slot:'psu', label:'Supply', name:P(d.psu).name, changed:d.psu!==r.psu, sub:partSub('psu',P(d.psu)) },
  ]; });
const rbPickerRows=computed(()=>{ const r=rbRig.value, d=rbD.value; if(!r) return []; const slot=g.s.rebuild.picker;
  if(slot==='unit'){ return g.cards().concat(g.s.customParts.filter(p=>p.kind==='unit')).map(c=>({ id:c.id, name:c.name,
      sub:c.mh+' MH · '+(c.mh/c.w).toFixed(2)+' MH/W · rig would make '+fmt.hash(d.n*c.mh),
      value:fmt.usd(c.price), valueSub:'each', current:c.id===d.unit })); }
  const lim=rbInfo.value.lim;
  return g.SLOT_OPTS[slot].concat(g.s.customParts.filter(p=>p.kind===slot)).map(p=>{
    let note=''; if(slot==='frame'){ const would=Math.min(p.slots,g.PART(d.mobo).pcie); note=would!==lim?' · limit → '+would:''; }
    if(slot==='mobo'){ const would=Math.min(g.PART(d.frame).slots,p.pcie); note=would!==lim?' · limit → '+would:''; }
    return { id:p.id, name:p.name, sub:partSub(slot,p)+note, value:p.price?fmt.usd(p.price):'free', valueSub:'', current:p.id===d[slot] };
  }); });
const rbChoose=id=>{ const d=rbD.value; d[g.s.rebuild.picker]=id;
  const lim=Math.min(g.PART(d.frame).slots,g.PART(d.mobo).pcie); if(d.n>lim) d.n=lim; g.s.rebuild.picker=null; };

const siteHash=computed(()=>siteRigs.value.reduce((a,r)=>a+g.rigHash(r),0));
const siteNet=computed(()=>siteRigs.value.reduce((a,r)=>a+g.rigNet(r),0));
watch(()=>f.value&&f.value.id, ()=>{ stopPicking(); openRig.value=null; filt.value='all'; resetSwipe(); });
const takeFocusRig=()=>{ const id=g.s.focusRig; if(id==null) return; g.s.focusRig=null;
  const r=g.s.rigs.find(x=>x.id===id); if(r && r.site===g.s.activeSite) openRig.value=id; };
onMounted(takeFocusRig); watch(()=>g.s.focusRig, takeFocusRig);
const rigSheetEl=ref(null);
useSheetA11y(rigSheetEl, computed(()=>!!rig.value), ()=>{ openRig.value=null; });
const fleetSheetEl=ref(null);
useSheetA11y(fleetSheetEl, fleetOpen, ()=>{ fleetOpen.value=false; });
const rebuildSheetEl=ref(null);
useSheetA11y(rebuildSheetEl, computed(()=>!!(g.s.rebuild&&rbRig.value)),
  ()=>{ if(g.s.rebuild) g.s.rebuild.picker ? g.s.rebuild.picker=null : g.s.rebuild=null; });
</script>

<template>
  <div>
    <div class="card" data-tour="rigs">
      <div class="card-hd"><span class="eyebrow">{{ f.name }}</span>
        <span class="eyebrow">{{ g.siteRigs(f).length }}/{{ g.siteSlots(f) }} positions used</span></div>
      <div class="statline">
        <div class="s"><div class="k">Rigs</div><div class="v">{{ siteRigs.length }}</div></div>
        <div class="s"><div class="k">Hashrate</div><div class="v">{{ fmt.hash(siteHash) }}</div></div>
        <div class="s"><div class="k">Net / day</div>
          <div class="v" :class="siteNet>=0?'pos':'neg'">{{ fmt.usd2(siteNet) }}</div></div>
      </div>
      <div v-if="g.s.sites.length>1" class="pills">
        <button v-for="st in g.s.sites" :key="st.id" class="pill"
                :class="{on:st.id===g.s.activeSite}" :aria-current="st.id===g.s.activeSite?'true':null"
                @click="g.s.activeSite=st.id">
          {{ st.name }} <span class="n">{{ g.siteRigs(st).length }}</span></button>
      </div>
    </div>

    <div class="card" v-if="siteRigs.length">
      <div class="pills">
        <button v-for="x in FILTERS" :key="x.k" class="pill"
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
      <div v-if="sortOpen" class="pills" style="border-top:1px solid var(--line-2)">
        <button v-for="x in SORTS" :key="x.k" class="pill" :class="{on:sortBy===x.k}"
                @click="sortBy=x.k; sortOpen=false">{{ x.label }}</button>
      </div>
    </div>

    <div class="card" v-if="shown.length">
      <div v-for="r in shown" :key="r.id" class="rigswipe"
           :class="{dragging:sw.drag&&sw.id===r.id}">
        <div class="rigslide" :class="{sx:sw.id===r.id, drag:sw.drag&&sw.id===r.id}"
             :style="sw.id===r.id?{'--sx':sw.x+'px'}:null">
          <button class="rigrow" :class="{sel:picking&&chosen[r.id]}"
                  @click="rowClick(r)"
                  @pointerdown="onSwipeDown($event,r)" @pointermove="onSwipeMove($event,r)"
                  @pointerup="onSwipeUp($event,r)" @pointercancel="onSwipeCancel($event,r)">
            <span v-if="picking" class="box" :class="{on:chosen[r.id]}">&#10003;</span>
            <Chassis v-else v-bind="chassisOf(r)" />
            <span class="mid">
              <span class="nm">{{ r.name }}
                <span v-if="stateOf(r).k!=='run'" class="sb" style="margin:0">{{ stateOf(r).label }}</span></span>
              <div class="sb">{{ r.units.length }}× {{ g.PART(r.units[0].p).name }}
                · {{ g.groupOf(r).name }} · <ChainMark :chain="g.groupOf(r).chain"
                />{{ g.chain(g.groupOf(r).chain).name }}</div>
              <div class="wearbar" role="img" :aria-label="'Wear '+(avgWear(r)*100).toFixed(0)+'%'">
                <i :class="avgWear(r)>0.6?'b':avgWear(r)>REPAIR_AT?'w':''"
                   :style="{width:(avgWear(r)*100).toFixed(0)+'%'}"></i></div>
            </span>
            <span class="rt">
              <div class="v" :class="g.rigNet(r)>=0?'pos':'neg'">{{ fmt.usd2(g.rigNet(r)) }}</div>
              <div class="k">{{ fmt.hash(g.rigHash(r)) }}</div></span>
            <span v-if="!picking" class="ch" style="color:var(--ink-3);font-size:15px">&rsaquo;</span>
          </button>
        </div>
        <button v-if="sw.id===r.id" class="rigswact"
                :class="{go:!r.on, arm:sw.x>=SW_FIRE}"
                :aria-label="swipeVerb(r)+' '+r.name" @click="fireSwipe(r)">
          <span class="ic" aria-hidden="true">&#9211;</span>
          <span class="lb">{{ swipeVerb(r) }}</span>
        </button>
      </div>
      <p v-if="g.s.help&&!picking" class="hint" style="padding:7px 12px 9px;margin-top:0">
        Swipe a rig left to flip its power without opening it. Tapping still opens the rig.</p>
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

    <div v-if="rig" class="sheet" ref="rigSheetEl" role="dialog" aria-modal="true"
         aria-labelledby="rig-sheet-title">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="openRig=null">&lsaquo; Rigs</button>
        <span class="t" id="rig-sheet-title">{{ rig.name }}</span></div>
      <div class="sheet-bd">
        <div class="card">
          <div class="rig-hd" v-if="renameOpen">
            <span style="flex:1;min-width:0">
              <label class="sr-only" for="rig-rename-input">Rig name</label>
              <input id="rig-rename-input" v-model="renameDraft" maxlength="24" placeholder="Rig name"
                     style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;
                            font:inherit;font-size:13px;margin-bottom:6px" @keyup.enter="saveRenameRig">
              <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0">
                <button class="btn btn-ghost btn-sm" @click="renameOpen=false">Cancel</button>
                <button class="btn btn-pri btn-sm" @click="saveRenameRig">Save name</button>
              </div>
            </span>
          </div>
          <div class="rig-hd" v-else>
            <span style="flex:1;min-width:0">
              <span class="rig-nm">{{ rig.name }}
                <button class="btn btn-sm btn-ghost" style="padding:2px 6px;margin-left:4px"
                        @click="startRenameRig">Rename</button></span>
              <div class="sb" style="margin-top:3px;display:flex;align-items:center;gap:8px">
                <Chassis v-bind="chassisOf(rig)" large />
                <span>{{ stateOf(rig).label }}{{ stateOf(rig).sub?' — '+stateOf(rig).sub:'' }}</span></div></span>
            <span style="flex:none;text-align:right">
              <div class="rig-net" :class="g.rigNet(rig)>=0?'pos':'neg'">{{ fmt.usd2(g.rigNet(rig)) }}</div>
              <div class="rig-net-l">per day</div></span>
          </div>
          <div class="rig-stats">
            <div class="s"><div class="k">Hashrate</div><div class="v">{{ fmt.hash(g.rigHash(rig)) }}</div></div>
            <div class="s"><div class="k">Draw</div><div class="v">{{ fmt.w(g.rigWallW(rig)) }}</div></div>
            <div class="s"><div class="k">Wear</div>
              <div class="v" :class="avgWear(rig)>0.6?'neg':avgWear(rig)>REPAIR_AT?'amb':''">
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
                    aria-label="power" :aria-pressed="rig.on&&rig.building<=0"><i></i></button>
            <span style="font-size:13px;flex:1">{{ rig.on ? 'Powered on' : stateOf(rig).label }}
              <div v-if="!rig.on&&rig.cut" class="sb">Turning it back on will not hold until the cause clears.</div></span>
          </div>
          <div class="rigfld"><label for="rig-group-select">Mining group — chain and pool live on the group</label>
            <select id="rig-group-select" :value="rig.group"
                    @change="g.setRigGroup(rig,parseInt($event.target.value))">
              <option v-for="gr in g.s.groups" :key="gr.id" :value="gr.id">
                {{ gr.name }} — {{ g.chain(gr.chain).name }}</option>
            </select>
            <p class="hint">Moving between groups never forfeits anything — the window belongs to the group. Manage groups on the Farm tab.</p></div>
          <div class="rigfld"><label for="rig-tune-range">Tune — quiet to pushed</label>
            <input id="rig-tune-range" type="range" min="-0.15" max="0.15" step="0.01" :value="rig.tune||0"
                   @input="rig.tune=parseFloat($event.target.value)">
            <div class="track-cap">
              <span>{{ ((rig.tune||0)*100).toFixed(0) }}% hash · {{ ((rig.tune||0)*190).toFixed(0) }}% power</span>
              <b :class="(rig.tune||0)>0.05?'amb':''">wear ×{{ (1+Math.max(0,(rig.tune||0))*3).toFixed(1) }}</b></div>
          </div>
        </div></div>

        <div class="card"><div class="list">
          <button class="pickrow" :disabled="rig.building>0" @click="g.startRebuild(rig); openRig=null">
            <span class="lab">Retrofit</span>
            <span class="val"><div class="n">{{ rig.building>0 ? 'Rebuilding — '+fmt.dur(rig.building) : 'Plan a rebuild' }}</div>
              <div class="s">Swap any parts, add or remove cards, one bill — the rig goes down for the assembly time.</div></span>
            <span class="ch">&rsaquo;</span></button>
          <button class="pickrow" :disabled="!wornN(rig,REPAIR_AT)||g.s.cash<wornCost(rig,REPAIR_AT)"
                  @click="g.swapWorn(rig.id,REPAIR_AT)">
            <span class="lab">Repair</span>
            <span class="val"><div class="n">{{ wornN(rig,REPAIR_AT)
              ? 'Replace '+wornN(rig,REPAIR_AT)+' worn card'+(wornN(rig,REPAIR_AT)===1?'':'s')+' · '+fmt.usd(wornCost(rig,REPAIR_AT))
              : 'No cards worn past '+fmt.pct(REPAIR_AT,0)+' yet' }}</div>
              <div class="s">Cards are swapped in place; the rig keeps running.</div></span></button>
          <button class="pickrow" @click="g.scrapRig(rig.id); openRig=null">
            <span class="lab">Strip</span>
            <span class="val"><div class="n" style="color:var(--red)">Strip this rig for parts</div>
              <div class="s">Frees its position and credits salvage.</div></span></button>
        </div></div>
      </div>
    </div>

    <div v-if="fleetOpen" class="sheet" ref="fleetSheetEl" role="dialog" aria-modal="true" aria-labelledby="fleet-sheet-title">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="fleetOpen=false">&lsaquo; Rigs</button>
        <span class="t" id="fleet-sheet-title">Fleet actions</span></div>
      <div class="sheet-bd">
        <div class="card"><div class="card-bd pt">
          <div class="dl" style="margin-top:0"><dt>Applies to</dt><dd>{{ scopeLabel }}</dd></div>
          <p class="hint" style="margin-top:0">Select rigs on the list to narrow this; with nothing selected every action covers the whole site.</p>
        </div></div>
        <div class="card"><div class="card-bd pt">
          <div class="rigfld"><label>Repair worn cards</label>
            <button class="btn btn-wide" :class="wornInfo.n&&g.s.cash>=wornInfo.cost?'btn-pri':''"
                    :disabled="!wornInfo.n||g.s.cash<wornInfo.cost" @click="g.fleetRepair(REPAIR_AT,scopeId)">
              {{ wornInfo.n ? 'Replace '+wornInfo.n+' card'+(wornInfo.n===1?'':'s')+' across '+wornInfo.rigs+' rig'+(wornInfo.rigs===1?'':'s')+' · '+fmt.usd(wornInfo.cost)
                 : 'Nothing worn past '+fmt.pct(REPAIR_AT,0) }}</button></div>
          <div class="rigfld"><label for="fleet-group-select">Move to a group</label>
            <select id="fleet-group-select" v-model.number="fleetGroup">
              <option v-for="gr in g.s.groups" :key="gr.id" :value="gr.id">
                {{ gr.name }} — {{ g.chain(gr.chain).name }}{{ gr.pool==='solo'?' · solo':(g.poolOf(gr.pool)?' · '+g.poolOf(gr.pool).name:'') }}</option>
            </select>
            <button class="btn btn-wide" style="margin-top:6px" :class="moveInfo.rigs?'btn-pri':''"
                    :disabled="!moveInfo.rigs" @click="g.fleetMove(fleetGroup,scopeId)">
              {{ moveInfo.rigs ? 'Move '+moveInfo.rigs+' rig'+(moveInfo.rigs===1?'':'s')+' ('+fmt.hash(moveInfo.hash)+')' : 'Already there' }}</button>
          </div>
        </div></div>
        <div class="card"><div class="card-bd pt">
          <div class="rigfld"><label for="fleet-card-select">Swap cards, keeping each chassis</label>
            <select id="fleet-card-select" v-model="fleetCard">
              <option v-for="c in fleetCardOpts" :key="c.id" :value="c.id">
                {{ c.name }} — {{ c.mh }} MH · {{ (c.mh/c.w).toFixed(2) }} MH/W · {{ fmt.usd(c.price) }}</option>
            </select>
            <button class="btn btn-wide" style="margin-top:6px" :class="refitInfo.rigs?'btn-pri':''"
                    :disabled="!refitInfo.rigs||g.s.cash<refitInfo.cost" @click="g.fleetRefit(fleetCard,scopeId)">
              {{ refitInfo.rigs ? 'Refit '+refitInfo.rigs+' rig'+(refitInfo.rigs===1?'':'s')+' · '+fmt.usd(refitInfo.cost) : 'No eligible rigs' }}</button>
          </div>
          <div class="rigfld" style="margin-top:12px">
            <label>Rebuild to the Build tab's specification</label>
            <div class="dl" style="margin-top:0"><dt>Target</dt>
              <dd>{{ g.s.draft.n }} × {{ g.PART(g.s.draft.unit).name }}</dd></div>
            <button class="btn btn-wide" style="margin-top:6px"
                    :class="specInfo.rigs&&g.s.cash>=specInfo.cost?'btn-pri':''"
                    :disabled="!specInfo.rigs||specInfo.cost>g.s.cash"
                    @click="g.fleetToSpec(g.draftSpec(),scopeId)">
              {{ !specInfo.rigs ? 'Nothing to rebuild' : specInfo.cost>g.s.cash
                   ? 'Needs '+fmt.usd(specInfo.cost)+' for '+specInfo.rigs+' rig'+(specInfo.rigs===1?'':'s')
                   : 'Rebuild '+specInfo.rigs+' rig'+(specInfo.rigs===1?'':'s')+' · '+fmt.usd(specInfo.cost) }}</button>
          </div>
        </div></div>
      </div>
    </div>

    <div v-if="g.s.rebuild && rbRig" class="sheet" ref="rebuildSheetEl" role="dialog" aria-modal="true" aria-labelledby="rebuild-sheet-title">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost"
                @click="g.s.rebuild.picker ? g.s.rebuild.picker=null : g.s.rebuild=null">
          &lsaquo; {{ g.s.rebuild.picker ? 'Back' : 'Cancel' }}</button>
        <span class="t" id="rebuild-sheet-title">{{ g.s.rebuild.picker
          ? {unit:'Cards',frame:'Frame',mobo:'Board',cool:'Cooling',psu:'Supply'}[g.s.rebuild.picker]
          : 'Rebuild '+rbRig.name }}</span></div>
      <div class="sheet-bd">
        <template v-if="g.s.rebuild.picker">
          <Compare title="Cheapest first" metric="price" :rows="rbPickerRows" :pick="rbChoose" />
        </template>
        <template v-else>
          <div class="card"><div class="list">
            <button v-for="fl in rbFields" :key="fl.slot" class="pickrow" @click="g.s.rebuild.picker=fl.slot">
              <span class="lab">{{ fl.label }}</span>
              <span class="val"><div class="n">{{ fl.name }}
                <span v-if="fl.changed" class="tag b" style="margin-left:5px">CHANGED</span></div>
                <div class="s">{{ fl.sub }}</div></span>
              <span class="ch">&rsaquo;</span></button>
            <div class="pickrow"><span class="lab">Count</span>
              <span class="val"><div class="n">{{ rbD.n }} × {{ g.PART(rbD.unit).name }}</div>
                <div class="s">Limit {{ rbInfo.lim }}</div></span>
              <span class="stepper">
                <button aria-label="Decrease card count" :disabled="rbD.n<=1" @click="rbD.n=Math.max(1,rbD.n-1)">&minus;</button>
                <span class="num">{{ rbD.n }}</span>
                <button aria-label="Increase card count" :disabled="rbD.n>=rbInfo.lim" @click="rbD.n=Math.min(rbInfo.lim,rbD.n+1)">+</button></span></div>
          </div></div>
          <button class="btn btn-wide" :class="rbInfo.ok?'btn-pri':''" :disabled="!rbInfo.ok" @click="g.applyRebuild()">
            {{ rbInfo.ok ? 'Take it down for '+fmt.dur(rbInfo.time) : 'Fix the crosses above' }}</button>
        </template>
      </div>
    </div>
  </div>
</template>
