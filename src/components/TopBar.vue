<script setup>
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';

const g = useGameStore();
</script>

<template>
  <div>
  <header class="top">
    <div><span class="wordmark">Rigs &amp; Pools</span>
      <span class="chip">d{{ fmt.day(g.s.t) }} {{ fmt.clock(g.s.t) }}</span>
      <span v-if="g.solarFactor>0.05" class="chip" style="background:var(--gold-t);color:var(--gold)">
        sun {{ fmt.pct(g.solarFactor,0) }}</span>
      <span class="chip">{{ g.ambient.toFixed(0) }}&deg; out</span>
      <span class="chip" :style="g.band==='peak'?'background:var(--red-t);color:var(--red)':
        g.band==='off'?'background:var(--green-t);color:var(--green)':''">
        grid {{ g.band==='off'?'off-peak':g.band }}</span>
      <span v-if="g.s.weather&&g.s.weather.now.cloud>0.45" class="chip">
        {{ g.s.weather.now.cloud>0.75?'overcast':'cloudy' }}</span></div>
    <div><div class="top-cash">{{ fmt.usd(g.s.cash) }}</div>
      <div class="top-sub">{{ fmt.usd(g.walletUsd) }} unsold</div></div>
  </header>
  <div class="speedbar">
    <span class="speedlbl">{{ g.s.speed===1?'Real time':'Fast-forward · '+g.s.speed+'×' }}
      <span v-if="g.s.saveInfo" style="color:var(--ink-3)"> · {{ g.s.saveInfo }}</span></span>
    <span class="speedset">
      <button class="helptog" :class="{on:g.s.help}" @click="g.s.help=!g.s.help"
              style="margin-right:6px">{{ g.s.help?'hide help':'help' }}</button>
      <button v-for="x in g.C.SPEEDS" :key="x" class="speedbtn" :class="{on:g.s.speed===x}"
              @click="g.s.speed=x">{{ x }}&times;</button></span>
  </div></div>
</template>
