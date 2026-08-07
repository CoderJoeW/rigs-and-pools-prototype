<script setup>
import { computed, ref } from 'vue';
import { useGameStore } from '../stores/game.js';

const g = useGameStore();
const filt = ref('all');
const GROUPS = { blocks:['block','pool'], money:['pay','sys','big'], problems:['bad'] };
const shown = computed(()=> filt.value==='all' ? g.s.feed
  : g.s.feed.filter(e=>GROUPS[filt.value].includes(e.kind)));
</script>

<template>
  <div class="card"><div class="card-hd"><span class="eyebrow">Activity</span>
      <span class="eyebrow"><button v-for="k in ['all','blocks','money','problems']" :key="k"
        class="btn btn-sm" :class="filt===k?'btn-pri':'btn-ghost'"
        @click="filt=k">{{ k }}</button></span></div>
    <div class="feed"><div v-if="!shown.length" class="ev"><span class="ev-x"
      style="color:var(--ink-3)">Nothing of that kind yet.</span></div>
      <div v-for="e in shown" :key="e.id" class="ev" :class="e.kind">
      <span class="ev-t">{{ e.t }}</span>
      <span class="ev-x">{{ e.text }}<span v-if="e.n>1" style="color:var(--ink-3)"> &times;{{ e.n }}</span></span>
      <span class="ev-a">{{ e.amount }}</span></div></div></div>
</template>
