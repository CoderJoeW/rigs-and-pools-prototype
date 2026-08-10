<script setup>
import { computed, ref, watch } from 'vue';
import { useGameStore } from '../stores/game.js';

const g = useGameStore();
const step = ref(0);
const slide = computed(()=>g.TOUR_SLIDES[step.value]);
const isLast = computed(()=>step.value===g.TOUR_SLIDES.length-1);

/* The tour drives navigation itself — each slide names the tab it's about
   (src/game/onboarding.js), so the caption always sits over the real
   screen it's describing rather than a blank one. Runs immediately so the
   very first slide lands correctly even though 'farm' is already the
   default tab. Not a lock: nothing stops a player tapping another tab on
   their own mid-tour, Next/Back just put them back on the right one. */
watch(() => g.showTour && slide.value, s => { if (s) g.s.tab = s.tab; }, { immediate:true });
</script>

<template>
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
