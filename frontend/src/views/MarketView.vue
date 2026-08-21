<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import ChainGem from '../components/ChainGem.vue';
import { CHAIN_HUE } from '../data/chains.js';

const g = useGameStore();
const open=reactive({});
const slip=(c,f)=>Math.min(0.5,0.5*(g.s.wallet[c.id]*f)/c.depth);

// Segmented layout, same real-tablist pattern as ChainsView: docs/implementation-notes.md#chains-view-srcviewschainsviewvue.
const SEGS=[
  {k:'prices', label:'Prices', icon:'M4 19V5M4 19h16M8 14.5l3.5-4 3 2.5L20 8'},
  {k:'drip',   label:'Auto-sell',
   icon:'M12 3.5s5.5 5.4 5.5 9.2a5.5 5.5 0 0 1-11 0C6.5 8.9 12 3.5 12 3.5z'},
  {k:'ledger', label:'Ledger',
   icon:'M5 3.5h11l3 3v14H5zM9 8.5h6M9 12.5h6M9 16.5h4'},
  {k:'setup',  label:'Setup',
   icon:'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M4 12h1.6M18.4 12H20M12 4v1.6M12 18.4V20M6.3 6.3l1.1 1.1M16.6 16.6l1.1 1.1M17.7 6.3l-1.1 1.1M7.4 16.6l-1.1 1.1'},
];
const seg=ref('prices');
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

// Change is measured between the last two SAMPLES (18h apart, tick.js
// pushes one every 0.75 sim-days), not against the live price — a live
// comparison would relabel a 0-18h window as if it were always the same measurement.
const WINDOW='18h';
const coinUsd=p=> p>=1 ? fmt.usd2(p) : '$'+p.toFixed(4);   // sub-dollar coins get extra digits so a day's move isn't rounded away
// "Thin" measured against the shallowest book actually in the catalog, not
// a fixed number — a fixed depth<=400 threshold never fired (shallowest is 2470).
const thinnest=computed(()=>Math.min(...g.s.chains.map(c=>c.depth)));
const coins=computed(()=>g.s.chains.map(c=>{
  const h=c.hist||[], n=h.length;
  const prev=n>=2?h[n-2]:null;
  const chg = prev>0 ? (h[n-1]-prev)/prev : null;
  const held=g.s.wallet[c.id]||0;
  return { c, price:g.price(c), chg, held, value:held*g.price(c),
           hue:CHAIN_HUE[c.id], spark:sparkPath(h, 26, 22),
           thin:c.depth<=thinnest.value*1.5 };
}));
const walletTotal=computed(()=>coins.value.reduce((a,x)=>a+x.value,0));
/* Each coin's share of what the wallet is worth — the bar the mockup draws
   beside a holding. A wallet worth nothing has no shares to draw rather
   than five zero-width bars claiming a division that did not happen. */
const shareOf=x=>walletTotal.value>0 ? x.value/walletTotal.value : 0;

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
    <div class="pagehd">
      <h1 class="pagehd-t">Market</h1>
      <p class="pagehd-s">Prices, selling, and the books.</p>
    </div>

    <div class="segbar four" role="tablist" aria-label="Market sections" @keydown="segKey">
      <button v-for="x in SEGS" :key="x.k" class="segtab" :class="{on:seg===x.k}"
              role="tab" :id="'mkseg-'+x.k" :aria-controls="'mkpan-'+x.k"
              :aria-selected="seg===x.k?'true':'false'"
              :tabindex="seg===x.k?0:-1" :ref="el=>{ if(el) segEl[x.k]=el }"
              @click="seg=x.k">
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path :d="x.icon"/></svg>
        <span>{{ x.label }}</span></button>
    </div>

    <div v-show="seg==='prices'" id="mkpan-prices" role="tabpanel" aria-labelledby="mkseg-prices"
         tabindex="0" class="mkpanel">
      <div class="sec"><span class="eyebrow">Coin prices</span>
        <span class="eyebrow">last {{ WINDOW }}</span></div>
      <!-- A scrolling strip rather than the mockup's fixed three: there are
           five chains, and a grid that fits five at 440px would make each
           card too small to read the price on. -->
      <div class="coinstrip">
        <div v-for="x in coins" :key="x.c.id" class="card coincard">
          <div class="cc-hd">
            <ChainGem :chain="x.c.id" :hue="x.hue" class="cc-gem" />
            <div class="cc-nm">
              <div class="cc-t">{{ x.c.tick }}</div>
              <div class="cc-n">{{ x.c.name }}</div>
            </div>
          </div>
          <div class="cc-p">{{ coinUsd(x.price) }}</div>
          <div class="cc-c">
            <span v-if="x.chg===null" class="cc-chg">new</span>
            <span v-else class="cc-chg" :class="x.chg>=0?'pos':'neg'">{{
              x.chg>=0?'+':'' }}{{ fmt.pct(x.chg,2) }}</span>
            <span class="cc-w">{{ WINDOW }}</span>
          </div>
          <svg class="cc-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
            <path :d="x.spark" fill="none" stroke-width="1.3" vector-effect="non-scaling-stroke"
                  :class="x.chg===null?'':x.chg>=0?'up':'down'"/></svg>
        </div>
      </div>

      <div class="sec"><span class="eyebrow">Your holdings</span>
        <span class="eyebrow">{{ fmt.usd2(walletTotal) }} unsold</span></div>
      <div class="card holdings" data-tour="market">
        <div class="hd-head" aria-hidden="true">
          <span class="h-coin">Coin</span><span class="h-price">Price</span>
          <span class="h-exit">To exit</span><span class="h-share">Your holding</span>
        </div>
        <template v-for="x in coins" :key="x.c.id">
          <button class="holdrow" :aria-expanded="open[x.c.id]?'true':'false'"
                  @click="open[x.c.id]=!open[x.c.id]">
            <ChainGem :chain="x.c.id" :hue="x.hue" class="hr-gem" />
            <span class="hr-id">
              <span class="hr-t">{{ x.c.tick }}
                <span v-if="x.thin" class="tag d">THIN</span></span>
              <span class="hr-n">{{ x.c.name }}</span></span>
            <span class="hr-price">{{ coinUsd(x.price) }}
              <span class="hr-sub" :class="x.chg===null?'':x.chg>=0?'pos':'neg'">{{
                x.chg===null ? '—' : (x.chg>=0?'+':'')+fmt.pct(x.chg,1) }}</span></span>
            <span class="hr-exit" :class="slip(x.c,1)>0.02?'neg':''">{{ fmt.pct(slip(x.c,1)) }}</span>
            <span class="hr-share">
              <span class="hr-v">{{ fmt.c(x.held) }}</span>
              <span class="hr-bar"><i :style="{width:(shareOf(x)*100).toFixed(1)+'%'}"></i></span>
              <span class="hr-usd">{{ fmt.usd2(x.value) }}
                <span class="hr-pct">{{ x.held>0 ? fmt.pct(shareOf(x),0) : '—' }}</span></span></span>
          </button>
          <div v-if="g.s.drip.on&&x.held>0" class="track-cap holdrip">
            <span :style="g.s.hold[x.c.id]?'color:var(--amber)':''">
              {{ g.s.hold[x.c.id] ? 'Held — the drip skips it'
                 : 'Drip sells '+fmt.c(x.held*g.s.drip.frac)+' at '
                   +fmt.pct(g.dripCost(x.c))+' slippage' }}</span>
            <button class="btn btn-sm btn-ghost" @click="g.toggleHold(x.c.id)">
              {{ g.s.hold[x.c.id]?'Release':'Hold' }}</button></div>
          <div v-if="open[x.c.id]" class="card-bd holdtrade">
            <div class="eyebrow" style="margin-bottom:4px" :id="'sell-label-'+x.c.id">Sell your {{ x.c.tick }}</div>
            <div class="btn-row" style="margin-top:0" role="group" :aria-labelledby="'sell-label-'+x.c.id">
              <button class="btn" :disabled="!x.held" @click="g.sell(x.c.id,0.25)">25%</button>
              <button class="btn" :disabled="!x.held" @click="g.sell(x.c.id,0.5)">50%</button>
              <button class="btn btn-pri" :disabled="!x.held" @click="g.sell(x.c.id,1)">All</button>
            </div>
            <div class="eyebrow" style="margin:10px 0 4px" :id="'buy-label-'+x.c.id">Buy {{ x.c.tick }} with cash</div>
            <div class="btn-row" style="margin-top:0" role="group" :aria-labelledby="'buy-label-'+x.c.id">
              <button class="btn" :disabled="!g.s.cash" @click="g.buy(x.c.id,0.1)">10%</button>
              <button class="btn" :disabled="!g.s.cash" @click="g.buy(x.c.id,0.25)">25%</button>
              <button class="btn btn-pri" :disabled="!g.s.cash" @click="g.buy(x.c.id,0.5)">50%</button>
            </div>
            <p v-if="g.s.help" class="hint" style="margin-top:6px">Buying pushes the price up the same
              way selling pushes it down — a premium that fades back toward fundamental value over a
              few days, same as a discount does.</p>
          </div>
        </template>
      </div>
    </div>

    <div v-show="seg==='drip'" id="mkpan-drip" role="tabpanel" aria-labelledby="mkseg-drip"
         tabindex="0" class="mkpanel">
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
    </div>

    <div v-show="seg==='ledger'" id="mkpan-ledger" role="tabpanel" aria-labelledby="mkseg-ledger"
         tabindex="0" class="mkpanel">
      <!-- The mockup's two side-by-side panels, given the pair this tab
           actually has to put beside each other: what came in against what
           went out. -->
      <div class="ledgrid">
        <div class="card ledtile">
          <div class="lt-k">Taken in</div>
          <div class="lt-v pos">{{ fmt.usd(g.s.earned+g.poolEarned) }}</div>
          <div class="lt-u">sales and pool fees</div>
        </div>
        <div class="card ledtile">
          <div class="lt-k">Paid out</div>
          <div class="lt-v neg">{{ fmt.usd(g.s.powerPaid+g.s.spent) }}</div>
          <div class="lt-u">power and parts</div>
        </div>
      </div>
      <div class="card"><div class="card-bd pt">
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
    </div>

    <div v-show="seg==='setup'" id="mkpan-setup" role="tabpanel" aria-labelledby="mkseg-setup"
         tabindex="0" class="mkpanel">
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
  </div>
</template>

<style scoped>
/* The Market tab's own chrome. The card, the .btn-row, the .dl rows, the
   switch and the segmented control all still come from main.css; what lives
   here is the price strip, the holdings table and the ledger's two tiles. */

/* ---- the price cards -------------------------------------------------- */
/* A horizontal scroller rather than the mockup's fixed three-up grid: five
   chains across 416px would leave each card too narrow to read a price on,
   and the strip is the same gesture the filter pills use elsewhere. */
.coinstrip{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;
  margin:0 -12px 10px;padding:0 12px 2px}
.coinstrip::-webkit-scrollbar{display:none}
.coincard{flex:none;width:156px;padding:10px 11px 8px}
.cc-hd{display:flex;align-items:center;gap:8px}
.cc-gem{width:32px !important;height:32px !important;border-radius:50% !important}
.cc-nm{min-width:0}
.cc-t{font-size:13.5px;font-weight:600;letter-spacing:-.01em;line-height:1.15}
.cc-n{font-size:10px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-p{font-family:var(--mono);font-size:19px;font-weight:500;letter-spacing:-.02em;
  margin-top:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-c{display:flex;align-items:baseline;gap:6px;margin-top:2px}
/* The state colours have to be restated at this specificity: a scoped rule
   compiles with the data-v attribute on it, so a bare `.cc-chg{color:…}`
   outranks the global .pos/.neg it is meant to defer to and every change
   renders grey. The sibling .hr-exit.neg below has the same shape for the
   same reason. */
.cc-chg{font-family:var(--mono);font-size:11px;font-weight:500;color:var(--ink-3)}
.cc-chg.pos{color:var(--green)}
.cc-chg.neg{color:var(--red)}
.cc-w{margin-left:auto;font-size:9.5px;color:var(--ink-3);text-transform:uppercase;
  letter-spacing:.05em}
.cc-spark{display:block;width:100%;height:32px;margin-top:6px}
.cc-spark path{stroke:var(--ink-3)}
.cc-spark path.up{stroke:var(--green)}
.cc-spark path.down{stroke:var(--red)}

/* ---- the holdings table ------------------------------------------------ */
.holdings{padding:0;overflow:hidden}
/* One column definition, stated once and shared by the header and the rows,
   so the two cannot drift apart. */
/* The share column is minmax, not a fixed track: a seven-figure holding
   prints wider than 86px and a fixed one would have spilled it left over the
   neighbouring column. It grows out of the flexible id column, which
   truncates gracefully; the count truncates too rather than overrunning. */
.hd-head,.holdrow{display:grid;grid-template-columns:28px minmax(0,1fr) auto auto minmax(86px,auto);
  align-items:center;gap:9px;padding:8px 11px;text-align:left;width:100%}
.hd-head{font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ink-3);border-bottom:1px solid var(--line)}
.hd-head .h-coin{grid-column:2}
.hd-head .h-share{text-align:right}
.holdrow{border-top:1px solid var(--line-2)}
.holdings .holdrow:first-of-type{border-top:none}
.hr-gem{width:28px !important;height:28px !important;border-radius:50% !important}
.hr-id{min-width:0}
.hr-t{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:600;letter-spacing:-.01em}
.hr-n{display:block;font-size:9.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.hr-price{font-family:var(--mono);font-size:12.5px;text-align:right;line-height:1.2}
.hr-sub{display:block;font-size:9.5px;font-weight:500;color:var(--ink-3)}
.hr-sub.pos{color:var(--green)}
.hr-sub.neg{color:var(--red)}
.hr-exit{font-family:var(--mono);font-size:11px;color:var(--ink-3);text-align:right}
.hr-exit.neg{color:var(--red)}
.hr-share{text-align:right;min-width:0}
.hr-v{display:block;font-family:var(--mono);font-size:12.5px;font-weight:500;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hr-pct{font-size:9.5px;color:var(--ink-3);margin-left:5px}
/* The bar is decorative — the share it draws is printed as the percentage
   directly above it, inside the same button. */
.hr-bar{display:block;height:3px;border-radius:2px;background:var(--line-2);overflow:hidden;
  margin:4px 0 3px}
.hr-bar i{display:block;height:100%;background:var(--green);
  transition:width .4s cubic-bezier(.2,.8,.2,1)}
.hr-usd{display:block;font-size:9.5px;color:var(--ink-3)}
/* One line: the button is a real 44px target, so letting the text push it
   onto its own row tripled the height of every held coin. */
.holdrip{display:flex;align-items:center;gap:8px;padding:0 11px 4px;margin-top:-4px}
.holdrip>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.holdrip .btn{flex:none}
.holdtrade{border-top:1px solid var(--line-2);padding-top:8px}

/* ---- the ledger's two tiles ------------------------------------------- */
.ledgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.ledtile{padding:10px 11px 11px;min-width:0}
.lt-k{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ink-3)}
.lt-v{font-family:var(--mono);font-size:19px;font-weight:500;letter-spacing:-.02em;margin-top:4px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lt-u{font-size:9.5px;color:var(--ink-3);margin-top:2px}

.mkpanel:focus{outline:none}

@media (max-width:359px){
  .coincard{width:142px}
  .hd-head,.holdrow{grid-template-columns:24px 1fr auto 72px;gap:7px;padding:8px}
  .hd-head .h-exit,.hr-exit{display:none}
  .hr-gem{width:24px !important;height:24px !important}
}
</style>
