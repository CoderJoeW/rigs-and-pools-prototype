<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';

// Single-series time chart architecture (axis-per-measure, no legend, no
// summing, scrub interaction): docs/implementation-notes.md#single-series-stat-chart-srccomponentsstatchartvue.
const p = defineProps({
  title: { type: String, default: '' },
  data: { type: Array as () => number[], default: () => [] },
  color: { type: String, default: 'var(--green)' },
  money: Boolean,
  unit: { type: String, default: '' },
  avg: Boolean,
  icon: String,
  note: String,
  digits: { type: Number, default: 2 },
});

const H = 40;                          // the viewBox's own height
const series = computed(() => p.data || []);
const ready = computed(() => series.value.length >= 2);
const path = computed(() => sparkPath(series.value, H - 2, H - 8));
/* The area under the line is drawn from the same path, closed to the
   baseline — a fill, not a second series, so it adds no ink that could be
   mistaken for data. */
const area = computed(() => ready.value ? path.value + ' L100 ' + H + ' L0 ' + H + ' Z' : '');

const lo = computed(() => ready.value ? Math.min(...series.value) : 0);
const hi = computed(() => ready.value ? Math.max(...series.value) : 0);
const last = computed(() => series.value.length ? series.value[series.value.length - 1]! : 0);
const mean = computed(() => ready.value
  ? series.value.reduce((a, v) => a + v, 0) / series.value.length : 0);

const show = (v: number) => p.money ? fmt.usd2(v) : (p.unit ? v.toFixed(p.digits) + ' ' + p.unit : fmt.hash(v));

/* Samples land every 0.75 sim-days. The axis counts BACK from now rather
   than forward from a day zero: these are 110-entry ring buffers, so once a
   run passes ~82 days the leftmost sample is not day 0 and never will be
   again — labelling it "0D" would disagree with every other date on the tab.
   How long ago a sample was taken is true whatever the buffer has dropped. */
const DAYS_PER_SAMPLE = 0.75;
const spanDays = computed(() => Math.round((series.value.length - 1) * DAYS_PER_SAMPLE));
const ticks = computed(() => {
  const d = spanDays.value;
  if (d < 4) return [];
  return [0, 0.25, 0.5, 0.75, 1].map(f => ({ f,
    label: f === 1 ? 'now' : Math.round(d * (1 - f)) + 'D' }));
});

const at = ref<number | null>(null);                  // the scrubbed index, or null for "live"
const marked = computed(() => at.value === null ? series.value.length - 1 : at.value);
const value = computed(() => series.value.length ? series.value[marked.value]! : 0);
const markX = computed(() => series.value.length < 2 ? 100
  : marked.value / (series.value.length - 1) * 100);
const markY = computed(() => {
  const l = lo.value, r = (hi.value - l) || 1;
  return (H - 2) - ((value.value - l) / r) * (H - 8);
});
const markAgo = computed(() =>
  Math.round((series.value.length - 1 - marked.value) * DAYS_PER_SAMPLE));

const plot = ref<HTMLElement | null>(null);
const scrub = (e: PointerEvent) => {
  const el = plot.value;
  if (!el || series.value.length < 2) return;
  const b = el.getBoundingClientRect();
  if (b.width <= 0) return;
  const f = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width));
  at.value = Math.round(f * (series.value.length - 1));
};
const onDown = (e: PointerEvent) => {
  if (e.pointerType === 'mouse' && e.button) return;
  const el = e.currentTarget as (Element & { setPointerCapture?: (id: number) => void }) | null;
  if (el && el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  scrub(e);
};
const onMove = (e: PointerEvent) => { if (at.value !== null) scrub(e); };
const release = () => { at.value = null; };

/* What a screen reader gets instead of the picture: the shape stated in
   words. The scrub gives a sighted reader the same figures point by point. */
const summary = computed(() => !ready.value
  ? p.title + ': not enough history yet'
  : p.title + ': ' + show(series.value[0]!) + ' to ' + show(last.value)
    + ' over the last ' + spanDays.value + ' days, low ' + show(lo.value)
    + ', high ' + show(hi.value));
</script>

<template>
  <div class="card statchart">
    <div class="sc-hd">
      <span v-if="icon" class="sc-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path :d="icon"/></svg></span>
      <span class="sc-t">{{ title }}</span>
      <span v-if="note" class="sc-note">{{ note }}</span>
      <span v-else-if="avg&&ready" class="sc-note">Average <b>{{ show(mean) }}</b></span>
    </div>

    <div class="sc-plot" ref="plot"
         @pointerdown="onDown" @pointermove="onMove"
         @pointerup="release" @pointercancel="release" @pointerleave="release">
      <svg class="sc-svg" viewBox="0 0 100 40" preserveAspectRatio="none"
           role="img" :aria-label="summary">
        <defs>
          <linearGradient :id="'scg-'+title.replace(/\W/g,'')" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" :stop-color="color" stop-opacity=".28"/>
            <stop offset="1" :stop-color="color" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path v-if="ready" :d="area" :fill="'url(#scg-'+title.replace(/\W/g,'')+')'" stroke="none"/>
        <path v-if="ready" :d="path" fill="none" :style="{stroke:color}" stroke-width="1.6"
              stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        <line v-if="ready&&at!==null" class="sc-cross" :x1="markX" :x2="markX" y1="0" y2="40"
              vector-effect="non-scaling-stroke"/>
      </svg>
      <span v-if="ready" class="sc-dot" :class="{live:at===null}"
            :style="{left:markX+'%', top:(markY/40*100)+'%', '--c':color}" aria-hidden="true"></span>
      <span v-if="ready" class="sc-chip" :style="{'--c':color}">
        {{ show(value) }}<span v-if="at!==null" class="sc-day">{{ markAgo ? markAgo+'D ago' : 'now' }}</span></span>
      <p v-if="!ready" class="sc-empty">Not enough history yet</p>
    </div>

    <div v-if="ticks.length" class="sc-axis" aria-hidden="true">
      <span v-for="t in ticks" :key="t.f">{{ t.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.statchart{padding:10px 12px 8px;margin-bottom:8px}
.sc-hd{display:flex;align-items:center;gap:7px}
.sc-ic{flex:none;display:flex;color:var(--ink-3)}
.sc-ic svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round}
.sc-t{flex:1;min-width:0;font-size:9.5px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.sc-note{flex:none;font-size:9.5px;color:var(--ink-3);letter-spacing:.03em}
.sc-note b{font-family:var(--mono);font-weight:500;color:var(--ink-2)}

.sc-plot{position:relative;margin-top:8px;height:86px;touch-action:pan-y}
.sc-svg{display:block;width:100%;height:100%}
.sc-cross{stroke:var(--ink-3);stroke-width:1;stroke-dasharray:2 2;opacity:.7}
.sc-dot{position:absolute;width:7px;height:7px;border-radius:50%;background:var(--c);
  transform:translate(-50%,-50%);box-shadow:0 0 0 2px var(--card);pointer-events:none}
/* The live end pulses; a scrubbed point is a still marker, so the two are
   never confused for each other. */
.sc-dot.live{animation:scPulse 2.6s ease-out infinite}
@keyframes scPulse{
  0%{box-shadow:0 0 0 2px var(--card),0 0 0 0 color-mix(in srgb,var(--c) 55%,transparent)}
  70%{box-shadow:0 0 0 2px var(--card),0 0 0 7px color-mix(in srgb,var(--c) 0%,transparent)}
  100%{box-shadow:0 0 0 2px var(--card),0 0 0 0 color-mix(in srgb,var(--c) 0%,transparent)}}
@media (prefers-reduced-motion:reduce){.sc-dot.live{animation:none}}
/* The one direct label: the live value, or whatever the finger is on. */
.sc-chip{position:absolute;right:0;top:50%;transform:translateY(-50%);
  display:flex;align-items:baseline;gap:5px;
  padding:3px 7px;border-radius:6px;font-family:var(--mono);font-size:11px;font-weight:500;
  color:var(--c);background:var(--card);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
.sc-day{font-size:9px;color:var(--ink-3)}
.sc-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:11.5px;color:var(--ink-3)}

.sc-axis{display:flex;justify-content:space-between;margin-top:5px;
  font-family:var(--mono);font-size:9px;color:var(--ink-3)}
</style>
