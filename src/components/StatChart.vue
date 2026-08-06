<script setup>
import { computed } from 'vue';
import { fmt } from '../utils/format.js';

const p = defineProps({ title:String, data:Array, color:String, money:Boolean });

const path = computed(()=>{
  const h=p.data||[]; if(h.length<2) return '';
  const lo=Math.min(...h), hi=Math.max(...h), r=(hi-lo)||1;
  return h.map((v,i)=>(i?'L':'M')+(i/(h.length-1)*100).toFixed(1)+' '+
    (36-((v-lo)/r)*32).toFixed(1)).join(' ');
});
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
        <path :d="path" fill="none" :stroke="p.color||'#137A55'" stroke-width="1.6"
              vector-effect="non-scaling-stroke"/></svg>
      <div class="track-cap"><span>{{ p.money?fmt.usd2(lo):fmt.hash(lo) }}</span>
        <b>{{ p.money?fmt.usd2(hi):fmt.hash(hi) }}</b></div>
    </div></div>
</template>
