<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import Feed from '../components/Feed.vue';

const g = useGameStore();
const live=computed(()=>g.s.rigs.filter(r=>g.rigLive(r)).length);
const netPath=computed(()=> sparkPath(g.s.netHist, 31, 28, 0));
const trend=computed(()=>{ const h=g.s.netHist; if(h.length<6) return '';
  const a=h[h.length-6], b=h[h.length-1];
  return b>a*1.03?'improving':b<a*0.97?'slipping':'holding'; });
const policyOpen=ref(false);
const hottest=computed(()=>g.s.sites.reduce((a,f)=>Math.max(a,g.siteTemp(f)),0));
/* groupAdvice/chainCeiling each walk every group and rig internally
   (chainHash -> myHash -> groupHash), and the template used to call them
   up to 5x and 4x per group per render. Computed once per group here. */
const groupRows=computed(()=>g.s.groups.map(gr=>({
  gr, advice:g.groupAdvice(gr), ceiling:g.chainCeiling(g.chain(gr.chain))
})));
const groupRenameOpen=reactive({});
const groupRenameDraft=reactive({});
const startRenameGroup=gr=>{ groupRenameDraft[gr.id]=gr.name; groupRenameOpen[gr.id]=true; };
const saveRenameGroup=gr=>{ g.renameGroup(gr,groupRenameDraft[gr.id]); groupRenameOpen[gr.id]=false; };
</script>

<template>
  <div>
    <div v-if="!g.s.rigs.length" class="card"><div class="empty">
      <h3>Nothing installed</h3>
      <p>A spare bedroom, a 1.5 kW wall outlet and $500. No hardware, no coins, and no
        electricity bill until something is running.</p>
      <button class="btn btn-pri" @click="g.s.tab='build'">Go shopping</button></div></div>

    <template v-else>
      <div class="card"><div class="card-bd pt">
        <div class="totals">
          <div><div class="k">Earned today</div>
            <div class="v pos">{{ fmt.usd2(g.revenueDay) }}</div></div>
          <div><div class="k">Power today</div>
            <div class="v neg">{{ fmt.usd2(g.powerDay) }}</div></div>
          <div><div class="k">Blocks today</div>
            <div class="v">{{ (g.s.today&&g.s.today.blocks)||0 }}</div></div>
          <div><div class="k">Best block ever</div>
            <div class="v">{{ fmt.usd2(g.s.bestBlock||0) }}</div></div>
        </div>
      </div></div>

      <div class="card"><div class="card-hd"><span class="eyebrow">Sites</span>
        <span class="eyebrow">{{ g.s.sites.length }}</span></div>
        <div class="list">
          <div v-for="f in g.s.sites" :key="'s'+f.id" class="rowline">
            <span style="flex:1;min-width:0"><span class="nm">{{ f.name }}</span>
              <span v-if="(f.temp||0)>=70" class="tag"
                    style="background:var(--red-t);color:var(--red);margin-left:5px">HOT</span>
              <div class="sb">{{ g.siteRigs(f).length }} rigs ·
                {{ fmt.hash(g.siteRigs(f).reduce((a,r)=>a+g.rigHash(r),0)) }} ·
                {{ fmt.w(g.siteDemand(f)) }} of {{ fmt.w(g.siteCapacity(f)+g.battFirm(f)) }}</div></span>
            <span class="rt">{{ fmt.usd2(g.siteCostPerHour(f)*24) }}<div class="sb">/day</div></span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><span class="eyebrow">Mining groups</span>
          <button class="btn btn-sm btn-ghost" @click="g.addGroup()">+ New group</button></div>
        <div class="card-bd pt">
          <div v-for="{gr, advice, ceiling} in groupRows" :key="gr.id"
               style="border:1px solid var(--line);border-radius:10px;padding:9px 10px;margin-bottom:8px">
            <template v-if="groupRenameOpen[gr.id]">
              <input v-model="groupRenameDraft[gr.id]" maxlength="24" placeholder="Group name"
                     style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;
                            font:inherit;font-size:13px;margin-bottom:6px" @keyup.enter="saveRenameGroup(gr)">
              <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0">
                <button class="btn btn-ghost btn-sm" @click="groupRenameOpen[gr.id]=false">Cancel</button>
                <button class="btn btn-pri btn-sm" @click="saveRenameGroup(gr)">Save name</button>
              </div>
            </template>
            <div v-else style="display:flex;align-items:baseline;gap:8px">
              <b style="flex:1">{{ gr.name }}
                <button class="btn btn-sm btn-ghost" style="padding:2px 6px;margin-left:2px"
                        @click="startRenameGroup(gr)">Rename</button>
                <span v-if="advice" class="tag"
                      style="background:var(--amber-t);color:var(--amber);margin-left:5px">OUTGROWN</span>
                <span v-else-if="ceiling" class="tag"
                      style="background:var(--amber-t);color:var(--amber);margin-left:5px">AT CEILING</span></b>
              <span class="num" style="font-size:13px">{{ fmt.hash(g.groupHash(gr)) }}</span>
              <span class="sb">· {{ g.groupRigs(gr).length }} rig{{ g.groupRigs(gr).length===1?'':'s' }}
                · {{ gr.found||0 }} blocks</span>
            </div>
            <div style="display:flex;gap:7px;margin-top:7px">
              <select style="flex:1" :value="gr.chain"
                      @change="g.setGroupChain(gr,$event.target.value)">
                <option v-for="c in g.s.chains" :key="c.id" :value="c.id">
                  {{ c.name }} — {{ c.target<60?c.target+'s':(c.target/60)+' min' }} blocks</option>
              </select>
              <select style="flex:1" :value="gr.pool"
                      @change="g.setGroupPool(gr,$event.target.value)">
                <option value="solo">Solo — whole reward</option>
                <optgroup label="Rival pools">
                  <option v-for="p in g.s.pools.filter(x=>x.live&&x.chain===gr.chain&&x.owner==='rival')"
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
              {{ fmt.usd2(g.netDay) }}</span>
            <span class="sb" style="flex:none;margin-left:8px">so far today
              &middot; earning about {{ fmt.usd2(g.expectedDay-g.powerRateDay) }}/day
              at this hashrate</span>
            <span style="flex:1;min-width:0">
              <svg v-if="g.s.netHist.length>2" class="spark" viewBox="0 0 100 34"
                   preserveAspectRatio="none" aria-hidden="true">
                <path :d="netPath" fill="none" :stroke="g.netDay>=0?'#137A55':'#BE443A'"
                      stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
              <span style="font-size:10px;color:var(--ink-3)">{{ trend }}</span></span></div>
          <div v-if="g.netDay<0 && g.s.cash>0" class="warnbox">
            <b>Burning cash</b> — {{ fmt.eta(g.runway) }} of runway.</div>
          <div v-else-if="!g.s.cash && !g.revenueDay" class="warnbox hard">
            <b>Insolvent.</b> The farm will sell itself down until something pays for itself.</div>
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
          <div class="s"><div class="k">Blocks</div><div class="v">{{ g.s.blocksSolved }}</div></div>
          <div class="s"><div class="k">Hottest site</div>
            <div class="v" :class="hottest>70?'neg':hottest>58?'amb':''">{{ hottest.toFixed(0) }}&deg;</div></div>
          <div class="s"><div class="k">Shed</div><div class="v" :class="g.s.shed?'amb':''">{{ g.s.shed }}</div></div>
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
