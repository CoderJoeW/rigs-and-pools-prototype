<script setup lang="ts">
import { computed } from 'vue';

// Part tile architecture (keyed by part not slot, contact-sheet shoot,
// runtime-minted-part fallback): docs/implementation-notes.md#part-catalogue-tiles-srccomponentsparttilevue.
const props = defineProps({
  part: { type: String, default: '' }, // a part id from data/hardware.ts — c1…c12, f2…f16, m2…m16, p450…p7500, x0…x6
  label: { type: String, default: '' },
});

const TILES = import.meta.glob<string>('../assets/part/*.webp', { eager: true, import: 'default' });

const TOP_OF_FAMILY: Record<string, string> = { unit: 'c12', psu: 'p7500', frame: 'f16', mobo: 'm16', cool: 'x6' };
const KIND_RE = /^custom-([a-z]+)-/;

function tileFor(id: string): string | undefined {
  if (!id) return undefined;
  const own = TILES[`../assets/part/${id}.webp`];
  if (own) return own;
  const custom = KIND_RE.exec(id);
  const family = custom ? TOP_OF_FAMILY[custom[1]!]
    : /^g\d+[ab]$/.test(id) ? TOP_OF_FAMILY.unit
    : /^gp\d+$/.test(id) ? TOP_OF_FAMILY.psu
    : null;
  return family ? TILES[`../assets/part/${family}.webp`] : undefined;
}

const src = computed(() => tileFor(props.part));
</script>

<template>
  <span class="parttile" :class="{ blank: !src }" :role="label ? 'img' : undefined"
        :aria-label="label || undefined" :aria-hidden="label ? undefined : 'true'">
    <img v-if="src" class="pt-img" :src="src" alt="" aria-hidden="true" />
    <i class="pt-sheen" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
.parttile {
  flex: none;
  position: relative;
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 9px;
  overflow: hidden;
  /* The contact sheets' studio floor, so the crop's own corners disappear
     into the tile instead of sitting on a dark plate. */
  background: #b3aca2;
  border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
}
/* Nothing in the game should reach this now — every catalogue, generated and
   fab-designed id resolves to a tile — but a row must not collapse if one
   ever does. */
.parttile.blank { background: color-mix(in srgb, var(--ink) 8%, transparent) }
.pt-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Written square at the frame's aspect, so cover only absorbs rounding. */
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.pt-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, .16) 0%, rgba(255, 255, 255, 0) 45%);
}
</style>
