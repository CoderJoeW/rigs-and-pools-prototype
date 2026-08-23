<script setup lang="ts">
import PartTile from './PartTile.vue';

interface CompareRow {
  id: string; name: string; sub: string; value: string; valueSub?: string;
  tile?: string; cls?: string; current?: boolean; locked?: boolean;
}
defineProps<{
  title?: string; metric?: string; rows?: CompareRow[]; pick?: (id: string) => void;
}>();
// Capped so a long catalogue's later rows don't sit through a growing
// queue before they animate in — past the cap every remaining row starts
// together, which reads as "the ladder", not a delay.
const rowDelay = (i: number) => Math.min(i,8)*22+'ms';
</script>

<template>
  <div class="cmp">
    <div class="cmp-hd"><span>{{ title }}</span><span>{{ metric }}</span></div>
    <component v-for="(r,i) in rows" :key="r.id" :is="pick?'button':'div'"
               class="cmp-r" :class="{cur:r.current, locked:r.locked}"
               :style="{ 'animation-delay': rowDelay(i) }"
               @click="pick && !r.locked && pick(r.id)">
      <!-- A row that names a catalogue part shows the part; every other
           picker in the app (shells, sources, cooling plants, storage) has
           no such art and keeps the rank number it always had. -->
      <PartTile v-if="r.tile" class="cmp-tile" :part="r.tile" />
      <span v-else class="cmp-n">{{ i+1 }}</span>
      <span class="cmp-nm"><span class="cmp-t">{{ r.name }}</span>
        <div class="cmp-d">{{ r.sub }}</div></span>
      <span class="cmp-rt"><div class="cmp-v" :class="r.cls">{{ r.value }}</div>
        <div class="cmp-d">{{ r.valueSub }}</div></span>
    </component>
  </div>
</template>

<style scoped>
/* The tile stands in for .cmp-n, so it takes that slot's width rather than
   widening the row and pushing every name across. */
.cmp-tile { margin-right: 2px }
</style>
