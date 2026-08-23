<script setup lang="ts">
import { computed } from 'vue';
import { sitePlate } from '../utils/siteArt.js';

// Farm-row thumbnail architecture (vs RackShot, no film, per-state border):
// docs/implementation-notes.md#farm-row-thumbnail-srccomponentssiteshotvue.
const props = defineProps({
  shell: { type: String, default: 'bedroom' },
  phase: { type: String as () => 'day' | 'night', default: 'day' },
  state: { type: String, default: 'off' },
  label: { type: String, default: '' },
});

const src = computed(() => sitePlate(props.shell, props.phase));
</script>

<template>
  <span class="siteshot" :class="state" role="img" :aria-label="label || state">
    <img class="ss-img" :src="src" alt="" aria-hidden="true" />
    <i class="ss-sheen" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
.siteshot {
  flex: none;
  position: relative;
  display: block;
  width: 104px;
  height: 78px;
  border-radius: 10px;
  overflow: hidden;
  background: #07080a;
  border: 1px solid #22262d;
}
.ss-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* The plates are 21:9 and this frame is 4:3, so the crop is doing real
     work: 42% keeps the racks, not the ceiling. */
  object-fit: cover;
  object-position: center 42%;
  display: block;
  pointer-events: none;
}
.ss-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, .09) 0%, rgba(255, 255, 255, 0) 42%);
}
.siteshot.run   { border-color: #24344d }
.siteshot.warn  { border-color: #4a3418 }
.siteshot.bad   { border-color: #4d2420 }
.siteshot.build { border-color: #2b3440 }
/* A site with nothing running is dimmed rather than re-shot: the room is the
   same room, it is just not doing anything. */
.siteshot.off   { filter: brightness(.7) saturate(.75) }

@media (max-width: 359px) {
  .siteshot { width: 84px; height: 64px }
}
</style>
