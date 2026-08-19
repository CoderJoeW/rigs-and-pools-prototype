<script setup>
import { computed } from 'vue';

/* The component thumbnail beside each row of the Build tab's parts list, and
   beside every option inside the pickers those rows open.

   KEYED BY PART, NOT BY SLOT. It used to take a slot name — 'unit', 'frame',
   'psu' — and hand back one of five pictures, so all twelve cards shared a
   photograph and so did all ten power supplies. The Build tab is a shop, and
   every ladder in data/hardware.js is monotonic: a dearer part is better on
   every axis that matters. None of that was visible. Now every catalogue id
   has its own tile, and opening a picker shows the ladder as objects rather
   than as a column of identical squares over changing text.

   HOW THEY WERE SHOT. Five contact sheets, one per family, every member of a
   family in a single frame on one seamless studio floor under one soft key
   from upper left, then cut apart on a shared square box. That is what makes a
   column of five read as one set: the objects differ, the framing and the
   light do not. It is also why this cost five generations rather than
   forty-three — and why a sixth family could be added the same way.

   The warm studio ground is deliberate and is the one place the app's art
   departs from the near-black used for installed hardware (RigShot, RackTile,
   Chassis). Those show machines in a room; these show goods on a shelf. The
   tile's own background is set to match the sheets' floor so the crop sits on
   it rather than fighting a dark frame.

   Decorative: every row and every option names its own part in text beside
   the tile. */
const props = defineProps({
  /* A part id from data/hardware.js — c1…c12, f2…f16, m2…m16, p450…p7500,
     x0…x6. */
  part: { type: String, default: '' },
  label: { type: String, default: '' },
});

/* Eager glob rather than forty-three import lines: the set is exactly the
   contents of the directory, and a part added to the catalogue needs only its
   tile dropped in beside the others. */
const TILES = import.meta.glob('../assets/part/*.webp', { eager: true, import: 'default' });

/* The catalogue is not fixed. Two kinds of part are minted at runtime and can
   never have a tile of their own:

     hardware.js grows the ladder every GEN_DAYS with `g<n>a`/`g<n>b` cards and
     a matching `gp<n>` supply — an endless series, so shipping art for it is
     not a thing that can be finished; and

     the fab mints `custom-<kind>-<stamp>` parts a player designed themselves.

   Both sit ABOVE the top of the ladder they extend, so the honest picture for
   either is the top static part of that family — a top-end card really is what
   a next-generation card looks like. Falling back keeps the column of tiles
   full instead of putting an empty square against the best hardware in the
   game from in-game day 14 onward. */
const TOP_OF_FAMILY = { unit: 'c12', psu: 'p7500', frame: 'f16', mobo: 'm16', cool: 'x6' };
const KIND_RE = /^custom-([a-z]+)-/;

function tileFor(id) {
  if (!id) return undefined;
  const own = TILES[`../assets/part/${id}.webp`];
  if (own) return own;
  const custom = KIND_RE.exec(id);
  const family = custom ? TOP_OF_FAMILY[custom[1]]
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
