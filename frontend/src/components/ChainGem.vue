<script setup lang="ts">
import { computed } from 'vue';
import tessera from '../assets/chain/tessera.webp';
import ferro from '../assets/chain/ferro.webp';
import halcyon from '../assets/chain/halcyon.webp';
import nova from '../assets/chain/nova.webp';
import obelisk from '../assets/chain/obelisk.webp';

// Chain gem architecture (one cut/five recoloured hues, shared crop box,
// swatch fallback): docs/implementation-notes.md#chain-emblem-srccomponentschaingemvue.
const props = defineProps({
  chain: { type: String, required: true },
  hue: { type: [Number, String], default: undefined },
  label: { type: String, default: '' },
});

const GEMS: Record<string, string> = { tessera, ferro, halcyon, nova, obelisk };
const src = computed(() => GEMS[props.chain]);
const hasHue = computed(() => props.hue !== undefined && props.hue !== null);
</script>

<template>
  <span
    class="chaingem"
    :class="{ flat: !src }"
    :style="hasHue ? { '--chain-h': hue } : undefined"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  >
    <img v-if="src" class="cg-img" :src="src" alt="" aria-hidden="true" />
    <i class="cg-sheen" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
.chaingem {
  flex: none;
  position: relative;
  display: block;
  width: 44px;
  height: 44px;
  border-radius: 11px;
  overflow: hidden;
  background: #07080a;
  border: 1px solid #22262d;
}
.cg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Written square at the frame's aspect, so cover only absorbs rounding. */
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.cg-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, .10) 0%, rgba(255, 255, 255, 0) 45%);
}
/* The fallback: the same tile, filled with the chain's own hue, so a chain
   without art still reads as that chain rather than as a missing image. */
.chaingem.flat {
  background:
    radial-gradient(circle at 50% 55%,
      oklch(var(--chain-l, .78) var(--chain-c, .15) var(--chain-h, 200)) 0%,
      color-mix(in srgb,
        oklch(var(--chain-l, .78) var(--chain-c, .15) var(--chain-h, 200)) 25%,
        #07080a) 70%);
}
</style>
