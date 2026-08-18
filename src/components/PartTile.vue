<script setup>
import { computed } from 'vue';
import unit from '../assets/build/unit.webp';
import frame from '../assets/build/frame.webp';
import mobo from '../assets/build/mobo.webp';
import cool from '../assets/build/cool.webp';
import psu from '../assets/build/psu.webp';

/* The component thumbnail beside each row of the Build tab's parts list.

   Keyed by the draft's own slot names, so a row asks for the slot it edits
   and gets the right object back — there is no second vocabulary to keep in
   step with buildDraft.js.

   The five were photographed in one frame, evenly spaced on one studio
   floor, and cut from it on a single square box sized to the widest of them.
   That is what makes a column of five read as one set: the objects differ,
   the framing and the light do not. Doing them as five separate generations
   would have given five slightly different studios.

   Decorative: every row names its own part in text beside the tile. */
const props = defineProps({
  slot: { type: String, required: true },
  label: { type: String, default: '' },
});

const TILES = { unit, frame, mobo, cool, psu };
const src = computed(() => TILES[props.slot]);
</script>

<template>
  <span class="parttile" :role="label ? 'img' : undefined" :aria-label="label || undefined"
        :aria-hidden="label ? undefined : 'true'">
    <img v-if="src" class="pt-img" :src="src" alt="" aria-hidden="true" />
    <i class="pt-sheen" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
.parttile {
  flex: none;
  position: relative;
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 9px;
  overflow: hidden;
  background: #07080a;
  border: 1px solid #22262d;
}
.pt-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Written square at the frame's aspect, so cover only absorbs rounding. */
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.pt-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, .09) 0%, rgba(255, 255, 255, 0) 45%);
}
</style>
