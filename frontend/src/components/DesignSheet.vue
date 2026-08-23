<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';
import type { Site } from '../game/types.js';
import type { DesignAxis } from '../data/customParts.js';

/* The fab's part designer. Which part is being designed and how its points are
   spent is store state (g.s.design), so the sheet reads that directly; the view
   only supplies the site to fall back on and the slot labels it already owns
   for the picker beside it. */
const props = defineProps({
  /* The tab's active site — used only when g.s.design names a site that is no
     longer in the list, which is the pre-existing fallback. */
  site: { type: Object as () => Site, required: true },
  /* {frame:'Frame', mobo:'Board', …} — shared with the site picker. */
  kindLabels: { type: Object as () => Record<string, string>, required: true },
});

const g = useGameStore();

const designPreview=computed(()=>{ const d=g.s.design; if(!d) return null;
  const site=g.s.sites.find(x=>x.id===d.fid)||props.site, fab=g.FAB(site.fab!)!; const liveTop=g.liveTopOf(d.kind);
  return { axes:g.DESIGN_AXES[d.kind], fab, totals:g.designTotals(d.kind,d.picks), stats:g.designStats(d.kind,d.picks,liveTop), cost:g.designCost(d.kind,d.picks,liveTop) }; });
const axisAtCap=(ax: DesignAxis)=>{ const d=g.s.design; if(!d) return true; const cur=d.picks[ax.key]||0;
  if(cur>=g.MAX_AXIS_POINTS) return true;
  return g.designTotals(d.kind,{ ...d.picks, [ax.key]:cur+1 }).budget>designPreview.value!.fab.budget; };

const designSheetEl=ref<HTMLElement | null>(null);
useSheetA11y(designSheetEl, computed(()=>!!g.s.design), ()=>{ g.closeDesign(); });
</script>

<template>
  <div v-if="g.s.design" class="sheet" ref="designSheetEl" role="dialog" aria-modal="true" aria-labelledby="design-sheet-title">
    <div class="sheet-hd">
      <button class="btn btn-sm btn-ghost" @click="g.closeDesign()">&lsaquo; Back</button>
      <span class="t" id="design-sheet-title">Design a {{ kindLabels[g.s.design!.kind] }}</span></div>
    <div class="sheet-bd">
      <div class="track"><i class="b" :style="{width:Math.min(100,designPreview!.totals.budget/designPreview!.fab.budget*100)+'%'}"></i></div>
      <div class="track-cap"><span>Design budget spent</span><b>{{ designPreview!.totals.budget }} / {{ designPreview!.fab.budget }}</b></div>
      <div v-for="ax in designPreview!.axes" :key="ax.key" class="dl">
        <dt>{{ ax.label }}</dt>
        <dd>{{ designPreview!.stats[ax.key] }}
          <span class="stepper">
            <button :aria-label="'Decrease '+ax.label" :disabled="!((g.s.design!.picks[ax.key]||0)>0)" @click="g.bumpDesignPick(ax.key,-1)">&minus;</button>
            <span class="num">{{ g.s.design!.picks[ax.key]||0 }}</span>
            <button :aria-label="'Increase '+ax.label" :disabled="axisAtCap(ax)" @click="g.bumpDesignPick(ax.key,1)">+</button>
          </span></dd>
      </div>
      <div class="dl"><dt>Manufacturing cost</dt><dd>{{ fmt.usd(designPreview!.cost.buildCash) }}</dd></div>
      <div class="dl"><dt>Build time</dt><dd>{{ designPreview!.cost.hours }} h</dd></div>
      <div class="dl"><dt>Price each time it's used to build a rig</dt><dd>{{ fmt.usd(designPreview!.cost.unitPrice) }}</dd></div>
      <p v-if="g.s.help" class="hint">Every point spent on one axis costs more than the last — the budget is what forces a real choice between axes, not a ceiling you're expected to hit.</p>
      <p v-if="designPreview!.totals.points<=0" class="note">Push at least one stat above the catalogue's own top tier — a design that spends nothing is strictly worse for the price.</p>
      <button class="btn btn-wide btn-pri" style="margin-top:9px" :disabled="designPreview!.totals.points<=0 || g.s.cash<designPreview!.cost.buildCash" @click="g.manufacturePart()">Manufacture &middot; {{ fmt.usd(designPreview!.cost.buildCash) }}</button>
    </div>
  </div>
</template>
