<script setup lang="ts">
import { computed, type PropType } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import ChainMark from './ChainMark.vue';
import { useInlineRename } from '../composables/useInlineRename.js';
import type { Group, GroupAdvice, ChainCeiling } from '../game/types.js';

// One mining group row on the Farm tab: name, chain/pool, rack share, advice.
// Extracted from a v-for body so rename state can be plain refs per group.
const props = defineProps({
  gr: { type: Object as PropType<Group>, required: true },
  advice: { type: Object as PropType<GroupAdvice | null>, default: null },
  ceiling: { type: Object as PropType<ChainCeiling | null>, default: null },
  totalSlots: { type: Number, default: 0 },  // racks across every site — this group's share denominator
});

const g = useGameStore();

const { open:renameOpen, draft:renameDraft, start:startRename, commit:saveRename } =
  useInlineRename(() => props.gr.name, name => g.renameGroup(props.gr, name));

const poolLabel = computed(() => { const p = g.poolOf(props.gr.pool); return p ? p.name : 'Solo'; });
</script>

<template>
  <div class="grp">
    <template v-if="renameOpen">
      <label class="sr-only" :for="'group-rename-'+gr.id">Group name</label>
      <input :id="'group-rename-'+gr.id" v-model="renameDraft" maxlength="24"
             placeholder="Group name" class="group-rename-input"
             @keyup.enter="saveRename()">
      <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:0">
        <button class="btn btn-ghost btn-sm" @click="renameOpen=false">Cancel</button>
        <button class="btn btn-pri btn-sm" @click="saveRename()">Save name</button>
      </div>
    </template>
    <template v-else>
      <div class="grp-hd">
        <b class="grp-nm"><ChainMark :chain="gr.chain" />{{ gr.name }}</b>
        <button class="grp-rn"
                :aria-label="'Rename '+gr.name" @click="startRename()">Rename</button>
      </div>
      <div class="grp-strip">
        <!-- The real <select> stays in the DOM, stretched invisibly over
             the pill: the picker keeps its native sheet, its keyboard
             behaviour and its label, and the pill is only the skin. -->
        <label class="gsel">
          <span class="gsel-ico" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M10 13.8a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7"/>
            <path d="M14 10.2a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7"/>
            </svg></span>
          <span class="gsel-txt"><span class="gsel-k">Chain</span>
            <span class="gsel-v">{{ g.chain(gr.chain)!.name }}</span></span>
          <span class="gsel-cv" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6"/></svg></span>
          <select class="gsel-native" :value="gr.chain" :aria-label="'Chain for '+gr.name"
                  @change="g.setGroupChain(gr,($event.target as HTMLSelectElement).value)">
            <option v-for="c in g.s.chains" :key="c.id" :value="c.id">
              {{ c.name }} — {{ c.target<60?c.target+'s':(c.target/60)+' min' }} blocks</option>
          </select>
        </label>
        <label class="gsel">
          <span class="gsel-ico" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="M4 17c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2"/>
            <path d="M4 21c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2"/>
            <path d="M12 3 8 9h8z"/></svg></span>
          <span class="gsel-txt"><span class="gsel-k">Pool</span>
            <span class="gsel-v">{{ poolLabel }}</span></span>
          <span class="gsel-cv" aria-hidden="true"><svg viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6"/></svg></span>
          <select class="gsel-native" :value="gr.pool" :aria-label="'Pool for '+gr.name"
                  @change="g.setGroupPool(gr,($event.target as HTMLSelectElement).value)">
            <option value="solo">Solo — whole reward</option>
            <optgroup label="Rival pools">
              <option v-for="p in g.s.pools.filter(x=>x.live&&x.chain===gr.chain&&x.owner!=='you')"
                      :key="p.id" :value="p.id">{{ p.name }} — {{ p.scheme }}
                {{ fmt.pct(p.fee) }}</option></optgroup>
            <optgroup v-if="g.s.pools.some(x=>x.live&&x.chain===gr.chain&&x.owner==='you')"
                      label="Your pools">
              <option v-for="p in g.s.pools.filter(x=>x.live&&x.chain===gr.chain&&x.owner==='you')"
                      :key="p.id" :value="p.id">{{ p.name }} — {{ p.scheme }}
                {{ fmt.pct(p.fee) }}</option></optgroup>
          </select>
        </label>
        <div class="gstat"><span class="gk">Hashrate</span>
          <span class="gv">{{ fmt.hash(g.groupHash(gr)) }}</span>
          <span v-if="advice" class="tag r gtag">OUTGROWN</span>
          <span v-else-if="ceiling" class="tag d gtag">AT CEILING</span></div>
        <div class="gstat"><span class="gk">Capacity</span>
          <span class="gv">{{ g.groupRigs(gr).length }} / {{ totalSlots }} racks</span></div>
      </div>
    </template>
    <p v-if="advice" class="hint" style="margin:8px 0 0;color:var(--amber)">
      You are {{ fmt.pct(advice.share,0) }} of {{ g.chain(gr.chain)!.name }} —
      above the floor a chain pays its emission, not your hashrate.
      {{ advice.alt }} would pay about
      {{ advice.mult.toFixed(1) }}&times; per MH, even after your hash raises
      its difficulty.</p>
    <p v-else-if="ceiling" class="hint"
       style="margin:8px 0 0;color:var(--amber)">
      You are {{ fmt.pct(ceiling.share,0) }} of
      {{ g.chain(gr.chain)!.name }} — above the floor a chain pays its emission, not your
      hashrate. It hands out about
      {{ fmt.usd(ceiling.grossCap) }}/day however much you point
      at it, so more rigs here divide the same pot. No other chain currently pays enough
      more to be worth the move, so growth has to come from a second group on another
      chain, or from a pool.</p>
    <div class="track-cap grp-foot">
      <span>{{ g.groupHash(gr)>0
        ? 'Next '+g.chain(gr.chain)!.name+' block: '
          +fmt.pct(Math.min(1,g.groupHash(gr)/Math.max(1,g.chainHash(g.chain(gr.chain)!))),0)+' yours'
        : 'No live rigs pointed here' }}</span>
      <b v-if="gr.pending>0" class="amb">{{ fmt.c(gr.pending) }}
        {{ g.chain(gr.chain)!.tick }} in the window</b>
      <button v-else-if="g.s.groups.length>1&&!g.groupRigs(gr).length"
              class="btn btn-sm btn-ghost" @click="g.dropGroup(gr)">Disband</button>
    </div>
  </div>
</template>

<style scoped>
/* ---- Mining groups ---- */
/* A group is a row in the card, not a card inside a card — one strip per
   group, divided from the next by a rule. */
.grp{
  padding:10px 12px 11px;
  border-top:1px solid var(--line-2);
}
.grp:first-child{border-top:none}
.grp-hd{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.grp-nm{
  flex:1;min-width:0;
  font-size:12.5px;font-weight:600;letter-spacing:-.01em;
  color:var(--ink-2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.grp-rn{flex:none;font-size:10.5px;font-weight:500;color:var(--blue);padding:2px 3px}
/* Chain and pool are pickers and carry a border; hashrate and capacity are
   readouts and carry only a divider. Four across at this width is tight, so
   the columns are weighted rather than equal — the pool name is the longest
   string of the four and the two figures are the shortest. */
.grp-strip{
  display:grid;
  grid-template-columns:1fr 1.05fr .62fr .84fr;
  align-items:center;
}
.gsel{
  position:relative;
  display:flex;
  align-items:center;
  gap:5px;
  padding:6px 6px;
  margin-right:6px;
  border:1px solid var(--line);
  border-radius:9px;
  background:var(--card);
  min-width:0;
}
.gsel:focus-within{outline:2px solid var(--green);outline-offset:1px}
.gsel-ico{flex:none;width:18px;height:18px;border-radius:6px;display:grid;place-items:center;
  background:var(--line-2);color:var(--ink-2)}
.gsel-ico svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}
.gsel-txt{flex:1;min-width:0}
.gsel-k{display:block;font-size:8px;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;color:var(--ink-3)}
.gsel-v{display:block;font-size:11.5px;font-weight:500;letter-spacing:-.02em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gsel-cv{flex:none;color:var(--ink-3)}
.gsel-cv svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round;display:block}
/* Invisible but real: still the element that opens, that the label points at,
   and that carries the aria-label. */
.gsel-native{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  opacity:0;
  border:none;
  padding:0;
  margin:0;
  cursor:pointer;
  -webkit-appearance:none;
  appearance:none;
}
.gstat{
  padding:2px 0 2px 7px;
  border-left:1px solid var(--line-2);
  min-width:0;
}
.gk{display:block;font-size:8px;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;color:var(--ink-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gv{display:block;font-family:var(--mono);font-variant-numeric:tabular-nums;
  font-size:10.5px;font-weight:500;margin-top:2px;letter-spacing:-.04em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gtag{margin-top:4px}
.grp-foot{margin-top:9px}
.group-rename-input{
  width:100%;padding:8px 10px;
  border:1px solid var(--line);border-radius:8px;
  font:inherit;font-size:13px;margin-bottom:6px;
  background:var(--card);color:var(--ink);
}
/* Four across is the mockup's shape and it holds down to ~380px. Below that
   the picker icons go first: they are decorative (aria-hidden) and cost 23px
   each, where the text they sit beside is the actual content — a chain named
   "Tessera" truncated to "Te…" is a worse trade than no icon. */
@media (max-width:380px){
  .gsel-ico{display:none}
  .gsel{gap:0}
  /* with the icons gone the pickers need less, so the readouts take it back —
     "Hashrate" is the widest column key and was the last cell still ellipsing */
  .grp-strip{grid-template-columns:.92fr .98fr .72fr .95fr}
}
/* Narrower than that, even the text stops fitting four across, so the strip
   folds to pickers over readouts rather than ellipsing every cell. */
@media (max-width:339px){
  .grp-strip{grid-template-columns:1fr 1fr;row-gap:9px}
  .gsel{margin-right:0}
  .grp-strip .gsel:nth-child(1){margin-right:7px}
  .gstat{padding-left:0;border-left:none}
  .grp-strip .gstat:nth-child(4){padding-left:9px;border-left:1px solid var(--line-2)}
}
</style>
