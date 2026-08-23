<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt, partSub } from '../utils/format.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import Compare from './Compare.vue';
import type { Card } from '../data/hardware.js';
import type { Rig, RebuildDraft } from '../game/types.js';

type RebuildSlot = keyof Omit<RebuildDraft, 'n'>;

/* The rig rebuild planner. Everything it needs already lives in the store as
   g.s.rebuild — which rig, the draft, and which slot's picker is open — so it
   takes no props: opening the sheet is g.startRebuild(rig), and closing it is
   clearing g.s.rebuild. That is why this lifted out of RigsView cleanly while
   the fleet sheet needs the view's selection passed in. */
const g = useGameStore();

const rbRig=computed(()=> g.s.rebuild ? g.s.rigs.find((x: Rig)=>x.id===g.s.rebuild!.rig) : null);
// pending/chain live on the rig's group, not the rig itself, since the group refactor.
const rbGroup=computed(()=> rbRig.value ? g.groupOf(rbRig.value) : null);
const rbD=computed(()=> g.s.rebuild ? g.s.rebuild.draft : null);
const rbInfo=computed(()=> rbRig.value && rbD.value ? g.rebuildInfo(rbRig.value, rbD.value)
  : {buy:0,credit:0,net:0,core:0,wall:0,lim:1,checks:[],time:0,ok:false,changed:false,hashNew:0});
const rbFields=computed(()=>{
  const r=rbRig.value, d=rbD.value; if(!r||!d) return [];
  const P=g.PART;
  return [
    { slot:'unit', label:'Cards', name:P(d.unit).name, changed:d.unit!==r.units[0].p,
      sub:P(d.unit).mh+' MH · '+(P(d.unit).mh/P(d.unit).w).toFixed(2)+' MH/W' },
    { slot:'frame', label:'Frame', name:P(d.frame).name, changed:d.frame!==r.frame,
      sub:partSub('frame',P(d.frame)) },
    { slot:'mobo', label:'Board', name:P(d.mobo).name, changed:d.mobo!==r.mobo,
      sub:partSub('mobo',P(d.mobo)) },
    { slot:'cool', label:'Cooling', name:P(d.cool).name, changed:d.cool!==r.cool,
      sub:partSub('cool',P(d.cool)) },
    { slot:'psu', label:'Supply', name:P(d.psu).name, changed:d.psu!==r.psu,
      sub:partSub('psu',P(d.psu)) },
  ];
});
const rbPickerRows=computed(()=>{
  const r=rbRig.value, d=rbD.value; if(!r||!d) return [];
  const slot=g.s.rebuild!.picker as RebuildSlot;
  if(slot==='unit'){
    return g.cards().concat(g.s.customParts.filter(p=>p.kind==='unit') as unknown as Card[]).map((c: Card)=>({ id:c.id, name:c.name,
      sub:c.mh+' MH · '+(c.mh/c.w).toFixed(2)+' MH/W · rig would make '+fmt.hash(d.n*c.mh),
      value:fmt.usd(c.price), valueSub:'each', current:c.id===d.unit }));
  }
  const lim=rbInfo.value.lim;
  // slot is 'frame'|'mobo'|'cool'|'psu' here — 'unit' already returned above.
  // The concat mixes SLOT_OPTS's catalogue shapes with a fab-designed
  // CustomPart, so — same duck-typed-union rationale as PART/SITEPART — the
  // map below reads fields by slot without a runtime discriminant check.
  const opts: any[] = g.SLOT_OPTS[slot];
  return opts.concat(g.s.customParts.filter(p=>p.kind===slot)).map((p: any)=>{
    let note='';
    if(slot==='frame'){ const would=Math.min(p.slots,g.PART(d.mobo).pcie);
      note=would!==lim?' · limit → '+would:''; }
    if(slot==='mobo'){ const would=Math.min(g.PART(d.frame).slots,p.pcie);
      note=would!==lim?' · limit → '+would:''; }
    const eff=partSub(slot as any,p);
    return { id:p.id, name:p.name, sub:eff+note,
      value:p.price?fmt.usd(p.price):'free', valueSub:'',
      current:p.id===d[slot] };
  });
});
const rbChoose=(id: string)=>{
  const d=rbD.value; if(!d||!g.s.rebuild) return;
  d[g.s.rebuild.picker as RebuildSlot]=id;
  const lim=Math.min(g.PART(d.frame).slots,g.PART(d.mobo).pcie);
  if(d.n>lim) d.n=lim;
  g.s.rebuild.picker=null;
};

const rebuildSheetEl=ref<HTMLElement | null>(null);
useSheetA11y(rebuildSheetEl, computed(()=>!!(g.s.rebuild&&rbRig.value)),
  ()=>{ if(!g.s.rebuild) return; if(g.s.rebuild.picker) g.s.rebuild.picker=null; else g.s.rebuild=null; });
</script>

<template>
  <div v-if="g.s.rebuild && rbRig" class="sheet" ref="rebuildSheetEl" role="dialog" aria-modal="true"
       aria-labelledby="rebuild-sheet-title">
    <div class="sheet-hd">
      <button class="btn btn-sm btn-ghost"
              @click="g.s.rebuild!.picker ? g.s.rebuild!.picker=null : g.s.rebuild=null">
        &lsaquo; {{ g.s.rebuild!.picker ? 'Back' : 'Cancel' }}</button>
      <span class="t" id="rebuild-sheet-title">{{ g.s.rebuild!.picker
        ? {unit:'Cards',frame:'Frame',mobo:'Board',cool:'Cooling',psu:'Supply'}[g.s.rebuild!.picker]
        : 'Rebuild '+rbRig.name }}</span></div>
    <div class="sheet-bd">
      <template v-if="g.s.rebuild!.picker">
        <Compare title="Cheapest first" metric="price" :rows="rbPickerRows" :pick="rbChoose" />
      </template>
      <template v-else>
        <div class="card"><div class="list">
          <button v-for="fl in rbFields" :key="fl.slot" class="pickrow"
                  @click="g.s.rebuild!.picker=fl.slot">
            <span class="lab">{{ fl.label }}</span>
            <span class="val"><div class="n">{{ fl.name }}
              <span v-if="fl.changed" class="tag b" style="margin-left:5px">CHANGED</span></div>
              <div class="s">{{ fl.sub }}</div></span>
            <span class="ch">&rsaquo;</span></button>
          <div class="pickrow"><span class="lab">Count</span>
            <span class="val"><div class="n">{{ rbD!.n }} × {{ g.PART(rbD!.unit).name }}
              <span v-if="rbD!.n!==rbRig.units.length" class="tag b" style="margin-left:5px">
                {{ rbD!.n>rbRig.units.length?'+':'' }}{{ rbD!.n-rbRig.units.length }}</span></div>
              <div class="s">Limit {{ rbInfo.lim }} — worn cards are traded first when reducing</div></span>
            <span class="stepper">
              <button aria-label="Decrease card count" :disabled="rbD!.n<=1"
                      @click="rbD!.n=Math.max(1,rbD!.n-1)">&minus;</button>
              <span class="num">{{ rbD!.n }}</span>
              <button aria-label="Increase card count" :disabled="rbD!.n>=rbInfo.lim"
                      @click="rbD!.n=Math.min(rbInfo.lim,rbD!.n+1)">+</button></span></div>
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

        <div v-if="rbGroup && rbGroup.pending>0" class="warnbox" style="margin-bottom:8px">
          <b>Going down forfeits the PPLNS window</b> —
          {{ fmt.c(rbGroup.pending) }} {{ g.chain(rbGroup.chain)!.tick }} at risk.</div>

        <button class="btn btn-wide" :class="rbInfo.ok?'btn-pri':''" :disabled="!rbInfo.ok"
                @click="g.applyRebuild()">
          {{ rbInfo.ok
             ? 'Take it down for '+fmt.dur(rbInfo.time)+' · '
               +(rbInfo.net>=0?'pay '+fmt.usd(rbInfo.net):'collect '+fmt.usd(-rbInfo.net))
             : 'Fix the crosses above' }}</button>
      </template>
    </div>
  </div>
</template>
