<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';
import keyArt from '../assets/key/hero.webp';

const g = useGameStore();
const step = ref(0);
const slide = computed(()=>g.TOUR_SLIDES[step.value]);
const isLast = computed(()=>step.value===g.TOUR_SLIDES.length-1);
// displaySlide overrides only the last slide for a replay: docs/implementation-notes.md#tour-spotlight-tracking-srccomponentswelcometourvue.
const displaySlide = computed(()=>{
  const s = slide.value;
  if(isLast.value && g.s.nextId>1) return { ...s,
    title:'Build another rig',
    body:'Quick pick keeps a fresh, affordable preset ready any time — tap Order parts below whenever you want to add to the farm.' };
  return s;
});

// Spotlight tracking (box-shadow dimming, retry/settle, alive flag): docs/implementation-notes.md#tour-spotlight-tracking-srccomponentswelcometourvue.
interface Spot { top: number; left: number; width: number; height: number }
const spot = ref<Spot | null>(null); // {top,left,width,height} in viewport px, or null
const PAD = 6;
let alive = true;
const currentTarget = (): Element | null =>
  slide.value && slide.value.target ? document.querySelector(slide.value.target) : null;
function readRect(el: Element){
  const r = el.getBoundingClientRect();
  spot.value = { top:r.top-PAD, left:r.left-PAD, width:r.width+PAD*2, height:r.height+PAD*2 };
}
function retrack(){
  const el = currentTarget();
  if(el) readRect(el); else spot.value = null;
}
function measure(){
  const el = currentTarget();
  if(!el){ spot.value = null; return; }
  if(el.scrollIntoView) el.scrollIntoView({ block:'center', behavior:'auto' });
  requestAnimationFrame(()=>{ if(alive) readRect(el); });
  setTimeout(()=>{ if(alive) retrack(); }, 200);
}
function measureWhenReady(triesLeft=8){
  if(!alive) return;
  if(currentTarget()) measure();
  else if(triesLeft>0) requestAnimationFrame(()=>measureWhenReady(triesLeft-1));
  else spot.value = null;
}
async function reposition(){
  if(!g.showTour){ spot.value = null; return; }
  await nextTick();
  measureWhenReady();
}
const onResize = () => { if(g.showTour) retrack(); };
// scrolling flag suppresses .tour-spot's transition during an active
// scroll: docs/implementation-notes.md#tour-spotlight-tracking-srccomponentswelcometourvue.
const scrolling = ref(false);
let scrollSettleTimer: ReturnType<typeof setTimeout> | undefined;
const onScroll = () => {
  if(!g.showTour) return;
  scrolling.value = true;
  clearTimeout(scrollSettleTimer);
  scrollSettleTimer = setTimeout(()=>{ scrolling.value = false; }, 150);
  retrack();
};

// Resets to slide 0 on hidden->shown transition, registered before the
// tab-sync watcher below: docs/implementation-notes.md#tour-spotlight-tracking-srccomponentswelcometourvue.
let tourWasShown = false;
watch(() => g.showTour, (shown: boolean) => {
  if(shown && !tourWasShown) step.value = 0;
  tourWasShown = shown;
}, { immediate:true });

// Drives the tab to match the current slide; runs immediately so slide 1
// is positioned correctly even though 'farm' is already the default tab.
watch(() => g.showTour && slide.value, (s: any) => { if (s) g.s.tab = s.tab; reposition(); }, { immediate:true });

// The reverse direction — some spotlighted targets are themselves buttons
// that jump tabs, so this resyncs the slide to match: docs/implementation-notes.md#tour-spotlight-tracking-srccomponentswelcometourvue.
watch(() => g.s.tab, (tab: string) => {
  if(!g.showTour) return;
  const idx = g.TOUR_SLIDES.findIndex((s: any) => s.tab === tab);
  if(idx !== -1 && idx !== step.value) step.value = idx;
});

onMounted(()=>{
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, true);
});
onBeforeUnmount(()=>{
  alive = false;
  clearTimeout(scrollSettleTimer);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('scroll', onScroll, true);
});
</script>

<template>
  <div v-if="g.showTour && spot" class="tour-spot" aria-hidden="true"
       :style="{ top:spot.top+'px', left:spot.left+'px', width:spot.width+'px', height:spot.height+'px',
                 transition: scrolling ? 'none' : undefined }">
  </div>
  <div v-if="g.showTour" class="card tour" aria-live="polite"
       style="margin:9px 12px 0;padding:12px 14px;background:var(--blue-t)">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px">
      <span class="eyebrow">Getting started &middot; {{ step+1 }} of {{ g.TOUR_SLIDES.length }}</span>
      <button class="btn btn-sm btn-ghost" @click="g.dismissTour()">Skip</button>
    </div>
    <!-- Only the opening slide carries the art. It is the one that has to
         say what the game IS before it starts naming tabs, and repeating a
         picture behind all seven would turn a caption into a carousel. -->
    <img v-if="step===0" class="tour-art" :src="keyArt" alt="" aria-hidden="true" />
    <h3 style="font-size:15px;font-weight:600;letter-spacing:-.02em;margin-bottom:5px;color:var(--ink)">
      {{ displaySlide.title }}</h3>
    <p style="font-size:12.5px;line-height:1.5;color:var(--ink)">{{ displaySlide.body }}</p>
    <div style="display:flex;gap:5px;justify-content:center;margin:10px 0 2px">
      <span v-for="(s,i) in g.TOUR_SLIDES" :key="i" aria-hidden="true"
            :style="{width:'6px',height:'6px',borderRadius:'50%',
                     background: i===step ? 'var(--blue)' : 'var(--line)'}"></span>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button v-if="step>0" class="btn btn-ghost" style="flex:1" @click="step--">Back</button>
      <button v-if="!isLast" class="btn btn-pri" style="flex:2" @click="step++">Next</button>
      <button v-else class="btn btn-pri" style="flex:2" @click="g.dismissTour()">Got it — let's build</button>
    </div>
  </div>
</template>

<style scoped>
.tour-art{
  display:block;
  width:100%;
  aspect-ratio:21/9;
  object-fit:cover;
  object-position:center 52%;
  border-radius:9px;
  margin-bottom:10px;
  background:#070a07;
}
</style>
