<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import Compare from '../components/Compare.vue';
import { CHAIN_HUE } from '../data/chains.js';

const g = useGameStore();
const f = computed(() => g.active);

const MAX_TILES = 60, MAX_EMPTY = 12;
const rigsHere = computed(() => g.siteRigs(f.value));
const floorTemp = computed(() => g.siteTemp(f.value));
const floorAmbient = computed(() => {
  const t = floorTemp.value;
  return t >= 70 ? 'hot' : t >= 58 ? 'warm' : 'cool';
});
const floor = computed(() => {
  const rigs = rigsHere.value, slots = Math.max(g.siteSlots(f.value), rigs.length), cells = [];
  let running = 0;
  for (const r of rigs) {
    if (cells.length >= MAX_TILES) break;
    const st = g.rigState(r);
    if (st.dot === 'run') running++;
    const gr = g.groupOf(r);
    const chain = gr ? gr.chain : null;
    const cards = r.units ? r.units.length : 0;
    const size = cards >= 9 ? 'lg' : cards >= 5 ? 'md' : 'sm';
    cells.push({
      key: 'r' + r.id, id: r.id, dot: st.dot, n: cells.length + 1,
      chain, hue: chain != null ? CHAIN_HUE[chain] : undefined, size, cards,
      label: 'Position ' + (cells.length + 1) + ' — ' + r.name + ', ' + st.label + (st.sub ? ' (' + st.sub + ')' : '')
    });
  }
  const empties = Math.min(MAX_EMPTY, MAX_TILES - cells.length, slots - rigs.length);
  for (let i = 0; i < empties; i++) cells.push({ key: 'e' + i, id: null });
  return { cells, rigs: rigs.length, slots, running, hidden: Math.max(0, slots - cells.length), temp: floorTemp.value, ambient: floorAmbient.value };
});
const DOT_LABEL = { run: 'Running', build: 'Building', warn: 'Wearing', bad: 'Needs attention', off: 'Off' };
const legend = computed(() => {
  const n = {};
  for (const r of rigsHere.value) { const d = g.rigState(r).dot; n[d] = (n[d] || 0) + 1; }
  return ['run', 'build', 'warn', 'bad', 'off'].filter(k => n[k]).map(k => ({ k, n: n[k], label: DOT_LABEL[k] }));
});
const openTile = id => { g.s.focusRig = id; g.s.tab = 'rigs'; };

const renameOpen = ref(false);
const renameDraft = ref('');
const startRename = () => { renameDraft.value = f.value.name; renameOpen.value = true; };
const saveRename = () => { g.renameSite(f.value, renameDraft.value); renameOpen.value = false; };
const powerOpen = ref(false);
const fabOpen = ref(false);
const fabQueued = computed(() => f.value.queue.find(j => j.kind === 'fab'));

const segs = (pairs, tot) => pairs.filter(([, v]) => v > 0).map(([k, v]) => ({ k, pct: tot > 0 ? v / tot : 0, v }));
const flow = computed(() => g.flowOf(f.value));
const flowIn = computed(() => {
  const x = flow.value;
  const tot = x.inRenew + x.inBatt + x.inPaid + x.unserved;
  return segs([['solar', x.inRenew], ['battery', x.inBatt], ['grid', x.inPaid], ['unserved', x.unserved]], tot);
});
const flowOut = computed(() => {
  const x = flow.value;
  const tot = x.rigs + x.cool + x.charge;
  return segs([['rigs', x.rigs], ['cooling', x.cool], ['charging', x.charge]], tot);
});

const sourceRows = computed(() => g.SOURCES.filter(p => p.price > 0).map(p => ({
  id: p.id, name: p.name,
  sub: (p.yield ? fmt.w(p.peak * p.yield) + ' real — ' + fmt.w(p.peak) + ' nameplate at ' + (p.yield * 100).toFixed(0) + '% yield' : fmt.w(p.peak) + ' peak') + ' · ' + (p.rate > 0 ? fmt.usd2(p.rate) + '/kWh' : 'no fuel cost') + ' · ' + p.hours + ' h to build',
  value: fmt.usd(p.price),
  valueSub: p.rate > 0 ? p.kind : fmt.usd2(p.price / (p.peak * (p.yield || 1))) + '/W'
})));
const storageRows = computed(() => g.STORAGE.map(p => ({
  id: p.id, name: p.name,
  sub: fmt.kwh(p.kwh) + ' · ' + fmt.w(p.kw * 1000) + ' charge/discharge · ' + p.hours + ' h',
  value: fmt.usd(p.price), valueSub: fmt.usd2(p.price / p.kwh) + '/kWh'
})));
const plantRows = computed(() => g.PLANTS.map(p => ({
  id: p.id, name: p.name,
  sub: fmt.w(p.cool) + ' cooling · ' + fmt.w(p.w) + ' draw · ' + p.hours + ' h',
  value: fmt.usd(p.price), valueSub: fmt.usd2(p.price / p.cool) + '/W cool'
})));
const shellRows = computed(() => g.SHELLS.map(p => ({
  id: p.id, name: p.name,
  sub: p.slots + ' positions · ' + fmt.w(p.cap) + ' service · ' + p.hours + ' h',
  value: fmt.usd(p.price), valueSub: fmt.usd(p.price / p.slots) + '/slot'
})));

const chooseSource = id => { g.addSitePart(f.value.id, id, 'source'); g.s.sitePicker = null; };
const chooseStorage = id => { g.addSitePart(f.value.id, id, 'storage'); g.s.sitePicker = null; };
const choosePlant = id => { g.addSitePart(f.value.id, id, 'plant'); g.s.sitePicker = null; };
const chooseShell = id => { g.addSite(id); g.s.sitePicker = null; };
const chooseExpand = id => { g.upgradeShell(f.value.id, id); g.s.sitePicker = null; };
const chooseFab = id => { g.chooseFab(f.value.id, id); g.s.sitePicker = null; };

useSheetA11y(() => !!g.s.sitePicker || !!g.s.design, () => { g.s.sitePicker = null; g.s.design = null; });
</script>

<template>
  <div>
    <div class="card"><div class="list">
      <button v-for="st in g.s.sites" :key="st.id" class="rowline"
              :style="{ background: st.id === g.s.activeSite ? 'var(--green-t)' : '' }"
              :aria-current="st.id === g.s.activeSite ? 'true' : null"
              @click="g.s.activeSite = st.id">
        <span style="flex:1;min-width:0"><span class="nm">{{ st.name }}</span>
          <div class="sb">{{ fmt.w(g.siteDemand(st)) }} / {{ fmt.w(g.siteCapacity(st)) }}
            &middot; {{ g.siteRigs(st).length }}/{{ g.siteSlots(st) }} positions
            &middot; {{ g.siteTemp(st).toFixed(0) }}&deg;</div></span>
        <span class="rt blu" v-if="st.queue.length">{{ st.queue.length }} building</span>
      </button>
      <button class="rowline" @click="g.s.sitePicker = 'shell'">
        <span style="flex:1"><span class="nm blu">+ New site</span>
          <div class="sb">buy a shell, then install power and cooling yourself</div></span>
        <span class="ch">&rsaquo;</span></button>
    </div></div>

    <div class="card floor-card" data-tour="sites">
      <div class="card-hd"><span class="eyebrow">Floor</span>
        <span class="eyebrow">{{ floor.rigs }}/{{ floor.slots }} positions
          <span class="floor-temp" :class="'t-' + floor.ambient"
                :title="'Site temperature ' + floor.temp.toFixed(0) + '°C'">
            {{ floor.temp.toFixed(0) }}&deg;</span></span></div>
      <div class="rigwrap" :class="'ambient-' + floor.ambient">
        <div class="riggrid" :class="{ calm: floor.running > 20 }">
          <template v-for="c in floor.cells" :key="c.key">
            <button v-if="c.id !== null" class="rigtile" :class="[c.dot, 'sz-' + c.size]"
                    :style="c.hue !== undefined ? { '--chain-h': c.hue } : undefined"
                    :title="c.label" :aria-label="c.label"
                    @click="openTile(c.id)">
              <span class="rt-led" aria-hidden="true"></span>
              <span class="rt-body" aria-hidden="true"></span>
              <span class="rt-n">{{ c.n }}</span>
            </button>
            <div v-else class="rigtile empty" aria-hidden="true"><span class="rt-rail"></span></div>
          </template>
        </div>
        <div v-if="legend.length" class="riglegend">
          <span v-for="l in legend" :key="l.k"><i class="dot" :class="l.k"></i>{{ l.label }} {{ l.n }}</span>
        </div>
        <div class="rigcap">
          <template v-if="floor.rigs">Tap a position to open that rig.</template>
          <template v-else>Nothing installed here yet &mdash; {{ floor.slots }} position{{ floor.slots === 1 ? '' : 's' }} waiting.</template>
          <span v-if="floor.hidden"> &middot; {{ floor.hidden }} further position{{ floor.hidden === 1 ? '' : 's' }} not drawn</span>
        </div>
      </div>
    </div>

    <div class="card"><div class="card-bd pt">
      <div class="card-hd" style="padding:0 0 7px"><span class="eyebrow">Manage {{ f.name }}</span>
        <span class="eyebrow">{{ g.siteRigs(f).length }}/{{ g.siteSlots(f) }} positions</span></div>
      <template v-if="renameOpen">
        <label class="sr-only" for="site-rename-input">Site name</label>
        <input id="site-rename-input" v-model="renameDraft" maxlength="24" placeholder="Site name"
               style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;font-size:13px;margin-bottom:6px"
               @keyup.enter="saveRename">
        <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0">
          <button class="btn btn-ghost" @click="renameOpen = false">Cancel</button>
          <button class="btn btn-pri" @click="saveRename">Save name</button>
        </div>
      </template>
      <div v-else class="btn-row" style="grid-template-columns:1fr 1fr 1fr;margin-top:0">
        <button class="btn btn-ghost" @click="startRename">Rename</button>
        <button class="btn btn-ghost" @click="g.s.sitePicker = 'expand'">Expand</button>
        <button class="btn btn-ghost" style="color:var(--red)" @click="g.decommissionSite(f.id)">Close</button>
      </div>
    </div></div>

    <div class="card">
      <button class="rig-hd" @click="powerOpen = !powerOpen">
        <span><span class="nm">Power</span>
          <div class="sb">{{ fmt.w(g.siteDemand(f)) }} of {{ fmt.w(g.siteCapacity(f) + g.battFirm(f)) }}</div></span>
        <span class="rt">{{ powerOpen ? '−' : '+' }}</span>
      </button>
      <div v-if="powerOpen" class="card-bd" style="border-top:1px solid var(--line-2)">
        <div class="flow">
          <div class="flow-lbl">Coming from</div>
          <div class="flow-bar"><i v-for="s in flowIn" :key="s.k" :class="s.k" :style="{ width: (s.pct * 100) + '%' }"></i></div>
          <div class="flow-lbl">Going to</div>
          <div class="flow-bar"><i v-for="s in flowOut" :key="s.k" :class="s.k" :style="{ width: (s.pct * 100) + '%' }"></i></div>
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-sm" @click="g.s.sitePicker = 'source'">+ Source</button>
          <button class="btn btn-sm" @click="g.s.sitePicker = 'storage'">+ Storage</button>
          <button class="btn btn-sm" @click="g.s.sitePicker = 'plant'">+ Cooling</button>
        </div>
      </div>
    </div>

    <div class="card">
      <button class="rig-hd" @click="fabOpen = !fabOpen">
        <span><span class="nm">Fabrication</span>
          <div class="sb">{{ f.fab ? g.FAB(f.fab).name : (fabQueued ? 'under construction' : 'not installed') }}</div></span>
        <span class="rt">{{ fabOpen ? '−' : '+' }}</span>
      </button>
      <div v-if="fabOpen" class="card-bd" style="border-top:1px solid var(--line-2)">
        <p v-if="!f.fab && !fabQueued" class="hint">A fab is the single biggest bet in the game — design and manufacture custom parts on site.</p>
        <template v-if="f.fab">
          <p class="hint">{{ g.FAB(f.fab).name }} · tier {{ g.FAB(f.fab).tier }} of 3 · design budget {{ g.FAB(f.fab).budget }}</p>
          <div class="btn-row">
            <button class="btn btn-sm" @click="g.s.sitePicker = 'fab'">Upgrade the fab</button>
            <button class="btn btn-sm btn-pri" @click="g.openDesignKind()">Design a part</button>
          </div>
        </template>
        <button v-else-if="!fabQueued" class="btn btn-pri" @click="g.s.sitePicker = 'fab'">Install a fab</button>
      </div>
    </div>

    <div v-if="g.s.sitePicker" class="sheet" role="dialog">
      <div class="sheet-hd">
        <b>{{ g.s.sitePicker === 'shell' ? 'New site' : g.s.sitePicker === 'expand' ? 'Expand shell' : g.s.sitePicker === 'source' ? 'Add source' : g.s.sitePicker === 'storage' ? 'Add storage' : g.s.sitePicker === 'plant' ? 'Add cooling' : 'Fab' }}</b>
        <button class="btn btn-sm btn-ghost" @click="g.s.sitePicker = null">Close</button>
      </div>
      <Compare v-if="g.s.sitePicker === 'shell'" :rows="shellRows" @pick="chooseShell" />
      <Compare v-else-if="g.s.sitePicker === 'expand'" :rows="shellRows" @pick="chooseExpand" />
      <Compare v-else-if="g.s.sitePicker === 'source'" :rows="sourceRows" @pick="chooseSource" />
      <Compare v-else-if="g.s.sitePicker === 'storage'" :rows="storageRows" @pick="chooseStorage" />
      <Compare v-else-if="g.s.sitePicker === 'plant'" :rows="plantRows" @pick="choosePlant" />
      <Compare v-else-if="g.s.sitePicker === 'fab'" :rows="g.fabRows(f)" @pick="chooseFab" />
    </div>

    <div v-if="g.s.design" class="sheet" role="dialog">
      <div class="sheet-hd">
        <b>Design a {{ g.s.design.kind === 'cool' ? 'Cooler' : g.s.design.kind === 'psu' ? 'Supply' : g.s.design.kind === 'unit' ? 'Card' : 'Frame' }}</b>
        <button class="btn btn-sm btn-ghost" @click="g.s.design = null">Close</button>
      </div>
      <div class="card-bd">
        <p class="hint">{{ g.designTotals(g.s.design.kind, g.s.design.picks).budget }} / {{ g.FAB(f.fab).budget }}</p>
        <div v-for="axis in g.DESIGN_AXES[g.s.design.kind]" :key="axis.key" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>{{ axis.label }}</span>
            <span>
              <button class="btn btn-sm" :aria-label="'Decrease ' + axis.label" @click="g.bumpDesignPick(axis.key, -1)">−</button>
              <button class="btn btn-sm" :aria-label="'Increase ' + axis.label" @click="g.bumpDesignPick(axis.key, 1)">+</button>
            </span>
          </div>
        </div>
        <button class="btn btn-pri" @click="g.manufacturePart()">Manufacture</button>
      </div>
    </div>
  </div>
</template>

<style>
.floor-card .card-hd{align-items:center}
.floor-temp{display:inline-block;margin-left:8px;padding:1px 6px;border-radius:999px;font-family:var(--mono);font-size:10px;font-weight:600;background:var(--line-2);color:var(--ink-3);vertical-align:1px}
.floor-temp.t-warm{background:var(--amber-t);color:var(--amber)}
.floor-temp.t-hot{background:var(--red-t);color:var(--red);box-shadow:0 0 8px color-mix(in srgb,var(--red) 35%,transparent)}
.rigwrap{padding:12px;border-radius:0 0 12px 12px;transition:background-color .6s ease,box-shadow .6s ease}
.rigwrap.ambient-warm{background:linear-gradient(180deg,color-mix(in srgb,var(--amber-t) 55%,transparent),color-mix(in srgb,var(--amber-t) 15%,transparent))}
.rigwrap.ambient-hot{background:linear-gradient(180deg,color-mix(in srgb,var(--red-t) 70%,transparent),color-mix(in srgb,var(--red-t) 20%,transparent));box-shadow:inset 0 0 24px color-mix(in srgb,var(--red) 18%,transparent)}
.riggrid{grid-template-columns:repeat(auto-fill,minmax(38px,1fr));gap:6px}
.rigtile{position:relative;border-radius:7px;overflow:hidden;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 12%,transparent),0 1px 2px color-mix(in srgb,var(--ink) 8%,transparent)}
.rigtile .rt-n{position:relative;z-index:2;font-weight:600;line-height:1}
.rigtile .rt-led{position:absolute;top:0;left:10%;right:10%;height:3px;border-radius:0 0 2px 2px;background:color-mix(in srgb,var(--ink-3) 35%,transparent);z-index:1}
.rigtile[style*="--chain-h"] .rt-led{background:oklch(var(--chain-l) var(--chain-c) var(--chain-h));box-shadow:0 0 6px oklch(var(--chain-l) var(--chain-c) var(--chain-h)/.55)}
.rigtile .rt-body{position:absolute;inset:8px 6px 6px;border-radius:3px;z-index:0;background:repeating-linear-gradient(90deg,transparent 0 2px,color-mix(in srgb,var(--ink) 8%,transparent) 2px 3px);opacity:.55;pointer-events:none}
.rigtile.sz-lg .rt-body{opacity:.85}
.rigtile.empty{box-shadow:none}
.rigtile.empty .rt-rail{position:absolute;inset:30% 18%;border-radius:2px;border:1px dashed color-mix(in srgb,var(--ink-3) 28%,transparent);pointer-events:none}
.rigtile.run .rt-body{opacity:.4;background:repeating-linear-gradient(90deg,transparent 0 2px,color-mix(in srgb,#000 18%,transparent) 2px 3px)}
.rigtile.off .rt-led{background:color-mix(in srgb,var(--card) 25%,transparent);box-shadow:none}
.rigtile.build .rt-led{animation:buildLed 1.2s ease-in-out infinite}
@keyframes buildLed{0%,100%{opacity:.35}50%{opacity:1}}
</style>
