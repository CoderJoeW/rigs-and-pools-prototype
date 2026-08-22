<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { C } from '../data/constants.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import { useSwipeAction } from '../composables/useSwipeAction.js';
import { useInlineRename } from '../composables/useInlineRename.js';
import RebuildSheet from '../components/RebuildSheet.vue';
import FleetSheet from '../components/FleetSheet.vue';
import ChainMark from '../components/ChainMark.vue';
import Chassis from '../components/Chassis.vue';
import RigShot from '../components/RigShot.vue';
import { CHAIN_HUE } from '../data/chains.js';
import { sitePlate, sitePhase } from '../utils/siteArt.js';

const g = useGameStore();
const f=computed(()=>g.active);

const avgWear=r=>g.rigWear(r);
const stateOf=r=>g.rigState(r);
const needsEye=r=>['off','worn','losing','wearing'].includes(stateOf(r).k);
const chainHueOf=r=>{
  const gr=g.groupOf(r);
  const chain=gr?gr.chain:null;
  return chain!=null?CHAIN_HUE[chain]:undefined;
};
const chassisOf=r=>{
  const n=r.units?r.units.length:0;
  return {
    state:stateOf(r).dot,
    size:n>=9?'lg':n>=5?'md':'sm',
    chainHue:chainHueOf(r),
    label:stateOf(r).label,
  };
};
const siteRigs=computed(()=>g.siteRigs(f.value));
// Filter chips: design-spec.md §6n.
const FILTERS=[
  {k:'all',     label:'All',      test:()=>true,  mark:'layers'},
  {k:'attention',label:'Needs attention', test:needsEye, alert:true, mark:'warn'},
  {k:'run',     label:'Running',  test:r=>stateOf(r).k==='run',  mark:'dot', dot:'run'},
  {k:'off',     label:'Off',      test:r=>stateOf(r).k==='off',  mark:'dot', dot:'off'},
  {k:'worn',    label:'Worn',     test:r=>['worn','wearing'].includes(stateOf(r).k),
                                  mark:'dot', dot:'warn'},
];
const filt=ref('all');
const counts=computed(()=>{
  const o={}; for(const x of FILTERS) o[x.k]=siteRigs.value.filter(x.test).length;
  return o;
});
// Each sort names its own direction (e.g. "Net/day (high -> low)"); cmp is
// always written ascending and reversed when flipped.
const SORTS=[
  {k:'name', label:'Name',
   // By name, not id, since rigs are renameable here; numeric collation so
   // "Rig 2" precedes "Rig 10", id breaks a tie.
   cmp:(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})||a.id-b.id,
   ends:['A–Z','Z–A']},
  {k:'net',  label:'Net/day', cmp:(a,b)=>g.rigNet(a)-g.rigNet(b), ends:['low → high','high → low'], desc:true},
  {k:'hash', label:'Hashrate',cmp:(a,b)=>g.rigHash(a)-g.rigHash(b), ends:['low → high','high → low'], desc:true},
  {k:'wear', label:'Wear',    cmp:(a,b)=>avgWear(a)-avgWear(b), ends:['low → high','high → low'], desc:true},
];
const sortBy=ref('name');
// Direction held per column so switching sorts doesn't leak one's flip into another.
const sortDesc=reactive(Object.fromEntries(SORTS.map(x=>[x.k,!!x.desc])));
const sortOpen=ref(false);
const sortOf=k=>SORTS.find(x=>x.k===k);
const sortEnd=k=>sortOf(k).ends[sortDesc[k]?1:0];
const sortLabel=computed(()=>sortOf(sortBy.value).label+' ('+sortEnd(sortBy.value)+')');
const flipSort=()=>{ sortDesc[sortBy.value]=!sortDesc[sortBy.value]; };
const pickSort=k=>{
  if(k===sortBy.value) flipSort(); else sortBy.value=k;
  sortOpen.value=false;
};
const shown=computed(()=>{
  const test=FILTERS.find(x=>x.k===filt.value).test;
  const s=sortOf(sortBy.value), dir=sortDesc[sortBy.value]?-1:1;
  return siteRigs.value.filter(test).sort((a,b)=>s.cmp(a,b)*dir);
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

/* Swipe-a-row-to-power-it: the pointer mechanics live in the composable, which
   knows nothing about rigs. What stays here is the domain half — which rows may
   be swiped, and what the swipe does. */
const canSwipe=r=>!!r && !picking.value && stateOf(r).k!=='build';
const swipeVerb=r=>r.on?'Power off':'Power on';
const rigById=id=>g.s.rigs.find(r=>r.id===id);

const { sw, SW_FIRE, onDown:onSwipeDown, onMove:onSwipeMove, onUp:onSwipeUp,
  onCancel:onSwipeCancel, fire:fireSwipe, close:closeSwipe, reset:resetSwipe,
  takeClick, isOpen:swipeOpen } = useSwipeAction({
    can: id => canSwipe(rigById(id)),
    fire: id => g.toggleRig(id),
    within: '.rigswipe',
  });

const rowClick=r=>{
  if(takeClick()) return;                      // this click is the tail of a drag
  if(swipeOpen(r.id)){ closeSwipe(); return; } // an open row closes before it opens
  if(picking.value) toggleChoose(r); else openRig.value=r.id;
};
watch([picking,filt,sortBy,()=>sortDesc[sortBy.value]],()=>resetSwipe());

const openRig=ref(null);
const rig=computed(()=> openRig.value==null ? null
  : g.s.rigs.find(r=>r.id===openRig.value) || null);
const { open:renameOpen, draft:renameDraft, start:startRenameRig, commit:saveRenameRig } =
  useInlineRename(()=>rig.value.name, name=>g.renameRig(rig.value.id,name));
watch(openRig, ()=>{ renameOpen.value=false; resetSwipe(); });
const fleetOpen=ref(false);
const REPAIR_AT=C.REPAIR_AT;

/* Same worn-card definition the fleet sweep uses, asked of the open rig only. */
const rigWorn=computed(()=> rig.value ? g.rigWorn(rig.value,REPAIR_AT) : {n:0,cost:0});

const siteHash=computed(()=>siteRigs.value.reduce((a,r)=>a+g.rigHash(r),0));
const siteNet=computed(()=>siteRigs.value.reduce((a,r)=>a+g.rigNet(r),0));
const siteLive=computed(()=>siteRigs.value.filter(r=>g.rigLive(r)).length);
const siteSlots=computed(()=>g.siteSlots(f.value));
// Hero wears the site's own shell (same plate as Sites/Farm), not a fixed rig photo.
const heroShot=computed(()=>sitePlate(f.value.shell, sitePhase(g.s.t)));
// Same dot vocabulary the rows use, not a fourth "site" colour.
const siteStatus=computed(()=>{
  if(siteLive.value) return {dot:'run', label:'Active'};
  if(siteRigs.value.some(r=>r.building>0)) return {dot:'build', label:'Building'};
  if(siteRigs.value.length) return {dot:'off', label:'Idle'};
  return {dot:'off', label:'Empty'};
});

watch(()=>f.value&&f.value.id, ()=>{ stopPicking(); openRig.value=null; filt.value='all'; resetSwipe(); });

const takeFocusRig=()=>{
  const id=g.s.focusRig; if(id==null) return;
  g.s.focusRig=null;
  const r=g.s.rigs.find(x=>x.id===id);
  if(r && r.site===g.s.activeSite) openRig.value=id;
};
onMounted(takeFocusRig);
watch(()=>g.s.focusRig, takeFocusRig);

const rigSheetEl=ref(null);
useSheetA11y(rigSheetEl, computed(()=>!!rig.value), ()=>{ openRig.value=null; });
</script>

<template>
  <div>
    <div class="pagehd">
      <h1 class="pagehd-t">Rigs</h1>
      <p class="pagehd-s">Fleet overview and management</p>
    </div>

    <div class="card rig-hero" data-tour="rigs">
      <div class="rig-hero-top">
        <img class="rig-hero-shot" :src="heroShot" alt="" aria-hidden="true" />
        <div class="rig-hero-id">
          <div class="rig-hero-nm">{{ f.name }}</div>
          <div class="rig-hero-st">
            <i class="dot" :class="siteStatus.dot" aria-hidden="true"></i>{{ siteStatus.label }}</div>
          <div class="rig-hero-pos">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/>
              <circle cx="12" cy="10" r="2.6"/></svg>
            Positions used: {{ siteRigs.length }} of {{ siteSlots }}</div>
        </div>
      </div>
      <div class="rig-hero-stats">
        <div class="s"><div class="k">Rigs</div><div class="v">{{ siteRigs.length }}</div>
          <div class="u">{{ siteLive }} active</div></div>
        <div class="s"><div class="k">Hashrate</div><div class="v">{{ fmt.hash(siteHash) }}</div>
          <div class="u">Total</div></div>
        <div class="s"><div class="k">Net/day</div>
          <div class="v" :class="siteNet>=0?'pos':'neg'">{{ fmt.usd2(siteNet) }}</div>
          <div class="u">Total</div></div>
      </div>
      <div v-if="g.s.sites.length>1" class="pills">
        <button v-for="st in g.s.sites" :key="st.id" class="pill"
                :class="{on:st.id===g.s.activeSite}" :aria-current="st.id===g.s.activeSite?'true':null"
                @click="g.s.activeSite=st.id">
          {{ st.name }} <span class="n">{{ g.siteRigs(st).length }}</span></button>
      </div>
    </div>

    <template v-if="siteRigs.length">
      <div class="pills rigfilters">
        <button v-for="x in FILTERS" :key="x.k" class="pill"
                :class="{on:filt===x.k, alert:x.alert&&counts[x.k]>0}"
                :disabled="!counts[x.k] && filt!==x.k"
                :aria-label="x.label+' — '+counts[x.k]+' rig'+(counts[x.k]===1?'':'s')"
                @click="filt=x.k">
          <svg v-if="x.mark==='layers'" class="pill-ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/>
            <path d="m3 16.5 9 4.5 9-4.5"/></svg>
          <svg v-else-if="x.mark==='warn'" class="pill-ic warn" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4 21 20H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>
          <i v-else class="dot" :class="x.dot" aria-hidden="true"></i>
          <span>{{ x.label }}</span></button>
      </div>

      <div class="rigbar">
        <button class="rigsort" :aria-expanded="sortOpen?'true':'false'" @click="sortOpen=!sortOpen">
          <span class="lb">Sort: <b>{{ sortLabel }}</b></span></button>
        <button class="rigsort-flip" :aria-label="'Reverse the order — currently '+sortEnd(sortBy)"
                @click="flipSort">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 20V4m0 0L4 7m3-3 3 3"/><path d="M17 4v16m0 0 3-3m-3 3-3-3"/></svg></button>
        <div class="rigbar-act">
          <button class="rigsel" :class="{on:picking}" :aria-pressed="picking?'true':'false'"
                  @click="picking ? stopPicking() : picking=true">
            <span class="box" :class="{on:picking}" aria-hidden="true">&#10003;</span>
            {{ picking?'Done':'Select' }}</button>
          <span class="rigbar-sep" aria-hidden="true">/</span>
          <button class="rigsel" @click="fleetOpen=true">Fleet</button>
        </div>
      </div>
      <div v-if="sortOpen" class="pills rigsorts">
        <button v-for="x in SORTS" :key="x.k" class="pill" :class="{on:sortBy===x.k}"
                @click="pickSort(x.k)">{{ x.label }} ({{ sortEnd(x.k) }})</button>
      </div>
    </template>

    <div class="riglist" v-if="shown.length">
      <div v-for="r in shown" :key="r.id" class="rigswipe"
           :class="{dragging:sw.drag&&sw.id===r.id}">
        <div class="rigslide" :class="{sx:sw.id===r.id, drag:sw.drag&&sw.id===r.id}"
             :style="sw.id===r.id?{'--sx':sw.x+'px'}:null">
          <button class="rigrow" :class="{sel:picking&&chosen[r.id]}"
                  @click="rowClick(r)"
                  @pointerdown="onSwipeDown($event,r.id)" @pointermove="onSwipeMove($event,r.id)"
                  @pointerup="onSwipeUp($event,r.id)" @pointercancel="onSwipeCancel($event,r.id)">
            <span v-if="picking" class="box" :class="{on:chosen[r.id]}">&#10003;</span>
            <RigShot v-else :state="stateOf(r).dot" :frame="r.frame" />
            <span class="mid">
              <span class="nm">{{ r.name }}</span>
              <span class="st"><i class="dot" :class="stateOf(r).dot" aria-hidden="true"></i>
                {{ stateOf(r).label }}</span>
              <!-- The group is dropped while there is only one: on a farm that
                   has never split its rigs, naming the group every row says
                   nothing and costs the chain its place on the first line. -->
              <div class="sb">{{ r.units.length }}× {{ g.PART(r.units[0].p).name }}<template
                  v-if="g.s.groups.length>1"> &middot; {{ g.groupOf(r).name }}</template>
                &middot; <ChainMark :chain="g.groupOf(r).chain"
                />{{ g.chain(g.groupOf(r).chain).name }}</div>
              <div class="wearline">
                <span class="wl">Wear</span>
                <div class="wearbar" aria-hidden="true">
                  <i :class="avgWear(r)>0.6?'b':avgWear(r)>REPAIR_AT?'w':''"
                     :style="{width:(avgWear(r)*100).toFixed(0)+'%'}"></i></div>
                <span class="wp" :class="avgWear(r)>0.6?'neg':avgWear(r)>REPAIR_AT?'amb':''"
                  >{{ (avgWear(r)*100).toFixed(0) }}%</span></div>
            </span>
            <span class="rt">
              <div class="v" :class="g.rigNet(r)>=0?'pos':'neg'">{{ fmt.usd2(g.rigNet(r)) }}</div>
              <div class="k">Net/day</div>
              <div class="v2">{{ fmt.hash(g.rigHash(r)) }}</div>
              <div class="k">Hashrate</div></span>
            <span v-if="!picking" class="ch" aria-hidden="true">&rsaquo;</span>
          </button>
        </div>
        <button v-if="sw.id===r.id" class="rigswact"
                :class="{go:!r.on, arm:sw.x>=SW_FIRE}"
                :aria-label="swipeVerb(r)+' '+r.name" @click="fireSwipe(r.id)">
          <span class="lb">{{ swipeVerb(r) }}</span>
          <span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M12 3v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg></span>
        </button>
      </div>
    </div>
    <!-- Outside .riglist, not inside it: a sticky box that is its own grid
         item has an auto-sized row for a containing block and so no offset
         range to travel through — it would scroll away with the rows it is
         meant to outlast. -->
    <div v-if="picking&&shown.length" class="selbar">
      <span class="c">{{ chosenIds.length }} selected</span>
      <button class="btn btn-sm btn-ghost" @click="chooseAll">
        {{ chosenIds.length===shown.length?'None':'All' }}</button>
      <button class="btn btn-sm btn-pri" :disabled="!chosenIds.length"
              @click="fleetOpen=true">Act on these</button>
    </div>
    <!-- Gated on the app-wide help preference like every other hint, even
         though the mockup draws it as permanent furniture: a player who has
         turned hints off has said this is the one thing they do not need. -->
    <div v-if="g.s.help&&shown.length&&!picking" class="card swipetip">
      <span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24">
        <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/>
        <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11"/>
        <path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 7-6 7s-6-2.6-6-6v-3.5a1.5 1.5 0 0 1 3 0V13"/>
        </svg></span>
      <span class="tx">Swipe a rig left for quick actions &mdash; tapping still opens it</span>
      <span class="ci" aria-hidden="true">i</span>
    </div>

    <div class="card" v-if="!shown.length"><div class="empty">
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
                <span>{{ stateOf(rig).label }}{{ stateOf(rig).sub?' — '+stateOf(rig).sub:'' }}</span>
                <button v-if="rig.building>0" class="btn btn-sm rigrush"
                        :disabled="g.s.cash<g.rushRigCost(rig)" @click="g.rushRig(rig.id)">
                  Rush {{ fmt.usd(g.rushRigCost(rig)) }}</button></div></span>
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
              <div v-if="!rig.on&&rig.cut" class="sb">Turning it back on will not hold until the
                cause clears.</div></span>
          </div>
          <div class="rigfld"><label for="rig-group-select">Mining group — chain and pool live on the group</label>
            <select id="rig-group-select" :value="rig.group"
                    @change="g.setRigGroup(rig,parseInt($event.target.value))">
              <option v-for="gr in g.s.groups" :key="gr.id" :value="gr.id">
                {{ gr.name }} — {{ g.chain(gr.chain).name }}</option>
            </select>
            <p class="hint">Moving between groups never forfeits anything — the window belongs to
              the group. Manage groups on the Farm tab.</p></div>
          <div class="rigfld"><label for="rig-tune-range">Tune — quiet to pushed</label>
            <input id="rig-tune-range" type="range" min="-0.15" max="0.15" step="0.01" :value="rig.tune||0"
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
          <button class="pickrow" :disabled="!rigWorn.n||g.s.cash<rigWorn.cost"
                  @click="g.swapWorn(rig.id,REPAIR_AT)">
            <span class="lab">Repair</span>
            <span class="val"><div class="n">{{ rigWorn.n
              ? 'Replace '+rigWorn.n+' worn card'+(rigWorn.n===1?'':'s')
                +' · '+fmt.usd(rigWorn.cost)
              : 'No cards worn past '+fmt.pct(REPAIR_AT,0)+' yet' }}</div>
              <div class="s">Cards are swapped in place; the rig keeps running.</div></span></button>
          <button class="pickrow" @click="g.scrapRig(rig.id); openRig=null">
            <span class="lab">Strip</span>
            <span class="val"><div class="n" style="color:var(--red)">Strip this rig for parts</div>
              <div class="s">Frees its position and credits salvage.</div></span></button>
        </div></div>
      </div>
    </div>

    <FleetSheet v-model:open="fleetOpen" :scope-id="scopeId" :scope-label="scopeLabel" />

    <RebuildSheet />
  </div>
</template>

<style scoped>
/* The Rigs tab's own chrome. Everything shared with the rest of the app — the
   card, the pill, the .dot vocabulary, the swipe mechanics — still comes from
   main.css; what lives here is the layout the mockup asks for and nothing
   else uses: a page header, a hero that fronts the site with a photograph,
   a list of rigs as separate cards rather than rows of one, and the sort /
   select bar between them. */

.rigrush{flex:none;background:var(--amber-t);color:var(--amber);font-weight:500}
.rigrush:active:not(:disabled){background:color-mix(in srgb,var(--amber) 25%,transparent)}

/* ---- the site hero -------------------------------------------------- */
.rig-hero{padding:0;overflow:hidden}
.rig-hero-top{display:flex;gap:12px;padding:12px}
.rig-hero-shot{flex:none;width:104px;height:88px;border-radius:8px;object-fit:cover;
  display:block;background:#07080a;border:1px solid #22262d}
.rig-hero-id{flex:1;min-width:0;padding-top:1px}
.rig-hero-nm{font-size:17px;font-weight:600;letter-spacing:-.02em;line-height:1.2;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rig-hero-st{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);
  margin-top:5px}
.rig-hero-pos{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-3);
  margin-top:6px}
.rig-hero-pos .ic{flex:none;width:13px;height:13px;fill:none;stroke:currentColor;
  stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.rig-hero-stats{display:grid;grid-template-columns:repeat(3,1fr);
  border-top:1px solid var(--line)}
.rig-hero-stats .s{padding:9px 12px;border-right:1px solid var(--line-2);min-width:0}
.rig-hero-stats .s:last-child{border-right:none}
.rig-hero-stats .k{font-size:9.5px;color:var(--ink-3);letter-spacing:.04em;
  text-transform:uppercase}
.rig-hero-stats .v{font-family:var(--mono);font-size:17px;font-weight:500;line-height:1.15;
  margin-top:3px;overflow:hidden;text-overflow:ellipsis}
.rig-hero-stats .v.pos{color:var(--green)} .rig-hero-stats .v.neg{color:var(--red)}
.rig-hero-stats .u{font-size:9.5px;color:var(--ink-3);margin-top:1px}

/* ---- filters -------------------------------------------------------- */
/* Off a card, so the strip scrolls against the page rather than inside a
   panel; the negative margin lets it run to both edges the way .pills does
   inside a card. */
.rigfilters{padding:0 12px 9px;margin:0 -12px;gap:5px}
.rigfilters .pill{gap:5px;padding:7px 10px;font-size:12px}
.rigfilters .pill .dot{width:8px;height:8px}
.rigfilters .pill:disabled{opacity:.38}
.pill-ic{flex:none;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round}
.pill-ic.warn{color:var(--red)}
/* The selected chip is a tinted outline rather than main.css's solid ink fill:
   five of these sit in a row above a list of photographs, and a black lozenge
   among them reads as a sixth piece of hardware. */
.rigfilters .pill.on,
.rigsorts .pill.on{background:var(--blue-t);border-color:var(--blue);color:var(--blue)}
.rigfilters .pill.alert{border-color:color-mix(in srgb, var(--red) 45%, var(--line));
  color:var(--red)}
.rigfilters .pill.alert.on{background:var(--red-t);border-color:var(--red);color:var(--red);
  box-shadow:none}
.rigfilters .pill.alert.on .pill-ic{color:var(--red)}

/* ---- sort and select bar -------------------------------------------- */
/* Every control here is padded to a real target rather than left at the
   global *{padding:0} reset — as bare text these were ~17px tall on a layout
   that is driven by thumbs, where the .btn-sm they replaced was ~28px. The
   negative margins keep the padding from moving the text off the page's
   own margin. */
.rigbar{display:flex;align-items:center;gap:4px;padding:0 2px 10px;min-height:34px}
.rigsort{font-size:12px;color:var(--ink-3);white-space:nowrap;padding:9px 6px;margin-left:-6px}
.rigsort b{color:var(--ink);font-weight:600}
.rigsort-flip{flex:none;width:34px;height:34px;display:flex;align-items:center;
  justify-content:center;border-radius:7px;color:var(--ink-2);
  transition:var(--press),background-color .15s}
.rigsort-flip svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round}
.rigbar-act{margin-left:auto;display:flex;align-items:center;gap:2px;
  border:1px solid var(--line);border-radius:9px;padding:0 5px}
.rigbar-sep{color:var(--line);font-size:12px}
.rigsel{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
  color:var(--ink-2);white-space:nowrap;padding:9px 6px}
.rigsel.on{color:var(--blue)}
.rigsel .box{flex:none;width:15px;height:15px;border-radius:4px;
  border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;
  font-size:9px;color:transparent;line-height:1}
.rigsel .box.on{background:var(--blue);border-color:var(--blue);color:#fff}
.rigsorts{padding:0 12px 10px;margin:0 -12px}

/* ---- the list ------------------------------------------------------- */
/* One card per rig rather than one card of rows: at this row height a shared
   panel reads as a table, and the mockup's list reads as a shelf of machines.
   The gap is what does it, so the swipe wrapper takes over the card's own
   frame — and its overflow, which is what clips the action panel underneath
   to the same rounded corners. */
.riglist{display:grid;gap:8px}
.rigswipe{background:var(--card);border:1px solid var(--line);border-radius:10px;
  overflow:hidden}
.rigrow{gap:11px;padding:10px;min-height:88px;align-items:center}
.rigrow .mid{min-width:0}
.rigrow .nm{font-size:16px;font-weight:600;letter-spacing:-.02em;display:block;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rigrow .st{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-2);
  margin-top:3px}
/* Two lines rather than one, unlike the mockup's: real part names run longer
   than its "6x RTX 5090", and the chain — the piece the row's photograph no
   longer carries — is last in the line and so the first thing an ellipsis
   would eat. Short specs still take one line and the row keeps its height. */
.rigrow .sb{margin-top:4px;white-space:normal;overflow-wrap:anywhere;
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.35}
/* Wear is the one number on the row that is a proportion, so it is the one
   thing drawn rather than printed — with the reading beside it, since a bar
   alone cannot say 32% and the mockup asks for both. */
.wearline{display:flex;align-items:center;gap:8px;margin-top:6px}
.wearline .wl{flex:none;font-size:10px;color:var(--ink-3)}
.wearline .wearbar{flex:1;min-width:0;height:5px;border-radius:3px;margin-top:0}
.wearline .wp{flex:none;font-family:var(--mono);font-size:10px;color:var(--ink-3)}
.wearline .wp.amb{color:var(--amber)} .wearline .wp.neg{color:var(--red)}
.rigrow .rt{align-self:center;padding-left:2px}
.rigrow .rt .v{font-size:15.5px}
.rigrow .rt .v2{font-family:var(--mono);font-size:12.5px;font-weight:500;line-height:1.15;
  margin-top:7px}
.rigrow .rt .k{font-size:9px;color:var(--ink-3);margin-top:1px}
.rigrow .ch{flex:none;color:var(--ink-3);font-size:17px;line-height:1}

/* The panel under the row. Filled from the start rather than tinted-then-
   filled: it now sits inside the rig's own card with nothing else in it, so
   there is no neighbouring row for a pale wash to get confused with, and the
   mockup shows it solid.
   The label is var(--card) rather than white for the reason main.css states
   at .rigswact.arm: the dark theme's --red and --green are light enough that
   white on them lands under 3.5:1, where the card colour clears AA against
   both. Which is also why .arm can no longer signal by filling in — that is
   the resting state now — and signals with a ring in the label's own colour
   instead. Darkening the fill would have been the obvious alternative and is
   the one thing that cannot work: it drags the dark theme's near-black label
   back under AA. */
.rigswact{gap:9px;padding:0 16px;background:var(--red);color:var(--card)}
.rigswact.go{background:var(--green);color:var(--card)}
/* "Let go now" happens on the glyph rather than on the panel: the panel's
   edges ARE the card's edges, so anything drawn there (a ring, a heavier
   border) lands on top of the card frame and reads as trim rather than as a
   change of state. The disc is well inboard, and flipping its fill costs no
   contrast — the glyph and its ground simply swap the pair they already had. */
.rigswact .ic{flex:none;width:26px;height:26px;display:flex;align-items:center;
  justify-content:center;border-radius:50%;
  box-shadow:inset 0 0 0 1.5px color-mix(in srgb, currentColor 42%, transparent);
  transition:background-color .15s,box-shadow .15s}
.rigswact .ic svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round}
.rigswact.arm .lb{font-weight:700}
.rigswact.arm .ic{background:currentColor;box-shadow:none}
.rigswact.arm .ic svg{stroke:var(--red)}
.rigswact.go.arm .ic svg{stroke:var(--green)}

/* ---- the swipe tip -------------------------------------------------- */
.swipetip{display:flex;align-items:center;gap:9px;padding:10px 12px;margin-top:8px}
.swipetip .ic{flex:none;display:flex;color:var(--ink-3)}
.swipetip .ic svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.swipetip .tx{flex:1;min-width:0;font-size:12px;color:var(--ink-2)}
.swipetip .ci{flex:none;width:17px;height:17px;border-radius:50%;
  border:1px solid var(--line);display:flex;align-items:center;justify-content:center;
  font-size:10px;font-style:italic;color:var(--ink-3);line-height:1}

/* Sticky against the page rather than inside a card, so the card's own
   negative margins no longer apply. */
.selbar{margin:8px 0 0;border-radius:10px;border:1px solid var(--line)}

@media (max-width:359px){
  .rig-hero-shot{width:88px;height:76px}
  .rigrow{gap:9px;padding:9px}
  .rigrow .nm{font-size:15px}
  .rigrow .rt .v{font-size:14.5px}
}
</style>
