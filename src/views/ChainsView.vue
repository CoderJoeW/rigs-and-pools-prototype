<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';
import ChainMark from '../components/ChainMark.vue';
import MyPoolCard from '../components/MyPoolCard.vue';
import ChainGem from '../components/ChainGem.vue';

/* One banner plate per chain, shot as a single sheet and cut into five so
   the set shares its lighting. Each is composed with its subject on the left
   and its right two-thirds falling to black, which is what lets it sit behind
   the card's own header without competing with the figures printed over it. */
const PLATES = import.meta.glob('../assets/chain/*-plate.webp', { eager: true, import: 'default' });
const plateOf = id => PLATES[`../assets/chain/${id}-plate.webp`];
import { CHAIN_HUE } from '../data/chains.js';

const g = useGameStore();
const open=reactive({});

/* ---- the tab's three halves -------------------------------------------
   This tab was one scroll carrying five unrelated sections: the chains, the
   pool market, the rivals in it, the pools you run, and the form to found
   another. The mockup puts a segmented control at the top, and these are the
   seams it falls along — the chains you mine, the market you compete in, and
   the business you run. Nothing moved between sections and nothing was cut;
   the scroll was only ever the reason they were hard to find. */
const SEGS=[
  {k:'chains', label:'Chains',
   icon:'M9.5 14.5 14.5 9.5M8 12l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2'},
  {k:'market', label:'Market', icon:'M4 19V5M4 19h16M8 14.5l3.5-4 3 2.5L20 8'},
  {k:'yours',  label:'Your pools',
   icon:'M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.5 4.2a3.4 3.4 0 0 1 0 6.6'},
];
const seg=ref('chains');
/* A tablist is a single tab stop with the arrows moving between tabs, so the
   roles the mockup's control implies are actually implemented rather than
   only announced: one tabindex=0 at a time, and focus follows selection. */
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
/* The (i) beside ACTIVE CHAINS. Its own flag rather than s.help: this one
   paragraph is a reference someone comes back to, and hiding it behind the
   app-wide hint preference put it out of reach of a player who had turned
   hints off precisely because they did not want them on every other row. */
const chainsInfo=ref(false);

/* ---- the chain card ---------------------------------------------------
   Everything the card states is something the simulation already computes;
   nothing here is a new number invented for the design.

   Derived once per chain in one computed rather than called from the
   template, the way FarmView already does it for the same helpers: ticks
   land ten times a second, five cards read three or four of these each, and
   groupAdvice alone walks every chain against every group against every rig.
   Called from the template that is O(chains^2 x groups x rigs) at 10Hz for
   figures that change on a block. */
const hueOf=c=>CHAIN_HUE[c.id];
/* Difficulty is a raw magnitude, not a hashrate, so it takes its own compact
   formatter rather than fmt.hash's MH/GH/TH ladder. */
const big=x=>!isFinite(x)?'—'
  :x>=1e12?(x/1e12).toFixed(2)+' T':x>=1e9?(x/1e9).toFixed(2)+' G'
  :x>=1e6?(x/1e6).toFixed(2)+' M':x>=1e3?(x/1e3).toFixed(2)+' K':x.toFixed(2);
const coins=x=>x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
/* The verdict word, in the vocabulary this tab already used as RUNNING EASY /
   RUNNING HARD tags: difficulty is retargeted from what was last seen, so a
   chain gaining hashrate runs easy until it catches up. */
const easeWord=e=> e>1.02?{k:'easy',label:'Running easy'}
                 : e<0.98?{k:'hard',label:'Running hard'}
                 : {k:'steady',label:'Steady'};
const cards=computed(()=>g.s.chains.map(c=>{
  const groups=g.s.groups.filter(x=>x.chain===c.id);
  const ease=g.easeOf(c);
  return {
    c, groups,
    // winChance IS this share — mine over the chain's total. Reaching for the
    // store's own version rather than restating the division here.
    share:g.winChance(c),
    mine:g.myHash(c),
    net:g.chainHash(c),
    diff:g.diffOf(c),
    /* What the chain itself pays out in a day: one block every `target`
       seconds, `reward` coins each. A property of the chain, not of your
       share of it. */
    emission:86400/c.target*c.reward,
    // The realized rate, not the `mult` constant: chains.js documents the two
    // diverging by ~17% once the price clamps.
    rate:g.revPerMh(c),
    ease, easeWord:easeWord(ease),
    /* The two advisories the Farm tab already raises against a group,
       restated against the chain they point at — a chain you have outgrown
       and a chain at its ceiling are facts about the chain, and this is the
       tab about chains. */
    outgrown:groups.some(gr=>g.groupAdvice(gr)),
    ceiling:g.chainCeiling(c),
    eta:g.blockETA(c), prog:g.blockProg(c),
    miners:g.s.sims.filter(m=>m.chain===c.id).length,
    pools:g.s.pools.filter(x=>x.live&&x.chain===c.id).length,
  };
}));

/* ---- solo against a pool ----------------------------------------------
   Deliberately a comparison of HOW OFTEN you are paid, not of how much. In
   this simulation a pool can never pay more per hash than solo — evMult is
   (1-fee) against solo's 1+TX_FEES — so a "pool advantage" measured in money
   would be a number that is always below 1. What a pool actually buys is
   frequency: its blocks land far more often than yours would, and every one
   of them pays you a share. That is the trade the two columns are for, and
   the hint underneath says the other half of it out loud.

   The counterfactual for hashrate that is not in a pool is the biggest live
   pool on its chain — the one it would most likely join. Hashrate on a chain
   with no pool at all contributes its solo rate to both columns, because solo
   is the only thing on offer there. */
const bestPoolOn=c=>{
  // poolHash is a full scan of the rigs, so each candidate is measured once
  // rather than the incumbent being re-measured for every comparison.
  let best=null, bestH=-1;
  for(const p of g.s.pools){
    if(!p.live||p.chain!==c.id) continue;
    const h=g.poolHash(p);
    if(h>bestH){ best=p; bestH=h; }
  }
  return best;
};
const payouts=computed(()=>{
  let solo=0, pooled=0;
  /* Gathered per pool rather than added per group: a pool's blocks pay every
     member, so it contributes once however many of your groups sit in it —
     but each of those groups still has to be counted into what the pool would
     be holding, which a dedupe-and-skip would throw away. */
  const join=new Map();
  for(const gr of g.s.groups){
    const h=g.groupHash(gr); if(h<=0) continue;
    const c=g.chain(gr.chain); if(!c) continue;
    solo+=86400*h/Math.max(1,g.diffOf(c));
    const p=gr.pool==='solo'?bestPoolOn(c):g.poolOf(gr.pool);
    // Nowhere to point it: solo is the only thing on offer on this chain, so
    // it counts the same on both sides rather than vanishing from one.
    if(!p){ pooled+=86400*h/Math.max(1,g.diffOf(c)); continue; }
    // poolHash already counts the groups that ARE in p; one you have not
    // joined would be bigger by yours, which is the comparison being made.
    join.set(p, (join.get(p)||0)+(gr.pool===p.id?0:h));
  }
  for(const [p,extra] of join)
    pooled+=86400*(g.poolHash(p)+extra)/Math.max(1,g.diffOf(g.chain(p.chain)));
  return { solo, pooled, mult: solo>0?pooled/solo:0 };
});
const spark=x=> sparkPath(Array.isArray(x)?x:x.hist, 32, 26);
const fieldMine=ref(true);
const field=computed(()=>{
  const mine=new Set(g.s.groups.map(x=>x.chain));
  return g.s.pools.filter(p=>p.live&&(!fieldMine.value||mine.has(p.chain)||p.owner==='you'))
    .slice().sort((a,b)=>g.poolHash(b)-g.poolHash(a));
});
const found=ref(false), fScheme=ref('PPLNS'), fFee=ref(0.02);
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
    <div class="pagehd">
      <h1 class="pagehd-t">Chains</h1>
      <p class="pagehd-s">Manage and monitor your mining chains.</p>
    </div>

    <div class="segbar" role="tablist" aria-label="Chains sections" @keydown="segKey">
      <button v-for="x in SEGS" :key="x.k" class="segtab" :class="{on:seg===x.k}"
              role="tab" :id="'chseg-'+x.k" :aria-controls="'chpan-'+x.k"
              :aria-selected="seg===x.k?'true':'false'"
              :tabindex="seg===x.k?0:-1" :ref="el=>{ if(el) segEl[x.k]=el }"
              @click="seg=x.k">
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path :d="x.icon"/></svg>
        <span>{{ x.label }}</span></button>
    </div>

    
    <div v-show="seg==='chains'" id="chpan-chains" role="tabpanel" aria-labelledby="chseg-chains"
         tabindex="0" class="chpanel">
    <div class="sec"><span class="eyebrow">Active chains</span>
      <button class="secinfo" :class="{on:chainsInfo}" :aria-expanded="chainsInfo?'true':'false'"
              aria-label="How chains and difficulty work" @click="chainsInfo=!chainsInfo">i</button></div>
    <p v-if="chainsInfo" class="hint chaininfo">Each chain runs a block window sized from the
      hashrate present when the block started. Finding early is luck and grows more likely as the
      window fills &mdash; it can never run past the end, so there are no droughts. Difficulty is
      retargeted on every block from what was actually seen, so it lags: a chain gaining hashrate
      runs <b>easy</b> until it catches up, one losing hashrate runs <b>hard</b>.</p>

    <div class="chainlist" data-tour="chains">
      <div v-for="x in cards" :key="x.c.id" class="card chaincard">
        <span class="cc-plate" aria-hidden="true"
              :style="{backgroundImage:'url('+plateOf(x.c.id)+')'}"></span>
        <button class="cc-tap" :aria-expanded="open[x.c.id]?'true':'false'"
                @click="open[x.c.id]=!open[x.c.id]">
          <span class="cc-hd">
            <ChainGem :chain="x.c.id" :hue="hueOf(x.c)" />
            <span class="cc-id">
              <span class="cc-nm">{{ x.c.name }}</span>
              <span class="cc-meta">
                <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 1.9"/></svg>
                Target: {{ x.c.target<60 ? x.c.target+'s' : (x.c.target/60).toFixed(0)+' min' }}
                <b class="sep" aria-hidden="true">&middot;</b>{{ x.c.tick }}
                <b class="sep" aria-hidden="true">&middot;</b>{{ x.rate.toFixed(4) }}/MH</span>
            </span>
            <span v-if="x.outgrown||x.ceiling" class="ccbadge">{{
              x.outgrown ? 'OUTGROWN' : 'AT CEILING' }}</span>
          </span>
          <span class="cc-body">
            <span class="cc-l">
              <span class="cc-k">Your hashrate share</span>
              <span class="cc-vrow">
                <span class="cc-v">{{ fmt.hash(x.mine) }}</span>
                <span class="cc-pct">{{ fmt.pct(x.share,1) }}</span></span>
              <span class="cc-bar" :class="{cap:!!x.ceiling}" aria-hidden="true">
                <i :style="{width:Math.min(100,x.share*100).toFixed(1)+'%'}"></i></span>
            </span>
            <span class="cc-r">
              <span class="cc-k">Emission / day</span>
              <span class="cc-v2">{{ coins(x.emission) }}</span>
              <span class="cc-u">{{ x.c.tick }}</span>
              <span class="cc-k cc-k2">Current difficulty</span>
              <span class="cc-v2">{{ big(x.diff) }}</span>
            </span>
          </span>
          <span class="cc-ft">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 19v-1.4a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3V19"/>
              <circle cx="9" cy="8" r="3.1"/>
              <path d="M21 19v-1.4a3 3 0 0 0-2.3-2.9M15.5 5.1a3 3 0 0 1 0 5.8"/></svg>
            {{ x.groups.length }} group{{ x.groups.length===1?'':'s' }}
            <b class="sep" aria-hidden="true">&middot;</b>
            <span class="cc-ease" :class="x.easeWord.k">{{ x.easeWord.label }}</span>
            <span class="cc-open" aria-hidden="true">{{ open[x.c.id]?'Less':'More' }}</span>
          </span>
        </button>
        <div v-if="open[x.c.id]" class="cc-more">
          <p class="note">{{ x.c.blurb }}</p>
          <!-- The block window, which the card itself has no room for: the one
               live thing on this tab, and the mechanic the note above the list
               explains. It fills toward the target and can never run past it. -->
          <div class="cc-win">
            <span class="cc-wt" :class="x.ease>1.02?'pos':x.ease<0.98?'neg':''">{{
              x.net<1 ? 'no hashrate' : x.eta<1 ? 'block due' : x.eta<60
                ? 'next block in '+x.eta.toFixed(0)+'s'
                : 'next block in '+(x.eta/60).toFixed(0)+'m' }}</span>
            <span class="cc-wb"><i :style="{width:(x.prog*100).toFixed(0)+'%'}"></i></span>
            <span class="cc-ws">{{ x.share>0 ? fmt.pct(x.share,2)+' of it yours' : 'no rigs here' }}</span>
          </div>
          <svg class="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
            <path :d="spark(x.c)" fill="none" style="stroke:var(--green)" stroke-width="1.4"
                  vector-effect="non-scaling-stroke"/></svg>
          <div class="dl"><dt>Pays</dt>
            <dd>{{ x.rate.toFixed(4) }}/MH a day
              <span class="sb">&middot; {{ fmt.usd2(g.price(x.c)) }} a coin
                &middot; base rate &times;{{ x.c.mult.toFixed(2) }}</span></dd></div>
          <div class="dl"><dt>Network</dt>
            <dd>{{ fmt.hash(x.net) }}
              <span class="sb">&middot; {{ x.miners }} miner{{ x.miners===1?'':'s' }}
                &middot; {{ x.pools }} pool{{ x.pools===1?'':'s' }}</span></dd></div>
          <div class="dl"><dt>Your hashrate</dt><dd>{{ fmt.hash(x.mine) }}</dd></div>
          <div class="dl"><dt>Your mean time to a block</dt><dd>{{ fmt.eta(g.mttb(x.c)) }}</dd></div>
          <div class="dl"><dt>Difficulty set from</dt>
            <dd>{{ fmt.hash(Math.max(x.c.floor,x.c.obs)) }}
              <span :class="x.ease>1.02?'pos':x.ease<0.98?'neg':''">
                ({{ x.ease>1?'+':'' }}{{ ((x.ease-1)*100).toFixed(0) }}% vs live)</span></dd></div>
          <div class="dl"><dt>Blocks found</dt><dd>{{ x.c.found }}</dd></div>
          <div class="dl"><dt>Price impact</dt>
            <dd :class="x.c.impact>0.01?'neg':x.c.impact<-0.01?'pos':''">
              {{ x.c.impact<0?'+':'' }}{{ fmt.pct(-x.c.impact) }}
              <span v-if="x.c.impact<-0.01" class="sb">premium from buying</span>
              <span v-else-if="x.c.impact>0.01" class="sb">discount from selling</span></dd></div>
          <div class="dl"><dt>Market</dt>
            <dd>tracks the miners
              <span v-if="g.fundOf(x.c)>g.price(x.c)*1.1" class="pos"> — rising toward {{ fmt.usd2(g.fundOf(x.c)) }}</span>
              <span v-else-if="g.fundOf(x.c)<g.price(x.c)*0.9" class="amb"> — cooling toward {{ fmt.usd2(g.fundOf(x.c)) }}</span>
              <span v-else> — near its level</span></dd></div>
        </div>
      </div>
    </div>

    <div class="sec"><span class="eyebrow">Solo vs pool</span>
      <span class="eyebrow">same hashrate, either way</span></div>
    <div class="card svp">
      <div class="svp-cols">
        <div class="svp-c">
          <div class="svp-hd"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 20v-1.6a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4V20"/>
            <circle cx="12" cy="7.5" r="3.6"/></svg>SOLO</div>
          <div class="svp-k">Your hashrate</div>
          <div class="svp-v">{{ fmt.hash(g.totalHash) }}</div>
          <div class="svp-k">Blocks / day you find</div>
          <div class="svp-v" :class="payouts.solo>0?'pos':''">{{ payouts.solo.toFixed(2) }}</div>
        </div>
        <span class="svp-vs" aria-hidden="true">VS</span>
        <div class="svp-c">
          <div class="svp-hd"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 19v-1.4a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3V19"/>
            <circle cx="9" cy="8" r="3.1"/>
            <path d="M21 19v-1.4a3 3 0 0 0-2.3-2.9M15.5 5.1a3 3 0 0 1 0 5.8"/></svg>POOL</div>
          <div class="svp-k">Your hashrate</div>
          <div class="svp-v">{{ fmt.hash(g.totalHash) }}</div>
          <div class="svp-k">Blocks / day you share in</div>
          <div class="svp-v" :class="payouts.pooled>0?'pos':''">{{ payouts.pooled.toFixed(2) }}</div>
        </div>
      </div>
      <div class="svp-ft">
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 16.5 10 10l3.5 3L20 6.5"/><path d="M15 6.5h5v5"/></svg>
        <span class="svp-ftk">Payouts land</span>
        <b class="svp-ftv" :class="payouts.mult>1?'pos':''">{{ payouts.mult>0
          ? payouts.mult.toFixed(2)+'\u00d7 as often' : '\u2014' }}</b>
      </div>
      <p v-if="g.s.help" class="hint svp-note">A pool finds blocks far more often than you would
        alone, and every one of them pays you a share &mdash; that is what this multiple counts.
        It is not more money: the share is proportional and the operator keeps a fee, so pooling
        trades a little of the rate for a lot of the wait.</p>
    </div>
    </div>

    <div v-show="seg==='market'" id="chpan-market" role="tabpanel" aria-labelledby="chseg-market"
         tabindex="0" class="chpanel">
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
          <div class="sb"><ChainMark :chain="p.chain" />{{ g.chain(p.chain).name }} ·
            {{ fmt.hash(g.poolHash(p)) }} of
            {{ fmt.hash(g.poolCapLimit(p)) }} · {{ p.found||0 }} blocks</div></span>
        <span class="rt">{{ fmt.pct(p.fee) }}
          <div class="sb">{{ fmt.pct(g.poolRep(p),0) }} rep</div></span></div>
      <div v-if="!field.length" class="rowline">
        <span class="sb">No pools running here yet.</span></div>
    </div></div>
    <p v-if="g.s.help" class="hint" style="padding:0 2px 8px">Ranked by members. Fee and reputation
      are what miners weigh; capacity is what your capital allows.</p>

    <div v-if="g.showChainsNudge" class="card" style="margin-bottom:8px;padding:10px 12px;
         background:var(--blue-t);display:flex;gap:10px;align-items:flex-start">
      <span style="flex:1;font-size:12.5px;line-height:1.5;color:var(--ink)">These {{
        g.rivalPools.length }} operators below are running real businesses — live reputation,
        fill state, a PPS/PPLNS mix — competing for the same miners you could recruit. Found a
        pool of your own further down to take them on.</span>
      <button @click="g.dismissChainsNudge()" aria-label="dismiss rival-pool nudge"
              style="flex:none;font-size:16px;line-height:1;color:var(--blue)">&times;</button>
    </div>
    <div class="sec"><span class="eyebrow">Rival detail</span>
      <span class="eyebrow">{{ g.rivalPools.length }} operators running</span></div>
    <div class="card"><div class="list">
      <button v-for="p in g.rivalPools" :key="p.id" class="rowline"
              @click="open[p.id]=!open[p.id]">
        <span style="flex:1;min-width:0"><span class="nm">{{ p.name }}</span>
          <span class="tag" style="margin-left:5px">{{ p.scheme }}</span>
          <span v-if="g.poolHash(p)>=g.poolCapLimit(p)*0.95" class="tag b"
                style="margin-left:4px">FULL</span>
          <div class="sb"><ChainMark :chain="p.chain" />{{ g.chain(p.chain).name }} ·
            {{ fmt.hash(g.poolHash(p)) }} of
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
    </div>

    <div v-show="seg==='yours'" id="chpan-yours" role="tabpanel" aria-labelledby="chseg-yours"
         tabindex="0" class="chpanel">
    <div class="sec"><span class="eyebrow">Your pools</span>
      <span class="eyebrow">{{ g.myPools.length }} running</span></div>
    <div v-if="!g.myPools.length" class="card"><div class="list">
      <div class="rowline">
        <span class="sb">None yet. Found one below and miners can point at it.</span></div>
    </div></div>
    <MyPoolCard v-for="p in g.myPools" :key="p.id" :pool="p"
                :open="!!open[p.id]" @toggle="open[p.id]=!open[p.id]" />

    <div class="card">
      <button class="rowline" @click="found=!found">
        <span style="flex:1"><span class="nm blu">+ Found a pool</span>
          <div class="sb">post a bond, set a fee, take members off the rivals</div></span>
        <span class="ch">&rsaquo;</span></button>
      <div v-if="found" class="card-bd" style="border-top:1px solid var(--line-2);padding-top:10px">
        <div class="dl"><dt>Chain</dt><dd><select v-model="fChain" style="width:auto" aria-label="Chain">
          <option v-for="c in g.s.chains" :key="c.id" :value="c.id">{{ c.name }}</option></select></dd></div>
        <div class="dl"><dt>Miners there</dt>
          <dd :class="g.simsOn(fChain)?'':'neg'">{{ g.simsOn(fChain)
            ? g.simsOn(fChain)+' on this chain to recruit from'
            : 'nobody — a pool here can only hold your own rigs' }}</dd></div>
        <div class="dl"><dt>Scheme</dt><dd><select v-model="fScheme" style="width:auto" aria-label="Scheme">
          <option value="PPLNS">PPLNS — members carry variance</option>
          <option value="PPS">PPS — you underwrite it</option></select></dd></div>
        <div class="dl"><dt>Your fee</dt><dd>{{ (fFee*100).toFixed(2) }}%</dd></div>
        <input type="range" min="0" max="0.08" step="0.0025" v-model.number="fFee" aria-label="Your fee">
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
  </div>
</template>
<style scoped>
/* The Chains tab's own chrome. The card, the pill, the .tag and the .dl rows
   still come from main.css; what lives here is the page header, the segmented
   control that splits the tab, the chain card, and the solo-against-pool
   panel. */

/* ---- section heading and its (i) ------------------------------------ */
.secinfo{flex:none;width:17px;height:17px;border-radius:50%;border:1px solid var(--line);
  display:flex;align-items:center;justify-content:center;font-size:10px;font-style:italic;
  color:var(--ink-3);line-height:1;transition:color .15s,border-color .15s}
.secinfo.on{color:var(--blue);border-color:var(--blue)}
.chaininfo{margin:0 2px 10px}

/* ---- the chain card -------------------------------------------------- */
/* The panels are v-show, not v-if: switching segments is a paint, and the
   scroll position and any card a player left open survive the round trip. */
.chpanel:focus{outline:none}
.chainlist{display:grid;gap:8px;margin-bottom:10px}
.chaincard{padding:0;overflow:hidden;position:relative;isolation:isolate}
/* The chain's own plate, bled in from the left and masked out before it
   reaches the numbers on the right. Not a full-bleed banner: the card's text
   is ink-on-card in both themes, and turning it light to sit on a photograph
   would have made these the only cards in the app that do.

   The height is the accessibility constraint, not a look. `.cc-meta` and
   `.cc-k` are 10-11px in --ink-3, which this project already runs at about
   3.1:1 on a bare card; a plate behind them dragged that to 2.6:1. Ending at
   34px keeps it above that line entirely — it sits behind the gem, which is
   opaque, and behind the name, which is 17px semibold — so those labels are
   back on plain card at exactly the contrast they had before.

   Held at --plate-a so it reads at the same strength on either ground. */
.cc-plate{position:absolute;inset:0 0 auto 0;height:34px;z-index:0;pointer-events:none;
  background-size:cover;background-position:left center;opacity:var(--plate-a);
  -webkit-mask-image:linear-gradient(100deg,#000 0%,rgba(0,0,0,.5) 40%,transparent 74%);
  mask-image:linear-gradient(100deg,#000 0%,rgba(0,0,0,.5) 40%,transparent 74%)}
.cc-tap{display:block;width:100%;text-align:left;padding:10px 12px 0;position:relative;z-index:1}
.cc-hd{display:flex;align-items:flex-start;gap:11px}
.cc-id{flex:1;min-width:0}
.cc-nm{display:block;font-size:17px;font-weight:600;letter-spacing:-.02em;line-height:1.2;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-meta{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-3);margin-top:3px}
.cc-meta .ic{flex:none;width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.7}
.sep{font-weight:400;opacity:.6;margin:0 1px}
/* An outline pill rather than main.css's filled .tag: it sits at the corner of
   a card that already carries a lit gemstone, and a solid amber block beside
   that read as a second light source. One slot, so a chain that is both
   outgrown and at its ceiling shows the sharper of the two — outgrown means
   there is somewhere better to be, which is the more actionable of them. */
.ccbadge{flex:none;padding:3px 8px;border-radius:999px;font-size:9px;font-weight:700;
  letter-spacing:.06em;border:1px solid var(--amber);color:var(--amber);white-space:nowrap}

.cc-body{display:flex;gap:12px;margin-top:9px}
.cc-l{flex:1;min-width:0}
.cc-r{flex:none;width:44%;padding-left:12px;border-left:1px solid var(--line-2)}
.cc-k{display:block;font-size:10px;color:var(--ink-3);letter-spacing:.02em}
.cc-k2{margin-top:9px}
.cc-vrow{display:flex;align-items:baseline;gap:8px;margin-top:3px}
.cc-v{font-family:var(--mono);font-size:19px;font-weight:500;letter-spacing:-.02em;
  line-height:1.2;min-width:0;overflow:hidden;text-overflow:ellipsis}
.cc-pct{flex:none;font-size:11.5px;color:var(--ink-2)}
.cc-v2{display:block;font-family:var(--mono);font-size:15px;font-weight:500;line-height:1.2;
  margin-top:2px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-u{display:block;font-size:10px;color:var(--ink-3);margin-top:1px}
.cc-bar{display:block;height:5px;border-radius:3px;background:var(--line-2);overflow:hidden;
  margin-top:7px}
.cc-bar i{display:block;height:100%;background:var(--green);
  transition:width .4s cubic-bezier(.2,.8,.2,1),background-color .2s}
/* Amber only where amber means what it means everywhere else in this app: a
   chain you have taken so much of that difficulty now answers to you, and
   pointing more hashrate at it earns nothing extra. */
.cc-bar.cap i{background:var(--amber)}

.cc-ft{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-3);
  margin-top:10px;padding:8px 0;border-top:1px solid var(--line-2)}
.cc-ft .ic{flex:none;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.cc-ease.easy{color:var(--green)}
.cc-ease.hard{color:var(--amber)}
.cc-open{margin-left:auto;color:var(--blue);font-weight:600}
.cc-more{padding:0 12px 11px;border-top:1px solid var(--line-2)}
.cc-more .note{margin-top:9px}

/* The block window: a countdown, the fill it has reached, and how much of the
   next block would be yours. */
.cc-win{margin:9px 0 4px}
.cc-wt{display:block;font-family:var(--mono);font-size:12px;font-weight:500}
.cc-wb{display:block;height:4px;border-radius:2px;background:var(--line-2);overflow:hidden;
  margin:5px 0 3px}
.cc-wb i{display:block;height:100%;background:var(--blue);transition:width .3s linear}
.cc-ws{display:block;font-size:10.5px;color:var(--ink-3)}

/* ---- solo against a pool -------------------------------------------- */
.svp{padding:0;overflow:hidden}
.svp-cols{display:flex;position:relative}
.svp-c{flex:1;min-width:0;padding:11px 12px 13px}
/* Facing edges padded to clear the VS badge, which is drawn over the seam. */
.svp-c:first-child{padding-right:26px}
.svp-c:last-child{padding-left:26px}
.svp-c+.svp-c{border-left:1px solid var(--line)}
.svp-hd{display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:700;
  letter-spacing:.09em;color:var(--ink-3);margin-bottom:9px}
.svp-hd .ic{flex:none;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.svp-k{font-size:10px;color:var(--ink-3)}
.svp-v{font-family:var(--mono);font-size:15.5px;font-weight:500;line-height:1.2;margin:2px 0 9px}
.svp-c .svp-v:last-child{margin-bottom:0}
/* The VS badge straddles the divider, so it is centred on the card rather than
   on either column. */
.svp-vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:var(--card);border:1px solid var(--line);
  font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--ink-2)}
.svp-ft{display:flex;align-items:center;gap:7px;padding:9px 12px;
  border-top:1px solid var(--line);background:var(--line-2)}
.svp-ft .ic{flex:none;width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round;color:var(--ink-3)}
.svp-ftk{flex:1;min-width:0;font-size:12px;color:var(--ink-2)}
.svp-ftv{flex:none;font-family:var(--mono);font-size:13px;font-weight:600}
.svp-note{padding:0 12px 11px;margin-top:9px}

/* Kept from the tab's previous pass: the pool rows below still lean on it. */
.rowline .nm{font-size:14.5px;font-weight:600;letter-spacing:-.02em}
.card .list .rowline{padding:11px 12px}

@media (max-width:359px){
  .cc-nm{font-size:15.5px}
  .cc-v{font-size:17px}
  /* Obelisk's emission is twelve characters; at 320px it needs the step. */
  .cc-v2{font-size:13.5px}
  .segtab{gap:5px;font-size:11.5px}
}
</style>
