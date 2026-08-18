<script setup>
import { computed, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt, partSub } from '../utils/format.js';
import { FRAMES, MOBOS, COOLERS } from '../data/hardware.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import { useTweenedNumber } from '../composables/useTweenedNumber.js';
import Compare from '../components/Compare.vue';
import PartTile from '../components/PartTile.vue';
import heroShot from '../assets/build/hero.webp';

const g = useGameStore();
const units=computed(()=>g.cards());
const mode=ref('preset');           // 'preset' | 'custom' — preset first, always
const presetFound=ref(true);
function runPreset(){ presetFound.value=g.generatePreset(); }
// Run once, right here, before the tweened refs below read their starting
// value — otherwise they'd initialize off the default draft from state.js
// and then immediately animate to the real preset on first paint, a
// mismatch putting this in onMounted (a tick later) couldn't avoid.
runPreset();
/* Bulk order count. Local UI state, not on the draft — the draft is a
   single-rig specification and stays that way so generatePreset /
   openBuildCost / fleet-to-spec keep working unchanged. Clamped live to
   maxBuildQty so the stepper never offers more than the site can take. */
const qty=ref(1);
const maxQty=computed(()=> g.maxBuildQty());
watch(maxQty, m=>{ if(qty.value>m) qty.value=Math.max(1,m); });
const orderCost=computed(()=> g.dp.cost*Math.min(qty.value, Math.max(1,maxQty.value||1)));
function setMode(m){
  mode.value=m;
  if(m==='preset') runPreset();          // customise always opens with the preset loaded —
}                                          // switching back regenerates it fresh

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
const drawShown = useTweenedNumber(()=>g.dp.wall);

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

/* Cards first, as the mockup lists them: the cards are what the rig is for,
   and every other slot is chosen to carry them.

   `qty` is the count of that part in one rig. Only the cards vary — a rig has
   one frame, one board, one cooler and one supply, and showing a stepper on
   each row (as the mockup does) would offer a choice this simulation does not
   have. The number is stated either way, so the column still reads as a bill
   of materials. */
const FIELDS=computed(()=>{
  const x=g.s.draft, n=x.n;
  return [
    {k:'unit',label:'Cards',job:'the hashrate', qty:n,
      part:g.PART(x.unit), sub:p=>p.mh+' MH · '+p.w+'W · '+(p.mh/p.w).toFixed(2)+' MH/W'},
    {k:'frame',label:'Frame',job:'holds the cards, and decides how well they breathe', qty:1,
      part:g.PART(x.frame), sub:p=>partSub('frame',p)},
    {k:'mobo',label:'Board',job:'drives the cards, and burns power doing nothing', qty:1,
      part:g.PART(x.mobo), sub:p=>partSub('mobo',p)},
    {k:'cool',label:'Cooling',job:'trades watts for card life', qty:1,
      part:g.PART(x.cool), sub:p=>partSub('cool',p)},
    {k:'psu',label:'Supply',job:'watts and connectors', qty:1,
      part:g.PART(x.psu), sub:p=>partSub('psu',p)},
  ];
});
/* What the hero's status corner reports. Free positions is the same figure
   the floor-space check gates on, said before it becomes a cross. */
const freePositions=computed(()=>{
  const f=g.active;
  return Math.max(0, g.siteSlots(f)-g.siteRigs(f).length);
});
/* The draw stat's sub-line: what this one rig would take out of the site's
   own headroom, which is the number the power check is really about. */
const siteShare=computed(()=>{
  const f=g.active, cap=g.siteCapacity(f)+g.battFirm(f);
  return cap>0 ? g.dp.wall/cap : 0;
});
/* Fab-designed parts (data/customParts.js) sit past the top of every
   catalogue ladder rather than inside it — generatePreset's own search
   never reaches for them (see buildDraft.js's header comment on why that's
   deliberate), so the only door in is here, appended to whichever ladder
   the design's slot type matches. */
const optionsFor=k=>{
  const base=k==='frame'?FRAMES:k==='mobo'?MOBOS:k==='cool'?COOLERS:k==='psu'?g.PSUS:units.value;
  return base.concat(g.s.customParts.filter(p=>p.kind===k));
};
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
/* A narrower frame or board can leave the card count past what the new pair
   can actually wire — the slot map would read "8 of 4 usable slots filled",
   canBuild would go false, and the "+" stepper would be disabled, so the only
   way out is tapping "−" until it is legal again. Clamp instead. */
const choose=id=>{
  g.s.draft[g.s.picker]=id;
  if(g.s.draft.n>cardLimit.value.n) g.s.draft.n=cardLimit.value.n;
  g.s.picker=null;
};

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
/* Sighted users watch the checkmarks flip live while editing in Customise;
   a screen reader user gets no equivalent signal without re-reading the
   whole panel after every change. This announces the OUTCOME, built from
   checks — which, unlike costShown etc., read the real, untweened store
   directly.

   That directness is exactly why the naive version (a computed re-read on
   every render) is wrong: two of the six check labels embed live figures —
   cash (buildDraft.js's "Parts cost X, you hold Y") and site power draw —
   that drift on EVERY simulation tick, not just on a real draft edit. A
   plain computed would re-announce a fresh cash figure up to 10x/second at
   high speed while sitting unaffordable, which is worse than the tween
   spam this was written to avoid: aria-live="polite" queues every distinct
   string it's given, so that reads as an unbroken stream of stale numbers
   that blocks anything else from being announced.

   Snapshotting only on gateKey (which checks pass/fail) closes that, but
   is too coarse on its own: a part swap that changes the cost WITHOUT
   flipping any check's pass/fail state (e.g. picking a pricier frame while
   still comfortably affordable) would then never re-announce either, and
   the reader would be stuck hearing an increasingly wrong price. draftKey
   covers that other half — a snapshot of the draft's OWN fields, which
   only change on a real player edit, never on a tick. Between the two:
   draftKey changing always means the player did something; gateKey
   changing (with draftKey held still) means the WORLD moved the outcome
   out from under them, e.g. cash finally catching up to an affordable
   total while they sat idle — both are worth announcing once. A tick that
   moves neither (cash draining further under an already-failing check) is
   the only case left, and correctly announces nothing. */
const draftKey=computed(()=> JSON.stringify(g.s.draft));
const gateKey=computed(()=> g.checks.map(c=>c.ok?1:0).join('')+':'+(g.canBuild?1:0));
const buildStatus=ref('');
watch(()=> draftKey.value+'|'+gateKey.value+'|'+qty.value, ()=>{
  const n=Math.min(qty.value, Math.max(1,maxQty.value||1));
  buildStatus.value = g.canBuild
    ? (n>1
        ? 'Ready to order '+n+' rigs for '+fmt.usd(g.dp.cost*n)+'.'
        : 'Ready to order for '+fmt.usd(g.dp.cost)+'.')
    : 'Cannot build yet: '+g.checks.filter(c=>!c.ok).map(c=>c.label).join('; ')+'.';
}, { immediate:true });
/* Quick pick only ever lands on a combination generatePreset() already ran
   the FULL canBuild gate against — every check is guaranteed to pass the
   MOMENT a preset exists at all (the "nothing fits" case above is its own
   message, not a failing checklist). But that guarantee is a snapshot, not
   an invariant: presetFound only re-runs on mount or switching back into
   Quick pick (setMode), never on a tick, so cash draining or the site's
   own power/capacity shifting underneath an already-open Quick pick CAN
   make canBuild go false while nothing here re-generates. Showing zero
   checks unconditionally would leave the Order button reading "Fix the
   crosses above" with no crosses anywhere on screen — worse than the wall
   of green checkmarks this split exists to cut, since the aria-live status
   below (buildStatus, which reads g.checks directly and doesn't go through
   this computed) would still correctly announce a real failure to assistive
   tech while the visible panel had nothing to show a sighted player. So:
   checks stay empty in the common case (canBuild true) and fall back to
   the real failing ones the instant it isn't — Quick pick is condensed,
   never silent. Notes (ceiling/subsidy) stay in both modes regardless:
   those are context about the chain, not gate diagnostics — ceilingNote
   in particular never blocks canBuild at all (see its own comment above). */
const verdict=computed(()=>{
  const c=g.checks;
  const gr=g.draftGroup();
  const notes=[ceilingNote.value,subsidyNote.value].filter(Boolean);
  /* Cost, hashrate and draw moved to the hero, where the mockup puts them,
     so what is left down here is what the hero has no room for: the notes in
     both modes, and in Customise the second-order figures a player
     troubleshooting a combination actually reads. */
  if(mode.value==='preset') return [ { t:'', rows:[], checks:c.filter(x=>!x.ok), notes } ];
  return [
    { t:'Cost & payback', rows:[], checks:[c[5]], notes },
    { t:'Hashrate & MH/W', rows:[ {k:'MH/W', v:effShown.value.toFixed(3)} ],
      checks:[c[0],c[2],c[1]] },
    { t:'Site impact', rows:[ {k:'Draw', v:fmt.w(drawShown.value)} ],
      checks:[c[4],c[3]] },
  ];
});
</script>

<template>
  <div>
    <div class="pagehd">
      <h1 class="pagehd-t">Build</h1>
      <p class="pagehd-s">Design a rig, then order the parts.</p>
    </div>

    <div class="card bhero" data-tour="build">
      <div class="bh-top">
        <span class="bh-eyebrow">
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2"/>
            <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>
            </svg>
          Design <b class="sep" aria-hidden="true">&middot;</b>{{ mode==='preset' ? 'Quick pick' : 'Custom' }}</span>
        <span class="bh-free" :class="{none:!freePositions}">
          <i class="dot" :class="freePositions?'run':'bad'" aria-hidden="true"></i>
          {{ freePositions }} free position{{ freePositions===1?'':'s' }}</span>
      </div>

      <div class="bh-body">
        <img class="bh-shot" :src="heroShot" alt="" aria-hidden="true" />
        <div class="bh-id">
          <div class="bh-title">{{ g.s.draft.n }} &times; {{ g.PART(g.s.draft.unit).name }}</div>
          <div class="bh-sub">{{ g.PART(g.s.draft.frame).name }}
            <b class="sep" aria-hidden="true">/</b>{{ g.PART(g.s.draft.mobo).name }}
            <b class="sep" aria-hidden="true">/</b>{{ g.PART(g.s.draft.cool).name }}
            <b class="sep" aria-hidden="true">/</b>{{ g.PART(g.s.draft.psu).name }}</div>
        </div>
      </div>

      <!-- The mockup gives each stat a decorative glyph underneath. Each one
           carries a second real figure instead: the reading a player would
           otherwise have to work out from the first. -->
      <div class="bh-stats">
        <div class="s"><div class="k">Hashrate</div>
          <div class="v" data-stat="hash">{{ fmt.hash(hashShown) }}</div>
          <div class="u">{{ g.s.draft.n }} card{{ g.s.draft.n===1?'':'s' }}</div></div>
        <div class="s"><div class="k">Draw</div>
          <div class="v" data-stat="draw">{{ fmt.w(drawShown) }}</div>
          <div class="u" :class="siteShare>1?'neg':siteShare>0.8?'amb':''">
            {{ fmt.pct(siteShare,0) }} of the site</div></div>
        <div class="s"><div class="k">Cost</div>
          <div class="v" data-stat="cost">{{ fmt.usd(costShown) }}</div>
          <div class="u">{{ isFinite(paybackShown) ? Math.round(paybackShown)+'d payback' : 'never pays back' }}</div></div>
      </div>

      <div class="bh-exp">
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 16.5 10 10l3.5 3L20 6.5"/><path d="M15 6.5h5v5"/></svg>
        Expected <b :class="netShown>=0?'pos':'neg'">{{ fmt.usd2(netShown) }}/day</b>
        on {{ g.chain(g.draftGroup().chain).name }}
      </div>

      <!-- aria-pressed, not role="radio": the radio pattern's contract is a
           package deal with roving tabindex and arrow-key navigation, and
           claiming it without that keyboard support would be a worse lie
           than the plain toggle-button semantics used here. -->
      <div class="seg2" :class="{custom:mode==='custom'}" role="group" aria-label="Build mode">
        <button :class="{on:mode==='preset'}" :aria-pressed="mode==='preset'"
                @click="setMode('preset')">Quick pick</button>
        <button :class="{on:mode==='custom'}" :aria-pressed="mode==='custom'"
                @click="setMode('custom')">Customise</button>
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

      <div class="card-bd" v-if="mode==='preset' && !presetFound">
        <p class="note">Nothing fits {{ g.active.name }}'s power or floor space within
          {{ fmt.usd(g.s.cash) }} right now. Open Customise to see exactly why.</p>
      </div>
    </div>

    <div class="sec"><span class="eyebrow">Pick components</span>
      <span class="eyebrow">{{ mode==='preset' ? 'chosen for you' : 'tap a row to swap it' }}</span></div>
    <div class="card partlist">
      <!-- A button only where it opens something. In Quick pick the preset
           chose these, so the rows report rather than invite — the old tab
           showed nothing at all here, and "what did it pick for me" was a
           question you had to leave Quick pick to answer. -->
      <component :is="mode==='custom' ? 'button' : 'div'" v-for="fl in FIELDS" :key="fl.k"
                 class="pickrow partrow"
                 :aria-haspopup="mode==='custom' ? 'dialog' : null"
                 @click="mode==='custom' && (g.s.picker=fl.k)">
        <PartTile :slot="fl.k" />
        <span class="lab">{{ fl.label }}</span>
        <span class="val"><div class="n">{{ fl.part.name }}</div>
          <div class="s" v-if="g.s.help && mode==='custom'" style="color:var(--blue)">{{ fl.job }}</div>
          <div class="s">{{ fl.sub(fl.part) }} &middot; {{ fmt.usd(fl.part.price) }}</div></span>
        <span class="qty">&times;{{ fl.qty }}</span>
        <span v-if="mode==='custom'" class="ch">&rsaquo;</span>
      </component>
    </div>

    <div class="bgrid">
      <div class="card bcount">
        <div class="bc-k">Count
          <span class="bc-i" :title="'How many cards go in this one rig. The frame and the board '
            +'each cap it; the smaller of the two is your limit.'" role="img"
            aria-label="How many cards go in this one rig, capped by the frame and the board">i</span>
        </div>
        <div class="bc-row">
          <div><div class="bc-v">{{ g.s.draft.n }}</div>
            <div class="bc-u">of {{ cardLimit.n }} max</div></div>
          <span class="stepper">
            <button aria-label="Decrease card count"
                    :disabled="mode!=='custom'||g.s.draft.n<=1"
                    @click="g.s.draft.n=Math.max(1,g.s.draft.n-1)">&minus;</button>
            <span class="num">{{ g.s.draft.n }}</span>
            <button aria-label="Increase card count"
                    :disabled="mode!=='custom'||g.s.draft.n>=cardLimit.n"
                    @click="g.s.draft.n=Math.min(cardLimit.n,g.s.draft.n+1)">+</button></span>
        </div>
        <p v-if="mode!=='custom'" class="bc-lock">Switch to Customise to change it</p>
      </div>

      <div class="card bcount">
        <div class="bc-k">Order quantity
          <span class="bc-i" :title="'How many of this same rig to order at once. Capped by the '
            +'floor space, the power and the cash you have.'" role="img"
            aria-label="How many of this rig to order at once, capped by floor space, power and cash">i</span>
        </div>
        <div class="bc-row">
          <label class="sr-only" for="build-qty">Order quantity</label>
          <select id="build-qty" class="bc-sel" v-model.number="qty">
            <option v-for="n in Math.max(1,maxQty||1)" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <p class="bc-u">Max {{ maxQty||0 }} · floor, power and cash</p>
      </div>
    </div>

    <div v-if="maxQty>1" class="btn-row" style="grid-template-columns:1fr 1fr;margin:0 0 8px;gap:6px">
      <button class="btn btn-sm btn-ghost" :disabled="!g.canBuild||qty===maxQty"
              @click="qty=maxQty">Fill site · {{ maxQty }}</button>
      <button class="btn btn-sm btn-ghost" :disabled="!g.canBuild"
              @click="qty=Math.min(maxQty, Math.max(1, Math.floor(g.s.cash/g.dp.cost)))">
        Max cash · {{ Math.min(maxQty, Math.max(1, Math.floor(g.s.cash/g.dp.cost))) }}</button>
    </div>

    <div class="card brow">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 1.9"/></svg>
      <span class="brow-k">Assembly time</span>
      <span class="brow-v">{{ fmt.dur(g.buildTime) }}{{ qty>1?' each · parallel':'' }}</span>
    </div>

    <div class="sec"><span class="eyebrow">Pre-build checks</span>
      <span class="eyebrow" :class="g.canBuild?'okc':'noc'">{{ g.canBuild
        ? 'all '+g.checks.length+' pass' : g.checks.filter(c=>!c.ok).length+' to fix' }}</span></div>
    <div class="card checkcard">
      <div v-for="vg in verdict" :key="vg.t" class="vgroup">
        <div v-if="vg.t" class="vgroup-hd"><span class="t">{{ vg.t }}</span></div>
        <div v-for="r in vg.rows" :key="r.k" class="vrow">
          <span class="k">{{ r.k }}</span><span class="v">{{ r.v }}</span></div>
        <div v-for="(c,i) in vg.checks" :key="i" class="chk chkrow" :class="c.ok?'ok':'no'">
          <span class="ic">{{ c.ok?'✓':'✗' }}</span>
          <span class="ct">{{ c.title || c.label }}
            <div v-if="!c.ok" class="fix">{{ c.fix }}</div></span>
          <span class="cd">{{ c.label }}</span></div>
        <div v-for="(n,i) in (vg.notes||[])" :key="'n'+i" class="chk note-chk" :class="'note-'+(n.tone||'warn')">
          <span class="ic">{{ n.tone==='good' ? '★' : '!' }}</span>
          <span>{{ n.label }}<div class="fix">{{ n.fix }}</div></span></div>
      </div>
      <p v-if="mode==='preset' && g.canBuild" class="allpass">
        <span class="ic" aria-hidden="true">✓</span>
        All {{ g.checks.length }} checks pass — Quick pick only offers builds that clear them.</p>
    </div>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ buildStatus }}</p>
    <button class="btn btn-wide btn-order buildcta" :class="g.canBuild?'btn-pri':''"
            data-testid="build" :disabled="!g.canBuild" @click="g.build(qty)">
      <span class="cta-ic" aria-hidden="true"><svg viewBox="0 0 24 24">
        <circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17.5" cy="19.5" r="1.4"/>
        <path d="M2.5 3.5h3l2.6 11.2h10.3l2.1-8H6.6"/></svg></span>
      <span class="cta-tx">
        <span class="cta-t">{{ g.canBuild
          ? (qty>1 ? 'Order '+qty+' rigs' : 'Order parts') : 'Fix the crosses above' }}</span>
        <span v-if="g.canBuild" class="cta-s">{{ fmt.usd(orderCost) }}</span></span>
    </button>

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

<style scoped>
/* The Build tab's own chrome. The card, the pickrow, the stepper, the slot
   grid, the .chk list and .seg2 all still come from main.css; what lives here
   is the hero, the parts list's tile column, the two count cards, and the
   order CTA. */

/* ---- the hero -------------------------------------------------------- */
.bhero{padding:0;overflow:hidden}
.bh-top{display:flex;align-items:center;gap:8px;padding:10px 12px 0}
.bh-eyebrow{display:flex;align-items:center;gap:6px;flex:1;min-width:0;
  font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bh-eyebrow .ic{flex:none;width:13px;height:13px;fill:none;stroke:currentColor;
  stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sep{font-weight:400;opacity:.55;margin:0 1px}
.bh-free{flex:none;display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;color:var(--green)}
.bh-free.none{color:var(--red)}
.bh-free .dot{width:7px;height:7px}

.bh-body{display:flex;align-items:center;gap:13px;padding:10px 12px 0}
.bh-shot{flex:none;width:120px;height:96px;border-radius:9px;object-fit:cover;display:block;
  background:#07080a;border:1px solid #22262d}
.bh-id{flex:1;min-width:0}
.bh-title{font-size:21px;font-weight:600;letter-spacing:-.03em;line-height:1.15;
  overflow-wrap:anywhere}
.bh-sub{font-size:11px;color:var(--ink-3);margin-top:5px;line-height:1.5}
/* The slash between part names needs air on both sides or it reads as part
   of the name before it. */
.bh-sub .sep{margin:0 4px}

.bh-stats{display:grid;grid-template-columns:repeat(3,1fr);margin-top:11px;
  border-top:1px solid var(--line)}
.bh-stats .s{padding:9px 12px;border-right:1px solid var(--line-2);min-width:0}
.bh-stats .s:last-child{border-right:none}
.bh-stats .k{font-size:9px;color:var(--ink-3);letter-spacing:.05em;text-transform:uppercase}
.bh-stats .v{font-family:var(--mono);font-size:16px;font-weight:500;line-height:1.15;margin-top:3px;
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bh-stats .u{font-size:9.5px;color:var(--ink-3);margin-top:2px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bh-stats .u.amb{color:var(--amber)} .bh-stats .u.neg{color:var(--red)}

.bh-exp{display:flex;align-items:center;gap:7px;padding:8px 12px;font-size:11.5px;
  color:var(--ink-2);border-top:1px solid var(--line);background:var(--line-2)}
.bh-exp .ic{flex:none;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round;color:var(--ink-3)}
.bh-exp b{font-family:var(--mono);font-weight:600}

/* ---- the parts list --------------------------------------------------- */
.partlist{margin-bottom:10px}
.partrow{display:flex;align-items:center;gap:10px;width:100%;text-align:left;
  padding:9px 12px;border-top:1px solid var(--line-2)}
.partlist .partrow:first-child{border-top:none}
.partrow .lab{flex:none;width:52px;font-size:9.5px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--ink-3);align-self:flex-start;padding-top:2px}
.partrow .val{flex:1;min-width:0}
.partrow .val .n{font-size:13.5px;font-weight:600;letter-spacing:-.01em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.partrow .val .s{font-size:10.5px;color:var(--ink-3);margin-top:2px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* The "what this slot is for" line is a sentence, so it wraps rather than
   being cut mid-word; the spec line under it stays one line. */
.partrow .val .s:not(:last-child){white-space:normal;overflow-wrap:anywhere;line-height:1.35}
/* The per-rig count, stated rather than offered: only the cards vary, so a
   stepper on every row would be a control that does nothing on four of five. */
.partrow .qty{flex:none;font-family:var(--mono);font-size:12.5px;color:var(--ink-2)}
.partrow .ch{flex:none;color:var(--ink-3);font-size:16px;line-height:1}

/* ---- the two count cards --------------------------------------------- */
.bgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.bcount{padding:9px 11px 10px;display:flex;flex-direction:column;min-width:0}
.bc-k{display:flex;align-items:center;gap:5px;font-size:9px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--ink-3)}
.bc-i{flex:none;width:14px;height:14px;border-radius:50%;border:1px solid var(--line);
  display:flex;align-items:center;justify-content:center;font-size:9px;font-style:italic;
  font-weight:400;text-transform:none;letter-spacing:0;line-height:1}
.bc-row{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:6px;
  flex:1}
.bc-v{font-family:var(--mono);font-size:24px;font-weight:500;letter-spacing:-.03em;line-height:1}
.bc-u{font-size:9.5px;color:var(--ink-3);margin-top:3px;white-space:nowrap}
.bc-lock{font-size:9.5px;color:var(--ink-3);margin-top:6px;font-style:italic}
.bc-sel{width:100%;font:inherit;font-size:14px;padding:7px 9px;border:1px solid var(--line);
  border-radius:8px;background:var(--card);color:var(--ink)}

/* ---- one-line rows ---------------------------------------------------- */
.brow{display:flex;align-items:center;gap:9px;padding:10px 12px;margin-bottom:10px}
.brow .ic{flex:none;width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round;color:var(--ink-3)}
.brow-k{flex:1;min-width:0;font-size:12px;color:var(--ink-2)}
.brow-v{flex:none;font-family:var(--mono);font-size:12.5px;font-weight:500}

/* ---- the checklist ---------------------------------------------------- */
.eyebrow.okc{color:var(--green)} .eyebrow.noc{color:var(--red)}
.checkcard{padding:2px 12px 10px;margin-bottom:10px}
/* Claim on the left, evidence on the right — the check's own label carries
   the figures, which is what the mockup puts in its second column. */
.chkrow{align-items:flex-start;gap:9px;padding:7px 0}
.chkrow .ct{flex:1;min-width:0;font-size:12.5px;color:var(--ink)}
.chkrow.no .ct{color:var(--red)}
.chkrow .cd{flex:none;max-width:47%;font-size:10.5px;color:var(--ink-3);text-align:right;
  line-height:1.35;padding-top:1px}
.allpass{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--ink-2);
  padding:7px 0}
.allpass .ic{flex:none;color:var(--green);font-family:var(--mono);font-weight:600}

/* ---- the order button ------------------------------------------------- */
.buildcta{display:flex;align-items:center;justify-content:center;gap:11px;
  padding:12px;margin-bottom:4px}
.cta-ic{flex:none;display:flex}
.cta-ic svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.cta-tx{display:flex;flex-direction:column;align-items:center;line-height:1.2}
.cta-t{font-size:15px;font-weight:600;letter-spacing:-.01em}
.cta-s{font-family:var(--mono);font-size:11.5px;font-weight:500;opacity:.85;margin-top:2px}

@media (max-width:359px){
  .bh-shot{width:96px;height:78px}
  .bh-title{font-size:18px}
  .bh-stats .v{font-size:14px}
  .bgrid{grid-template-columns:1fr}
  .chkrow .cd{max-width:42%}
}
</style>
