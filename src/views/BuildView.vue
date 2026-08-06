<script setup>
import { computed, onMounted, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { FRAMES, MOBOS, COOLERS } from '../data/hardware.js';
import Compare from '../components/Compare.vue';

const g = useGameStore();
const units=computed(()=>g.cards());
const mode=ref('preset');           // 'preset' | 'custom' — preset first, always
const presetFound=ref(true);
function runPreset(){ presetFound.value=g.generatePreset(); }
onMounted(()=>{ if(mode.value==='preset') runPreset(); });
function setMode(m){
  mode.value=m;
  if(m==='preset') runPreset();          // customise always opens with the preset loaded —
}                                          // switching back regenerates it fresh

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
      part:g.PART(x.frame), sub:p=>'fits '+p.slots+' · airflow '+p.air.toFixed(2)},
    {k:'mobo',label:'Board',job:'drives the cards, and burns power doing nothing',
      part:g.PART(x.mobo), sub:p=>'drives '+p.pcie+' · '+p.w+'W idle'},
    {k:'cool',label:'Cooling',job:'trades watts for card life',
      part:g.PART(x.cool), sub:p=>'÷'+p.fac.toFixed(2)+' heat · '+p.w+'W'},
    {k:'psu',label:'Supply',job:'watts and connectors',
      part:g.PART(x.psu), sub:p=>fmt.w(p.w)+' · '+p.conn+' PCIe · '+(p.eff*100).toFixed(0)+'%'},
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
  return { label:c.name+' is at its ceiling — '+fmt.pct(ceil.share,0)
             +' of it would be yours',
    fix:'Above its floor a chain pays its emission, not your hashrate: '
        +c.name+' hands out about '+fmt.usd(ceil.grossCap)
        +'/day however much you point at it, so this rig mostly divides '
        +'the same pot. Move the group to another chain and it earns on top.' };
});
const verdict=computed(()=>{
  const c=g.checks, dp=g.dp, ex=g.draftExpected;
  const gr=g.draftGroup();
  return [
    { t:'Cost & payback',
      rows:[ {k:'Parts', v:fmt.usd(dp.cost)},
             {k:'Expected on '+g.chain(gr.chain).name, v:fmt.usd2(ex.net)+'/day'},
             {k:'Expected payback', v:isFinite(ex.payback)?Math.round(ex.payback)+' days':'never'} ],
      checks:[c[5]], note:ceilingNote.value },
    { t:'Hashrate & MH/W',
      rows:[ {k:'Hashrate', v:fmt.hash(dp.mh)},
             {k:'MH/W', v:g.draftEff.toFixed(3)} ],
      checks:[c[0],c[2],c[1]] },
    { t:'Site impact',
      rows:[ {k:'Draw', v:fmt.w(dp.coreW/dp.psu.eff)} ],
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
          <span class="stepper" style="display:flex;align-items:center;border:1px solid var(--line);border-radius:8px">
            <button style="width:32px;height:32px;text-align:center"
                    @click="g.s.draft.n=Math.max(1,g.s.draft.n-1)">&minus;</button>
            <span class="num" style="min-width:24px;text-align:center">{{ g.s.draft.n }}</span>
            <button style="width:32px;height:32px;text-align:center"
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
            <div v-if="vg.note" class="chk note-chk">
              <span class="ic">!</span>
              <span>{{ vg.note.label }}<div class="fix">{{ vg.note.fix }}</div></span></div>
          </div>
        </div>
        <div class="dl"><dt>Assembly</dt><dd>{{ fmt.dur(g.buildTime) }}</dd></div>
        <button class="btn btn-wide" :class="g.canBuild?'btn-pri':''" style="margin-top:10px"
                :disabled="!g.canBuild" @click="g.build()">
          {{ g.canBuild?'Order parts · '+fmt.usd(g.dp.cost):'Fix the crosses above' }}</button>
      </div>
    </div>

    <div v-if="g.s.picker" class="sheet">
      <div class="sheet-hd">
        <button class="btn btn-sm btn-ghost" @click="g.s.picker=null">&lsaquo; Back</button>
        <span class="t">{{ FIELDS.find(f=>f.k===g.s.picker).label }} —
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
