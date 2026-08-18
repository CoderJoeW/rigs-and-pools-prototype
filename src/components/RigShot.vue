<script setup>
import { computed } from 'vue';
import run from '../assets/rig/run.webp';
import warn from '../assets/rig/warn.webp';
import build from '../assets/rig/build.webp';
import bad from '../assets/rig/bad.webp';
import off from '../assets/rig/off.webp';

/* The wide hardware shot that fronts every row of the Rigs list.

   A fourth set of renders, and the reason it is not one of the other three:
   Chassis is a 36-44px square badge that sits INSIDE a line of text, RackShot
   is a 104x78 portrait-ish crop of a whole site's rack, and RackTile is a
   macro crop of a rack's mesh with no cabinet outline left in frame. This one
   is a 16:9 studio shot of a SINGLE rig with the whole enclosure in frame,
   because the Rigs row is the one place in the app that shows one machine at a
   size where the machine itself is the subject rather than a marker for it.

   All five states come from one 2112x1188 crop box measured on the OFF render
   — the only state whose LEDs are dark, so its detail box contains the
   hardware and not the bloom around it. Sharing that box is what keeps the
   chassis from drifting or resizing as a rig changes state: only the light
   moves. `build` is the one that reaches past it (its removed front panel
   leans out to the left) and it is cropped rather than reframed, for the same
   reason.

   No chain LED, unlike RackTile's version of this idea: a tile on the floor
   plan is wordless and needs the bar to say which chain it points at, where
   this row names the chain in text two lines down, with its ChainMark beside
   it. Painted here as well it was pure duplication — and a bright bar laid
   over a photograph whose own LEDs are the subject read as a fault in the
   picture rather than as a label. */
const props = defineProps({
  state: { type: String, default: 'off' },
  label: { type: String, default: '' },
});

const SHOTS = { run, warn, build, bad, off };
const src = computed(() => SHOTS[props.state] || SHOTS.off);
</script>

<template>
  <span class="rigshot" :class="state" role="img" :aria-label="label || state">
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
