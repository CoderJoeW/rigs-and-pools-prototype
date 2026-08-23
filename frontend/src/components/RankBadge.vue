<script setup lang="ts">
import { computed } from 'vue';
import hobbyist from '../assets/rank/hobbyist.webp';
import tinkerer from '../assets/rank/tinkerer.webp';
import operator from '../assets/rank/operator.webp';
import engineer from '../assets/rank/engineer.webp';
import mogul from '../assets/rank/mogul.webp';
import magnate from '../assets/rank/magnate.webp';

/* The career-rank medallion.

   One badge, six metals, climbing: copper, brass, gunmetal, silver, gold,
   platinum. The form never changes — same hexagonal frame, same pickaxe over
   a gearwheel, same crop box measured on the copper render — so the ladder
   reads as one object being upgraded rather than six unrelated awards, and
   the only thing that moves between ranks is what it is made of. The same
   rule the rack, rig and gem sets follow.

   Keyed by INDEX into RANKS rather than by name: the ladder is ordered and
   what a rank is called is a label on it, so renaming one in milestones.ts
   cannot silently unhook its art. An index past the art falls back to the
   last badge rather than rendering nothing — a seventh rank added to the
   catalog should look unfinished, not broken. */
const props = defineProps({
  rank: { type: Number, default: 0 },
  label: { type: String, default: '' },
});

const BADGES = [hobbyist, tinkerer, operator, engineer, mogul, magnate];
const src = computed(() =>
  BADGES[Math.max(0, Math.min(BADGES.length - 1, props.rank))]);
</script>

<template>
  <span class="rankbadge" :role="label ? 'img' : undefined"
        :aria-label="label || undefined" :aria-hidden="label ? undefined : 'true'">
    <img class="rb-img" :src="src" alt="" aria-hidden="true" />
    <i class="rb-sheen" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
/* The same dark tile every other generated asset in this app wears —
   RigShot, ChainGem and PartTile all frame their render rather than trying
   to knock its ground out. Blending it away was the first attempt and it
   does not survive both themes: the render's ground is near-black but not
   black, so `screen` left a grey plate on the dark card and would have
   blown the badge out on the light one. A framed tile is what the rest of
   the app already looks like, and it reads as deliberate in both. */
.rankbadge {
  flex: none;
  position: relative;
  display: block;
  width: 84px;
  height: 84px;
  border-radius: 14px;
  overflow: hidden;
  background: #07080a;
  border: 1px solid #22262d;
}
.rb-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Written square at the frame's aspect, so cover only absorbs rounding. */
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.rb-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, .10) 0%, rgba(255, 255, 255, 0) 45%);
}

@media (max-width: 359px) {
  .rankbadge { width: 66px; height: 66px }
}
</style>
