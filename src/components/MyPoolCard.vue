<script setup>
import { computed, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import ChainMark from './ChainMark.vue';

/* One pool you own, on the Chains tab: capacity and bond, the members you can
   point at it, the fee dial and its projection, and the close/top-up controls.

   In the view this was a v-for body whose every piece of local state was a map
   keyed by pool id — feeDraft[p.id], poolRenameOpen[p.id], poolRenameDraft[p.id].
   One card per component means those are just refs, and the keying disappears. */
const props = defineProps({
  pool: { type: Object, required: true },
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle']);

const g = useGameStore();

/* The hashrate sparkline. tick.js appends a poolHash sample to pool.hist every
   four in-game hours, so this only draws once a pool has been running a while —
   which is why the extraction lost it silently: a freshly founded pool has an
   empty hist and never reaches the branch. */
const spark = hist => sparkPath(hist, 32, 26);

/* An unset fee draft means "showing the live fee" — the projection and the
   Move/Cancel pair only appear once the player has actually moved the slider. */
const feeDraft = ref(undefined);
const renameOpen = ref(false);
const renameDraft = ref('');
const startRename = () => { renameDraft.value = props.pool.name; renameOpen.value = true; };
const saveRename = () => { g.renamePool(props.pool, renameDraft.value); renameOpen.value = false; };

/* Everything here scans every miner on the pool's chain — tens of thousands of
   them once the network has filled — and the template asked for them a dozen
   times per render between the "Turning away" line, the top-up button's four
   states and the fee projection. Through computed() each is one call, cached
   until something it actually reads moves; measured, that is the difference
   between ~90 ms and ~15 ms per render of an open card, and the fee slider
   re-renders on every input event. */
const demand = computed(() => g.poolDemand(props.pool));
const tierBond = computed(() => g.nextTierBond(props.pool));
const held = computed(() => g.poolHash(props.pool));
const pnl = computed(() => g.poolPnl(props.pool));
const feeProj = computed(() => feeDraft.value === undefined
  ? null : g.poolProj(props.pool, feeDraft.value));

/* Bond top-up / release amounts, scaled to the order of magnitude the bond is
   already at, so the buttons stay useful from $100 to $100k. */
const bondSteps = computed(() => {
  const p = props.pool;
  const mag = Math.max(100, Math.pow(10, Math.floor(Math.log10(Math.max(100, p.bond)))));
  return [mag/10, mag, mag*5].map(x => Math.round(x)).filter(x => x >= 10);
});
</script>

<template>
  <div class="card">
    <button class="rig-hd" style="width:100%" @click="emit('toggle')">
      <span style="flex:1;min-width:0;text-align:left">
        <span class="nm">{{ pool.name }}</span>
        <span class="tag b" style="margin-left:5px">{{ pool.scheme }}</span>
        <span v-if="pool.capped||held>=g.poolCapLimit(pool)*0.95"
              class="tag" style="background:var(--amber-t);color:var(--amber);margin-left:3px">FULL</span>
        <div class="sb"><ChainMark :chain="pool.chain" />{{ g.chain(pool.chain).name }} ·
          {{ fmt.hash(held) }} of
          {{ fmt.hash(g.poolCapLimit(pool)) }} · {{ pool.found||0 }} blocks ·
          {{ fmt.pct(g.poolRep(pool),0) }} rep</div></span>
      <span class="rt" style="text-align:right">{{ fmt.pct(pool.fee) }}
        <div class="sb" :class="pool.bond<pool.bond0*0.4?'neg':''">bond {{ fmt.usd(pool.bond) }}</div></span>
      <span style="font-size:14px;margin-left:8px">{{ open?'−':'+' }}</span>
    </button>
    <div v-if="open" class="card-bd">
      <template v-if="renameOpen">
        <label class="sr-only" :for="'pool-rename-'+pool.id">Pool name</label>
        <input :id="'pool-rename-'+pool.id" v-model="renameDraft" maxlength="24"
               placeholder="Pool name"
               style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;
                      font:inherit;font-size:13px;margin-bottom:6px" @keyup.enter="saveRename()">
        <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0;margin-bottom:8px">
          <button class="btn btn-ghost btn-sm" @click="renameOpen=false">Cancel</button>
          <button class="btn btn-pri btn-sm" @click="saveRename()">Save name</button>
        </div>
      </template>
      <button v-else class="btn btn-ghost btn-sm" style="margin-bottom:8px"
              :aria-label="'Rename '+pool.name" @click="startRename()">Rename</button>
      <div class="track"><i :class="pool.bond<pool.bond0*0.4?'o':'g'"
        :style="{width:Math.min(100,pool.bond/pool.bond0*100)+'%'}"></i></div>
      <div class="track-cap"><span>Bond against its opening size</span>
        <b>{{ fmt.pct(pool.bond/pool.bond0,0) }}</b></div>
      <div class="dl"><dt>Members</dt><dd>{{ fmt.hash(pool.cap) }}
        <span v-if="pool.capped" class="amb"> · at your bond limit</span></dd></div>
      <div v-if="g.poolTrust(pool)<0.999">
        <div class="track"><i class="b" :style="{width:(g.poolTrust(pool)*100).toFixed(0)+'%'}"></i></div>
        <div class="track-cap"><span>Reputation — miners commit as it fills</span>
          <b>{{ fmt.pct(g.poolTrust(pool),0) }} · {{ fmt.dur(Math.max(0,
            pool.born+g.TRUST_RAMP-g.s.t)) }} to go</b></div>
      </div>
      <div class="dl"><dt>Recruiting from</dt>
        <dd :class="g.simsOn(pool.chain)?'':'neg'">{{ g.simsOn(pool.chain)
          ? g.simsOn(pool.chain)+' miners on '+g.chain(pool.chain).name+', '
            +g.s.sims.filter(m=>m.pool===pool.id).length+' with you'
          : 'nobody mines '+g.chain(pool.chain).name }}</dd></div>
      <div class="dl"><dt>Rivals</dt><dd>{{ g.s.pools.filter(x=>x.live&&x.chain===pool.chain&&x.id!==pool.id)
        .map(x=>x.name.replace(g.chain(pool.chain).name+' ','')+' '+fmt.pct(x.fee)).join(' · ') }}</dd></div>
      <div v-for="gr in g.s.groups.filter(x=>x.chain===pool.chain&&x.pool!==pool.id)" :key="gr.id"
           class="dl"><dt>Your rigs</dt>
        <dd><button class="btn btn-sm" @click="g.setGroupPool(gr,pool.id)">
          Point {{ gr.name }} ({{ fmt.hash(g.groupHash(gr)) }}) here</button></dd></div>
      <div class="rigfld"><label>Bond — {{ pool.scheme==='PPS'
          ? 'this is your capacity control' : 'reputation only on PPLNS' }}</label>
        <div class="dl" style="margin-top:0"><dt>Posted</dt>
          <dd class="num">{{ fmt.usd(pool.bond) }}</dd></div>
        <div v-if="pool.scheme==='PPS'" class="dl"><dt>Supports</dt>
          <dd>{{ fmt.hash(g.poolCapLimit(pool)) }} of members
            <span class="sb">· limited by {{ g.capBinding(pool) }}</span></dd></div>
        <div v-if="pool.scheme==='PPS'" class="dl"><dt>Dry-spell risk</dt>
          <dd>{{ fmt.usd(g.blockValue(g.chain(pool.chain))) }} a block, and this pool expects
            {{ (86400*held/Math.max(1,g.diffOf(g.chain(pool.chain)))).toFixed(
               86400*held/Math.max(1,g.diffOf(g.chain(pool.chain)))<10?2:0) }} a day —
            {{ g.capBinding(pool)==='dry-spell cover'
               ? 'rare enough that cover is what caps you'
               : 'often enough that luck barely moves you' }}</dd></div>
        <div v-else class="dl"><dt>Supports</dt>
          <dd>any amount — members carry their own variance</dd></div>
        <div v-if="pool.scheme==='PPS'" class="track">
          <i :class="pool.capped?'o':'g'" :style="{width:Math.min(100,
            held/Math.max(1,g.poolCapLimit(pool))*100)+'%'}"></i></div>
        <div v-if="pool.scheme==='PPS'" class="track-cap">
          <span>{{ fmt.hash(held) }} of {{ fmt.hash(g.poolCapLimit(pool)) }} underwritten</span>
          <b v-if="pool.capped" class="amb">full — add bond to grow</b></div>
        <div class="btn-row" style="margin-top:7px">
          <button v-for="a in bondSteps" :key="'a'+a" class="btn btn-sm"
                  :disabled="g.s.cash<a" @click="g.addBond(pool,a)">+{{ fmt.usd(a) }}</button>
          <button class="btn btn-sm" :disabled="g.s.cash<100"
                  @click="g.addBond(pool,g.s.cash)">all cash</button>
        </div>
        <div class="btn-row" style="margin-top:5px">
          <button v-for="a in bondSteps" :key="'r'+a" class="btn btn-sm btn-ghost"
                  :disabled="pool.bond-g.bondFloor(pool)<a" @click="g.releaseBond(pool,a)">
            &minus;{{ fmt.usd(a) }}</button>
        </div>
        <p class="hint">{{ pool.scheme==='PPS'
          ? 'Every dollar of bond underwrites members, and you cannot release below cover for the ones you already have.'
          : 'A PPLNS bond buys no capacity — it is the buffer that keeps you solvent and trusted. Releasing it lowers what you promise.' }}</p>
      </div>
      <div class="dl"><dt>Their revenue</dt>
        <dd>{{ fmt.usd(pool.cap*g.C.PAY*g.chain(pool.chain).mult) }}/day</dd></div>
      <div class="dl"><dt>Your margin</dt>
        <dd class="pos">{{ fmt.usd(pool.cap*g.C.PAY*g.chain(pool.chain).mult*
          (pool.scheme==='PPS'?pool.fee+0.06:pool.fee)) }}/day</dd></div>
      <div class="dl"><dt>Blocks found</dt><dd>{{ pool.found||0 }}</dd></div>
      <div v-if="(pool.hist||[]).length>2">
        <svg viewBox="0 0 100 34" preserveAspectRatio="none"
             style="width:100%;height:40px;display:block;margin-top:6px" aria-hidden="true">
          <path :d="spark(pool.hist)" fill="none" style="stroke:var(--green)" stroke-width="1.5"
                vector-effect="non-scaling-stroke"/></svg>
        <div class="track-cap"><span>Members, last seven days</span>
          <b :class="pool.hist[pool.hist.length-1]>=pool.hist[0]?'pos':'neg'">{{
            pool.hist[pool.hist.length-1]>=pool.hist[0]?'+':'' }}{{
            fmt.hash(pool.hist[pool.hist.length-1]-pool.hist[0]) }}</b></div>
      </div>
      <div class="totals" style="margin-top:8px">
        <div><div class="k">Fee income</div>
          <div class="v">{{ fmt.usd2(pnl.income) }}/day</div></div>
        <div><div class="k">Capital tied up</div>
          <div class="v">{{ fmt.usd(pnl.capital) }}</div></div>
        <div><div class="k">Return on it</div>
          <div class="v" :class="pnl.roi>0.2?'pos':''">{{
            (pnl.roi*100).toFixed(0) }}%/yr</div></div>
        <div><div class="k">Pays for itself in</div>
          <div class="v">{{ pnl.payback===Infinity?'never'
            :Math.round(pnl.payback)+' days' }}</div></div>
      </div>
      <div v-if="tierBond>0" class="dl"><dt>Turning away</dt>
        <dd class="amb">{{ fmt.hash(demand-held) }} wants in but your
          capital will not carry it</dd></div>
      <button v-if="tierBond>0" class="btn btn-wide"
              :class="g.s.cash>=tierBond?'btn-pri':''"
              :disabled="g.s.cash<tierBond"
              @click="g.addBond(pool,tierBond)">
        {{ g.s.cash>=tierBond
           ? 'Post '+fmt.usd(tierBond)+' and take all '+fmt.hash(demand)
           : 'Needs '+fmt.usd(tierBond)+' to take everyone waiting' }}</button>
      <div class="dl"><dt>Booked so far</dt>
        <dd :class="pool.earned>=0?'pos':'neg'">{{ fmt.usd(pool.earned) }}</dd></div>
      <div class="dl"><dt>Withdrawable</dt>
        <dd :class="g.poolProfit(pool)>0?'pos':''">{{ fmt.usd(g.poolProfit(pool)) }}</dd></div>
      <div v-if="pool.bond<pool.bond0" class="warnbox" style="margin-top:7px">
        <b>Bond below its opening size.</b> Top it up — if it reaches zero the pool cannot pay
        its miners and closes automatically, and you lose what is left.</div>
      <div class="dl"><dt>Fee</dt><dd>{{ fmt.pct(pool.fee) }}
        <span class="sb"> · holding {{ fmt.hash(held) }}</span></dd></div>
      <input type="range" min="0" max="0.10" step="0.0025" :value="feeDraft!==undefined?feeDraft:pool.fee"
             :aria-label="'Fee for '+pool.name" @input="feeDraft=parseFloat($event.target.value)">
      <div v-if="feeDraft!==undefined&&Math.abs(feeDraft-pool.fee)>0.0005"
           class="warnbox" style="margin-top:6px">
        <b>{{ (feeDraft*100).toFixed(2) }}% would settle at
          {{ fmt.hash(feeProj) }}</b>
        <span :class="feeProj>held?'pos':'neg'">
          ({{ feeProj>held?'+':'' }}{{ fmt.hash(feeProj-held) }})</span>
        <div class="sb" style="margin-top:3px">Changing the fee resets your fee-stability
          reputation for three days — that cost is in this figure.</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-sm btn-pri" style="flex:1"
                  @click="g.setPoolFee(pool,feeDraft); feeDraft=undefined">
            Move to {{ (feeDraft*100).toFixed(2) }}%</button>
          <button class="btn btn-sm btn-ghost" @click="feeDraft=undefined">Cancel</button>
        </div>
      </div>
      <p v-if="g.s.help" class="hint">Cut the fee to take share from the other pools; raise it to
        earn more per member. {{ pool.scheme==='PPS'
          ? 'On PPS you also keep the transaction fees, but you owe members expected value whether or not blocks land — a dry spell comes out of the bond.'
          : 'On PPLNS members carry the variance, so your bond is never at risk from bad luck.' }}</p>
      <div style="display:flex;gap:6px;margin-top:9px">
        <button class="btn" :class="g.poolProfit(pool)>0?'btn-pri':''" style="flex:1"
                :disabled="g.poolProfit(pool)<=0" @click="g.withdrawProfit(pool)">
          Withdraw {{ fmt.usd(g.poolProfit(pool)) }}</button>
        <button class="btn btn-ghost" :disabled="g.s.cash<100"
                @click="g.topUpBond(pool,Math.min(g.s.cash,Math.max(100,pool.bond0-pool.bond)))">
          Top up</button>
        <button class="btn btn-ghost" :aria-label="'Close '+pool.name" @click="g.closePool(pool)">Close</button></div>
    </div>
  </div>
</template>
