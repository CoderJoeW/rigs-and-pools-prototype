<script setup>
import { computed } from 'vue';
import run from '../assets/chassis/run.png';
import warn from '../assets/chassis/warn.png';
import build from '../assets/chassis/build.png';
import bad from '../assets/chassis/bad.png';
import off from '../assets/chassis/off.png';

/* The landscape hardware shot that anchors each Farm site row.

   Chassis.vue renders the SAME five renders as a small square badge next to a
   single rig; this one frames them as the wide hero the Farm mockup asks for —
   bigger, cropped to 4:3, and carrying the row's status colour in its bloom
   rather than in a border. Kept as its own component instead of another
   `size` on Chassis because almost none of Chassis's chrome survives at this
   size: no chain LED overlay, no per-state border, a different crop, and a
   glow that has to read from across the row. */
const props = defineProps({
  state: { type: String, default: 'off' },
  label: { type: String, default: '' },
});

const SHOTS = { run, warn, build, bad, off };
const src = computed(() => SHOTS[props.state] || SHOTS.off);
</script>

<template>
  <span class="rackshot" :class="state" role="img" :aria-label="label || state">
    <img class="rs-img" :src="src" alt="" aria-hidden="true" />
    <i class="rs-sheen" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
.rackshot {
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
.rs-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* The renders are square with the chassis centred, so cover crops the empty
     black above and below rather than letterboxing it into the frame. */
  object-fit: cover;
  object-position: center 46%;
  display: block;
  pointer-events: none;
}
/* A single highlight pass over the glass — top sheen plus a floor-level bloom
   in the state's colour, so a row's status is legible from the artwork alone
   and not only from the pill above it. */
.rs-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, .10) 0%, rgba(255, 255, 255, 0) 38%),
    radial-gradient(120% 70% at 50% 108%, var(--rs-glow, transparent) 0%, transparent 70%);
}
.rackshot.run   { --rs-glow: rgba(76, 141, 255, .34); border-color: #24344d }
.rackshot.warn  { --rs-glow: rgba(255, 158, 51, .34); border-color: #4a3418 }
.rackshot.bad   { --rs-glow: rgba(255, 100, 89, .36); border-color: #4d2420 }
.rackshot.build { --rs-glow: rgba(196, 216, 240, .26); border-color: #2b3440 }
.rackshot.off   { --rs-glow: transparent; filter: grayscale(.3) brightness(.82) }

@media (max-width: 359px) {
  .rackshot { width: 84px; height: 64px }
}
</style>
