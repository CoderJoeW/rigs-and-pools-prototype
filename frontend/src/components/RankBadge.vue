<script setup lang="ts">
import { computed } from 'vue';
import hobbyist from '../assets/rank/hobbyist.webp';
import tinkerer from '../assets/rank/tinkerer.webp';
import operator from '../assets/rank/operator.webp';
import engineer from '../assets/rank/engineer.webp';
import mogul from '../assets/rank/mogul.webp';
import magnate from '../assets/rank/magnate.webp';

// Rank badge architecture (one form/six metals, keyed by index, art
// fallback): docs/implementation-notes.md#career-rank-medallion-srccomponentsrankbadgevue.
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
/* Dark tile rationale: docs/implementation-notes.md#career-rank-medallion-srccomponentsrankbadgevue. */
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
