<script setup lang="ts">
// Chain mark architecture (renders nothing on its own account, static hue
// map for save compatibility): docs/implementation-notes.md#chain-colour-mark-srccomponentschainmarkvue.
import { computed } from 'vue';
import { CHAIN_HUE } from '../data/chains.js';

const props = defineProps({
  chain: { type:String, required:true },   // chain id, e.g. 'tessera'
  lg:    { type:Boolean, default:false },  // the larger mark used on the Chains tab
});
const hue = computed(()=>CHAIN_HUE[props.chain]);
</script>

<template>
  <i v-if="hue!==undefined" class="cmk" :class="{lg}"
     :style="{'--chain-h':hue}" aria-hidden="true"></i>
</template>
