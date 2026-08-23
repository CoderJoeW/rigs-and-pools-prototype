<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';
import { useTweenedNumber } from '../composables/useTweenedNumber.js';
import { sfx, cycleVolume, volumeLabel } from '../services/audio.js';

/* The sound pill (issue #46) sits beside `help` because the speedbar is the
   one strip visible from every tab, and because `help` already establishes it
   as where this app keeps its "how much does this thing tell me" preferences.
   It is NOT part of g.s: a mute is a property of this device, not of the save
   — services/audio.js explains why that distinction matters. */
const g = useGameStore();
/* The cash figure is the most-looked-at number in the app, so it counts to
   its new value rather than swapping to it — a payout landing should look
   different from a page reload (issue #43). Display only: g.s.cash is still
   the truth everything else reads. */
const cashShown = useTweenedNumber(() => g.s.cash);

/* This chip is the "what time is it" readout, shown right beside sun% and
   the grid band — so it has to be on the same DAY_HOURS cycle those run on
   (timeOfDay.js's hourOf), not fmt.day/fmt.clock's real-time 86400s day.
   Everywhere else fmt.day/fmt.clock/fmt.hm are used — the feed log's
   timestamps — they're a record of real elapsed session time and are
   deliberately left alone. */
const CYCLE_S = g.C.DAY_HOURS*3600;
const dayClock = computed(()=>{
  const t=((g.s.t%CYCLE_S)+CYCLE_S)%CYCLE_S, hourFloat=t/CYCLE_S*24;
  const h=Math.floor(hourFloat), m=Math.floor((hourFloat-h)*60);
  return 'd'+(Math.floor(g.s.t/CYCLE_S)+1)+' '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
});
</script>

<template>
  <div>
  <header class="top">
    <div class="top-left"><span class="wordmark">
        <span class="brandmark" aria-hidden="true"><svg viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>
          <circle cx="12" cy="12" r="2.5"/></svg></span>
        Rigs &amp; Pools
        <span class="live" role="status" aria-label="Simulation running"></span></span>
      <span class="chip">{{ dayClock }}</span>
      <span v-if="g.solarFactor>0.05" class="chip" style="background:var(--gold-t);color:var(--gold)">
        sun {{ fmt.pct(g.solarFactor,0) }}</span>
      <span class="chip">{{ g.ambient.toFixed(0) }}&deg; out</span>
      <span class="chip" :style="g.band==='peak'?'background:var(--red-t);color:var(--red)':
        g.band==='off'?'background:var(--green-t);color:var(--green)':''">
        grid {{ g.band==='off'?'off-peak':g.band }}</span>
      <span v-if="g.s.weather&&g.s.weather.now.cloud>0.45" class="chip">
        {{ g.s.weather.now.cloud>0.75?'overcast':'cloudy' }}</span></div>
    <div class="top-right"><div class="top-cash">{{ fmt.usd(cashShown) }}</div>
      <div class="top-sub">{{ fmt.usd(g.walletUsd) }} unsold</div></div>
  </header>
  <div class="speedbar">
    <span class="speedlbl">{{ g.s.speed===1?'Real time':'Fast-forward · '+g.s.speed+'×' }}
      <span v-if="g.s.saveInfo" style="color:var(--ink-3)"> · {{ g.s.saveInfo }}</span></span>
    <span class="speedset">
      <button v-if="!g.showTour" class="helptog" @click="g.restartTour()"
              title="Replay the getting-started tour" style="margin-right:6px">tour</button>
      <button class="helptog" :class="{on:g.s.help}" @click="g.s.help=!g.s.help"
              style="margin-right:6px">{{ g.s.help?'hide help':'help' }}</button>
      <button class="sndtog" :class="{on:sfx.volume>0}" @click="cycleVolume()"
              :aria-label="'Sound is '+volumeLabel()+'. Activate to change level.'"
              :title="sfx.volume>0 ? 'Sound on — cycles louder, then off'
                                   : 'Sound off — blocks, jackpots and rank-ups'"
              style="margin-right:6px">{{ volumeLabel() }}</button>
      <button v-for="x in g.C.SPEEDS" :key="x" class="speedbtn" :class="{on:g.s.speed===x}"
              @click="g.s.speed=x">{{ x }}&times;</button></span>
  </div></div>
</template>
