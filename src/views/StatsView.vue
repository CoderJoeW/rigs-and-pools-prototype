<script setup>
import { computed } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import StatChart from '../components/StatChart.vue';

const g = useGameStore();
const doneN=computed(()=>Object.keys((g.s.mile&&g.s.mile.done)||{}).length);
const rank=computed(()=>g.RANKS[(g.s.mile&&g.s.mile.rank)||0][1]);
const nextRank=computed(()=>{
  const i=((g.s.mile&&g.s.mile.rank)||0)+1;
  return i<g.RANKS.length ? g.RANKS[i] : null;
});
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
    <div class="card">
      <div class="hero">
        <span class="hero-lbl">Career</span>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:2px">
          <span class="hero-val" style="font-size:26px">{{ rank }}</span>
          <span class="sb">{{ doneN }} / {{ g.MILESTONES.length }} milestones</span></div>
        <p v-if="nextRank" class="hint" style="margin:4px 0 0">
          {{ nextRank[1] }} at {{ nextRank[0] }} milestones.</p>
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
        {{ g.C.GEN_DAYS }} days — generation {{ g.s.gen||0 }} is current.</p>
    </div></div>
  </div>
</template>
