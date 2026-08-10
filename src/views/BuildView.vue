<script setup>
import { computed, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt, partSub } from '../utils/format.js';
import { FRAMES, MOBOS, COOLERS } from '../data/hardware.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import { useTweenedNumber } from '../composables/useTweenedNumber.js';
import Compare from '../components/Compare.vue';

const g = useGameStore();
const units=computed(()=>g.cards());
const mode=ref('preset');           // 'preset' | 'custom' — preset first, always
const presetFound=ref(true);
function runPreset(){ presetFound.value=g.generatePreset(); }
function setMode(m){
  mode.value=m;
  if(m==='preset') runPreset();          // customise always opens with the preset loaded —
}                                          // switching back regenerates it fresh

// The preset needs to be picked BEFORE the tweened refs below read their
// starting value — otherwise they'd initialize off the default draft from
// state.js and then immediately animate to the real preset on first paint,
// a mismatch onMounted (a tick later) couldn't avoid.
if(mode.value==='preset') runPreset();

/* The verdict panel is the one readout a player actually watches while
   iterating on a build — every part swap or stepper tap changes several of
   these at once, and a flat swap-on-render reads as a spreadsheet
   recalculating rather than a build coming together. Tweened the same way
   TopBar's cash and Farm's "Net today" already are (useTweenedNumber's own
   header comment names those as the deliberately short list this opts
   into — draft numbers are the third case it's meant for: a discrete,
   player-initiated change, not an ambient value ticking in the background).
   Formatting stays exactly what it was — fmt.* is only ever handed the
   CURRENT eased value, one frame at a time. */
const costShown = useTweenedNumber(()=>g.dp.cost);
const netShown = useTweenedNumber(()=>g.draftExpected.net);
const paybackShown = useTweenedNumber(()=>g.draftExpected.payback);
const hashShown = useTweenedNumber(()=>g.dp.mh);
const effShown = useTweenedNumber(()=>g.draftEff);
const drawShown = useTweenedNumber(()=>g.dp.coreW/g.dp.psu.eff);

/* Frame and board both cap the card count, which was the confusion. The fix
   is to state each one's job in the label and to show, permanently, which of
   them is currently your limit — rather than only saying so when you exceed it. */
const cardLimit=computed(()=>{
  const f=g.PART(g.s.draft.frame), m=g.PART(g.s.draft.mobo);
  return { n:Math.min(f.slots,m.pcie),
           by: f.slots<m.pcie?'the frame':f.slots>m.pcie?'the motherboard':'both, equally',
           frame:f.slots, mobo:m.pcie };
});
/* The visual rig: one cell per physical position on the current frame.
   Filled cells are cards you've committed to; dashed/greyed cells past
   the frame-vs-board limit are positions that exist but can't be wired —
   the binding constraint as a shape, not a sentence. */
const slotCells=computed(()=>{
  const f=g.PART(g.s.draft.frame), lim=cardLimit.value.n, n=g.s.draft.n;
  return Array.from({length:f.slots},(_,i)=> i<n?'filled':i<lim?'open':'locked');
});

const FIELDS=computed(()=>{
  const x=g.s.draft;
  return [
    {k:'frame',label:'Frame',job:'holds the cards, and decides how well they breathe',
      part:g.PART(x.frame), sub:p=>partSub('frame',p)},
    {k:'mobo',label:'Board',job:'drives the cards, and burns power doing nothing',
      part:g.PART(x.mobo), sub:p=>partSub('mobo',p)},
    {k:'cool',label:'Cooling',job:'trades watts for card life',
      part:g.PART(x.cool), sub:p=>partSub('cool',p)},
    {k:'psu',label:'Supply',job:'watts and connectors',
      part:g.PART(x.psu), sub:p=>partSub('psu',p)},
    {k:'unit',label:'Cards',job:'the hashrate',
      part:g.PART(x.unit), sub:p=>p.mh+' MH · '+p.w+'W · '+(p.mh/p.w).toFixed(2)+' MH/W'},
  ];
});
const optionsFor=k=> k==='frame'?FRAMES:k==='mobo'?MOBOS
                   :k==='cool'?COOLERS:k==='psu'?g.PSUS:units.value;
const pickerRows=computed(()=>{
  const k=g.s.picker; if(!k) return [];
  const cur=g.s.draft[k], fld=FIELDS.value.find(x=>x.k===k);
  const lim=cardLimit.value;
  return optionsFor(k).map(p=>{
    const e = k==='unit' ? g.unitEcon(p) : null;
    let note='';
    if(k==='frame'){ const would=Math.min(p.slots,lim.mobo);
      note = would>lim.n ? ' · raises your limit to '+would
           : would<lim.n ? ' · drops your limit to '+would
           : ' · limit stays '+lim.n+' (the board caps you)'; }
    if(k==='mobo'){ const would=Math.min(lim.frame,p.pcie);
      note = would>lim.n ? ' · raises your limit to '+would
           : would<lim.n ? ' · drops your limit to '+would
           : ' · limit stays '+lim.n+' (the frame caps you)'; }
    return { id:p.id, name:p.name,
      sub:(fld?fld.sub(p):'')+note+(e?' · '+fmt.usd2(e.net)+'/day each':''),
      value:p.price?fmt.usd(p.price):'free',
      valueSub: e ? (isFinite(e.payback)?Math.round(e.payback)+'d payback':'never') : '',
      current:p.id===cur };
  });
});
const choose=id=>{ g.s.draft[g.s.picker]=id; g.s.picker=null; };

const pickerSheetEl=ref(null);
useSheetA11y(pickerSheetEl, computed(()=>!!g.s.picker), ()=>{ g.s.picker=null; });

/* Verdict panel, always ranked the same way: cost and payback first,
   then hashrate and efficiency, then what it costs the site. Guidance
   stays visible whether or not anything is currently wrong. */
/* Thread 32's signal, in the checker's grammar but NOT in canBuild.
   Being at a chain's ceiling is a reason to point the rig somewhere
   else, never a reason you may not build it — so it reads like a check
   and is deliberately absent from the gate. */
const ceilingNote=computed(()=>{
  const gr=g.draftGroup(), c=gr&&g.chain(gr.chain);
  const ceil=g.chainCeiling(c, g.dp.mh);
  if(!ceil) return null;
  // chainCeiling is forward-looking — it folds this not-yet-built rig's
  // hash into the gate — so the chain may currently be below its floor
  // even when the projection clears it. Tense the copy accordingly
  // (issue #25): "is at" only when the chain is already there today.
  const already=g.chainHash(c)>c.floor;
  return { tone:'warn',
    label: already
      ? c.name+' is at its ceiling — '+fmt.pct(ceil.share,0)+' of it would be yours'
      : 'This rig would put '+c.name+' at its ceiling — '+fmt.pct(ceil.share,0)+' of it would be yours',
    fix:'Above its floor a chain pays its emission, not your hashrate: '
        +c.name+' hands out about '+fmt.usd(ceil.grossCap)
        +'/day once it is at or above its floor, so this rig mostly divides '
        +'the same pot. Move the group to another chain and it earns on top.' };
});
/* Issue #6: a brand-new player's first Build-tab numbers can be a same-day
   payback worth several times the starting balance — honest, but reads as
   "this must be broken" with no context. It's real: below its floor a
   chain pays every miner the same flat rate no matter how little hash
   they bring (§1), so a first rig on an empty chain earns a rate the
   chain can't sustain once it fills.

   The flat rate is governed by diffOf's own condition (dispatch.js:
   Math.max(c.floor, c.obs)*c.target), not by raw chainHash — obs can sit
   stale-high after a brownout (more likely since #19 raised BASE_WEAR),
   in which case the chain is NOT paying the flat floor rate even while
   chainHash itself is still under the floor. Gating on chainHash alone
   both undersold that gap and, combined with an incorrect assumption
   that this was mutually exclusive with ceilingNote, silently hid the
   note in exactly the case it matters most: chainCeiling(c, dp.mh)
   projects the NEXT rig's hash forward, so right after the first rig
   lands (~192 MH, still under Tessera's 350 floor) a second rig's draft
   already reads as "at ceiling" even though the currently-quoted rate is
   still the fully undiluted flat one. Both are true at once, so both
   notes render — clarifying rather than contradicting: "you're on the
   welcome rate right now, and this next rig would end it." */
const subsidyNote=computed(()=>{
  const gr=g.draftGroup(), c=gr&&g.chain(gr.chain);
  if(!c || c.obs>c.floor) return null;
  return { tone:'good', label:c.name+' is paying a new-miner premium',
    fix:'Below its floor, '+c.name+' pays every miner the same rate regardless '
        +'of how little hash they bring — the fast payback is a deliberate '
        +'welcome gift, not a glitch. It fades as the chain fills toward its floor.' };
});
const verdict=computed(()=>{
  const c=g.checks;
  const gr=g.draftGroup();
  return [
    { t:'Cost & payback',
      rows:[ {k:'Parts', v:fmt.usd(costShown.value)},
             {k:'Expected on '+g.chain(gr.chain).name, v:fmt.usd2(netShown.value)+'/day'},
             {k:'Expected payback', v:isFinite(paybackShown.value)?Math.round(paybackShown.value)+' days':'never'} ],
      checks:[c[5]], notes:[ceilingNote.value,subsidyNote.value].filter(Boolean) },
    { t:'Hashrate & MH/W',
      rows:[ {k:'Hashrate', v:fmt.hash(hashShown.value)},
             {k:'MH/W', v:effShown.value.toFixed(3)} ],
      checks:[c[0],c[2],c[1]] },
    { t:'Site impact',
      rows:[ {k:'Draw', v:fmt.w(drawShown.value)} ],
      checks:[c[4],c[3]] },
  ];
});
</script>

<template>
  <div>
    <div class="card">
      <div class="card-hd"><span class="eyebrow">Build a rig</span>
        <span class="eyebrow">{{ g.active.name }} · {{ fmt.usd(g.s.cash) }}</span></div>

      <div class="seg2">
        <button :class="{on:mode==='preset'}" @click="setMode('preset')">Quick pick</button>
        <button :class="{on:mode==='custom'}" @click="setMode('custom')">Customise</button>
      </div>

      <div class="slotwrap">
        <div class="slotgrid">
          <div v-for="(c,i) in slotCells" :key="i" class="slotcell" :class="c">
            <span v-if="c==='filled'">&#9670;</span></div>
        </div>
        <div class="slotcap">{{ g.s.draft.n }} of {{ cardLimit.n }} usable slots filled
          <span v-if="cardLimit.frame!==cardLimit.mobo">
            &middot; {{ cardLimit.by }} caps it here; the rest of the frame is greyed out</span></div>
      </div>

      <template v-if="mode==='preset'">
        <div class="card-bd" style="padding-top:9px" v-if="presetFound">
          <div class="dl"><dt>{{ g.s.draft.n }} × {{ g.PART(g.s.draft.unit).name }}</dt>
            <dd>{{ fmt.usd(g.dp.cost) }}</dd></div>
          <p class="hint">on {{ g.PART(g.s.draft.frame).name }} · {{ g.PART(g.s.draft.mobo).name }}
            · {{ g.PART(g.s.draft.psu).name }} · {{ g.PART(g.s.draft.cool).name }}</p>
        </div>
        <div class="card-bd" v-else>
          <p class="note">Nothing fits {{ g.active.name }}'s power or floor space within
            {{ fmt.usd(g.s.cash) }} right now. Open Customise to see exactly why.</p>
        </div>
      </template>

      <template v-else>
        <button v-for="fl in FIELDS" :key="fl.k" class="pickrow" @click="g.s.picker=fl.k">
          <span class="lab">{{ fl.label }}</span>
          <span class="val"><div class="n">{{ fl.part.name }}</div>
            <div class="s" v-if="g.s.help" style="color:var(--blue)">{{ fl.job }}</div>
            <div class="s">{{ fl.sub(fl.part) }} · {{ fmt.usd(fl.part.price) }}</div></span>
          <span class="ch">&rsaquo;</span></button>

        <div class="pickrow"><span class="lab">Cards</span>
          <span class="val"><div class="n">{{ g.s.draft.n }} × {{ g.PART(g.s.draft.unit).name }}</div>
            <div class="s">Limit {{ cardLimit.n }}, set by {{ cardLimit.by }}
              <span style="color:var(--ink-3)">· frame fits {{ cardLimit.frame }},
                board drives {{ cardLimit.mobo }}</span></div>
            <div class="s">{{ g.s.draft.n }} risers · {{ fmt.usd(g.s.draft.n*g.RISER.price) }}</div></span>
          <span class="stepper">
            <button aria-label="Decrease card count" :disabled="g.s.draft.n<=1"
                    @click="g.s.draft.n=Math.max(1,g.s.draft.n-1)">&minus;</button>
            <span class="num">{{ g.s.draft.n }}</span>
            <button aria-label="Increase card count" :disabled="g.s.draft.n>=cardLimit.n"
                    @click="g.s.draft.n=Math.min(cardLimit.n,g.s.draft.n+1)">+</button></span></div>
      </template>

      <div class="card-bd" style="padding-top:9px">
        <div class="verdict">
          <div v-for="vg in verdict" :key="vg.t" class="vgroup">
            <div class="vgroup-hd"><span class="t">{{ vg.t }}</span></div>
            <div v-for="r in vg.rows" :key="r.k" class="vrow">
              <span class="k">{{ r.k }}</span><span class="v">{{ r.v }}</span></div>
            <div v-for="(c,i) in vg.checks" :key="i" class="chk" :class="c.ok?'ok':'no'">
              <span class="ic">{{ c.ok?'✓':'✗' }}</span>
              <span>{{ c.label }}<div v-if="!c.ok" class="fix">{{ c.fix }}</div></span></div>
            <div v-for="(n,i) in (vg.notes||[])" :key="'n'+i" class="chk note-chk" :class="'note-'+(n.tone||'warn')">
              <span class="ic">{{ n.tone==='good' ? '★' : '!' }}</span>
              <span>{{ n.label }}<div class="fix">{{ n.fix }}</div></span></div>
          </div>
        </div>
        <div class="dl"><dt>Assembly</dt><dd>{{ fmt.dur(g.buildTime) }}</dd></div>
        <button class="btn btn-wide" :class="g.canBuild?'btn-pri':''" style="margin-top:10px"
                data-tour="build" :disabled="!g.canBuild" @click="g.build()">
          {{ g.canBuild?'Order parts · '+fmt.usd(g.dp.cost):'Fix the crosses above' }}</button>
      </div>
    </div>

    <div v-if="g.s.picker" class="sheet" ref="pickerSheetEl" role="dialog" aria-modal="true"
         aria-labelledby="build-picker-title">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="g.s.picker=null">&lsaquo; Back</button>
        <span class="t" id="build-picker-title">{{ FIELDS.find(f=>f.k===g.s.picker).label }} —
          {{ FIELDS.find(f=>f.k===g.s.picker).job }}</span></div>
      <div class="sheet-bd">
        <Compare title="Cheapest first — more expensive is always better" metric="cost"
                 :rows="pickerRows" :pick="choose" />
        <p class="hint" style="padding:0 2px">Every ladder is monotonic: a more expensive part is better on
          every axis. What changes is value — dollars per MH worsen as you climb, so cheap parts
          win while cash is short and efficient parts win once watts are.</p>
      </div>
    </div>
  </div>
</template>
