<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import Feed from '../components/Feed.vue';
import ChainMark from '../components/ChainMark.vue';
import Chassis from '../components/Chassis.vue';
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

const blocksToday=computed(()=>{
  const n=g.s.today&&g.s.today.blocks;
  return Number.isFinite(n)?fmt.n(n):'—';
});
const bestBlock=computed(()=>Number.isFinite(g.s.bestBlock)?fmt.usd2(g.s.bestBlock):'—');
</script>

<template>
  <div>
    <div v-if="!g.s.rigs.length" class="card" data-tour="farm"><div class="empty">
      <h3>Nothing installed</h3>
      <p>A spare bedroom, a 1.5 kW wall outlet and $500. No hardware, no coins, and no
        electricity bill until something is running.</p>
      <button class="btn btn-pri" @click="g.s.tab='build'">Go shopping</button></div></div>

    <template v-else>
      <!-- Approved hybrid top: 2×2 quiet stat cards -->
      <div class="card farm-top" data-tour="farm">
        <div class="farm-stats">
          <div class="farm-stat">
            <div class="farm-stat-k">Net hashrate</div>
            <div class="farm-stat-v">{{ fmt.hash(g.totalHash) }}</div>
            <svg v-if="g.s.hashHist&&g.s.hashHist.length>2" class="farm-spark" viewBox="0 0 100 24"
                 preserveAspectRatio="none" aria-hidden="true">
              <path :d="sparkPath(g.s.hashHist, 22, 20)" fill="none"
                    style="stroke:var(--blue)" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
            </svg>
          </div>
          <div class="farm-stat">
            <div class="farm-stat-k">Power draw</div>
            <div class="farm-stat-v">{{ fmt.w(totalDemand) }}</div>
            <div class="farm-stat-sub">{{ fmt.pct(g.headroom,0) }} of capacity</div>
          </div>
          <div class="farm-stat">
            <div class="farm-stat-k">Profit / loss today</div>
            <div class="farm-stat-v" :class="g.netDay>=0?'pos':'neg'">{{ fmt.usd2(netDayShown) }}</div>
            <svg v-if="g.s.netHist.length>2" class="farm-spark" viewBox="0 0 100 24"
                 preserveAspectRatio="none" aria-hidden="true">
              <path :d="netPath" fill="none"
                    :style="{stroke:g.netDay>=0?'var(--green)':'var(--red)'}"
                    stroke-width="1.4" vector-effect="non-scaling-stroke"/>
            </svg>
          </div>
          <div class="farm-stat">
            <div class="farm-stat-k">Cost today</div>
            <div class="farm-stat-v neg">{{ fmt.usd2(g.powerDay) }}</div>
            <div class="farm-stat-sub">power</div>
          </div>
        </div>
      </div>

      <!-- Mining sites — large chassis hero rows (approved layout) -->
      <div class="card">
        <div class="card-hd"><span class="eyebrow">Mining sites</span>
          <span class="eyebrow">{{ g.s.sites.length }}</span></div>
        <div class="list">
          <button v-for="row in siteRows" :key="'s'+row.f.id" class="siterow"
                  @click="g.s.activeSite=row.f.id; g.s.tab='sites'">
            <div class="siterow-main">
              <div class="siterow-hd">
                <span class="siterow-status" :class="row.statusTone">
                  <i class="siterow-dot"></i>{{ row.status }}</span>
                <span class="siterow-name">{{ row.f.name }}</span>
              </div>
              <div class="siterow-sub">{{ row.rigCount }}/{{ row.slots }} positions
                · {{ fmt.w(row.demand) }} of {{ fmt.w(row.capacity) }}</div>
              <div class="siterow-metrics">
                <span><span class="mk">Hash rate</span>
                  <span class="mv">{{ fmt.hash(row.hash) }}</span></span>
                <span><span class="mk">Power</span>
                  <span class="mv">{{ fmt.w(row.demand) }}</span></span>
                <span><span class="mk">Temp</span>
                  <span class="mv" :class="row.ambient==='hot'?'neg':row.ambient==='warm'?'amb':''">
                    {{ row.temp.toFixed(0) }}°C</span></span>
              </div>
              <div class="siterow-bar" role="img"
                   :aria-label="'Utilization '+(row.util*100).toFixed(0)+'%'">
                <i :style="{width:(row.util*100).toFixed(0)+'%'}"
                   :class="row.util>0.9?'o':row.util>0.7?'w':'g'"></i>
              </div>
            </div>
            <Chassis class="siterow-chassis" :state="row.chassisState" size="lg" large
                     :chain-hue="row.chainHue"
                     :label="row.f.name+' — '+row.status" />
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><span class="eyebrow">Mining groups</span>
          <button class="btn btn-sm btn-ghost" @click="g.addGroup()">+ New group</button></div>
        <div class="card-bd pt">
          <div v-for="{gr, advice, ceiling} in groupRows" :key="gr.id" class="group-card">
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
            <div v-else style="display:flex;align-items:baseline;gap:8px">
              <b style="flex:1"><ChainMark :chain="gr.chain" />{{ gr.name }}
                <button class="btn btn-sm btn-ghost" style="padding:2px 6px;margin-left:2px"
                        :aria-label="'Rename '+gr.name" @click="startRenameGroup(gr)">Rename</button>
                <span v-if="advice" class="tag"
                      style="background:var(--amber-t);color:var(--amber);margin-left:5px">OUTGROWN</span>
                <span v-else-if="ceiling" class="tag"
                      style="background:var(--amber-t);color:var(--amber);margin-left:5px">AT CEILING</span></b>
              <span class="num" style="font-size:13px">{{ fmt.hash(g.groupHash(gr)) }}</span>
              <span class="sb">· {{ g.groupRigs(gr).length }} rig{{ g.groupRigs(gr).length===1?'':'s' }}
                · {{ gr.found||0 }} blocks</span>
            </div>
            <div style="display:flex;gap:7px;margin-top:7px">
              <select style="flex:1" :value="gr.chain" :aria-label="'Chain for '+gr.name"
                      @change="g.setGroupChain(gr,$event.target.value)">
                <option v-for="c in g.s.chains" :key="c.id" :value="c.id">
                  {{ c.name }} — {{ c.target<60?c.target+'s':(c.target/60)+' min' }} blocks</option>
              </select>
              <select style="flex:1" :value="gr.pool" :aria-label="'Pool for '+gr.name"
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
            </div>
            <p v-if="advice" class="hint" style="margin:6px 0 0;color:var(--amber)">
              You are {{ fmt.pct(advice.share,0) }} of {{ g.chain(gr.chain).name }} —
              above the floor a chain pays its emission, not your hashrate.
              {{ advice.alt }} would pay about
              {{ advice.mult.toFixed(1) }}× per MH, even after your hash raises
              its difficulty.</p>
            <p v-else-if="ceiling" class="hint"
               style="margin:6px 0 0;color:var(--amber)">
              You are {{ fmt.pct(ceiling.share,0) }} of
              {{ g.chain(gr.chain).name }} — above the floor a chain pays its emission, not your
              hashrate. It hands out about
              {{ fmt.usd(ceiling.grossCap) }}/day however much you point
              at it, so more rigs here divide the same pot. No other chain currently pays enough
              more to be worth the move, so growth has to come from a second group on another
              chain, or from a pool.</p>
            <div class="track-cap" style="margin-top:6px">
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
          <p v-if="g.s.help" class="hint">A group's rigs mine as <b>one participant</b> — one
            ticket in the draw, one PPLNS window. Rebuilds, brownouts and power cycles never
            forfeit; only the group switching chain or pool does.</p>
        </div>
      </div>

      <div class="card">
        <div class="hero">
          <div style="display:flex;align-items:baseline;justify-content:space-between">
            <span class="hero-lbl">Net today</span>
            <span class="tag" :class="g.binding==='power'?'d':'g'">
              {{ g.binding==='power'?'power-bound':'cash-bound' }}</span></div>
          <div style="display:flex;align-items:flex-end;gap:10px;margin-top:2px">
            <span class="hero-val" :class="g.netDay>=0?'pos':'neg'" style="flex:none">
              {{ fmt.usd2(netDayShown) }}</span>
            <span class="sb" style="flex:none;margin-left:8px">so far today
              &middot; earning about {{ fmt.usd2(g.expectedDay-g.powerRateDay) }}/day
              at this hashrate</span>
            <span style="flex:1;min-width:0">
              <svg v-if="g.s.netHist.length>2" class="spark" viewBox="0 0 100 34"
                   preserveAspectRatio="none" aria-hidden="true">
                <path :d="netPath" fill="none" :style="{stroke: g.netDay>=0?'var(--green)':'var(--red)'}"
                      stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
              <span style="font-size:10px;color:var(--ink-3)">{{ trend }}</span></span></div>
          <div v-if="g.netDay<0 && g.s.cash>0" class="warnbox">
            <b>Burning cash</b> — {{ fmt.eta(g.runway) }} of runway.</div>
          <div v-else-if="!g.s.cash && !g.revenueDay" class="warnbox hard">
            <b>Insolvent.</b> The farm will sell itself down until something pays for itself.</div>
          <div v-else-if="g.idleCashAdvice" class="warnbox" style="background:var(--amber-t);color:var(--amber)">
            <b>{{ fmt.usd(g.s.cash) }} sitting idle</b> — {{ g.idleCashAdvice.site.name }} has
            {{ g.idleCashAdvice.open }} open position{{ g.idleCashAdvice.open===1?'':'s' }} and the next
            rig only costs {{ fmt.usd(g.idleCashAdvice.cost) }}.
            <button class="btn btn-sm btn-pri" style="margin-top:6px" @click="g.s.tab='build'">Build one</button></div>
        </div>
        <div class="statline">
          <div class="s"><div class="k">Hashrate</div><div class="v">{{ fmt.hash(g.totalHash) }}</div></div>
          <div class="s"><div class="k">MH / W</div><div class="v">{{ g.effMhw.toFixed(3) }}</div></div>
          <div class="s"><div class="k">Power used</div>
            <div class="v" :class="g.binding==='power'?'amb':''">{{ fmt.pct(g.headroom,0) }}</div></div>
          <div class="s"><div class="k">Capacity</div><div class="v blu">{{ fmt.w(g.totalCapacity) }}</div></div>
          <div class="s"><div class="k">Revenue / day</div><div class="v pos">{{ fmt.usd2(g.revenueDay) }}</div></div>
          <div class="s"><div class="k">Costs / day</div><div class="v neg">{{ fmt.usd2(-g.powerDay) }}</div></div>
          <div class="s"><div class="k">Net / day</div>
            <div class="v" :class="g.netDay>=0?'pos':'neg'">{{ fmt.usd2(g.netDay) }}</div></div>
          <div class="s"><div class="k">Net to date</div>
            <div class="v" :class="g.lifetimeNet>=0?'pos':'neg'">{{ fmt.usd(g.lifetimeNet) }}</div></div>
          <div class="s"><div class="k">Rigs</div><div class="v">{{ live }}/{{ g.s.rigs.length }}</div></div>
          <div class="s"><div class="k">Blocks today</div><div class="v">{{ blocksToday }}</div></div>
          <div class="s"><div class="k">Best block ever</div><div class="v">{{ bestBlock }}</div></div>
          <div class="s"><div class="k">Hottest site</div>
            <div class="v" :class="hottest>70?'neg':hottest>58?'amb':''">{{ hottest.toFixed(0) }}&deg;</div></div>
        </div>
      </div>

      <div v-if="g.s.unlocked.auto" class="card">
        <button class="rowline" @click="policyOpen=!policyOpen">
          <span><span class="nm">Automation</span>
            <div class="sb">{{ g.s.autoOff?'shed below '+fmt.usd2(g.s.offThreshold)+'/day':'shutdown off' }}
              &middot; {{ g.s.autoFix?'replacing above '+fmt.pct(g.s.fixAt,0):'no auto-replace' }}</div></span>
          <span class="rt" style="color:var(--ink-3);font-size:15px">{{ policyOpen?'−':'+' }}</span>
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
      <Feed />
    </template>
  </div>
</template>

<style scoped>
/* Hybrid Farm redesign — large chassis heroes, calm 2×2 top stats */
.farm-top{padding:0}
.farm-stats{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:1px;
  background:var(--line);
}
.farm-stat{
  background:var(--card);
  padding:12px 14px 11px;
  min-height:78px;
  display:flex;
  flex-direction:column;
  justify-content:flex-start;
}
.farm-stat-k{
  font-size:9.5px;
  font-weight:600;
  letter-spacing:.06em;
  text-transform:uppercase;
  color:var(--ink-3);
  margin-bottom:4px;
}
.farm-stat-v{
  font-family:var(--mono);
  font-size:18px;
  font-weight:500;
  letter-spacing:-.02em;
  line-height:1.15;
}
.farm-stat-sub{
  font-size:10.5px;
  color:var(--ink-3);
  margin-top:3px;
}
.farm-spark{
  width:100%;
  height:22px;
  margin-top:6px;
  display:block;
}

.siterow{
  display:flex;
  align-items:center;
  gap:12px;
  padding:12px 14px;
  width:100%;
  border-top:1px solid var(--line-2);
  text-align:left;
}
.siterow:first-child{border-top:none}
.siterow-main{flex:1;min-width:0}
.siterow-hd{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
}
.siterow-status{
  display:inline-flex;
  align-items:center;
  gap:5px;
  font-size:9.5px;
  font-weight:600;
  letter-spacing:.06em;
  text-transform:uppercase;
  color:var(--ink-3);
}
.siterow-status.online{color:var(--green)}
.siterow-status.hot{color:var(--red)}
.siterow-status.idle{color:var(--ink-3)}
.siterow-dot{
  width:6px;height:6px;border-radius:50%;
  background:currentColor;flex:none;
}
.siterow-status.online .siterow-dot{
  box-shadow:0 0 6px color-mix(in srgb,var(--green) 70%,transparent);
}
.siterow-status.hot .siterow-dot{
  box-shadow:0 0 6px color-mix(in srgb,var(--red) 70%,transparent);
}
.siterow-name{
  font-size:15px;
  font-weight:600;
  letter-spacing:-.02em;
}
.siterow-sub{
  font-size:11px;
  color:var(--ink-3);
  margin-top:2px;
}
.siterow-metrics{
  display:flex;
  gap:14px;
  margin-top:8px;
  flex-wrap:wrap;
}
.siterow-metrics .mk{
  display:block;
  font-size:9px;
  font-weight:600;
  letter-spacing:.05em;
  text-transform:uppercase;
  color:var(--ink-3);
}
.siterow-metrics .mv{
  font-family:var(--mono);
  font-size:12.5px;
  font-weight:500;
  margin-top:1px;
  display:block;
}
.siterow-bar{
  height:4px;
  border-radius:99px;
  background:var(--line-2);
  margin-top:8px;
  overflow:hidden;
}
.siterow-bar i{
  display:block;
  height:100%;
  border-radius:99px;
  transition:width .4s cubic-bezier(.2,.8,.2,1);
}
.siterow-bar i.g{background:var(--green)}
.siterow-bar i.w{background:var(--amber)}
.siterow-bar i.o{background:var(--red)}
.siterow-chassis{
  flex:none;
  width:56px !important;
  height:56px !important;
  border-radius:10px !important;
}

.group-card{
  border:1px solid var(--line);
  border-radius:12px;
  padding:11px 12px;
  margin-bottom:10px;
  background:color-mix(in srgb,var(--card) 92%,var(--line-2));
}
.group-rename-input{
  width:100%;padding:8px 10px;
  border:1px solid var(--line);border-radius:8px;
  font:inherit;font-size:13px;margin-bottom:6px;
  background:var(--card);color:var(--ink);
}
</style>
