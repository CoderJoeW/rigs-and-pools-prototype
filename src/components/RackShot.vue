<script setup>
import { computed } from 'vue';
import run from '../assets/rack/run.webp';
import warn from '../assets/rack/warn.webp';
import build from '../assets/rack/build.webp';
import bad from '../assets/rack/bad.webp';
import off from '../assets/rack/off.webp';

/* The landscape hardware shot that anchors each Farm site row.

   Its own set of renders, not Chassis.vue's: these are 4:3 studio shots of the
   whole enclosure, cropped so the rack fills the frame the way the mockup has
   it, where Chassis carries square 64px badges built to read next to a single
   rig. Kept as its own component for the same reason — almost none of
   Chassis's chrome survives at this size: no chain LED overlay, no per-state
   border, a different crop, and a glow that has to read from across the row.

   All five share one crop box, so the chassis holds its position and size when
   a site changes state and only the light moves. */
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
  /* Already cropped to the frame's aspect, so cover only absorbs rounding. */
  object-fit: cover;
  object-position: center;
  display: block;
  pointer-events: none;
}
/* Just a glass sheen across the top. The renders carry their own light —
   each state's LED bar and its bloom are in the image — so the only thing left
   for CSS is to tie the border to the state's colour and let the frame read as
   a lit panel rather than a flat crop. */
.rs-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, .09) 0%, rgba(255, 255, 255, 0) 42%);
}
.rackshot.run   { border-color: #24344d }
.rackshot.warn  { border-color: #4a3418 }
.rackshot.bad   { border-color: #4d2420 }
.rackshot.build { border-color: #2b3440 }
/* Off is genuinely unlit in its render; the extra knock-down separates a dark
   site from a merely dim one at thumbnail size. */
.rackshot.off   { filter: brightness(.85) }

@media (max-width: 359px) {
  .rackshot { width: 84px; height: 64px }
}
</style>
