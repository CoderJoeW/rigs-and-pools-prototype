<script setup>
defineProps({ title:String, metric:String, rows:Array, pick:Function });
// Capped so a long catalogue's later rows don't sit through a growing
// queue before they animate in — past the cap every remaining row starts
// together, which reads as "the ladder", not a delay.
const rowDelay = i => Math.min(i,8)*22+'ms';
</script>

<template>
  <div class="cmp">
    <div class="cmp-hd"><span>{{ title }}</span><span>{{ metric }}</span></div>
    <component v-for="(r,i) in rows" :key="r.id" :is="pick?'button':'div'"
               class="cmp-r" :class="{cur:r.current, locked:r.locked}"
               :style="{ 'animation-delay': rowDelay(i) }"
               @click="pick && !r.locked && pick(r.id)">
      <span class="cmp-n">{{ i+1 }}</span>
      <span class="cmp-nm"><span class="cmp-t">{{ r.name }}</span>
        <div class="cmp-d">{{ r.sub }}</div></span>
      <span class="cmp-rt"><div class="cmp-v" :class="r.cls">{{ r.value }}</div>
        <div class="cmp-d">{{ r.valueSub }}</div></span>
    </component>
  </div>
</template>
