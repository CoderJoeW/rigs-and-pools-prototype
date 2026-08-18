<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import StatChart from '../components/StatChart.vue';
import RankBadge from '../components/RankBadge.vue';

const g = useGameStore();

/* ---- the tab's three halves -------------------------------------------
   Stats is the summary and the series, History is the market's own record,
   and Achievements is the milestone ladder — which used to be a wall of
   twenty-odd checkboxes sitting directly under the rank card, above every
   chart on the tab. The mockup's segmented control is the seam. */
const SEGS=[
  {k:'stats', label:'Stats', icon:'M5 20V10M12 20V4M19 20v-7'},
  {k:'history', label:'History', icon:'M12 7.5V12l3.2 1.9M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 5v4h4'},
  {k:'awards', label:'Achievements',
   icon:'M12 3.2l7 3v5c0 4.3-3 8.1-7 9.6-4-1.5-7-5.3-7-9.6v-5zM9 12l2.2 2.2L15.4 10'},
];
const seg=ref('stats');
const segEl=reactive({});
const segKey=e=>{
  const d = e.key==='ArrowRight' ? 1 : e.key==='ArrowLeft' ? -1
          : e.key==='Home' ? 'first' : e.key==='End' ? 'last' : 0;
  if(!d) return;
  e.preventDefault();
  const i=SEGS.findIndex(x=>x.k===seg.value);
  const n = d==='first' ? 0 : d==='last' ? SEGS.length-1
          : (i+d+SEGS.length)%SEGS.length;
  seg.value=SEGS[n].k;
  const el=segEl[seg.value]; if(el&&el.focus) el.focus();
};

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
/* The mockup's XP bar, over the currency this game actually counts:
   milestones. Measured BETWEEN the two rank thresholds rather than from
   zero, so the bar reports progress through the rank you are in — from zero
   it would read as nearly full for most of the last rank and barely move
   across a whole tier. The top rank has nothing above it, so it is complete
   rather than dividing by a threshold that does not exist. */
const rankProg=computed(()=>{
  const from=g.RANKS[rankIdx.value][0];
  const to=nextRank.value?nextRank.value[0]:null;
  if(to===null) return { done:doneN.value, need:doneN.value, frac:1, top:true };
  const span=Math.max(1,to-from);
  return { done:Math.max(0,doneN.value-from), need:span,
           frac:Math.max(0,Math.min(1,(doneN.value-from)/span)), top:false };
});

/* ---- the three headline tiles ---------------------------------------- */
const tiles=computed(()=>[
  { k:'Lifetime net', v:fmt.usd(g.lifetimeNet), u:'less power and parts',
    tone:g.lifetimeNet>=0?'pos':'neg',
    icon:'M4 16.5 10 10l3.5 3L20 6.5M15 6.5h5v5' },
  { k:'Blocks found', v:fmt.n(g.s.blocksSolved), u:g.s.orphaned
      ? g.s.orphaned+' orphaned' : 'none orphaned',
    icon:'m12 3 8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5' },
  { k:'Best block', v:g.s.bestBlock>0?fmt.usd(g.s.bestBlock):'—',
    u:g.s.bestBlock>0?'single biggest payout':'no blocks yet',
    tone:g.s.bestBlock>0?'pos':'',
    icon:'m12 3 4.5 5.5L12 21 7.5 8.5zM7.5 8.5h9M12 3 7.5 8.5M12 3l4.5 5.5' },
]);

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
/* The whole climb as a shape (issue #51): past ranks filled, the current one
   marked, ranks not yet reached left empty — the same .track vocabulary the
   app uses for capacity, wear and reputation. */
const ladder=computed(()=>g.RANKS.map(([need,name],i)=>({ name, need, i,
  cls: i<rankIdx.value ? 'g' : i===rankIdx.value ? 'b' : '' })));
</script>

<template>
  <div>
    <div class="pagehd">
      <h1 class="pagehd-t">Stats</h1>
      <p class="pagehd-s">Your rank, your record, and the trends behind them.</p>
    </div>

    <div class="segbar" role="tablist" aria-label="Stats sections" @keydown="segKey">
      <button v-for="x in SEGS" :key="x.k" class="segtab" :class="{on:seg===x.k}"
              role="tab" :id="'stseg-'+x.k" :aria-controls="'stpan-'+x.k"
              :aria-selected="seg===x.k?'true':'false'"
              :tabindex="seg===x.k?0:-1" :ref="el=>{ if(el) segEl[x.k]=el }"
              @click="seg=x.k">
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path :d="x.icon"/></svg>
        <span>{{ x.label }}</span></button>
    </div>

    <div v-show="seg==='stats'" id="stpan-stats" role="tabpanel" aria-labelledby="stseg-stats"
         tabindex="0" class="stpanel">
      <div class="card rankcard" data-tour="stats">
        <RankBadge :rank="rankIdx" class="rc-badge" />
        <div class="rc-id">
          <div class="rc-k">Career rank</div>
          <div class="rc-name">{{ rank }}</div>
          <div class="rc-n">Rank <b>{{ rankIdx+1 }}</b> of {{ g.RANKS.length }}</div>
          <div class="rc-bar" role="img"
               :aria-label="rankProg.top ? 'Top rank reached'
                 : rankProg.done+' of '+rankProg.need+' milestones toward '+nextRank[1]">
            <i :style="{width:(rankProg.frac*100).toFixed(1)+'%'}"></i></div>
          <div class="rc-cap">
            <span v-if="rankProg.top">Top rank &mdash; {{ doneN }} of {{ g.MILESTONES.length }} milestones</span>
            <span v-else>{{ rankProg.done }} / {{ rankProg.need }} toward {{ nextRank[1] }}</span>
            <b>{{ fmt.pct(rankProg.frac,0) }}</b></div>
        </div>
      </div>

      <div class="tilegrid">
        <div v-for="t in tiles" :key="t.k" class="card stattile">
          <div class="st-k">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path :d="t.icon"/></svg>
            {{ t.k }}</div>
          <div class="st-v" :class="t.tone">{{ t.v }}</div>
          <div class="st-u">{{ t.u }}</div>
        </div>
      </div>

      <StatChart title="Efficiency" :data="g.s.effHist||[]" unit="MH/W" :digits="3"
                 avg color="var(--blue)"
                 icon="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />
      <StatChart title="Hashrate" :data="g.s.hashHist||[]" avg color="var(--blue)"
                 icon="M2.5 12h3l2.5-7 4 14 2.5-7h5" />
      <StatChart title="Net to date" :data="g.s.netCumHist||[]" money
                 color="var(--green)" note="Cumulative"
                 icon="M4 16.5 10 10l3.5 3L20 6.5M15 6.5h5v5" />
    </div>

    <div v-show="seg==='history'" id="stpan-history" role="tabpanel"
         aria-labelledby="stseg-history" tabindex="0" class="stpanel">
      <!-- No average on the two that sample a counter which resets at
           midnight: the mean of partial-day snapshots is about half a day's
           real figure. The note says what a point is instead. -->
      <StatChart title="Net per day" :data="g.s.netHist" money color="var(--green)"
                 note="So far that day"
                 icon="M4 16.5 10 10l3.5 3L20 6.5M15 6.5h5v5" />
      <StatChart title="Cash" :data="g.s.cashHist||[]" money avg color="var(--gold)"
                 icon="M12 3.5v17M8 7.5h6a2.5 2.5 0 0 1 0 5H10a2.5 2.5 0 0 0 0 5h6" />
      <StatChart title="Power spend" :data="g.s.powerHist||[]" money color="var(--amber)"
                 note="So far that day"
                 icon="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />

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

    <div v-show="seg==='awards'" id="stpan-awards" role="tabpanel" aria-labelledby="stseg-awards"
         tabindex="0" class="stpanel">
      <div class="sec"><span class="eyebrow">The ladder</span>
        <span class="eyebrow">{{ doneN }} / {{ g.MILESTONES.length }} milestones</span></div>
      <div class="card"><div class="card-bd pt">
        <div class="track" role="img" style="height:8px;gap:3px"
             :aria-label="'Rank ladder: '+rank+', '+(rankIdx+1)+' of '+g.RANKS.length">
          <i v-for="r in ladder" :key="r.name" :class="r.cls" :title="r.name"
             :style="{width:'calc('+(100/g.RANKS.length)+'% - 3px)'}"></i>
        </div>
        <div class="rungs">
          <span v-for="r in ladder" :key="'n'+r.name" class="rung"
                :class="{on:r.i===rankIdx, past:r.i<rankIdx}">{{ r.name }}</span>
        </div>
      </div></div>

      <div class="card"><div class="card-bd pt">
        <div v-for="t in tracks" :key="t.name" style="margin-bottom:10px">
          <div class="track-cap"><span style="font-weight:600;color:var(--ink)">{{ t.name }}</span>
            <b>{{ t.n }}/{{ t.items.length }}</b></div>
          <div v-for="m in t.items" :key="m.id" class="chk" :class="m.done?'ok':''"
               style="opacity:1">
            <span class="ic">{{ m.done?'✓':'○' }}</span>
            <span :style="m.done?'':'color:var(--ink-3)'">{{ m.name }}
              <span class="sb"> — {{ m.done ? 'day '+m.day : m.desc }}</span></span></div>
        </div>
      </div></div>
    </div>
  </div>
</template>

<style scoped>
/* The Stats tab's own chrome. The card, the .track, the .chk list and the
   segmented control come from main.css; what lives here is the rank card,
   the three tiles and the ladder's rung labels. */

/* ---- the rank card ---------------------------------------------------- */
.rankcard{display:flex;align-items:center;gap:14px;padding:14px 14px 15px;margin-bottom:8px}
.rc-badge{flex:none}
.rc-id{flex:1;min-width:0}
.rc-k{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ink-3)}
.rc-name{font-size:24px;font-weight:600;letter-spacing:-.035em;line-height:1.1;margin-top:3px;
  overflow-wrap:anywhere}
.rc-n{font-size:11.5px;color:var(--ink-3);margin-top:3px}
.rc-n b{font-family:var(--mono);font-weight:600;color:var(--amber)}
.rc-bar{height:6px;border-radius:3px;background:var(--line-2);overflow:hidden;margin-top:9px}
.rc-bar i{display:block;height:100%;background:var(--amber);
  transition:width .5s cubic-bezier(.2,.8,.2,1)}
.rc-cap{display:flex;align-items:baseline;gap:8px;margin-top:5px;font-size:10px;
  color:var(--ink-3)}
.rc-cap span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-cap b{flex:none;font-family:var(--mono);font-weight:500}

/* ---- the three tiles -------------------------------------------------- */
.tilegrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}
.stattile{padding:9px 10px 10px;min-width:0}
.st-k{display:flex;align-items:center;gap:4px;font-size:8.5px;font-weight:700;
  letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-k .ic{flex:none;width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:1.9;
  stroke-linecap:round;stroke-linejoin:round}
.st-v{font-family:var(--mono);font-size:16px;font-weight:500;letter-spacing:-.03em;
  line-height:1.15;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-v.pos{color:var(--green)} .st-v.neg{color:var(--red)}
.st-u{font-size:9px;color:var(--ink-3);margin-top:2px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---- the ladder's rungs ----------------------------------------------- */
.rungs{display:flex;gap:3px;margin-top:5px}
.rung{flex:1;min-width:0;font-size:8.5px;letter-spacing:.02em;color:var(--ink-3);
  text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rung.past{color:var(--green)}
.rung.on{color:var(--blue);font-weight:700}

.stpanel:focus{outline:none}

@media (max-width:359px){
  .rc-name{font-size:20px}
  .tilegrid{grid-template-columns:1fr 1fr}
  .tilegrid .stattile:last-child{grid-column:1 / -1}
  .rungs{display:none}
}
</style>
