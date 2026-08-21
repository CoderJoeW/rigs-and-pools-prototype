<script setup>
import { computed } from 'vue';
import run from '../assets/floor/run.webp';
import warn from '../assets/floor/warn.webp';
import build from '../assets/floor/build.webp';
import bad from '../assets/floor/bad.webp';
import off from '../assets/floor/off.webp';

/* One position on a site's floor plan.

   Its own set of renders, alongside Chassis (square 64px badges beside a
   single rig) and RigShot (the 16:9 shot fronting a Rigs row): these are
   macro crops of a rack's front face, framed so the mesh and its LED rows fill
   a wide tile edge to edge with no cabinet outline to shrink at this size. All
   five states come from one crop box and differ only in what colour the LEDs
   burn, so a position holds its exact framing as it changes state and only the
   light moves.

   An empty position renders as a <div> rather than a <button> — there is
   nothing to open — and drops the render for a dashed outline. */
const props = defineProps({
  state: { type: String, default: 'off' },
  empty: { type: Boolean, default: false },
  code: { type: String, default: '' },
  chainHue: { type: [Number, String], default: undefined },
  label: { type: String, default: '' },
});

const SHOTS = { run, warn, build, bad, off };
const src = computed(() => SHOTS[props.state] || SHOTS.off);
const hasChain = computed(() => props.chainHue !== undefined && props.chainHue !== null);
</script>

<template>
  <div v-if="empty" class="rigtile empty" aria-hidden="true">
    <span class="rt-plus">+</span>
    <span class="rt-empty">Empty</span>
  </div>
  <button
    v-else
    class="rigtile"
    :class="state"
    :style="hasChain ? { '--chain-h': chainHue } : undefined"
    :title="label"
    :aria-label="label"
  >
    <img class="rt-img" :src="src" alt="" aria-hidden="true" />
    <span class="rt-led" aria-hidden="true"></span>
    <span class="rt-scrim" aria-hidden="true"></span>
    <span class="rt-n">{{ code }}</span>
    <svg class="rt-wave" viewBox="0 0 40 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 6h5l2-4 3 8 3-6 2 3 3-5 2 4h5l2-3 3 5 2-2h5" fill="none"
            stroke-width="1.2" vector-effect="non-scaling-stroke" />
    </svg>
  </button>
</template>

<style scoped>
.rigtile {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 21 / 10;
  border-radius: 9px;
  overflow: hidden;
  background: #07080a;
  border: 1px solid #232830;
  text-align: left;
  /* main.css still presses button.rigtile on :active; the timing that made it
     an ease rather than a snap used to live beside it in the old swatch rule. */
  transition: var(--press), border-color .2s;
}
.rt-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Every state shares the source crop, so cover only absorbs rounding. */
  object-fit: cover;
  object-position: center;
  display: block;
  pointer-events: none;
}
/* Darkened toward the top-left so the position code reads over the render
   without a plate behind it. */
.rt-scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg,
    rgba(4, 6, 9, .82) 0%, rgba(4, 6, 9, .34) 46%, rgba(4, 6, 9, 0) 72%);
}
.rt-n {
  position: absolute;
  top: 5px;
  left: 7px;
  z-index: 2;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: .02em;
  color: #E8EDF2;
  line-height: 1;
}
/* The chain LED bar — the one piece of state the renders cannot carry, since
   which chain a rig points at is a choice made long after the shot. */
.rt-led {
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 2px;
  border-radius: 0 0 2px 2px;
  z-index: 2;
  background: transparent;
}
.rigtile[style*="--chain-h"] .rt-led {
  background: oklch(var(--chain-l, .78) var(--chain-c, .15) var(--chain-h));
  box-shadow: 0 0 7px oklch(var(--chain-l, .78) var(--chain-c, .15) var(--chain-h) / .6);
}
/* A heartbeat in the corner: the tile's one moving part, so a floor of stills
   still reads as machines that are doing something. */
.rt-wave {
  position: absolute;
  right: 6px;
  bottom: 5px;
  width: 34px;
  height: 11px;
  z-index: 2;
  opacity: .9;
}
.rigtile.run   { border-color: #24425e }
.rigtile.run   .rt-wave path { stroke: #6FB6FF }
.rigtile.warn  { border-color: #5a3d15 }
.rigtile.warn  .rt-wave path { stroke: #FFB454 }
.rigtile.bad   { border-color: #5c2622 }
.rigtile.bad   .rt-wave path { stroke: #FF7A6E }
.rigtile.build { border-color: #3c2c5e }
.rigtile.build .rt-wave path { stroke: #B18CFF; animation: tileBuild 1.4s ease-in-out infinite }
.rigtile.off   { border-color: #1e2229; filter: brightness(.8) }
/* A powered-down rig still points at a chain, but a full-strength LED over a
   dark render would read as the brightest thing on the floor. */
.rigtile.off   .rt-led { opacity: .3 }
.rigtile.off   .rt-wave { opacity: .35 }
.rigtile.off   .rt-wave path { stroke: #7C8794 }
@keyframes tileBuild { 0%, 100% { opacity: .3 } 50% { opacity: 1 } }

.rigtile.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  background: transparent;
  border: 1px dashed color-mix(in srgb, var(--ink-3) 34%, transparent);
  color: var(--ink-3);
}
.rt-plus { font-size: 15px; line-height: 1; font-weight: 300 }
.rt-empty {
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: .09em;
  text-transform: uppercase;
}
</style>
