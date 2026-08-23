<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue';
import { sitePlate, siteFilm } from '../utils/siteArt.js';

// Site hero backdrop: two always-mounted stills cross-fading with day/night,
// plus a night-only silent loop on big shells. Full rationale (why both
// plates stay mounted, why the film is never load-bearing, autoplay
// handling): docs/implementation-notes.md#site-hero-backdrop-srccomponentssitefilmvue.
const props = defineProps({
  shell: { type: String, required: true },
  phase: { type: String as () => 'day' | 'night', default: 'day' },
  motion: { type: Boolean, default: true },
});

const dayPlate = computed(() => sitePlate(props.shell, 'day'));
const nightPlate = computed(() => sitePlate(props.shell, 'night'));
const film = computed(() => siteFilm(props.shell));

// Decided once at mount, not per render — see docs/implementation-notes.md.
const allowed = ref(false);
onMounted(() => {
  const mq = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const conn = typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: { saveData?: boolean } }).connection : null;
  allowed.value = !(mq && mq.matches) && !(conn && conn.saveData);
});

const showFilm = computed(() =>
  props.motion && allowed.value && props.phase === 'night' && !!film.value);

/* The `autoplay` attribute alone is not enough. A muted inline video is
   allowed to start on every current browser, but the attribute only fires if
   the element is in the document when the browser gets round to it, and this
   one is mounted later — the moment the sim crosses into night. Calling play()
   ourselves the tick after it mounts is the reliable half; the .catch() is the
   other half, because a refusal is a normal outcome (a strict autoplay policy,
   a battery-saver mode) and must not surface as an unhandled rejection. When
   it is refused the poster stays up, which is the night plate, which is what
   the card would have shown anyway. */
const filmEl = ref<HTMLVideoElement | null>(null);
// Watches film as well as showFilm — see docs/implementation-notes.md.
watch([showFilm, film], async ([on]) => {
  if (!on) return;
  await nextTick();
  const v = filmEl.value;
  if (!v || !v.play) return;
  try {
    const r = v.play();
    if (r && r.catch) r.catch(() => {});
  } catch { /* poster stays up, which is the night plate */ }
}, { immediate: true });
</script>

<template>
  <span class="sfilm" aria-hidden="true">
    <img class="sf-plate" :src="dayPlate" alt=""
         :style="{ opacity: phase === 'day' ? 1 : 0 }" />
    <img class="sf-plate" :src="nightPlate" alt=""
         :style="{ opacity: phase === 'night' ? 1 : 0 }" />
    <!-- Keyed on the shell so switching sites REPLACES the element. Patching
         a <source src> in place does nothing on its own: a media element will
         not re-select its source without a load() call, so without this key a
         move from one film-bearing site to another at night left the previous
         site's loop playing over the new site's plate. -->
    <video v-if="showFilm" :key="shell" ref="filmEl" class="sf-film" :poster="nightPlate"
           muted loop playsinline autoplay preload="auto" tabindex="-1">
      <source v-if="film?.webm" :src="film.webm" type="video/webm" />
      <source v-if="film?.mp4" :src="film.mp4" type="video/mp4" />
    </video>
  </span>
</template>

<style scoped>
.sfilm {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  overflow: hidden;
  pointer-events: none;
  /* Under both plates while the first decodes, so the card never flashes the
     page background through its own hero. */
  background: #070a0d;
}
.sf-plate, .sf-film {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 42%;
  display: block;
  pointer-events: none;
}
.sf-plate {
  /* Long enough to read as dusk rather than a swap. The sim crosses the
     threshold once per game-day, so this only ever runs twice a day. */
  transition: opacity 1.6s ease;
}
.sf-film {
  /* Sits over the night plate it was cut from; the poster covers the gap
     before the first frame decodes, and a video that never starts leaves the
     plate underneath doing the job. */
  z-index: 1;
}
@media (prefers-reduced-motion: reduce) {
  .sf-plate { transition: none }
}
</style>
