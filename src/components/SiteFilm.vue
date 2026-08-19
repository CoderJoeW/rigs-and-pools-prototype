<script setup>
import { computed, ref, watch, nextTick, onMounted } from 'vue';
import { sitePlate, siteFilm } from '../utils/siteArt.js';

/* The backdrop of the site hero: two stills that cross-fade with the sim's own
   day/night, and — on the three biggest shells — a silent loop over the top.

   WHY BOTH PLATES ARE ALWAYS MOUNTED. The cross-fade is the point. Swapping
   one <img>'s src at dawn shows a blank frame while the new plate decodes;
   holding both and animating opacity means the change is a dissolve, and the
   browser has had the other plate decoded since mount either way. They are the
   same room from the same camera, so a dissolve reads as the light changing
   rather than as a different picture arriving.

   WHY THE FILM IS NEVER LOAD-BEARING. Motion here is a decoration on a card
   that must stay readable, so it is layered OVER a still that is doing the
   real work, and every path that ends in "no video" — reduced motion, a save
   -data connection, a codec the browser will not take, an autoplay refusal, a
   shell with no film — simply leaves the still showing. There is no fallback
   branch to get wrong because the fallback IS the base layer.

   The film is only shown against the NIGHT plate: it was cut from the night
   generation, and running it over a daylit still would put two different
   times of day in one frame. That also means it costs nothing for half the
   game clock, which is a fair trade for one 65 KB file per shell.

   `playsinline` and `muted` are what let iOS autoplay at all. The element is
   only mounted once the hero is actually in its night phase, so by the time
   `preload` matters the file is wanted — a site never seen after dark never
   fetches it. */
const props = defineProps({
  shell: { type: String, required: true },
  phase: { type: String, default: 'day' },   // 'day' | 'night'
  motion: { type: Boolean, default: true },
});

const dayPlate = computed(() => sitePlate(props.shell, 'day'));
const nightPlate = computed(() => sitePlate(props.shell, 'night'));
const film = computed(() => siteFilm(props.shell));

/* Decided once, at mount, rather than per render: both are device
   preferences, and re-reading them on every tick would be a matchMedia call
   inside a hot path for a value that changes about never. A user who flips
   "reduce motion" mid-session gets the still on the next reload, which is the
   same deal every other animation in the app offers. */
const allowed = ref(false);
onMounted(() => {
  const mq = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
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
const filmEl = ref(null);
watch(showFilm, async on => {
  if (!on) return;
  await nextTick();
  const v = filmEl.value;
  if (!v || !v.play) return;
  // Both shapes of failure, because they are not the same shape everywhere:
  // browsers reject the returned promise, and environments without a media
  // stack (jsdom, under the component tests) throw synchronously instead.
  try {
    const r = v.play();
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* poster stays up, which is the night plate */ }
}, { immediate: true });
</script>

<template>
  <span class="sfilm" aria-hidden="true">
    <img class="sf-plate" :src="dayPlate" alt=""
         :style="{ opacity: phase === 'day' ? 1 : 0 }" />
    <img class="sf-plate" :src="nightPlate" alt=""
         :style="{ opacity: phase === 'night' ? 1 : 0 }" />
    <video v-if="showFilm" ref="filmEl" class="sf-film" :poster="nightPlate"
           muted loop playsinline autoplay preload="auto" tabindex="-1">
      <source v-if="film.webm" :src="film.webm" type="video/webm" />
      <source v-if="film.mp4" :src="film.mp4" type="video/mp4" />
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
