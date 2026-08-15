<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import Feed from '../components/Feed.vue';
import ChainMark from '../components/ChainMark.vue';
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
const BAY_MAX=16, BAY_EMPTY=4;
const siteRows=computed(()=>g.s.sites.map(f=>{
  const rigs=g.siteRigs(f);
  const slots=g.siteSlots(f);
  const temp=g.siteTemp(f);
  const ambient=temp>=70?'hot':temp>=58?'warm':'cool';
  const cells=[];
  for(const r of rigs){
    if(cells.length>=BAY_MAX) break;
    const st=g.rigState(r);
    const gr=g.groupOf(r);
    const chain=gr?gr.chain:null;
    const hue=chain!=null?CHAIN_HUE[chain]:undefined;
    cells.push({ key:'r'+r.id, empty:false, dot:st.dot,
      style:hue!==undefined?{'--chain-h':hue}:undefined });
  }
  const empties=Math.min(BAY_EMPTY, Math.max(0, slots-rigs.length));
  for(let i=0;i<empties;i++) cells.push({ key:'e'+i, empty:true });
  return {
    f, cells, more:Math.max(0, rigs.length-BAY_MAX), ambient, temp,
    hash:rigs.reduce((a,r)=>a+g.rigHash(r),0),
    demand:g.siteDemand(f),
    capacity:g.siteCapacity(f)+g.battFirm(f),
    costDay:g.siteCostPerHour(f)*24,
  };
}));
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
    <div v-if="!g.s.rigs.length" class="card" data-tour="farm"><div class="empty">
      <h3>Nothing installed</h3>
      <p>A spare bedroom, a 1.5 kW wall outlet and $500. No hardware, no coins, and no
        electricity bill until something is running.</p>
      <button class="btn btn-pri" @click="g.s.tab='build'">Go shopping</button></div></div>

    <template v-else>
      <div class="card" data-tour="farm"><div class="card-bd pt">
        <div class="totals">
          <div><div class="k">Earned today</div>
            <div class="v pos">{{ fmt.usd2(g.revenueDay) }}</div></div>
          <div><div class="k">Power today</div>
            <div class="v neg">{{ fmt.usd2(g.powerDay) }}</div></div>
          <div><div class="k">Blocks today</div>
            <div class="v">{{ fmt.n(g.s.today&&g.s.today.blocks) }}</div></div>
          <div><div class="k">Best block ever</div>
            <div class="v">{{ Number.isFinite(g.s.bestBlock) ? fmt.usd2(g.s.bestBlock) : '\u2014' }}</div></div>
        </div>
      </div></div>

      <div class="card"><div class="card-hd"><span class="eyebrow">Sites</span>
        <span class="eyebrow">{{ g.s.sites.length }}</span></div>
        <div class="list">
          <button v-for="row in siteRows" :key="'s'+row.f.id" class="rowline"
                  @click="g.s.activeSite=row.f.id; g.s.tab='sites'">
            <span style="flex:1;min-width:0"><span class="nm">{{ row.f.name }}</span>
              <span v-if="row.ambient==='hot'" class="tag"
                    style="background:var(--red-t);color:var(--red);margin-left:5px">HOT</span>
              <span v-else-if="row.ambient==='warm'" class="tag"
                    style="background:var(--amber-t);color:var(--amber);margin-left:5px">WARM</span>
              <div class="sb">{{ g.siteRigs(row.f).length }} rigs \u00b7
                {{ fmt.hash(row.hash) }} \u00b7
                {{ fmt.w(row.demand) }} of {{ fmt.w(row.capacity) }}</div>
              <div class="sitebay" :class="'ambient-'+row.ambient" aria-hidden="true">
                <span v-for="c in row.cells" :key="c.key" class="baytile"
                      :class="c.empty?'empty':c.dot" :style="c.style">
                  <i v-if="!c.empty" class="ch-led"></i>
                </span>
                <span v-if="row.more" class="baymore">+{{ row.more }}</span>
              </div></span>
            <span class="rt">{{ fmt.usd2(row.costDay) }}<div class="sb">/day</div></span></button>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><span class="eyebrow">Mining groups</span>
          <button class="btn btn-sm btn-ghost" @click="g.addGroup()">+ New group</button></div>
        <div class="card-bd pt">
          <div v-for="{gr, advice, ceiling} in groupRows" :key="gr.id"
               style="border:1px solid var(--line);border-radius:10px;padding:9px 10px;margin-bottom:8px">
            <template v-if="groupRenameOpen[gr.id]">
              <label class="sr-only" :for="'group-rename-'+gr.id">Group name</label>
              <input :id="'group-rename-'+gr.id" v-model="groupRenameDraft[gr.id]" maxlength="24"
                     placeholder="Group name"
                     style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;
                            font:inherit;font-size:13px;margin-bottom:6px" @keyup.enter="saveRenameGroup(gr)">
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
              <span class="sb">\u00b7 {{ g.groupRigs(gr).length }} rig{{ g.groupRigs(gr).length===1?'':'s' }}
                \u00b7 {{ gr.found||0 }} blocks</span>
            </div>
            <div style="display:flex;gap:7px;margin-top:7px">
              <select style="flex:1" :value="gr.chain" :aria-label="'Chain for '+gr.name"
                      @change="g.setGroupChain(gr,$event.target.value)">
                <option v-for="c in g.s.chains" :key="c.id" :value="c.id">
                  {{ c.name }} \u2014 {{ c.target<60?c.target+'s':(c.target/60)+' min' }} blocks</option>
              </select>
              <select style="flex:1" :value="gr.pool" :aria-label="'Pool for '+gr.name"
                      @change="g.setGroupPool(gr,$event.target.value)">
                <option value="solo">Solo \u2014 whole reward</option>
                <optgroup label="Rival pools">
                  <option v-for="p in g.s.pools.filter(x=>x.live&&x.chain===gr.chain&&x.owner!=='you')"
                          :key="p.id" :value="p.id">{{ p.name }} \u2014 {{ p.scheme }}
                    {{ fmt.pct(p.fee) }}</option></optgroup>
                <optgroup v-if="g.s.pools.some(x=>x.live&&x.chain===gr.chain&&x.owner==='you')"
                          label="Your pools">
                  <option v-for="p in g.s.pools.filter(x=>x.live&&x.chain===gr.chain&&x.owner==='you')"
                          :key="p.id" :value="p.id">{{ p.name }} \u2014 {{ p.scheme }}
                    {{ fmt.pct(p.fee) }}</option></optgroup>
              </select>
            </div>
          </div>
          <p v-if="g.s.help" class="hint">A group's rigs mine as <b>one participant</b> \u2014 one
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
          </div>
        </div>
        <div class="statline">
          <div class="s"><div class="k">Hashrate</div><div class="v">{{ fmt.hash(g.totalHash) }}</div></div>
          <div class="s"><div class="k">Rigs</div><div class="v">{{ live }}/{{ g.s.rigs.length }}</div></div>
          <div class="s"><div class="k">Hottest site</div>
            <div class="v" :class="hottest>70?'neg':hottest>58?'amb':''">{{ hottest.toFixed(0) }}&deg;</div></div>
        </div>
      </div>
      <Feed />
    </template>
  </div>
</template>

<style scoped>
.sitebay{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;padding:7px 8px;border-radius:9px;background:var(--line-2);transition:background-color .5s ease,box-shadow .5s ease}
.sitebay.ambient-warm{background:linear-gradient(90deg,color-mix(in srgb,var(--amber-t) 55%,var(--line-2)),var(--line-2))}
.sitebay.ambient-hot{background:linear-gradient(90deg,color-mix(in srgb,var(--red-t) 65%,var(--line-2)),var(--line-2));box-shadow:inset 0 0 12px color-mix(in srgb,var(--red) 12%,transparent)}
.baytile{width:18px;height:18px;border-radius:4px;border:1.5px solid var(--line);position:relative;overflow:hidden;flex:none;background:#12141a;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 8%,transparent),0 1px 2px color-mix(in srgb,var(--ink) 12%,transparent)}
.baytile.empty{background:transparent;border-style:dashed;border-color:color-mix(in srgb,var(--ink-3) 40%,transparent);box-shadow:none}
.baytile.run{border-color:color-mix(in srgb,var(--green) 70%,transparent);box-shadow:0 0 6px color-mix(in srgb,var(--green) 40%,transparent),inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent)}
.baytile.off{border-color:var(--ink-3);opacity:.75;filter:grayscale(.4)}
.baytile.bad{border-color:color-mix(in srgb,var(--red) 70%,transparent);box-shadow:0 0 7px color-mix(in srgb,var(--red) 45%,transparent)}
.baytile.warn{border-color:color-mix(in srgb,var(--amber) 70%,transparent);box-shadow:0 0 7px color-mix(in srgb,var(--amber) 40%,transparent)}
.baytile.build{border-color:color-mix(in srgb,var(--blue) 70%,transparent);box-shadow:0 0 7px color-mix(in srgb,var(--blue) 40%,transparent)}
.baytile:not(.empty)::before{content:'';position:absolute;inset:5px 3px 3px;border-radius:1px;background:repeating-linear-gradient(90deg,transparent 0 1.5px,color-mix(in srgb,var(--ink) 18%,transparent) 1.5px 2.5px);opacity:.7;pointer-events:none;z-index:1}
.baytile.run::before{background:repeating-linear-gradient(90deg,transparent 0 1.5px,color-mix(in srgb,#000 28%,transparent) 1.5px 2.5px);opacity:.45}
.baytile .ch-led{position:absolute;top:0;left:14%;right:14%;height:2.5px;border-radius:0 0 1px 1px;background:color-mix(in srgb,var(--ink-3) 30%,transparent);z-index:2}
.baytile.run .ch-led{background:var(--green);box-shadow:0 0 4px color-mix(in srgb,var(--green) 70%,transparent)}
.baytile.warn .ch-led{background:var(--amber);box-shadow:0 0 4px color-mix(in srgb,var(--amber) 70%,transparent)}
.baytile.bad .ch-led{background:var(--red);box-shadow:0 0 4px color-mix(in srgb,var(--red) 70%,transparent)}
.baytile.build .ch-led{background:var(--blue);box-shadow:0 0 4px color-mix(in srgb,var(--blue) 70%,transparent);animation:bayBuildLed 1.2s ease-in-out infinite}
.baytile.off .ch-led{background:color-mix(in srgb,var(--card) 20%,transparent);box-shadow:none}
.baytile[style*="--chain-h"] .ch-led{background:oklch(var(--chain-l) var(--chain-c) var(--chain-h));box-shadow:0 0 4px oklch(var(--chain-l) var(--chain-c) var(--chain-h)/.55)}
@keyframes bayBuildLed{0%,100%{opacity:.35}50%{opacity:1}}
.baymore{font-family:var(--mono);font-size:9px;color:var(--ink-3);align-self:center;margin-left:2px}
</style>
