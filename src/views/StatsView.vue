<script setup>
import { computed } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import StatChart from '../components/StatChart.vue';

const g = useGameStore();
const doneN=computed(()=>Object.keys((g.s.mile&&g.s.mile.done)||{}).length);
// Clamped with Number.isFinite, not ||0 (issue #14): this indexes g.RANKS,
// and ||0 only catches falsy corruption (NaN, undefined) — a malformed
// non-numeric value (e.g. a stringified rank from a bad save) is truthy
// and would sail through ||0 straight into an array index.
const rankIdx=computed(()=>Number.isFinite(g.s.mile&&g.s.mile.rank) ? g.s.mile.rank : 0);
const rank=computed(()=>g.RANKS[rankIdx.value][1]);
const nextRank=computed(()=>{
  const i=rankIdx.value+1;
  return i<g.RANKS.length ? g.RANKS[i] : null;
});
// A visual shape for "here's the whole climb, here's where I am on it"
// (issue #51) — the rank-up moment already gets a toast, a sound and a
// screen flourish, but the Stats tab itself only ever showed the current
// rank as a word. Reuses the same .track/i.g/i.b progress-bar vocabulary
// the app already uses for capacity/wear/reputation bars: past ranks
// filled green, the current rank marked blue ("you are here"), ranks not
// yet reached left empty.
const ladder=computed(()=>g.RANKS.map(([need,name],i)=>({ name, need,
  cls: i<rankIdx.value ? 'g' : i===rankIdx.value ? 'b' : '' })));
const tracks=computed(()=>{
  const by={};
  for(const m of g.MILESTONES){
    (by[m.track]=by[m.track]||[]).push({ ...m,
      done:!!(g.s.mile&&g.s.mile.done[m.id]),
      day:g.s.mile&&g.s.mile.done[m.id]?Math.floor(g.s.mile.done[m.id]/86400)+1:0 });
  }
  return Object.entries(by).map(([name,items])=>({name,items,
    n:items.filter(x=>x.done).length}));
});
</script>

<template>
  <div>
    <div class="card" data-tour="stats">
      <div class="hero stats-hero">
        <span class="hero-lbl">Career rank</span>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:2px">
          <span class="hero-val" style="font-size:28px;letter-spacing:-.03em">{{ rank }}</span>
          <span class="sb">{{ doneN }} / {{ g.MILESTONES.length }} milestones</span></div>
        <p v-if="nextRank" class="hint" style="margin:4px 0 0">
          {{ nextRank[1] }} at {{ nextRank[0] }} milestones.</p>
        <div class="track" role="img" style="height:8px;gap:3px;margin-top:10px"
             :aria-label="'Rank ladder: '+rank+', '+(rankIdx+1)+' of '+g.RANKS.length">
          <i v-for="r in ladder" :key="r.name" :class="r.cls" :title="r.name"
             :style="{width:'calc('+(100/g.RANKS.length)+'% - 3px)'}"></i>
        </div>
      </div>
      <div class="card-bd pt">
        <div v-for="t in tracks" :key="t.name" style="margin-bottom:10px">
          <div class="track-cap"><span style="font-weight:600;color:var(--ink)">{{ t.name }}</span>
            <b>{{ t.n }}/{{ t.items.length }}</b></div>
          <div v-for="m in t.items" :key="m.id" class="chk" :class="m.done?'ok':''"
               style="opacity:1">
            <span class="ic">{{ m.done?'✓':'○' }}</span>
            <span :style="m.done?'':'color:var(--ink-3)'">{{ m.name }}
              <span class="sb"> — {{ m.done ? 'day '+m.day : m.desc }}</span></span></div>
        </div>
      </div>
    </div>

    <StatChart title="Net per day" :data="g.s.netHist" money color="var(--green)" />
    <StatChart title="Hashrate" :data="g.s.hashHist||[]" color="var(--blue)" />
    <StatChart title="Cash" :data="g.s.cashHist||[]" money color="var(--gold)" />
    <div class="sec"><span class="eyebrow">Coin prices</span>
      <span class="eyebrow">last ~80 days</span></div>
    <div class="card"><div class="card-bd pt">
      <div v-for="c in g.s.chains" :key="c.id" style="margin-bottom:10px">
        <div class="track-cap"><span>{{ c.tick }}</span><b>{{ fmt.usd2(g.price(c)) }}</b></div>
        <svg viewBox="0 0 100 22" preserveAspectRatio="none"
             style="width:100%;height:34px;display:block" aria-hidden="true">
          <path :d="sparkPath(c.hist, 20, 18)"
            fill="none" style="stroke:var(--green)" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>
      </div>
      <p class="hint">One point per ~18 game hours. Card generations land every
        {{ g.C.GEN_DAYS }} days — generation {{ fmt.n(g.s.gen) }} is current.</p>
    </div></div>
  </div>
</template>

<style scoped>
.stats-hero{padding:14px 14px 12px}
.track-cap span{letter-spacing:.02em}
</style>
