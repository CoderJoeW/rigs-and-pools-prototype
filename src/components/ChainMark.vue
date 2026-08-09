<script setup>
/* The colour half of a chain's name. Renders nothing on its own account — it
   always sits immediately before the text it belongs to, so the name is what a
   screen reader reads and the mark is what the eye catches. Hence aria-hidden
   and no title: a tooltip here would announce "Tessera" next to the word
   Tessera.
   The hue comes from the static CHAIN_HUE map rather than from the live chain
   record, so a world restored from a save made before chains had hues still
   shows its colours — see the note in chains.js. */
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
