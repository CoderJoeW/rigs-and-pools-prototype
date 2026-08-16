<script setup>
import { reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';

const g = useGameStore();
const open=reactive({});
const slip=(c,f)=>Math.min(0.5,0.5*(g.s.wallet[c.id]*f)/c.depth);

function downloadBackup(){
  const blob=new Blob([g.exportSave()],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`rigs-and-pools-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const fileInput=ref(null);
const importArm=ref(false);
const importMsg=ref('');
function pickBackup(){
  if(!importArm.value){ importArm.value=true; return; }
  fileInput.value.click();
}
async function onBackupFile(e){
  const file=e.target.files[0];
  e.target.value='';       // lets the same file be picked again
  importArm.value=false;
  if(!file) return;
  const ok=await g.importSave(await file.text());
  importMsg.value=ok?'Restored from backup':"That file isn't a Rigs & Pools save";
}
</script>

<template>
  <div>
    <div class="card"><div class="card-hd"><span class="eyebrow">Auto-sell drip</span>
      <button class="switch" :class="{on:g.s.drip.on}" @click="g.setDrip('on',!g.s.drip.on)"
              aria-label="auto-sell" :aria-pressed="!!g.s.drip.on"><i></i></button></div>
      <div class="card-bd">
        <div class="rigfld" style="margin-top:0"><label id="drip-size-label">Order size — how much of a stack goes at once</label>
          <div class="btn-row" style="margin-top:0" role="group" aria-labelledby="drip-size-label">
            <button v-for="f in [0.25,0.5,1]" :key="f" class="btn btn-sm"
                    :class="g.s.drip.frac===f?'btn-pri':''" @click="g.setDrip('frac',f)">
              {{ (f*100).toFixed(0) }}%</button></div></div>
        <div class="rigfld"><label id="drip-freq-label">How often</label>
          <div class="btn-row" style="margin-top:0" role="group" aria-labelledby="drip-freq-label">
            <button v-for="h in [1,6,24]" :key="h" class="btn btn-sm"
                    :class="g.s.drip.hours===h?'btn-pri':''" @click="g.setDrip('hours',h)">
              {{ h===1?'hourly':h===6?'every 6h':'daily' }}</button></div></div>
        <p class="hint" style="margin:2px 0 0">
          {{ (g.s.drip.frac*100).toFixed(0) }}% of every holding,
          {{ g.s.drip.hours===1?'each hour':g.s.drip.hours===6?'four times a day':'once a day' }}<span
            v-if="g.s.drip.frac<1">, so a stack decays rather than exits</span>.</p>
        <p v-if="g.dripWorst()" class="hint" style="color:var(--amber);margin-top:4px">
          Slippage bites hardest on {{ g.dripWorst().c.name }}: this order would lose
          {{ fmt.pct(g.dripWorst().cost) }}<span v-if="g.s.drip.frac>0.25">
            — a 25% order would cost {{ fmt.pct(g.dripWorst().at25) }}</span>.</p>
        <input type="range" min="0" max="14" step="0.25" v-model.number="g.s.minSell"
               aria-label="Hold below price floor">
        <div class="track-cap"><span>Hold below</span>
          <b>{{ g.s.minSell>0?fmt.usd2(g.s.minSell):'no floor' }}</b></div>
        <p v-if="g.s.help" class="hint">Slippage is charged per order and heals between them, so
          small orders beat one large exit — by more on a thin book than a deep one. Hold a coin
          below to let it ride.</p></div></div>

    <div class="card" data-tour="market"><div class="list">
      <template v-for="c in g.s.chains" :key="c.id">
        <button class="rowline" @click="open[c.id]=!open[c.id]">
          <span style="flex:1;min-width:0"><span class="nm">{{ c.tick }}</span>
            <span v-if="c.depth<=400" class="tag d" style="margin-left:5px">THIN</span>
            <div class="sb">{{ fmt.c(g.s.wallet[c.id]) }} held ·
              {{ fmt.usd2(g.s.wallet[c.id]*g.price(c)) }}</div></span>
          <span class="rt">{{ fmt.usd2(g.price(c)) }}
            <div class="sb" :class="slip(c,1)>0.02?'neg':''">{{ fmt.pct(slip(c,1)) }} to exit</div></span>
        </button>
        <div v-if="g.s.drip.on&&g.s.wallet[c.id]>0" class="track-cap"
             style="padding:0 12px 6px;margin-top:-2px">
          <span :style="g.s.hold[c.id]?'color:var(--amber)':''">
            {{ g.s.hold[c.id] ? 'Held — the drip skips it'
               : 'Drip sells '+fmt.c(g.s.wallet[c.id]*g.s.drip.frac)+' at '
                 +fmt.pct(g.dripCost(c))+' slippage' }}</span>
          <button class="btn btn-sm btn-ghost" @click="g.toggleHold(c.id)">
            {{ g.s.hold[c.id]?'Release':'Hold' }}</button></div>
        <div v-if="open[c.id]" class="card-bd" style="padding-top:6px">
          <div class="eyebrow" style="margin-bottom:4px" :id="'sell-label-'+c.id">Sell your {{ c.tick }}</div>
          <div class="btn-row" style="margin-top:0" role="group" :aria-labelledby="'sell-label-'+c.id">
            <button class="btn" :disabled="!g.s.wallet[c.id]" @click="g.sell(c.id,0.25)">25%</button>
            <button class="btn" :disabled="!g.s.wallet[c.id]" @click="g.sell(c.id,0.5)">50%</button>
            <button class="btn btn-pri" :disabled="!g.s.wallet[c.id]" @click="g.sell(c.id,1)">All</button>
          </div>
          <div class="eyebrow" style="margin:10px 0 4px" :id="'buy-label-'+c.id">Buy {{ c.tick }} with cash</div>
          <div class="btn-row" style="margin-top:0" role="group" :aria-labelledby="'buy-label-'+c.id">
            <button class="btn" :disabled="!g.s.cash" @click="g.buy(c.id,0.1)">10%</button>
            <button class="btn" :disabled="!g.s.cash" @click="g.buy(c.id,0.25)">25%</button>
            <button class="btn btn-pri" :disabled="!g.s.cash" @click="g.buy(c.id,0.5)">50%</button>
          </div>
          <p v-if="g.s.help" class="hint" style="margin-top:6px">Buying pushes the price up the same
            way selling pushes it down — a premium that fades back toward fundamental value over a
            few days, same as a discount does.</p>
        </div>
      </template>
    </div></div>

    <div class="card"><div class="card-hd"><span class="eyebrow">Ledger</span></div>
      <div class="card-bd pt">
        <div class="dl"><dt>Sold to market</dt><dd>{{ fmt.usd(g.s.earned) }}</dd></div>
        <div class="dl"><dt>Pool fees earned</dt><dd class="pos">{{ fmt.usd(g.poolEarned) }}</dd></div>
        <div class="dl"><dt>Power paid</dt><dd class="neg">{{ fmt.usd(g.s.powerPaid) }}</dd></div>
        <div class="dl"><dt>Spent</dt><dd>{{ fmt.usd(g.s.spent) }}</dd></div>
        <div class="dl"><dt>Peak hashrate</dt><dd>{{ fmt.hash(g.s.peakHash) }}</dd></div>
        <div class="dl"><dt>Blocks solved</dt><dd>{{ g.s.blocksSolved }}</dd></div>
        <div class="dl"><dt>Orphaned</dt>
          <dd :class="g.s.orphaned?'amb':''">{{ g.s.orphaned }}</dd></div>
        <div class="dl"><dt>Rigs shed</dt><dd :class="g.s.shed?'amb':''">{{ g.s.shed }}</dd></div>
        <div class="dl" style="border-top:1px solid var(--line);margin-top:4px;padding-top:7px">
          <dt style="color:var(--ink);font-weight:600">Net to date</dt>
          <dd style="font-weight:600" :class="g.lifetimeNet>=0?'pos':'neg'">
            {{ fmt.usd(g.lifetimeNet) }}</dd></div>
      </div></div>

    <div class="card"><div class="card-hd"><span class="eyebrow">Appearance</span></div>
      <div class="card-bd">
        <div class="btn-row" style="margin-top:0">
          <button v-for="t in ['auto','light','dark']" :key="t" class="btn btn-sm"
                  :class="g.s.theme===t?'btn-pri':''" @click="g.s.theme=t">
            {{ t[0].toUpperCase()+t.slice(1) }}</button>
        </div>
        <p v-if="g.s.help" class="hint">Auto follows your device's setting.</p>
      </div></div>

    <div class="card"><div class="card-bd pt">
      <div class="btn-row" style="margin-top:0">
        <button class="btn" @click="downloadBackup">Download backup</button>
        <button class="btn" :class="importArm?'btn-pri':''" @click="pickBackup">
          {{ importArm?'Choose a file…':'Restore from backup' }}</button>
      </div>
      <input ref="fileInput" type="file" accept="application/json" style="display:none"
             @change="onBackupFile">
      <p v-if="importMsg" class="hint" :class="importMsg.startsWith('Restored')?'pos':'neg'">
        {{ importMsg }}</p>
      <button class="btn btn-ghost btn-wide" style="margin-top:8px"
              @click="g.s.wipeArm ? g.wipeSave() : g.s.wipeArm=true">
        {{ g.s.saveInfo==='erased' ? 'Erased — a new run has begun'
           : g.s.wipeArm ? 'Tap again to erase everything' : 'Erase save and start over' }}</button>
      <p class="hint">Autosaves every 30 seconds and when you leave. Offline progress is credited
        on return, up to 24 hours. A backup file is the only way to move a save between browsers
        or devices, or to keep a copy before trying something risky.</p>
    </div></div>
  </div>
</template>

<style scoped>
/* Hybrid: calm market surface */
.card-hd{padding:10px 12px 8px}
.rowline{padding:10px 12px}
.rowline .nm{font-weight:600;letter-spacing:-.01em}
</style>
