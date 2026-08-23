<script setup lang="ts">
import { computed, ref, type PropType } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { C } from '../data/constants.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';

/* The fleet actions sheet — repair, move, refit, rebuild-to-spec, each applied
   to a scope rather than one rig. Unlike the rebuild sheet this cannot be
   self-sufficient: the scope is the LIST's business (which site is showing, and
   which rows the player has ticked), so the view passes it in and this only
   owns the two selects and the quotes derived from them. */
const props = defineProps({
  open: { type: Boolean, default: false },
  /* A site id, null for the whole farm, or an explicit array of rig ids —
     whatever fleetRigs() understands. */
  scopeId: { type: [Number, String, Array] as PropType<number | string | number[] | null>, default: null },
  scopeLabel: { type: String, default: '' },
});
const emit = defineEmits(['update:open']);

const g = useGameStore();
const REPAIR_AT = C.REPAIR_AT;

const fleetGroup = ref(1), fleetCard = ref('c8');
const scope = computed(() => props.scopeId);
const specInfo = computed(() => g.fleetSpecInfo(g.draftSpec(), scope.value));
const wornInfo = computed(() => g.fleetWorn(REPAIR_AT, scope.value));
const moveInfo = computed(() => g.fleetMoveInfo(fleetGroup.value, scope.value));
const refitInfo = computed(() => g.fleetRefitInfo(fleetCard.value, scope.value));
const fleetCardOpts = computed(() => g.cards().concat(g.s.customParts.filter((p: any) => p.kind === 'unit')));

const fleetSheetEl = ref<HTMLElement | null>(null);
useSheetA11y(fleetSheetEl, computed(() => props.open), () => emit('update:open', false));
</script>

<template>
  <div v-if="open" class="sheet" ref="fleetSheetEl" role="dialog" aria-modal="true"
     aria-labelledby="fleet-sheet-title">
    <div class="sheet-hd">
      <button class="btn btn-sm btn-ghost" @click="emit('update:open',false)">&lsaquo; Rigs</button>
      <span class="t" id="fleet-sheet-title">Fleet actions</span></div>
    <div class="sheet-bd">
      <div class="card"><div class="card-bd pt">
        <div class="dl" style="margin-top:0"><dt>Applies to</dt><dd>{{ scopeLabel }}</dd></div>
        <p class="hint" style="margin-top:0">Select rigs on the list to narrow this; with nothing
          selected every action covers the whole site.</p>
      </div></div>

      <div class="card"><div class="card-bd pt">
        <div class="rigfld"><label>Repair worn cards</label>
          <button class="btn btn-wide"
                  :class="wornInfo.n&&g.s.cash>=wornInfo.cost?'btn-pri':''"
                  :disabled="!wornInfo.n||g.s.cash<wornInfo.cost"
                  @click="g.fleetRepair(REPAIR_AT,scopeId)">
            {{ wornInfo.n
               ? 'Replace '+wornInfo.n+' card'+(wornInfo.n===1?'':'s')
                 +' across '+wornInfo.rigs+' rig'+(wornInfo.rigs===1?'':'s')
                 +' · '+fmt.usd(wornInfo.cost)
               : 'Nothing worn past '+fmt.pct(REPAIR_AT,0) }}</button></div>

        <div class="rigfld"><label for="fleet-group-select">Move to a group</label>
          <select id="fleet-group-select" v-model.number="fleetGroup">
            <option v-for="gr in g.s.groups" :key="gr.id" :value="gr.id">
              {{ gr.name }} — {{ g.chain(gr.chain).name }}{{ gr.pool==='solo'?' · solo'
                :(g.poolOf(gr.pool)?' · '+g.poolOf(gr.pool).name:'') }}</option>
          </select>
          <button class="btn btn-wide" style="margin-top:6px"
                  :class="moveInfo.rigs?'btn-pri':''"
                  :disabled="!moveInfo.rigs"
                  @click="g.fleetMove(fleetGroup,scopeId)">
            {{ moveInfo.rigs
               ? 'Move '+moveInfo.rigs+' rig'
                 +(moveInfo.rigs===1?'':'s')+' ('
                 +fmt.hash(moveInfo.hash)+')'
               : 'Already there' }}</button>
          <p class="hint">Moving never forfeits a PPLNS window — it belongs to the group.</p></div>
      </div></div>

      <div class="card"><div class="card-bd pt">
        <div class="rigfld"><label for="fleet-card-select">Swap cards, keeping each chassis</label>
          <select id="fleet-card-select" v-model="fleetCard">
            <option v-for="c in fleetCardOpts" :key="c.id" :value="c.id">
              {{ c.name }} — {{ c.mh }} MH · {{ (c.mh/c.w).toFixed(2) }} MH/W · {{ fmt.usd(c.price) }}</option>
          </select>
          <button class="btn btn-wide" style="margin-top:6px"
                  :class="refitInfo.rigs?'btn-pri':''"
                  :disabled="!refitInfo.rigs||g.s.cash<refitInfo.cost"
                  @click="g.fleetRefit(fleetCard,scopeId)">
            {{ refitInfo.rigs
               ? 'Refit '+refitInfo.rigs+' rig'
                 +(refitInfo.rigs===1?'':'s')
                 +' · '+fmt.usd(refitInfo.cost)
               : 'No eligible rigs' }}</button>
          <div class="warnbox" style="margin-top:6px">Every eligible rig goes down at once for
            its rebuild. The farm earns nothing until they are back.</div>
          <p class="hint">Rigs whose supply, connectors or site power cannot take the card are
            skipped, and say why in their own panel.</p></div>

        <div class="rigfld" style="margin-top:12px">
          <label>Rebuild to the Build tab's specification</label>
          <div class="dl" style="margin-top:0"><dt>Target</dt>
            <dd>{{ g.s.draft.n }} × {{ g.PART(g.s.draft.unit).name }}<br>
              <span class="sb">{{ g.PART(g.s.draft.frame).name }} · {{ g.PART(g.s.draft.mobo).name }}
                · {{ g.PART(g.s.draft.cool).name }} · {{ g.PART(g.s.draft.psu).name }}</span></dd></div>
          <p class="hint" style="margin-top:0">Design it on Build, then stamp it across the farm.
            Unlike a card refit this replaces the chassis too, so a farm that grew in stages ends
            up uniform.</p>
          <div v-if="specInfo.already" class="track-cap">
            <span>Already on this spec</span><b>{{ specInfo.already }}</b></div>
          <div v-if="specInfo.blocked" class="track-cap">
            <span class="amb">Cannot take it — {{ specInfo.why }}</span>
            <b class="amb">{{ specInfo.blocked }}</b></div>
          <button class="btn btn-wide" style="margin-top:6px"
                  :class="specInfo.rigs&&g.s.cash>=specInfo.cost?'btn-pri':''"
                  :disabled="!specInfo.rigs||specInfo.cost>g.s.cash"
                  @click="g.fleetToSpec(g.draftSpec(),scopeId)">
            {{ !specInfo.rigs ? 'Nothing to rebuild'
               : specInfo.cost>g.s.cash
                 ? 'Needs '+fmt.usd(specInfo.cost)+' for '+specInfo.rigs+' rig'+(specInfo.rigs===1?'':'s')
                 : 'Rebuild '+specInfo.rigs+' rig'+(specInfo.rigs===1?'':'s')+' · '+fmt.usd(specInfo.cost) }}</button>
        </div>
      </div></div>
    </div>
  </div>
</template>
