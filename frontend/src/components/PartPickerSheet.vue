<script setup>
import { computed, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { FRAMES, MOBOS, COOLERS } from '../data/hardware.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import Compare from './Compare.vue';

// Part picker architecture (props vs store, emit-not-write, custom parts):
// docs/implementation-notes.md#part-picker-sheet-srccomponentspartpickersheetvue.
const props = defineProps({
  fields: { type: Array, required: true },     // FIELDS rows: {k, label, job, sub(part)}
  cardLimit: { type: Object, required: true }, // {n, frame, mobo}: cards this pair can wire
  units: { type: Array, required: true },      // card options, following the generation ladder
});
const emit = defineEmits(['pick']);

const g = useGameStore();

const field = computed(() => props.fields.find(f => f.k === g.s.picker) || null);

const optionsFor = k => {
  const base = k==='frame'?FRAMES:k==='mobo'?MOBOS:k==='cool'?COOLERS:k==='psu'?g.PSUS:props.units;
  return base.concat(g.s.customParts.filter(p => p.kind === k));
};

const pickerRows = computed(() => {
  const k = g.s.picker; if(!k) return [];
  const cur = g.s.draft[k], fld = field.value;
  const lim = props.cardLimit;
  return optionsFor(k).map(p => {
    const e = k==='unit' ? g.unitEcon(p) : null;
    let note='';
    if(k==='frame'){ const would=Math.min(p.slots,lim.mobo);
      note = would>lim.n ? ' · raises your limit to '+would
           : would<lim.n ? ' · drops your limit to '+would
           : ' · limit stays '+lim.n+' (the board caps you)'; }
    if(k==='mobo'){ const would=Math.min(lim.frame,p.pcie);
      note = would>lim.n ? ' · raises your limit to '+would
           : would<lim.n ? ' · drops your limit to '+would
           : ' · limit stays '+lim.n+' (the frame caps you)'; }
    return { id:p.id, name:p.name,
      // A fab-designed custom part has no catalogue id and so no photograph;
      // PartTile falls back to an empty tile, which keeps the column aligned.
      tile:p.id,
      sub:(fld?fld.sub(p):'')+note+(e?' · '+fmt.usd2(e.net)+'/day each':''),
      value:p.price?fmt.usd(p.price):'free',
      valueSub: e ? (isFinite(e.payback)?Math.round(e.payback)+'d payback':'never') : '',
      current:p.id===cur };
  });
});

const pickerSheetEl = ref(null);
useSheetA11y(pickerSheetEl, computed(()=>!!g.s.picker), ()=>{ g.s.picker=null; });
</script>

<template>
  <div v-if="g.s.picker && field" class="sheet" ref="pickerSheetEl" role="dialog" aria-modal="true"
       aria-labelledby="build-picker-title">
    <div class="sheet-hd">
      <button class="btn btn-sm btn-ghost" @click="g.s.picker=null">&lsaquo; Back</button>
      <span class="t" id="build-picker-title">{{ field.label }} —
        {{ field.job }}</span></div>
    <div class="sheet-bd">
      <Compare title="Cheapest first — more expensive is always better" metric="cost"
               :rows="pickerRows" :pick="id => emit('pick', id)" />
      <p class="hint" style="padding:0 2px">Every ladder is monotonic: a more expensive part is better on
        every axis. What changes is value — dollars per MH worsen as you climb, so cheap parts
        win while cash is short and efficient parts win once watts are.</p>
    </div>
  </div>
</template>
