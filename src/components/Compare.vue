<script setup>
defineProps({ title:String, metric:String, rows:Array, pick:Function });
</script>

<template>
  <div class="cmp">
    <div class="cmp-hd"><span>{{ title }}</span><span>{{ metric }}</span></div>
    <component v-for="(r,i) in rows" :key="r.id" :is="pick?'button':'div'"
               class="cmp-r" :class="{cur:r.current, locked:r.locked}"
               @click="pick && !r.locked && pick(r.id)">
      <span class="cmp-n">{{ i+1 }}</span>
      <span class="cmp-nm"><span class="cmp-t">{{ r.name }}</span>
        <div class="cmp-d">{{ r.sub }}</div></span>
      <span class="cmp-rt"><div class="cmp-v" :class="r.cls">{{ r.value }}</div>
        <div class="cmp-d">{{ r.valueSub }}</div></span>
    </component>
  </div>
</template>
