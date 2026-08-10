<script setup>
import { computed, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { useSheetA11y } from '../composables/useSheetA11y.js';

const g = useGameStore();
const step = ref(0);
const slide = computed(()=>g.TOUR_SLIDES[step.value]);
const isLast = computed(()=>step.value===g.TOUR_SLIDES.length-1);

const tourEl = ref(null);
useSheetA11y(tourEl, computed(()=>g.showTour), ()=>g.dismissTour());
</script>

<template>
  <div v-if="g.showTour" class="sheet" ref="tourEl" role="dialog" aria-modal="true"
       aria-labelledby="tour-title">
    <div class="sheet-hd">
      <span class="eyebrow">Getting started &middot; {{ step+1 }} of {{ g.TOUR_SLIDES.length }}</span>
      <button class="btn btn-sm btn-ghost" @click="g.dismissTour()">Skip</button>
    </div>
    <div class="sheet-bd">
      <div class="empty" style="text-align:left;padding:18px 4px 8px">
        <h3 id="tour-title">{{ slide.title }}</h3>
        <p>{{ slide.body }}</p>
      </div>
      <div style="display:flex;gap:5px;justify-content:center;margin:10px 0 4px">
        <span v-for="(s,i) in g.TOUR_SLIDES" :key="i" aria-hidden="true"
              :style="{width:'6px',height:'6px',borderRadius:'50%',
                       background: i===step ? 'var(--blue)' : 'var(--line)'}"></span>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button v-if="step>0" class="btn btn-ghost" style="flex:1" @click="step--">Back</button>
        <button v-if="!isLast" class="btn btn-pri" style="flex:2" @click="step++">Next</button>
        <button v-else class="btn btn-pri" style="flex:2" @click="g.beginFirstBuild()">Open Build</button>
      </div>
    </div>
  </div>
</template>
