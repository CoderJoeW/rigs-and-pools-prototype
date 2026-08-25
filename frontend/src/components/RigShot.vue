<script setup lang="ts">
import { computed } from 'vue';
import { rigShot, rigClass } from '../utils/rigArt.js';

// Rig shot architecture (own render set vs Chassis/RackTile, frame as a
// second art axis, no chain LED): docs/implementation-notes.md#rig-hero-shot-srccomponentsrigshotvue.
const props = defineProps({
  state: { type: String, default: 'off' },
  frame: { type: String, default: 'f4' }, // a frame id from data/hardware.ts (f2 … f16)
  label: { type: String, default: '' },
});

const src = computed(() => rigShot(props.frame, props.state));
const cls = computed(() => rigClass(props.frame));
</script>

<template>
  <span class="rigshot" :class="[state, 'cl-' + cls]" :role="label ? 'img' : undefined"
        :aria-label="label || undefined" :aria-hidden="label ? undefined : 'true'">
    <img class="rgs-img" :src="src" alt="" aria-hidden="true" />
    <i class="rgs-sheen" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
.rigshot {
  flex: none;
  position: relative;
  display: block;
  width: 104px;
  height: 58px;
  border-radius: 8px;
  overflow: hidden;
  background: #07080a;
  border: 1px solid #22262d;
}
.rgs-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Already written at the frame's aspect, so cover only absorbs rounding. */
  object-fit: cover;
  object-position: center;
  display: block;
  pointer-events: none;
}
.rgs-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, .08) 0%, rgba(255, 255, 255, 0) 40%);
}
/* The border is the only per-state chrome left: the renders carry their own
   LEDs and floor bloom, so a CSS glow on top would double it. */
.rigshot.run   { border-color: #24425e }
.rigshot.warn  { border-color: #5a3d15 }
.rigshot.bad   { border-color: #5c2622 }
.rigshot.build { border-color: #333a45 }
/* Off is genuinely unlit in its render; the knock-down separates a dark rig
   from a merely dim one at this size. */
.rigshot.off   { border-color: #1e2229; filter: brightness(.82) }

@media (max-width: 359px) {
  .rigshot { width: 88px; height: 50px }
}
</style>
