<script setup>
import { useGameStore } from '../stores/game.js';

const g = useGameStore();
</script>

<template>
  <div v-if="g.onboardingStep" class="card"
       style="margin:9px 12px 0;padding:10px 12px;background:var(--blue-t);
              display:flex;gap:10px;align-items:flex-start">
    <span style="flex:1;font-size:12.5px;line-height:1.5;color:var(--ink)">{{ g.onboardingStep.text }}</span>
    <button @click="g.dismissOnboarding()" aria-label="dismiss"
            style="flex:none;font-size:16px;line-height:1;color:var(--blue)">&times;</button>
  </div>
</template>
