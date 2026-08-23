<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt, partSub } from '../utils/format.js';
import { useTweenedNumber } from '../composables/useTweenedNumber.js';
import PartPickerSheet from '../components/PartPickerSheet.vue';
import PartTile from '../components/PartTile.vue';
import { rigShot } from '../utils/rigArt.js';

const g = useGameStore();
const units=computed(()=>g.cards());
const mode=ref('preset');           // 'preset' | 'custom' — preset first, always
const presetFound=ref(true);
function runPreset(){ presetFound.value=g.generatePreset(); }
// Run synchronously here, before the tweened refs below read their starting
// value — an onMounted (a tick later) would let them animate from the
// default draft to the real preset on first paint. docs/implementation-notes.md.
runPreset();
// Bulk order count. Local UI state, not on the draft — the draft stays a
// single-rig spec so generatePreset/openBuildCost/fleet-to-spec keep
// working unchanged. Clamped live to maxBuildQty.
const qty=ref(1);
const maxQty=computed(()=> g.maxBuildQty());
watch(maxQty, m=>{ if(qty.value>m) qty.value=Math.max(1,m); });
const orderCost=computed(()=> g.dp.cost*Math.min(qty.value, Math.max(1,maxQty.value||1)));
function setMode(m: string){
  mode.value=m;
  if(m==='preset') runPreset();          // customise always opens with the preset loaded —
}                                          // switching back regenerates it fresh

// Verdict panel numbers are tweened (like TopBar's cash and Farm's "Net
// today") so a part swap reads as a build coming together, not a
// spreadsheet recalculating. docs/implementation-notes.md.
const costShown = useTweenedNumber(()=>g.dp.cost);
const netShown = useTweenedNumber(()=>g.draftExpected.net);
const paybackShown = useTweenedNumber(()=>g.draftExpected.payback);
const hashShown = useTweenedNumber(()=>g.dp.mh);
const effShown = useTweenedNumber(()=>g.draftEff);
const drawShown = useTweenedNumber(()=>g.dp.wall);

// Frame and board both cap the card count: design-spec.md §6i.
const cardLimit=computed(()=>{
  const f=g.PART(g.s.draft.frame), m=g.PART(g.s.draft.mobo);
  return { n:Math.min(f.slots,m.pcie),
           by: f.slots<m.pcie?'the frame':f.slots>m.pcie?'the motherboard':'both, equally',
           frame:f.slots, mobo:m.pcie };
});
// Visual rig: one cell per physical frame position: design-spec.md §6i.
const slotCells=computed(()=>{
  const f=g.PART(g.s.draft.frame), lim=cardLimit.value.n, n=g.s.draft.n;
  return Array.from({length:f.slots},(_,i)=> i<n?'filled':i<lim?'open':'locked');
});

// `qty` is the count of that part in one rig — only the cards vary; a rig
// has exactly one frame/board/cooler/supply, so no stepper on those rows.
const FIELDS=computed(()=>{
  const x=g.s.draft, n=x.n;
  return [
    {k:'unit',label:'Cards',job:'the hashrate', qty:n,
      part:g.PART(x.unit), sub:(p:any)=>p.mh+' MH · '+p.w+'W · '+(p.mh/p.w).toFixed(2)+' MH/W'},
    {k:'frame',label:'Frame',job:'holds the cards, and decides how well they breathe', qty:1,
      part:g.PART(x.frame), sub:(p:any)=>partSub('frame',p)},
    {k:'mobo',label:'Board',job:'drives the cards, and burns power doing nothing', qty:1,
      part:g.PART(x.mobo), sub:(p:any)=>partSub('mobo',p)},
    {k:'cool',label:'Cooling',job:'trades watts for card life', qty:1,
      part:g.PART(x.cool), sub:(p:any)=>partSub('cool',p)},
    {k:'psu',label:'Supply',job:'watts and connectors', qty:1,
      part:g.PART(x.psu), sub:(p:any)=>partSub('psu',p)},
  ];
});
// Hero photo tracks the draft's frame (always the 'run' state — a preview
// of ownership, not assembly) and free positions mirrors the floor-space
// check. docs/implementation-notes.md.
const heroShot=computed(()=>rigShot(g.s.draft.frame,'run'));
const freePositions=computed(()=>{
  const f=g.active;
  return Math.max(0, g.siteSlots(f)-g.siteRigs(f).length);
});
// Deliberately site-demand-AFTER-this-rig vs capacity, not this rig's draw
// alone — the same arithmetic the power check gates on (incl. extra
// cooling), so the colour turns exactly when the check does.
const siteAfter=computed(()=>{
  const f=g.active, p=g.dp;
  const cap=g.siteCapacity(f)+g.battFirm(f);
  const coolDelta=g.sitePlantW(f, p.coreW/Math.max(0.01,p.air))-g.sitePlantW(f);
  const after=g.siteDemand(f)+p.wall+coolDelta;
  // A site with no capacity at all is over its limit, not at 0% of it —
  // returning a calm zero there would colour the stat green in the one case
  // where nothing can run.
  return { after, cap, frac: cap>0 ? after/cap : (after>0 ? Infinity : 0) };
});
// Clamps card count to the new frame/board pair's limit rather than
// leaving canBuild false with no way out but tapping "-" repeatedly. Stays
// here, not in the picker: needs cardLimit AFTER the draft changes, and a
// prop the child received is a render old by then.
const choose=(id: string)=>{
  (g.s.draft as any)[g.s.picker!]=id;
  if(g.s.draft.n>cardLimit.value.n) g.s.draft.n=cardLimit.value.n;
  g.s.picker=null;
};

// Verdict panel ranking: design-spec.md §6i. ceilingNote is thread 32's
// signal, deliberately kept out of canBuild's gate — see docs/implementation-notes.md.
const ceilingNote=computed(()=>{
  const gr=g.draftGroup(), c=gr&&g.chain(gr.chain);
  const ceil=g.chainCeiling(c as any, g.dp.mh);
  if(!ceil) return null;
  const already=g.chainHash(c!)>c!.floor;   // "is at" only when true today, not just projected — issue #25
  return { tone:'warn',
    label: already
      ? c.name+' is at its ceiling — '+fmt.pct(ceil.share,0)+' of it would be yours'
      : 'This rig would put '+c.name+' at its ceiling — '+fmt.pct(ceil.share,0)+' of it would be yours',
    fix:'Above its floor a chain pays its emission, not your hashrate: '
        +c.name+' hands out about '+fmt.usd(ceil.grossCap)
        +'/day once it is at or above its floor, so this rig mostly divides '
        +'the same pot. Move the group to another chain and it earns on top.' };
});
// Issue #6 — new-miner subsidy context, coexists with ceilingNote by design:
// docs/implementation-notes.md#build-view-verdict-panel-srcviewsbuildviewvue.
const subsidyNote=computed(()=>{
  const gr=g.draftGroup(), c=gr&&g.chain(gr.chain);
  if(!c || c.obs>c.floor) return null;
  return { tone:'good', label:c.name+' is paying a new-miner premium',
    fix:'Below its floor, '+c.name+' pays every miner the same rate regardless '
        +'of how little hash they bring — the fast payback is a deliberate '
        +'welcome gift, not a glitch. It fades as the chain fills toward its floor.' };
});
// aria-live announcement snapshotting (why draftKey AND gateKey, not a
// naive computed): docs/implementation-notes.md#build-view-verdict-panel-srcviewsbuildviewvue.
const draftKey=computed(()=> JSON.stringify(g.s.draft));
const gateKey=computed(()=> g.checks.map((c:any)=>c.ok?1:0).join('')+':'+(g.canBuild?1:0));
const buildStatus=ref('');
watch(()=> draftKey.value+'|'+gateKey.value+'|'+qty.value, ()=>{
  const n=Math.min(qty.value, Math.max(1,maxQty.value||1));
  buildStatus.value = g.canBuild
    ? (n>1
        ? 'Ready to order '+n+' rigs for '+fmt.usd(g.dp.cost*n)+'.'
        : 'Ready to order for '+fmt.usd(g.dp.cost)+'.')
    : 'Cannot build yet: '+g.checks.filter((c:any)=>!c.ok).map((c:any)=>c.label).join('; ')+'.';
}, { immediate:true });
// Quick pick's condensed-not-silent checks: docs/implementation-notes.md#build-view-verdict-panel-srcviewsbuildviewvue.
const verdict=computed(()=>{
  const c=g.checks;
  const gr=g.draftGroup();
  const notes=[ceilingNote.value,subsidyNote.value].filter((x): x is NonNullable<typeof x> => !!x);
  // Cost/hashrate/draw live on the hero; this is what's left — notes in
  // both modes, second-order figures only in Customise.
  if(mode.value==='preset') return [ { t:'', rows:[], checks:c.filter((x:any)=>!x.ok), notes } ];
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

    <div class="card bhero">
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
          <div class="u" :class="siteAfter.frac>1?'neg':siteAfter.frac>0.85?'amb':''">
            {{ siteAfter.cap>0 ? 'site at '+fmt.pct(Math.min(9.99,siteAfter.frac),0)+' after'
                               : 'site has no power' }}</div></div>
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
        <PartTile :part="fl.part.id" />
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
            <div class="bc-u">of {{ cardLimit.n }} max</div>
            <!-- Risers are priced per card and are part of dp.cost, so without
                 this the parts list no longer added up to the Cost stat. -->
            <div class="bc-u">+{{ g.s.draft.n }} risers {{ fmt.usd(g.s.draft.n*g.RISER.price) }}</div></div>
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
        ? 'all '+g.checks.length+' pass' : g.checks.filter((c: any)=>!c.ok).length+' to fix' }}</span></div>
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
    <!-- The tour's own copy says "tap Order parts below", and the tour scrolls
         its target to the middle of the screen — so the target has to be that
         button, not the hero it used to sit on, which now leaves the button a
         page below the fold. -->
    <button class="btn btn-wide btn-order buildcta" :class="g.canBuild?'btn-pri':''"
            data-tour="build" data-testid="build" :disabled="!g.canBuild" @click="g.build(qty)">
      <span class="cta-ic" aria-hidden="true"><svg viewBox="0 0 24 24">
        <circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17.5" cy="19.5" r="1.4"/>
        <path d="M2.5 3.5h3l2.6 11.2h10.3l2.1-8H6.6"/></svg></span>
      <span class="cta-tx">
        <span class="cta-t">{{ g.canBuild
          ? (qty>1 ? 'Order '+qty+' rigs' : 'Order parts') : 'Fix the crosses above' }}</span>
        <span v-if="g.canBuild" class="cta-s">{{ fmt.usd(orderCost) }}</span></span>
    </button>

    <PartPickerSheet :fields="FIELDS" :card-limit="cardLimit" :units="units" @pick="choose" />
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
