<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import Feed from '../components/Feed.vue';
import ChainMark from '../components/ChainMark.vue';
import RackShot from '../components/RackShot.vue';
import { CHAIN_HUE } from '../data/chains.js';
import { useTweenedNumber } from '../composables/useTweenedNumber.js';

const g = useGameStore();
const netDayShown = useTweenedNumber(() => g.netDay);
const live=computed(()=>g.s.rigs.filter(r=>g.rigLive(r)).length);
const netPath=computed(()=> sparkPath(g.s.netHist, 31, 28, 0));
const trend=computed(()=>{ const h=g.s.netHist; if(h.length<6) return '';
  const a=h[h.length-6], b=h[h.length-1];
  return b>a*1.03?'improving':b<a*0.97?'slipping':'holding'; });
const policyOpen=ref(false);
const hottest=computed(()=>g.s.sites.reduce((a,f)=>Math.max(a,g.siteTemp(f)),0));
const totalDemand=computed(()=>g.s.sites.reduce((a,f)=>a+g.siteDemand(f),0));

/* The overview cards' "vs yesterday" chips. Both helpers return null whenever
   there is nothing honest to compare against — no adjacent closed day (a fresh
   save, or one resumed across a multi-day gap), or too little of today elapsed
   to project — and the chip simply doesn't render. An invented 0.0% would read
   as "flat" rather than as "no comparison yet".

   Hashrate is a reading and compares directly. Profit and cost are counters
   still filling up, so they go through dayPaceDelta, which projects today to a
   full day before comparing it with yesterday's finished one. And profit
   compares 'net', matching the figure printed above it — comparing gross
   revenue under a net headline would call a day green while profit fell. */
const hashDelta=computed(()=>g.dayDelta('hash', g.totalHash));
const netDelta=computed(()=>g.dayPaceDelta('net', g.netDay));
const costDelta=computed(()=>g.dayPaceDelta('power', g.powerDay));
const deltaText=d=>(d>=0?'▲ ':'▼ ')+fmt.pct(Math.abs(d),2);

/* Dominant chassis state for a site row hero — prefer attention states, then
   running, then build, else off. Same vocabulary the Rigs list and Sites floor
   already use. */
const siteChassisState=f=>{
  const rigs=g.siteRigs(f);
  if(!rigs.length) return 'off';
  let hasBad=false, hasWarn=false, hasBuild=false, hasRun=false;
  for(const r of rigs){
    const d=g.rigState(r).dot;
    if(d==='bad') hasBad=true;
    else if(d==='warn') hasWarn=true;
    else if(d==='build') hasBuild=true;
    else if(d==='run') hasRun=true;
  }
  if(hasBad) return 'bad';
  if(hasWarn) return 'warn';
  if(hasBuild) return 'build';
  if(hasRun) return 'run';
  return 'off';
};

const siteRows=computed(()=>g.s.sites.map(f=>{
  const rigs=g.siteRigs(f);
  const slots=g.siteSlots(f);
  const temp=g.siteTemp(f);
  const ambient=temp>=70?'hot':temp>=58?'warm':'cool';
  const demand=g.siteDemand(f);
  const capacity=g.siteCapacity(f)+g.battFirm(f);
  const util=capacity>0?Math.min(1,demand/capacity):0;
  const hash=rigs.reduce((a,r)=>a+g.rigHash(r),0);
  const online=rigs.some(r=>g.rigLive(r));
  const status=ambient==='hot'?'HOT':online?'ONLINE':'IDLE';
  const statusTone=ambient==='hot'?'hot':online?'online':'idle';
  let chainHue;
  for(const r of rigs){
    const gr=g.groupOf(r);
    if(gr&&gr.chain!=null){ chainHue=CHAIN_HUE[gr.chain]; break; }
  }
  return {
    f, ambient, temp, hash, demand, capacity, util, status, statusTone,
    costDay:g.siteCostPerHour(f)*24,
    chassisState:siteChassisState(f),
    chainHue,
    rigCount:rigs.length,
    slots,
  };
}));

const groupRows=computed(()=>g.s.groups.map(gr=>({
  gr, advice:g.groupAdvice(gr), ceiling:g.chainCeiling(g.chain(gr.chain))
})));
const groupRenameOpen=reactive({});
const groupRenameDraft=reactive({});
const startRenameGroup=gr=>{ groupRenameDraft[gr.id]=gr.name; groupRenameOpen[gr.id]=true; };
const saveRenameGroup=gr=>{ g.renameGroup(gr,groupRenameDraft[gr.id]); groupRenameOpen[gr.id]=false; };
const poolLabel=gr=>{ const p=g.poolOf(gr.pool); return p?p.name:'Solo'; };

const blocksToday=computed(()=>{
  const n=g.s.today&&g.s.today.blocks;
  return Number.isFinite(n)?fmt.n(n):'—';
});
const bestBlock=computed(()=>Number.isFinite(g.s.bestBlock)?fmt.usd2(g.s.bestBlock):'—');
const uptime=computed(()=>g.s.rigs.length?live.value/g.s.rigs.length:0);
const margin=computed(()=>g.revenueDay>0?g.netDay/g.revenueDay:0);
const payoutDay=computed(()=>g.expectedDay-g.powerRateDay);
/* "Payout progress" is the current block window on the chain the biggest group
   points at — the farm's main earner, and the one whose next block matters. */
const mainGroup=computed(()=>g.s.groups.reduce(
  (a,gr)=>!a||g.groupHash(gr)>g.groupHash(a)?gr:a, null));
const payoutProg=computed(()=>{
  const gr=mainGroup.value, c=gr&&g.chain(gr.chain);
  return c?g.blockProg(c):0;
});
const autoRules=computed(()=>(g.s.autoOff?1:0)+(g.s.autoFix?1:0));
/* A group's capacity is read against the whole farm's positions, not one
   site's: a group spans sites, so "how much of what I own is pointed here"
   is the question the number answers. */
const totalSlots=computed(()=>g.s.sites.reduce((a,f)=>a+g.siteSlots(f),0));
</script>

<template>
  <div class="farm">
    <div v-if="!g.s.rigs.length" class="card" data-tour="farm"><div class="empty">
      <h3>Nothing installed</h3>
      <p>A spare bedroom, a 1.5 kW wall outlet and $500. No hardware, no coins, and no
        electricity bill until something is running.</p>
      <button class="btn btn-pri" @click="g.s.tab='build'">Go shopping</button></div></div>

    <template v-else>
      <!-- Overview — four icon-led stat cards -->
      <div class="sect"><span class="sect-k">Overview</span></div>
      <div class="ovgrid" data-tour="farm">
        <div class="ovcard">
          <div class="ov-hd"><span class="ov-ico blu" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M12 2.6 20.5 7v10L12 21.4 3.5 17V7z"/><path d="M3.5 7 12 11.6 20.5 7"/>
            <path d="M12 11.6v9.8"/></svg></span>
            <span class="ov-k">Net hashrate</span></div>
          <div class="ov-row">
            <span class="ov-v">{{ fmt.hash(g.totalHash) }}</span>
            <svg v-if="g.s.hashHist&&g.s.hashHist.length>2" class="ov-spark" viewBox="0 0 100 24"
                 preserveAspectRatio="none" aria-hidden="true">
              <path :d="sparkPath(g.s.hashHist, 22, 20)" fill="none"
                    style="stroke:var(--blue)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
            </svg>
          </div>
          <div v-if="hashDelta!==null" class="ov-ft">
            <span class="delta" :class="hashDelta>=0?'up':'down'">{{ deltaText(hashDelta) }}</span>
            vs yesterday</div>
        </div>

        <div class="ovcard">
          <div class="ov-hd"><span class="ov-ico blu" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/></svg></span>
            <span class="ov-k">Power draw</span></div>
          <div class="ov-row"><span class="ov-v">{{ fmt.w(totalDemand) }}</span></div>
          <div class="ov-bar" role="img"
               :aria-label="'Power draw '+fmt.pct(g.headroom,0)+' of capacity'">
            <i :style="{width:Math.min(100,g.headroom*100).toFixed(0)+'%'}"
               :class="g.headroom>0.9?'o':g.headroom>0.75?'w':'b'"></i></div>
          <div class="ov-ft">{{ fmt.pct(g.headroom,0) }} capacity</div>
        </div>

        <div class="ovcard">
          <div class="ov-hd"><span class="ov-ico grn" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M12 2.5v19"/><path d="M16.5 7.2A3.7 3.7 0 0 0 12.8 5h-1.4a3.2 3.2 0
              0 0 0 6.4h1.2a3.3 3.3 0 0 1 0 6.6h-1.5a3.8 3.8 0 0 1-3.7-2.3"/></svg></span>
            <span class="ov-k">Profit / loss today</span></div>
          <div class="ov-row">
            <span class="ov-v" :class="g.netDay>=0?'pos':'neg'">{{ fmt.usd2(netDayShown) }}</span>
            <svg v-if="g.s.netHist.length>2" class="ov-spark" viewBox="0 0 100 24"
                 preserveAspectRatio="none" aria-hidden="true">
              <path :d="sparkPath(g.s.netHist, 22, 20, 0)" fill="none"
                    :style="{stroke:g.netDay>=0?'var(--green)':'var(--red)'}"
                    stroke-width="1.6" vector-effect="non-scaling-stroke"/>
            </svg>
          </div>
          <div v-if="netDelta!==null" class="ov-ft">
            <span class="delta" :class="netDelta>=0?'up':'down'">{{ deltaText(netDelta) }}</span>
            vs yesterday</div>
        </div>

        <div class="ovcard">
          <div class="ov-hd"><span class="ov-ico red" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M12 2.5v19"/><path d="M16.5 7.2A3.7 3.7 0 0 0 12.8 5h-1.4a3.2 3.2 0
              0 0 0 6.4h1.2a3.3 3.3 0 0 1 0 6.6h-1.5a3.8 3.8 0 0 1-3.7-2.3"/></svg></span>
            <span class="ov-k">Cost today</span></div>
          <div class="ov-row">
            <span class="ov-v neg">{{ fmt.usd2(g.powerDay) }}</span>
            <svg v-if="g.s.powerHist&&g.s.powerHist.length>2" class="ov-spark" viewBox="0 0 100 24"
                 preserveAspectRatio="none" aria-hidden="true">
              <path :d="sparkPath(g.s.powerHist, 22, 20, 0)" fill="none" style="stroke:var(--red)"
                    stroke-width="1.6" vector-effect="non-scaling-stroke"/>
            </svg>
          </div>
          <!-- Always the cost card's own red, whichever way the day moved: the
               arrow carries the direction, the colour says which card it is. -->
          <div v-if="costDelta!==null" class="ov-ft">
            <span class="delta down">{{ deltaText(costDelta) }}</span> vs yesterday</div>
        </div>
      </div>

      <!-- Mining sites — status, three metrics, utilization, hardware shot -->
      <div class="sect"><span class="sect-k">Mining sites</span>
        <span class="sect-m">{{ g.s.sites.length }} site{{ g.s.sites.length===1?'':'s' }}</span></div>
      <div class="card">
        <div class="list">
          <button v-for="row in siteRows" :key="'s'+row.f.id" class="siterow"
                  @click="g.s.activeSite=row.f.id; g.s.tab='sites'">
            <span class="sr-main">
              <span class="sr-hd">
                <span class="sr-pill" :class="row.statusTone">
                  <i class="sr-dot"></i>{{ row.status }}</span>
                <span class="sr-name">{{ row.f.name }}</span>
              </span>
              <span class="sr-sub">{{ row.rigCount }}/{{ row.slots }} positions
                &middot; {{ fmt.w(row.demand) }}</span>
              <span class="sr-metrics">
                <span class="m"><span class="mk">Hash rate</span>
                  <span class="mv">{{ fmt.hash(row.hash) }}</span></span>
                <span class="m"><span class="mk">Power</span>
                  <span class="mv">{{ fmt.w(row.demand) }}</span></span>
                <span class="m"><span class="mk"><svg class="mk-ico" viewBox="0 0 24 24"
                    aria-hidden="true"><path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/>
                    </svg>Temp</span>
                  <span class="mv" :class="row.ambient==='hot'?'neg':row.ambient==='warm'?'amb':''">
                    {{ row.temp.toFixed(0) }}&deg;C</span></span>
              </span>
              <span class="sr-util">
                <span class="uk">Utilization</span>
                <b class="uv" :class="row.util>0.9?'neg':row.util>0.7?'amb':'blu'">
                  {{ (row.util*100).toFixed(0) }}%</b>
                <span class="ubar" role="img"
                      :aria-label="'Utilization '+(row.util*100).toFixed(0)+'%'">
                  <i :style="{width:(row.util*100).toFixed(0)+'%'}"
                     :class="row.util>0.9?'o':row.util>0.7?'w':'b'"></i></span>
              </span>
            </span>
            <RackShot :state="row.chassisState" :label="row.f.name+' — '+row.status" />
          </button>
        </div>
      </div>

      <!-- Mining groups — chain and pool as pickers, hashrate and size beside them -->
      <div class="sect"><span class="sect-k">Mining groups</span>
        <button class="sect-a" @click="g.addGroup()">+ New group</button></div>
      <div class="card">
          <div v-for="{gr, advice, ceiling} in groupRows" :key="gr.id" class="grp">
            <template v-if="groupRenameOpen[gr.id]">
              <label class="sr-only" :for="'group-rename-'+gr.id">Group name</label>
              <input :id="'group-rename-'+gr.id" v-model="groupRenameDraft[gr.id]" maxlength="24"
                     placeholder="Group name" class="group-rename-input"
                     @keyup.enter="saveRenameGroup(gr)">
              <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0">
                <button class="btn btn-ghost btn-sm" @click="groupRenameOpen[gr.id]=false">Cancel</button>
                <button class="btn btn-pri btn-sm" @click="saveRenameGroup(gr)">Save name</button>
              </div>
            </template>
            <template v-else>
              <div class="grp-hd">
                <b class="grp-nm"><ChainMark :chain="gr.chain" />{{ gr.name }}</b>
                <button class="grp-rn"
                        :aria-label="'Rename '+gr.name" @click="startRenameGroup(gr)">Rename</button>
              </div>
              <div class="grp-strip">
                <!-- The real <select> stays in the DOM, stretched invisibly over
                     the pill: the picker keeps its native sheet, its keyboard
                     behaviour and its label, and the pill is only the skin. -->
                <label class="gsel">
                  <span class="gsel-ico" aria-hidden="true"><svg viewBox="0 0 24 24">
                    <path d="M10 13.8a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7"/>
                    <path d="M14 10.2a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7"/>
                    </svg></span>
                  <span class="gsel-txt"><span class="gsel-k">Chain</span>
                    <span class="gsel-v">{{ g.chain(gr.chain).name }}</span></span>
                  <span class="gsel-cv" aria-hidden="true"><svg viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6"/></svg></span>
                  <select class="gsel-native" :value="gr.chain" :aria-label="'Chain for '+gr.name"
                          @change="g.setGroupChain(gr,$event.target.value)">
                    <option v-for="c in g.s.chains" :key="c.id" :value="c.id">
                      {{ c.name }} — {{ c.target<60?c.target+'s':(c.target/60)+' min' }} blocks</option>
                  </select>
                </label>
                <label class="gsel">
                  <span class="gsel-ico" aria-hidden="true"><svg viewBox="0 0 24 24">
                    <path d="M4 17c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2"/>
                    <path d="M4 21c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2"/>
                    <path d="M12 3 8 9h8z"/></svg></span>
                  <span class="gsel-txt"><span class="gsel-k">Pool</span>
                    <span class="gsel-v">{{ poolLabel(gr) }}</span></span>
                  <span class="gsel-cv" aria-hidden="true"><svg viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6"/></svg></span>
                  <select class="gsel-native" :value="gr.pool" :aria-label="'Pool for '+gr.name"
                          @change="g.setGroupPool(gr,$event.target.value)">
                    <option value="solo">Solo — whole reward</option>
                    <optgroup label="Rival pools">
                      <option v-for="p in g.s.pools.filter(x=>x.live&&x.chain===gr.chain&&x.owner!=='you')"
                              :key="p.id" :value="p.id">{{ p.name }} — {{ p.scheme }}
                        {{ fmt.pct(p.fee) }}</option></optgroup>
                    <optgroup v-if="g.s.pools.some(x=>x.live&&x.chain===gr.chain&&x.owner==='you')"
                              label="Your pools">
                      <option v-for="p in g.s.pools.filter(x=>x.live&&x.chain===gr.chain&&x.owner==='you')"
                              :key="p.id" :value="p.id">{{ p.name }} — {{ p.scheme }}
                        {{ fmt.pct(p.fee) }}</option></optgroup>
                  </select>
                </label>
                <div class="gstat"><span class="gk">Hashrate</span>
                  <span class="gv">{{ fmt.hash(g.groupHash(gr)) }}</span>
                  <span v-if="advice" class="tag r gtag">OUTGROWN</span>
                  <span v-else-if="ceiling" class="tag d gtag">AT CEILING</span></div>
                <div class="gstat"><span class="gk">Capacity</span>
                  <span class="gv">{{ g.groupRigs(gr).length }} / {{ totalSlots }} racks</span></div>
              </div>
            </template>
            <p v-if="advice" class="hint" style="margin:8px 0 0;color:var(--amber)">
              You are {{ fmt.pct(advice.share,0) }} of {{ g.chain(gr.chain).name }} —
              above the floor a chain pays its emission, not your hashrate.
              {{ advice.alt }} would pay about
              {{ advice.mult.toFixed(1) }}&times; per MH, even after your hash raises
              its difficulty.</p>
            <p v-else-if="ceiling" class="hint"
               style="margin:8px 0 0;color:var(--amber)">
              You are {{ fmt.pct(ceiling.share,0) }} of
              {{ g.chain(gr.chain).name }} — above the floor a chain pays its emission, not your
              hashrate. It hands out about
              {{ fmt.usd(ceiling.grossCap) }}/day however much you point
              at it, so more rigs here divide the same pot. No other chain currently pays enough
              more to be worth the move, so growth has to come from a second group on another
              chain, or from a pool.</p>
            <div class="track-cap grp-foot">
              <span>{{ g.groupHash(gr)>0
                ? 'Next '+g.chain(gr.chain).name+' block: '
                  +fmt.pct(Math.min(1,g.groupHash(gr)/Math.max(1,g.chainHash(g.chain(gr.chain)))),0)+' yours'
                : 'No live rigs pointed here' }}</span>
              <b v-if="gr.pending>0" class="amb">{{ fmt.c(gr.pending) }}
                {{ g.chain(gr.chain).tick }} in the window</b>
              <button v-else-if="g.s.groups.length>1&&!g.groupRigs(gr).length"
                      class="btn btn-sm btn-ghost" @click="g.dropGroup(gr)">Disband</button>
            </div>
          </div>
          <p v-if="g.s.help" class="hint grp-help">A group's rigs mine as <b>one participant</b> — one
            ticket in the draw, one PPLNS window. Rebuilds, brownouts and power cycles never
            forfeit; only the group switching chain or pool does.</p>
      </div>

      <!-- Net today — the day's headline over a twelve-cell ledger -->
      <div class="sect"><span class="sect-k">Net today</span></div>
      <div class="card">
        <div class="nethero">
          <div class="nh-l">
            <div class="nh-k">Net today</div>
            <div class="nh-v" :class="g.netDay>=0?'pos':'neg'">{{ fmt.usd2(netDayShown) }}</div>
            <span class="nh-bind" :class="g.binding==='power'?'d':'g'">
              <i class="nh-bdot"></i>{{ g.binding==='power'?'Power-bound':'Cash-bound' }}</span>
          </div>
          <div class="nh-r">
            <svg v-if="g.s.netHist.length>2" class="nh-chart" viewBox="0 0 100 44"
                 preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient :id="'nhfill'" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" :stop-color="g.netDay>=0?'var(--green)':'var(--red)'"
                      stop-opacity=".30"/>
                <stop offset="100%" :stop-color="g.netDay>=0?'var(--green)':'var(--red)'"
                      stop-opacity="0"/></linearGradient></defs>
              <path :d="sparkPath(g.s.netHist,40,34,0)+' L100 44 L0 44 Z'" fill="url(#nhfill)"
                    stroke="none"/>
              <path :d="sparkPath(g.s.netHist,40,34,0)" fill="none"
                    :style="{stroke:g.netDay>=0?'var(--green)':'var(--red)'}"
                    stroke-width="1.6" vector-effect="non-scaling-stroke"/>
            </svg>
            <span class="nh-trend">{{ trend }}</span>
          </div>
        </div>
        <div class="nh-note">so far today &middot; earning about
          {{ fmt.usd2(payoutDay) }}/day at this hashrate</div>
        <div v-if="g.netDay<0 && g.s.cash>0" class="warnbox nh-warn">
          <b>Burning cash</b> — {{ fmt.eta(g.runway) }} of runway.</div>
        <div v-else-if="!g.s.cash && !g.revenueDay" class="warnbox hard nh-warn">
          <b>Insolvent.</b> The farm will sell itself down until something pays for itself.</div>
        <div v-else-if="g.idleCashAdvice" class="warnbox nh-warn"
             style="background:var(--amber-t);color:var(--amber)">
          <b>{{ fmt.usd(g.s.cash) }} sitting idle</b> — {{ g.idleCashAdvice.site.name }} has
          {{ g.idleCashAdvice.open }} open position{{ g.idleCashAdvice.open===1?'':'s' }} and the next
          rig only costs {{ fmt.usd(g.idleCashAdvice.cost) }}.
          <button class="btn btn-sm btn-pri" style="margin-top:6px" @click="g.s.tab='build'">Build one</button></div>

        <div class="ledger">
          <div class="lc"><span class="lk">Gross revenue</span>
            <span class="lv">{{ fmt.usd2(g.revenueDay) }}</span></div>
          <div class="lc"><span class="lk">Power cost</span>
            <span class="lv">{{ fmt.usd2(g.powerDay) }}</span></div>
          <div class="lc"><span class="lk">Net / day</span>
            <span class="lv" :class="g.netDay>=0?'pos':'neg'">{{ fmt.usd2(g.netDay) }}</span></div>
          <div class="lc"><span class="lk">Net to date</span>
            <span class="lv" :class="g.lifetimeNet>=0?'pos':'neg'">{{ fmt.usd(g.lifetimeNet) }}</span></div>

          <div class="lc"><span class="lk">Rig uptime</span>
            <span class="lv">{{ fmt.pct(uptime,1) }}</span></div>
          <div class="lc"><span class="lk">Active rigs</span>
            <span class="lv">{{ live }}/{{ g.s.rigs.length }}</span></div>
          <div class="lc"><span class="lk">Blocks today</span>
            <span class="lv">{{ blocksToday }}</span></div>
          <div class="lc"><span class="lk">Best block ever</span>
            <span class="lv">{{ bestBlock }}</span></div>

          <div class="lc"><span class="lk">Power usage eff.</span>
            <span class="lv">{{ g.effMhw.toFixed(3) }} MH/W</span></div>
          <div class="lc"><span class="lk">Net margin</span>
            <span class="lv" :class="margin>=0?'pos':'neg'">{{ fmt.pct(margin,1) }}</span></div>
          <div class="lc"><span class="lk">Est. payout (24h)</span>
            <span class="lv" :class="payoutDay>=0?'pos':'neg'">{{ fmt.usd2(payoutDay) }}</span></div>
          <div class="lc"><span class="lk">Payout progress</span>
            <span class="lv">{{ fmt.pct(payoutProg,0) }}</span>
            <span class="lbar" aria-hidden="true">
              <i :style="{width:(payoutProg*100).toFixed(0)+'%'}"></i></span></div>
        </div>
      </div>

      <div v-if="g.s.unlocked.auto" class="card autocard">
        <button class="autorow" @click="policyOpen=!policyOpen" :aria-expanded="policyOpen">
          <span class="au-ico" aria-hidden="true"><svg viewBox="0 0 24 24">
            <rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4.5V8"/>
            <circle cx="12" cy="3.2" r="1.3"/><path d="M9.5 13h.01M14.5 13h.01"/>
            <path d="M9.5 16.6h5"/></svg></span>
          <span class="au-txt"><span class="au-nm">Automation</span>
            <span class="au-sb">{{ autoRules }} rule{{ autoRules===1?'':'s' }} active</span></span>
          <span class="au-cv" :class="{open:policyOpen}" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        <div v-if="policyOpen" class="card-bd" style="border-top:1px solid var(--line-2);padding-top:10px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:13px">Power down unprofitable rigs</span>
            <button class="switch" :class="{on:g.s.autoOff}" @click="g.s.autoOff=!g.s.autoOff"
                    aria-label="shutdown" :aria-pressed="!!g.s.autoOff"><i></i></button></div>
          <input type="range" min="-5" max="30" step="0.25" v-model.number="g.s.offThreshold">
          <div class="track-cap"><span>Threshold</span><b>{{ fmt.usd2(g.s.offThreshold) }}/day</b></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:9px">
            <span style="font-size:13px">Replace worn cards</span>
            <button class="switch" :class="{on:g.s.autoFix}" @click="g.s.autoFix=!g.s.autoFix"
                    aria-label="replace" :aria-pressed="!!g.s.autoFix"><i></i></button></div>
          <input type="range" min="0.2" max="0.9" step="0.05" v-model.number="g.s.fixAt">
          <div class="track-cap"><span>Replace above</span><b>{{ fmt.pct(g.s.fixAt,0) }} wear</b></div>
        </div>
      </div>

      <div class="sect"><span class="sect-k">Activity feed</span>
        <span class="sect-m">Hottest site {{ hottest.toFixed(0) }}&deg;</span></div>
      <Feed />
    </template>
  </div>
</template>

<style scoped>
/* Farm redesign — section headings outside the cards, icon-led overview tiles,
   a hardware shot on every site row, and the day's ledger under one headline. */

.sect{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:2px 2px 7px;
  margin-top:14px;
}
.farm > .sect:first-child{margin-top:2px}
.sect-k{
  font-size:12.5px;
  font-weight:600;
  letter-spacing:-.01em;
  color:var(--ink-2);
}
.sect-m{font-size:11px;color:var(--ink-3)}
.sect-a{
  font-size:11.5px;
  font-weight:500;
  color:var(--blue);
  padding:2px 2px;
}

/* ---- Overview tiles ---- */
.ovgrid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
  margin-bottom:2px;
}
.ovcard{
  background:var(--card);
  border:1px solid var(--line);
  border-radius:10px;
  padding:10px 11px 9px;
  display:flex;
  flex-direction:column;
}
.ov-hd{display:flex;align-items:center;gap:7px;min-width:0}
.ov-ico{
  flex:none;
  width:22px;height:22px;
  border-radius:6px;
  display:grid;place-items:center;
}
.ov-ico svg{
  width:13px;height:13px;
  fill:none;stroke:currentColor;
  stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;
}
.ov-ico.blu{background:var(--blue-t);color:var(--blue)}
.ov-ico.grn{background:var(--green-t);color:var(--green)}
.ov-ico.red{background:var(--red-t);color:var(--red)}
.ov-k{
  font-size:10.5px;
  color:var(--ink-3);
  letter-spacing:-.005em;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.ov-row{
  display:flex;
  align-items:center;
  gap:6px;
  margin-top:7px;
  min-width:0;
}
.ov-v{
  font-family:var(--mono);
  font-variant-numeric:tabular-nums;
  font-size:19px;
  font-weight:500;
  letter-spacing:-.035em;
  line-height:1.1;
  flex:none;
  min-width:0;
}
.ov-spark{flex:1;min-width:0;height:24px;display:block;margin-left:auto}
.ov-ft{
  margin-top:auto;
  padding-top:6px;
  font-size:10px;
  color:var(--ink-3);
}
.delta{font-family:var(--mono);font-size:10px;font-weight:500}
.delta.up{color:var(--green)}
.delta.down{color:var(--red)}
.ov-bar{
  height:5px;
  border-radius:99px;
  background:var(--line-2);
  overflow:hidden;
  margin-top:9px;
}
.ov-bar i{display:block;height:100%;border-radius:99px;
  transition:width .4s cubic-bezier(.2,.8,.2,1)}
.ov-bar i.b{background:var(--blue)}
.ov-bar i.w{background:var(--amber)}
.ov-bar i.o{background:var(--red)}

/* ---- Site rows ---- */
.siterow{
  display:flex;
  align-items:center;
  gap:11px;
  padding:12px;
  width:100%;
  border-top:1px solid var(--line-2);
  text-align:left;
}
.siterow:first-child{border-top:none}
.sr-main{flex:1;min-width:0;display:block}
.sr-hd{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.sr-pill{
  display:inline-flex;
  align-items:center;
  gap:5px;
  font-size:9px;
  font-weight:600;
  letter-spacing:.07em;
  padding:3px 7px;
  border-radius:99px;
  background:var(--line-2);
  color:var(--ink-3);
}
.sr-pill.online{background:var(--green-t);color:var(--green)}
.sr-pill.hot{background:var(--amber-t);color:var(--amber)}
.sr-dot{width:5px;height:5px;border-radius:50%;background:currentColor;flex:none}
.sr-pill.online .sr-dot{
  box-shadow:0 0 6px color-mix(in srgb,var(--green) 75%,transparent);
}
.sr-pill.hot .sr-dot{
  box-shadow:0 0 6px color-mix(in srgb,var(--amber) 75%,transparent);
}
.sr-name{font-size:15px;font-weight:600;letter-spacing:-.025em}
.sr-sub{display:block;font-size:10.5px;color:var(--ink-3);margin-top:2px}
.sr-metrics{display:flex;margin-top:9px}
.sr-metrics .m{
  flex:1 1 0;
  min-width:0;
  padding-left:9px;
  border-left:1px solid var(--line-2);
}
.sr-metrics .m:first-child{padding-left:0;border-left:none}
.mk{
  display:flex;
  align-items:center;
  gap:3px;
  font-size:8.5px;
  font-weight:600;
  letter-spacing:.05em;
  text-transform:uppercase;
  color:var(--ink-3);
}
.mk-ico{width:9px;height:9px;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;flex:none}
.mv{
  display:block;
  font-family:var(--mono);
  font-variant-numeric:tabular-nums;
  font-size:12px;
  font-weight:500;
  margin-top:2px;
  letter-spacing:-.02em;
}
.sr-util{display:flex;align-items:center;gap:6px;margin-top:9px}
.uk{font-size:9.5px;color:var(--ink-3);flex:none}
.uv{font-family:var(--mono);font-size:10px;font-weight:500;flex:none}
.ubar{
  flex:1;
  min-width:0;
  height:4px;
  border-radius:99px;
  background:var(--line-2);
  overflow:hidden;
}
.ubar i{display:block;height:100%;border-radius:99px;
  transition:width .4s cubic-bezier(.2,.8,.2,1)}
.ubar i.b{background:var(--blue)}
.ubar i.w{background:var(--amber)}
.ubar i.o{background:var(--red)}

/* ---- Mining groups ---- */
/* A group is a row in the card, not a card inside a card — one strip per
   group, divided from the next by a rule. */
.grp{
  padding:10px 12px 11px;
  border-top:1px solid var(--line-2);
}
.grp:first-child{border-top:none}
.grp-hd{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.grp-nm{
  flex:1;min-width:0;
  font-size:12.5px;font-weight:600;letter-spacing:-.01em;
  color:var(--ink-2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.grp-rn{flex:none;font-size:10.5px;font-weight:500;color:var(--blue);padding:2px 3px}
/* Chain and pool are pickers and carry a border; hashrate and capacity are
   readouts and carry only a divider. Four across at this width is tight, so
   the columns are weighted rather than equal — the pool name is the longest
   string of the four and the two figures are the shortest. */
.grp-strip{
  display:grid;
  grid-template-columns:1fr 1.05fr .62fr .84fr;
  align-items:center;
}
.gsel{
  position:relative;
  display:flex;
  align-items:center;
  gap:5px;
  padding:6px 6px;
  margin-right:6px;
  border:1px solid var(--line);
  border-radius:9px;
  background:var(--card);
  min-width:0;
}
.gsel:focus-within{outline:2px solid var(--green);outline-offset:1px}
.gsel-ico{flex:none;width:18px;height:18px;border-radius:6px;display:grid;place-items:center;
  background:var(--line-2);color:var(--ink-2)}
.gsel-ico svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.gsel-txt{flex:1;min-width:0}
.gsel-k{display:block;font-size:8px;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;color:var(--ink-3)}
.gsel-v{display:block;font-size:11.5px;font-weight:500;letter-spacing:-.02em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gsel-cv{flex:none;color:var(--ink-3)}
.gsel-cv svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round;display:block}
/* Invisible but real: still the element that opens, that the label points at,
   and that carries the aria-label. */
.gsel-native{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  opacity:0;
  border:none;
  padding:0;
  margin:0;
  cursor:pointer;
  -webkit-appearance:none;
  appearance:none;
}
.gstat{
  padding:2px 0 2px 7px;
  border-left:1px solid var(--line-2);
  min-width:0;
}
.gk{display:block;font-size:8px;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;color:var(--ink-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gv{display:block;font-family:var(--mono);font-variant-numeric:tabular-nums;
  font-size:10.5px;font-weight:500;margin-top:2px;letter-spacing:-.04em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gtag{margin-top:4px}
.grp-foot{margin-top:9px}
.grp-help{padding:0 12px 11px}

.group-rename-input{
  width:100%;padding:8px 10px;
  border:1px solid var(--line);border-radius:8px;
  font:inherit;font-size:13px;margin-bottom:6px;
  background:var(--card);color:var(--ink);
}

/* ---- Net today ---- */
.nethero{display:flex;align-items:stretch;gap:10px;padding:13px 12px 4px}
.nh-l{flex:none;min-width:0}
.nh-k{font-size:11px;color:var(--ink-3)}
.nh-v{
  font-family:var(--mono);
  font-variant-numeric:tabular-nums;
  font-size:32px;
  font-weight:500;
  line-height:1.05;
  letter-spacing:-.04em;
  margin-top:1px;
}
.nh-v.pos{color:var(--green);text-shadow:0 0 18px color-mix(in srgb,var(--green) 40%,transparent)}
.nh-v.neg{color:var(--red);text-shadow:0 0 18px color-mix(in srgb,var(--red) 35%,transparent)}
.nh-bind{
  display:inline-flex;align-items:center;gap:5px;margin-top:7px;
  font-size:10px;font-weight:500;padding:3px 8px;border-radius:99px;
}
.nh-bind.g{background:var(--green-t);color:var(--green)}
.nh-bind.d{background:var(--gold-t);color:var(--gold)}
.nh-bdot{width:5px;height:5px;border-radius:50%;background:currentColor;flex:none}
.nh-r{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end}
.nh-chart{width:100%;height:64px;display:block}
.nh-trend{font-size:9.5px;color:var(--ink-3);text-align:right;margin-top:2px}
.nh-note{padding:0 12px 10px;font-size:10.5px;color:var(--ink-3)}
.nh-warn{margin:0 12px 10px}

.ledger{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  border-top:1px solid var(--line);
}
.lc{
  min-width:0;
  padding:8px 7px;
  border-right:1px solid var(--line-2);
  border-bottom:1px solid var(--line-2);
}
.lc:nth-child(4n){border-right:none}
.lc:nth-last-child(-n+4){border-bottom:none}
.lk{
  display:block;
  font-size:8.5px;
  letter-spacing:.02em;
  color:var(--ink-3);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.lv{
  display:block;
  font-family:var(--mono);
  font-variant-numeric:tabular-nums;
  font-size:11.5px;
  font-weight:500;
  margin-top:2px;
  letter-spacing:-.03em;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.lbar{
  display:block;height:3px;border-radius:99px;
  background:var(--line-2);overflow:hidden;margin-top:4px;
}
.lbar i{display:block;height:100%;border-radius:99px;background:var(--blue);
  transition:width .4s cubic-bezier(.2,.8,.2,1)}

/* ---- Automation ---- */
.autocard{margin-top:9px}
.autorow{display:flex;align-items:center;gap:9px;padding:11px 12px;width:100%}
.au-ico{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;
  background:var(--blue-t);color:var(--blue)}
.au-ico svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.au-txt{flex:1;min-width:0}
.au-nm{display:block;font-size:13.5px;font-weight:500;letter-spacing:-.015em}
.au-sb{display:block;font-size:10.5px;color:var(--ink-3);margin-top:1px}
.au-cv{flex:none;color:var(--ink-3);transition:transform .18s ease}
.au-cv svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round;display:block}
.au-cv.open{transform:rotate(180deg)}

/* Four across is the mockup's shape and it holds down to ~380px. Below that
   the picker icons go first: they are decorative (aria-hidden) and cost 23px
   each, where the text they sit beside is the actual content — a chain named
   "Tessera" truncated to "Te…" is a worse trade than no icon. */
@media (max-width:380px){
  .gsel-ico{display:none}
  .gsel{gap:0}
  /* with the icons gone the pickers need less, so the readouts take it back —
     "Hashrate" is the widest column key and was the last cell still ellipsing */
  .grp-strip{grid-template-columns:.92fr .98fr .72fr .95fr}
}
/* Narrower than that, even the text stops fitting four across, so the strip
   folds to pickers over readouts rather than ellipsing every cell. */
@media (max-width:339px){
  .grp-strip{grid-template-columns:1fr 1fr;row-gap:9px}
  .gsel{margin-right:0}
  .grp-strip .gsel:nth-child(1){margin-right:7px}
  .gstat{padding-left:0;border-left:none}
  .grp-strip .gstat:nth-child(4){padding-left:9px;border-left:1px solid var(--line-2)}
}

@media (max-width:359px){
  .ledger{grid-template-columns:repeat(2,1fr)}
  .lc:nth-child(4n){border-right:1px solid var(--line-2)}
  .lc:nth-child(2n){border-right:none}
  .lc:nth-last-child(-n+4){border-bottom:1px solid var(--line-2)}
  .lc:nth-last-child(-n+2){border-bottom:none}
}
</style>
