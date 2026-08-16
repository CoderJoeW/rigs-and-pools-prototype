<script setup>
import { computed, reactive, ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { sparkPath } from '../utils/spark.js';

// PLACEHOLDER - will be replaced with full content
const g = useGameStore();
</script>
<template><div>loading</div></template>
<style scoped>
/* Hybrid: clearer chain hierarchy */
.rowline .nm{font-size:14.5px;font-weight:600;letter-spacing:-.02em}
.card .list .rowline{padding:11px 12px}
</style>
