<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';

const g = useGameStore();
const open=reactive({});
const spark=x=> sparkPath(Array.isArray(x)?x:x.hist, 32, 26);
const feeDraft=reactive({});
const fieldMine=ref(true);
// one table, everyone on the same axes, ranked by the thing that matters
const field=computed(()=>{
  const mine=new Set(g.s.groups.map(x=>x.chain));
  return g.s.pools.filter(p=>p.live&&(!fieldMine.value||mine.has(p.chain)||p.owner==='you'))
    .slice().sort((a,b)=>g.poolHash(b)-g.poolHash(a));
});
const found=ref(false), fScheme=ref('PPLNS'), fFee=ref(0.02);
// steps scaled to the pool's own size, so the buttons stay useful at $50 or $50,000
const bondSteps=p=>{
  const mag=Math.max(100, Math.pow(10, Math.floor(Math.log10(Math.max(100,p.bond)))));
  return [mag/10, mag, mag*5].map(x=>Math.round(x)).filter(x=>x>=10);
};
// default to the chain your rigs are on — 'tessera' was the old default and
// it is the one chain with no other miners, so every first pool was founded
// somewhere nobody could ever join
const fChain=ref((g.s.groups[0]&&g.s.groups[0].chain)||'ferro');
const bond=computed(()=>g.bondReq(g.chain(fChain.value),fScheme.value));
const projShare=computed(()=>{
  const c=g.chain(fChain.value);
  const live=g.s.pools.filter(p=>p.live&&p.chain===c.id);
  const mine=Math.max(0,1-fFee.value);
  const tot=live.reduce((a,p)=>a+Math.max(0,1-p.fee)*g.poolTrust(p),0)+mine;
  return tot>0?mine/tot:0;
});
const projMargin=computed(()=>{
  const c=g.chain(fChain.value);
  const h=c.floor*0.70*projShare.value;
  const lim = fScheme.value==='PPS' ? bond.value/(g.C.PAY*c.mult*4) : Infinity;
  return Math.min(h,lim)*g.C.PAY*c.mult*(fScheme.value==='PPS'?fFee.value+0.06:fFee.value);
});
</script>

<template>
  <div>
    <div class="sec" style="margin-top:2px"><span class="eyebrow">Chains</span>
      <span class="eyebrow">$/day per MH/s</span></div>
    <div class="card"><div class="list">
      <template v-for="c in g.s.chains" :key="c.id">
        <button class="rowline" @click="open[c.id]=!open[c.id]">
          <span style="flex:1;min-width:0"><span class="nm">{{ c.name }}</span>
            <span class="tag" style="margin-left:5px">
              {{ c.target<60 ? c.target+'s' : (c.target/60).toFixed(0)+' min' }} blocks</span>
            <span v-if="g.easeOf(c)>1.02" class="tag g" style="margin-left:3px">RUNNING EASY</span>
            <span v-else-if="g.easeOf(c)<0.98" class="tag r" style="margin-left:3px">RUNNING HARD</span>
            <span v-if="c.mult>1.1" class="tag g" style="margin-left:3px">+{{ ((c.mult-1)*100).toFixed(0) }}%</span>
            <div class="sb">{{ fmt.usd2(g.price(c)) }} · pays {{ g.revPerMh(c).toFixed(4) }}/MH
              · network {{ fmt.hash(g.chainHash(c)) }}
              · {{ g.s.sims.filter(m=>m.chain===c.id).length }} miners
              · {{ g.s.pools.filter(p=>p.live&&p.chain===c.id).length }} pools</div></span>
          <span class="cd">
            <span class="cd-t" :class="g.easeOf(c)>1.02?'pos':g.easeOf(c)<0.98?'neg':''">
              {{ g.chainHash(c)<1 ? '—' : g.blockETA(c)<1 ? 'due' : g.blockETA(c)<60
                 ? g.blockETA(c).toFixed(0)+'s' : (g.blockETA(c)/60).toFixed(0)+'m' }}</span>
            <span class="cd-bar"><i :style="{width:(g.blockProg(c)*100).toFixed(0)+'%'}"></i></span>
            <span class="cd-s">{{ g.winChance(c)>0 ? fmt.pct(g.winChance(c),2)+' yours' : 'no rigs' }}</span>
          </span>
        </button>
        <div v-if="open[c.id]" class="card-bd" style="padding-top:8px">
          <p class="note">{{ c.blurb }}</p>
          <svg class="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
            <path :d="spark(c)" fill="none" stroke="#137A55" stroke-width="1.4"
                  vector-effect="non-scaling-stroke"/></svg>
          <div class="dl"><dt>Your hashrate</dt><dd>{{ fmt.hash(g.myHash(c)) }}</dd></div>
          <div class="dl"><dt>Your mean time to a block</dt><dd>{{ fmt.eta(g.mttb(c)) }}</dd></div>
          <div class="dl"><dt>Difficulty set from</dt>
            <dd>{{ fmt.hash(Math.max(c.floor,c.obs)) }}
              <span :class="g.easeOf(c)>1.02?'pos':g.easeOf(c)<0.98?'neg':''">
                ({{ g.easeOf(c)>1?'+':'' }}{{ ((g.easeOf(c)-1)*100).toFixed(0) }}% vs live)</span></dd></div>
          <div class="dl"><dt>Blocks found</dt><dd>{{ c.found }}</dd></div>
          <div class="dl"><dt>Price impact</dt>
            <dd :class="c.impact>0.01?'neg':c.impact<-0.01?'pos':''">
              {{ c.impact<0?'+':'' }}{{ fmt.pct(-c.impact) }}
              <span v-if="c.impact<-0.01" class="sb">premium from buying</span>
              <span v-else-if="c.impact>0.01" class="sb">discount from selling</span></dd></div>
          <div class="dl"><dt>Market</dt>
            <dd>tracks the miners
              <span v-if="g.fundOf(c)>g.price(c)*1.1" class="pos"> — rising toward {{ fmt.usd2(g.fundOf(c)) }}</span>
              <span v-else-if="g.fundOf(c)<g.price(c)*0.9" class="amb"> — cooling toward {{ fmt.usd2(g.fundOf(c)) }}</span>
              <span v-else> — near its level</span></dd></div>
        </div>
      </template>
    </div></div>

    <p v-if="g.s.help" class="hint" style="margin:2px 2px 10px">Each chain runs a block window
      sized from the hashrate present when the block started. Finding early is luck and grows more
      likely as the window fills — it can never run past the end, so there are no droughts.
      Difficulty is retargeted on every block from what was actually seen, so it lags: a chain
      gaining hashrate runs <b>easy</b> until it catches up, one losing hashrate runs <b>hard</b>.</p>

    <div class="sec"><span class="eyebrow">The field</span>
      <span class="eyebrow">
        <button class="btn btn-sm btn-ghost" @click="fieldMine=!fieldMine">{{
          fieldMine?'my chains':'all chains' }}</button></span></div>
    <div class="card"><div class="list">
      <div v-for="p in field" :key="'f'+p.id" class="rowline"
           :style="p.owner==='you'?'background:var(--green-t)':''">
        <span style="flex:1;min-width:0">
          <span class="nm">{{ p.name }}</span>
          <span class="tag" :class="p.owner==='you'?'b':''" style="margin-left:5px">{{ p.scheme }}</span>
          <span v-if="p.owner==='you'" class="tag b" style="margin-left:3px">YOURS</span>
          <div class="sb">{{ g.chain(p.chain).name }} · {{ fmt.hash(g.poolHash(p)) }} of
            {{ fmt.hash(g.poolCapLimit(p)) }} · {{ p.found||0 }} blocks</div></span>
        <span class="rt">{{ fmt.pct(p.fee) }}
          <div class="sb">{{ fmt.pct(g.poolRep(p),0) }} rep</div></span></div>
      <div v-if="!field.length" class="rowline">
        <span class="sb">No pools running here yet.</span></div>
    </div></div>
    <p v-if="g.s.help" class="hint" style="padding:0 2px 8px">Ranked by members. Fee and reputation
      are what miners weigh; capacity is what your capital allows.</p>

    <div class="sec"><span class="eyebrow">Rival detail</span>
      <span class="eyebrow">{{ g.rivalPools.length }} operators running</span></div>
    <div class="card"><div class="list">
      <button v-for="p in g.rivalPools" :key="p.id" class="rowline"
              @click="open[p.id]=!open[p.id]">
        <span style="flex:1;min-width:0"><span class="nm">{{ p.name }}</span>
          <span class="tag" style="margin-left:5px">{{ p.scheme }}</span>
          <span v-if="g.poolHash(p)>=g.poolCapLimit(p)*0.95" class="tag b"
                style="margin-left:4px">FULL</span>
          <div class="sb">{{ g.chain(p.chain).name }} · {{ fmt.hash(g.poolHash(p)) }} of
            {{ fmt.hash(g.poolCapLimit(p)) }} · {{ p.found||0 }} blocks</div>
          <div v-if="open[p.id]" class="sb" style="margin-top:3px">
            reputation {{ fmt.pct(g.poolRep(p),0) }} —
            solvency {{ fmt.pct(g.repParts(p).solvency,0) }},
            age {{ fmt.pct(g.repParts(p).age,0) }},
            luck {{ fmt.pct(g.repParts(p).luck,0) }},
            steady fee {{ fmt.pct(g.repParts(p).feeStab,0) }}<br>
            backed by {{ fmt.usd(p.bond) }} of capital</div></span>
        <span class="rt">{{ fmt.pct(p.fee) }}
          <div class="sb">{{ fmt.pct(g.poolRep(p),0) }} rep</div></span></button>
      <div v-if="!g.rivalPools.length" class="rowline">
        <span class="sb">No pools running anywhere — the field is yours.</span></div>
    </div></div>
    <p v-if="g.s.help" class="hint" style="padding:0 2px 8px">There are no official pools. Every
      pool is a business with capital behind it, and that capital caps the hashrate it can carry —
      about {{ fmt.usd(g.C.PAY*4) }} per MH/s on PPS, a ninth of that on PPLNS. Reputation is
      solvency, age, blocks found and a fee that stays put.</p>

    <div class="sec"><span class="eyebrow">Your pools</span>
      <span class="eyebrow">{{ g.myPools.length }} running</span></div>
    <div v-if="!g.myPools.length" class="card"><div class="list">
      <div class="rowline">
        <span class="sb">None yet. Found one below and miners can point at it.</span></div>
    </div></div>
    <div v-for="p in g.myPools" :key="p.id" class="card">
      <button class="rig-hd" style="width:100%" @click="open[p.id]=!open[p.id]">
        <span style="flex:1;min-width:0;text-align:left">
          <span class="nm">{{ p.name }}</span>
          <span class="tag b" style="margin-left:5px">{{ p.scheme }}</span>
          <span v-if="p.capped||g.poolHash(p)>=g.poolCapLimit(p)*0.95"
                class="tag" style="background:var(--amber-t);color:var(--amber);margin-left:3px">FULL</span>
          <div class="sb">{{ g.chain(p.chain).name }} · {{ fmt.hash(g.poolHash(p)) }} of
            {{ fmt.hash(g.poolCapLimit(p)) }} · {{ p.found||0 }} blocks ·
            {{ fmt.pct(g.poolRep(p),0) }} rep</div></span>
        <span class="rt" style="text-align:right">{{ fmt.pct(p.fee) }}
          <div class="sb" :class="p.bond<p.bond0*0.4?'neg':''">bond {{ fmt.usd(p.bond) }}</div></span>
        <span style="font-size:14px;margin-left:8px">{{ open[p.id]?'−':'+' }}</span>
      </button>
      <div v-if="open[p.id]" class="card-bd">
        <div class="track"><i :class="p.bond<p.bond0*0.4?'o':'g'"
          :style="{width:Math.min(100,p.bond/p.bond0*100)+'%'}"></i></div>
        <div class="track-cap"><span>Bond against its opening size</span>
          <b>{{ fmt.pct(p.bond/p.bond0,0) }}</b></div>
        <div class="dl"><dt>Members</dt><dd>{{ fmt.hash(p.cap) }}
          <span v-if="p.capped" class="amb"> · at your bond limit</span></dd></div>
        <div v-if="g.poolTrust(p)<0.999">
          <div class="track"><i class="b" :style="{width:(g.poolTrust(p)*100).toFixed(0)+'%'}"></i></div>
          <div class="track-cap"><span>Reputation — miners commit as it fills</span>
            <b>{{ fmt.pct(g.poolTrust(p),0) }} · {{ fmt.dur(Math.max(0,
              p.born+g.TRUST_RAMP-g.s.t)) }} to go</b></div>
        </div>
        <div class="dl"><dt>Recruiting from</dt>
          <dd :class="g.simsOn(p.chain)?'':'neg'">{{ g.simsOn(p.chain)
            ? g.simsOn(p.chain)+' miners on '+g.chain(p.chain).name+', '
              +g.s.sims.filter(m=>m.pool===p.id).length+' with you'
            : 'nobody mines '+g.chain(p.chain).name }}</dd></div>
        <div class="dl"><dt>Rivals</dt><dd>{{ g.s.pools.filter(x=>x.live&&x.chain===p.chain&&x.id!==p.id)
          .map(x=>x.name.replace(g.chain(p.chain).name+' ','')+' '+fmt.pct(x.fee)).join(' · ') }}</dd></div>
        <div v-for="gr in g.s.groups.filter(x=>x.chain===p.chain&&x.pool!==p.id)" :key="gr.id"
             class="dl"><dt>Your rigs</dt>
          <dd><button class="btn btn-sm" @click="g.setGroupPool(gr,p.id)">
            Point {{ gr.name }} ({{ fmt.hash(g.groupHash(gr)) }}) here</button></dd></div>
        <div class="rigfld"><label>Bond — {{ p.scheme==='PPS'
            ? 'this is your capacity control' : 'reputation only on PPLNS' }}</label>
          <div class="dl" style="margin-top:0"><dt>Posted</dt>
            <dd class="num">{{ fmt.usd(p.bond) }}</dd></div>
          <div v-if="p.scheme==='PPS'" class="dl"><dt>Supports</dt>
            <dd>{{ fmt.hash(g.poolCapLimit(p)) }} of members
              <span class="sb">· limited by {{ g.capBinding(p) }}</span></dd></div>
          <div v-if="p.scheme==='PPS'" class="dl"><dt>Dry-spell risk</dt>
            <dd>{{ fmt.usd(g.blockValue(g.chain(p.chain))) }} a block, and this pool expects
              {{ (86400*g.poolHash(p)/Math.max(1,g.diffOf(g.chain(p.chain)))).toFixed(
                 86400*g.poolHash(p)/Math.max(1,g.diffOf(g.chain(p.chain)))<10?2:0) }} a day —
              {{ g.capBinding(p)==='dry-spell cover'
                 ? 'rare enough that cover is what caps you'
                 : 'often enough that luck barely moves you' }}</dd></div>
          <div v-else class="dl"><dt>Supports</dt>
            <dd>any amount — members carry their own variance</dd></div>
          <div v-if="p.scheme==='PPS'" class="track">
            <i :class="p.capped?'o':'g'" :style="{width:Math.min(100,
              g.poolHash(p)/Math.max(1,g.poolCapLimit(p))*100)+'%'}"></i></div>
          <div v-if="p.scheme==='PPS'" class="track-cap">
            <span>{{ fmt.hash(g.poolHash(p)) }} of {{ fmt.hash(g.poolCapLimit(p)) }} underwritten</span>
            <b v-if="p.capped" class="amb">full — add bond to grow</b></div>
          <div class="btn-row" style="margin-top:7px">
            <button v-for="a in bondSteps(p)" :key="'a'+a" class="btn btn-sm"
                    :disabled="g.s.cash<a" @click="g.addBond(p,a)">+{{ fmt.usd(a) }}</button>
            <button class="btn btn-sm" :disabled="g.s.cash<100"
                    @click="g.addBond(p,g.s.cash)">all cash</button>
          </div>
          <div class="btn-row" style="margin-top:5px">
            <button v-for="a in bondSteps(p)" :key="'r'+a" class="btn btn-sm btn-ghost"
                    :disabled="p.bond-g.bondFloor(p)<a" @click="g.releaseBond(p,a)">
              &minus;{{ fmt.usd(a) }}</button>
          </div>
          <p class="hint">{{ p.scheme==='PPS'
            ? 'Every dollar of bond underwrites members, and you cannot release below cover for the ones you already have.'
            : 'A PPLNS bond buys no capacity — it is the buffer that keeps you solvent and trusted. Releasing it lowers what you promise.' }}</p>
        </div>
        <div class="dl"><dt>Their revenue</dt>
          <dd>{{ fmt.usd(p.cap*g.C.PAY*g.chain(p.chain).mult) }}/day</dd></div>
        <div class="dl"><dt>Your margin</dt>
          <dd class="pos">{{ fmt.usd(p.cap*g.C.PAY*g.chain(p.chain).mult*
            (p.scheme==='PPS'?p.fee+0.06:p.fee)) }}/day</dd></div>
        <div class="dl"><dt>Blocks found</dt><dd>{{ p.found||0 }}</dd></div>
        <div v-if="(p.hist||[]).length>2">
          <svg viewBox="0 0 100 34" preserveAspectRatio="none"
               style="width:100%;height:40px;display:block;margin-top:6px" aria-hidden="true">
            <path :d="spark(p.hist)" fill="none" stroke="#137A55" stroke-width="1.5"
                  vector-effect="non-scaling-stroke"/></svg>
          <div class="track-cap"><span>Members, last seven days</span>
            <b :class="p.hist[p.hist.length-1]>=p.hist[0]?'pos':'neg'">{{
              p.hist[p.hist.length-1]>=p.hist[0]?'+':'' }}{{
              fmt.hash(p.hist[p.hist.length-1]-p.hist[0]) }}</b></div>
        </div>
        <div class="totals" style="margin-top:8px">
          <div><div class="k">Fee income</div>
            <div class="v">{{ fmt.usd2(g.poolPnl(p).income) }}/day</div></div>
          <div><div class="k">Capital tied up</div>
            <div class="v">{{ fmt.usd(g.poolPnl(p).capital) }}</div></div>
          <div><div class="k">Return on it</div>
            <div class="v" :class="g.poolPnl(p).roi>0.2?'pos':''">{{
              (g.poolPnl(p).roi*100).toFixed(0) }}%/yr</div></div>
          <div><div class="k">Pays for itself in</div>
            <div class="v">{{ g.poolPnl(p).payback===Infinity?'never'
              :Math.round(g.poolPnl(p).payback)+' days' }}</div></div>
        </div>
        <div v-if="g.nextTierBond(p)>0" class="dl"><dt>Turning away</dt>
          <dd class="amb">{{ fmt.hash(g.poolDemand(p)-g.poolHash(p)) }} wants in but your
            capital will not carry it</dd></div>
        <button v-if="g.nextTierBond(p)>0" class="btn btn-wide"
                :class="g.s.cash>=g.nextTierBond(p)?'btn-pri':''"
                :disabled="g.s.cash<g.nextTierBond(p)"
                @click="g.addBond(p,g.nextTierBond(p))">
          {{ g.s.cash>=g.nextTierBond(p)
             ? 'Post '+fmt.usd(g.nextTierBond(p))+' and take all '+fmt.hash(g.poolDemand(p))
             : 'Needs '+fmt.usd(g.nextTierBond(p))+' to take everyone waiting' }}</button>
        <div class="dl"><dt>Booked so far</dt>
          <dd :class="p.earned>=0?'pos':'neg'">{{ fmt.usd(p.earned) }}</dd></div>
        <div class="dl"><dt>Withdrawable</dt>
          <dd :class="g.poolProfit(p)>0?'pos':''">{{ fmt.usd(g.poolProfit(p)) }}</dd></div>
        <div v-if="p.bond<p.bond0" class="warnbox" style="margin-top:7px">
          <b>Bond below its opening size.</b> Top it up — if it reaches zero the pool cannot pay
          its miners and closes automatically, and you lose what is left.</div>
        <div class="dl"><dt>Fee</dt><dd>{{ fmt.pct(p.fee) }}
          <span class="sb"> · holding {{ fmt.hash(g.poolHash(p)) }}</span></dd></div>
        <input type="range" min="0" max="0.10" step="0.0025" :value="feeDraft[p.id]!==undefined?feeDraft[p.id]:p.fee"
               @input="feeDraft[p.id]=parseFloat($event.target.value)">
        <div v-if="feeDraft[p.id]!==undefined&&Math.abs(feeDraft[p.id]-p.fee)>0.0005"
             class="warnbox" style="margin-top:6px">
          <b>{{ (feeDraft[p.id]*100).toFixed(2) }}% would settle at
            {{ fmt.hash(g.poolProj(p,feeDraft[p.id])) }}</b>
          <span :class="g.poolProj(p,feeDraft[p.id])>g.poolHash(p)?'pos':'neg'">
            ({{ g.poolProj(p,feeDraft[p.id])>g.poolHash(p)?'+':'' }}{{
              fmt.hash(g.poolProj(p,feeDraft[p.id])-g.poolHash(p)) }})</span>
          <div class="sb" style="margin-top:3px">Changing the fee resets your fee-stability
            reputation for three days — that cost is in this figure.</div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-sm btn-pri" style="flex:1"
                    @click="g.setPoolFee(p,feeDraft[p.id]); feeDraft[p.id]=undefined">
              Move to {{ (feeDraft[p.id]*100).toFixed(2) }}%</button>
            <button class="btn btn-sm btn-ghost" @click="feeDraft[p.id]=undefined">Cancel</button>
          </div>
        </div>
        <p v-if="g.s.help" class="hint">Cut the fee to take share from the other pools; raise it to
          earn more per member. {{ p.scheme==='PPS'
            ? 'On PPS you also keep the transaction fees, but you owe members expected value whether or not blocks land — a dry spell comes out of the bond.'
            : 'On PPLNS members carry the variance, so your bond is never at risk from bad luck.' }}</p>
        <div style="display:flex;gap:6px;margin-top:9px">
          <button class="btn" :class="g.poolProfit(p)>0?'btn-pri':''" style="flex:1"
                  :disabled="g.poolProfit(p)<=0" @click="g.withdrawProfit(p)">
            Withdraw {{ fmt.usd(g.poolProfit(p)) }}</button>
          <button class="btn btn-ghost" :disabled="g.s.cash<100"
                  @click="g.topUpBond(p,Math.min(g.s.cash,Math.max(100,p.bond0-p.bond)))">
            Top up</button>
          <button class="btn btn-ghost" @click="g.closePool(p)">Close</button></div>
      </div>
    </div>

    <div class="card">
      <button class="rowline" @click="found=!found">
        <span style="flex:1"><span class="nm blu">+ Found a pool</span>
          <div class="sb">post a bond, set a fee, take members off the rivals</div></span>
        <span class="ch">&rsaquo;</span></button>
      <div v-if="found" class="card-bd" style="border-top:1px solid var(--line-2);padding-top:10px">
        <div class="dl"><dt>Chain</dt><dd><select v-model="fChain" style="width:auto">
          <option v-for="c in g.s.chains" :key="c.id" :value="c.id">{{ c.name }}</option></select></dd></div>
        <div class="dl"><dt>Miners there</dt>
          <dd :class="g.simsOn(fChain)?'':'neg'">{{ g.simsOn(fChain)
            ? g.simsOn(fChain)+' on this chain to recruit from'
            : 'nobody — a pool here can only hold your own rigs' }}</dd></div>
        <div class="dl"><dt>Scheme</dt><dd><select v-model="fScheme" style="width:auto">
          <option value="PPLNS">PPLNS — members carry variance</option>
          <option value="PPS">PPS — you underwrite it</option></select></dd></div>
        <div class="dl"><dt>Your fee</dt><dd>{{ (fFee*100).toFixed(2) }}%</dd></div>
        <input type="range" min="0" max="0.08" step="0.0025" v-model.number="fFee">
        <div class="dl"><dt>Bond required</dt>
          <dd :class="g.s.cash<bond?'neg':''">{{ fmt.usd(bond) }}</dd></div>
        <div class="dl"><dt>Likely share</dt><dd>{{ fmt.pct(projShare,0) }} of the pool market</dd></div>
        <div v-if="fScheme==='PPS'" class="dl"><dt>That bond supports</dt>
          <dd>{{ fmt.hash(bond/(g.C.PAY*g.chain(fChain).mult*4)) }} of members</dd></div>
        <div class="dl"><dt>Margin once trusted</dt><dd class="pos">{{ fmt.usd(projMargin) }}/day</dd></div>
        <p v-if="g.s.help" class="hint">PPS bonds are ten times larger because you are selling
          insurance: members are paid a flat rate per share whether or not the pool finds anything,
          and the shortfall comes out of your bond. The bond also caps how much hashrate you may
          take on — four days of cover — so growing a PPS pool means posting more capital, not
          cutting the fee. New pools take about two days to earn full trust.</p>
        <button class="btn btn-wide btn-pri" style="margin-top:9px" :disabled="g.s.cash<bond"
                @click="g.foundPool(fChain,fScheme,fFee); found=false">
          Post {{ fmt.usd(bond) }} and open</button>
      </div>
    </div>
  </div>
</template>
