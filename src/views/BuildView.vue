<script setup>
import { computed, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt, partSub } from '../utils/format.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import Compare from '../components/Compare.vue';
import Chassis from '../components/Chassis.vue';

const g = useGameStore();

const FIELDS = [
  { k:'unit',  label:'Cards',   job:'the compute' },
  { k:'frame', label:'Frame',   job:'the slots' },
  { k:'mobo',  label:'Board',   job:'the lanes' },
  { k:'cool',  label:'Cooling', job:'the heat' },
  { k:'psu',   label:'Supply',  job:'the watts' },
];

const qty = computed({
  get: () => g.s.draft.qty || 1,
  set: v => { g.s.draft.qty = Math.max(1, Math.min(g.maxBuildQty, v|0)); },
});

const fieldRows = computed(() => {
  const d = g.s.draft;
  const P = g.PART;
  return FIELDS.map(f => {
    const p = P(d[f.k]);
    let sub = '';
    if (f.k === 'unit') sub = p.mh + ' MH · ' + (p.mh / p.w).toFixed(2) + ' MH/W';
    else sub = partSub(f.k, p);
    return { ...f, name: p.name, sub, price: p.price || 0 };
  });
});

const pickerRows = computed(() => {
  const slot = g.s.picker;
  if (!slot) return [];
  if (slot === 'unit') {
    return g.cards().concat(g.s.customParts.filter(p => p.kind === 'unit')).map(c => ({
      id: c.id, name: c.name,
      sub: c.mh + ' MH · ' + (c.mh / c.w).toFixed(2) + ' MH/W',
      value: fmt.usd(c.price), valueSub: 'each', current: c.id === g.s.draft.unit,
    }));
  }
  return g.SLOT_OPTS[slot].concat(g.s.customParts.filter(p => p.kind === slot)).map(p => ({
    id: p.id, name: p.name, sub: partSub(slot, p),
    value: p.price ? fmt.usd(p.price) : 'free', valueSub: '',
    current: p.id === g.s.draft[slot],
  }));
});

const choose = id => {
  g.s.draft[g.s.picker] = id;
  const lim = Math.min(g.PART(g.s.draft.frame).slots, g.PART(g.s.draft.mobo).pcie);
  if (g.s.draft.n > lim) g.s.draft.n = lim;
  g.s.picker = null;
};

const draftChassis = computed(() => {
  const d = g.s.draft;
  const n = d.n || 1;
  // building state while in draft
  const state = 'build';
  return { state, size: n >= 9 ? 'lg' : n >= 5 ? 'md' : 'sm', large: true, label: 'Draft chassis' };
});

const pickerSheetEl = ref(null);
useSheetA11y(pickerSheetEl, computed(() => !!g.s.picker), () => { g.s.picker = null; });
</script>

<template>
  <div>
    <div class="card" data-tour="build">
      <div class="card-hd"><span class="eyebrow">Design</span>
        <span class="eyebrow">{{ g.siteSlots(g.active) - g.siteRigs(g.active).length }} free positions</span></div>

      <div class="build-hero">
        <Chassis class="build-chassis" v-bind="draftChassis" />
        <div style="min-width:0;flex:1">
          <div class="build-hero-title">{{ g.s.draft.n }} × {{ g.PART(g.s.draft.unit).name }}</div>
          <div class="build-hero-sub">{{ g.PART(g.s.draft.frame).name }} · {{ g.PART(g.s.draft.mobo).name }}
            · {{ g.PART(g.s.draft.cool).name }} · {{ g.PART(g.s.draft.psu).name }}</div>
        </div>
      </div>

      <div class="statline" style="border-top:1px solid var(--line-2)">
        <div class="s"><div class="k">Hashrate</div><div class="v">{{ fmt.hash(g.dp.hash) }}</div></div>
        <div class="s"><div class="k">Draw</div><div class="v">{{ fmt.w(g.dp.wall) }}</div></div>
        <div class="s"><div class="k">Cost</div><div class="v">{{ fmt.usd(g.dp.cost) }}</div></div>
      </div>
    </div>

    <div class="card"><div class="list">
      <button v-for="fl in fieldRows" :key="fl.k" class="pickrow" @click="g.s.picker=fl.k">
        <span class="lab">{{ fl.label }}</span>
        <span class="val"><div class="n">{{ fl.name }}</div>
          <div class="s">{{ fl.sub }}</div></span>
        <span class="ch">&rsaquo;</span></button>
      <div class="pickrow"><span class="lab">Count</span>
        <span class="val"><div class="n">{{ g.s.draft.n }} × {{ g.PART(g.s.draft.unit).name }}</div>
          <div class="s">Limit {{ g.dp.lim }} — cards per chassis</div></span>
        <span class="stepper">
          <button aria-label="Decrease card count" :disabled="g.s.draft.n<=1"
                  @click="g.s.draft.n=Math.max(1,g.s.draft.n-1)">&minus;</button>
          <span class="num">{{ g.s.draft.n }}</span>
          <button aria-label="Increase card count" :disabled="g.s.draft.n>=g.dp.lim"
                  @click="g.s.draft.n=Math.min(g.dp.lim,g.s.draft.n+1)">+</button></span></div>
    </div></div>

    <div class="card"><div class="card-bd pt">
      <div class="rigfld"><label for="build-qty">Order quantity</label>
        <div style="display:flex;align-items:center;gap:10px">
          <input id="build-qty" type="number" min="1" :max="g.maxBuildQty" v-model.number="qty"
                 style="width:72px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit">
          <span class="sb">of {{ g.maxBuildQty }} max at this site</span>
        </div>
        <p class="hint">Bulk orders queue the same chassis and go into the build queue together.</p></div>

      <div style="margin:8px 0">
        <div v-for="(c,i) in g.dp.checks" :key="i" class="chk" :class="c.ok?'ok':'no'">
          <span class="ic">{{ c.ok?'✓':'✗' }}</span>
          <span>{{ c.label }}<div v-if="!c.ok" class="fix">{{ c.fix }}</div></span></div>
      </div>

      <button class="btn btn-wide" :class="g.canBuild?'btn-pri':''" :disabled="!g.canBuild"
              @click="g.orderBuild(qty)">
        {{ g.canBuild
             ? (qty>1
                  ? 'Order '+qty+' · '+fmt.usd(g.dp.cost*qty)
                  : 'Order parts · '+fmt.usd(g.dp.cost))
             : 'Fix the crosses above' }}</button>
    </div></div>

    <div v-if="g.s.picker" class="sheet" ref="pickerSheetEl" role="dialog" aria-modal="true"
         aria-labelledby="build-picker-title">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="g.s.picker=null">&lsaquo; Back</button>
        <span class="t" id="build-picker-title">{{ FIELDS.find(f=>f.k===g.s.picker).label }} —
          {{ FIELDS.find(f=>f.k===g.s.picker).job }}</span></div>
      <div class="sheet-bd">
        <Compare title="Cheapest first — more expensive is always better" metric="cost"
                 :rows="pickerRows" :pick="choose" />
        <p class="hint" style="padding:0 2px">Every ladder is monotonic: a more expensive part is better on
          every axis. What changes is value — dollars per MH worsen as you climb, so cheap parts
          win while cash is short and efficient parts win once watts are.</p>
      </div>
    </div>
  </div>
</template>
<style scoped>
.build-hero{display:flex;align-items:center;gap:16px;padding:14px 14px 6px}
.build-chassis{width:96px !important;height:96px !important;border-radius:12px !important;flex:none}
.build-hero-title{font-size:15px;font-weight:600;letter-spacing:-.02em}
.build-hero-sub{font-size:11.5px;color:var(--ink-3);margin-top:3px}
</style>
