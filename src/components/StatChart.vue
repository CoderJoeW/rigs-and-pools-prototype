<script setup>
import { computed } from 'vue';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';

const p = defineProps({ title:String, data:Array, color:String, money:Boolean });

const path = computed(()=> sparkPath(p.data, 36, 32));
const last = computed(()=> (p.data&&p.data.length)?p.data[p.data.length-1]:0);
const lo = computed(()=> p.data&&p.data.length?Math.min(...p.data):0);
const hi = computed(()=> p.data&&p.data.length?Math.max(...p.data):0);
</script>

<template>
  <div class="card"><div class="card-hd"><span class="eyebrow">{{ p.title }}</span>
      <span class="eyebrow num">{{ p.money?fmt.usd2(last):fmt.hash(last) }}</span></div>
    <div class="card-bd">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style="width:100%;height:64px;display:block"
           aria-hidden="true">
        <path :d="path" fill="none" :style="{stroke: p.color||'var(--green)'}" stroke-width="1.6"
              vector-effect="non-scaling-stroke"/></svg>
      <div class="track-cap"><span>{{ p.money?fmt.usd2(lo):fmt.hash(lo) }}</span>
        <b>{{ p.money?fmt.usd2(hi):fmt.hash(hi) }}</b></div>
    </div></div>
</template>
