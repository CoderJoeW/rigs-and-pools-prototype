<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';

const g = useGameStore();
const step = ref(0);
const slide = computed(()=>g.TOUR_SLIDES[step.value]);
const isLast = computed(()=>step.value===g.TOUR_SLIDES.length-1);

/* The spotlight — a single element sized to the real target's own rect,
   with a box-shadow spread wide enough to cover the rest of the viewport.
   box-shadow is pure paint, never hit-tested, so this dims everything
   without a second overlay element and without ever intercepting a click
   — same "caption, not a lock" rule the rest of the tour follows. */
const spot = ref(null); // {top,left,width,height} in viewport px, or null
const PAD = 6;
// Guards the retry/settle chain below against outliving the component —
// it's plain requestAnimationFrame/setTimeout recursion, not a Vue
// watcher, so unmounting mid-chain would otherwise keep it alive (and
// free to touch a torn-down component's refs) until it ran itself out.
let alive = true;
const currentTarget = () =>
  slide.value && slide.value.target && document.querySelector(slide.value.target);
function readRect(el){
  const r = el.getBoundingClientRect();
  spot.value = { top:r.top-PAD, left:r.left-PAD, width:r.width+PAD*2, height:r.height+PAD*2 };
}
// Re-measures WITHOUT scrolling — for resize/scroll, where the target
// hasn't changed and re-centering it would fight the player's own scroll
// input every time they tried to look at anything else.
function retrack(){
  const el = currentTarget();
  if(el) readRect(el); else spot.value = null;
}
// Scrolls to and measures a NEWLY arrived-at target. views/main.css's
// .viewfade transition (160ms, up to a 7px translateY) is still animating
// when the target first exists, so an immediate read lands a few px off
// its resting position — corrected by a second read once it's done.
function measure(){
  const el = currentTarget();
  if(!el){ spot.value = null; return; }
  if(el.scrollIntoView) el.scrollIntoView({ block:'center', behavior:'auto' });
  requestAnimationFrame(()=>{ if(alive) readRect(el); });
  setTimeout(()=>{ if(alive) retrack(); }, 200);
}
/* The tab switch, the view remount behind it, and the target actually
   existing in the DOM don't all land in the same tick — retries across a
   few animation frames rather than assuming one nextTick is enough. */
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
// capture:true — the .body panel is what actually scrolls (main.css:
// overflow-y:auto), and a scroll on an inner element doesn't bubble to
// window, but it does reach a capturing ancestor listener regardless of
// which element scrolls, so this needs no reference to .body itself.
const onScroll = () => { if(g.showTour) retrack(); };

/* Each slide names the tab it's about; the tour drives navigation there
   itself so the spotlight always lands on the real screen it's
   describing, not a blank one. Runs immediately so the very first slide
   is positioned correctly even though 'farm' is already the default tab. */
watch(() => g.showTour && slide.value, s => { if (s) g.s.tab = s.tab; reposition(); }, { immediate:true });

/* The other direction. Several of the tour's own spotlighted targets are
   themselves live buttons that jump tabs on click — FarmView's "Go
   shopping" and RigsView's "Build one" both point straight at Build,
   right there inside the highlight. Clicking one used to leave the tour's
   own step wherever Next/Back last put it: caption still reading "Rigs,"
   spotlight hunting for a target that no longer exists on the Build tab
   underneath. The tour follows instead — every tab is one of its own
   slides, so any tab change while it's up (this button, or just tapping
   the tab bar directly) resyncs the displayed slide to match, keeping
   caption, spotlight and the real screen in agreement no matter which of
   the two ever moves first. Guarded on actually differing so this can't
   bounce against the watcher above. */
watch(() => g.s.tab, tab => {
  if(!g.showTour) return;
  const idx = g.TOUR_SLIDES.findIndex(s => s.tab === tab);
  if(idx !== -1 && idx !== step.value) step.value = idx;
});

onMounted(()=>{
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, true);
});
onBeforeUnmount(()=>{
  alive = false;
  window.removeEventListener('resize', onResize);
  window.removeEventListener('scroll', onScroll, true);
});
</script>

<template>
  <div v-if="g.showTour && spot" class="tour-spot" aria-hidden="true"
       :style="{ top:spot.top+'px', left:spot.left+'px', width:spot.width+'px', height:spot.height+'px' }">
  </div>
  <div v-if="g.showTour" class="card tour" aria-live="polite"
       style="margin:9px 12px 0;padding:12px 14px;background:var(--blue-t)">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px">
      <span class="eyebrow">Getting started &middot; {{ step+1 }} of {{ g.TOUR_SLIDES.length }}</span>
      <button class="btn btn-sm btn-ghost" @click="g.dismissTour()">Skip</button>
    </div>
    <h3 style="font-size:15px;font-weight:600;letter-spacing:-.02em;margin-bottom:5px;color:var(--ink)">
      {{ slide.title }}</h3>
    <p style="font-size:12.5px;line-height:1.5;color:var(--ink)">{{ slide.body }}</p>
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
