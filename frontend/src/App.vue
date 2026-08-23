<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from './stores/game.js';
import { fmt } from './utils/format.js';
import keyArt from './assets/key/hero.webp';
import TopBar from './components/TopBar.vue';
import OnboardingBanner from './components/OnboardingBanner.vue';
import WelcomeTour from './components/WelcomeTour.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import FarmView from './views/FarmView.vue';
import SitesView from './views/SitesView.vue';
import RigsView from './views/RigsView.vue';
import BuildView from './views/BuildView.vue';
import ChainsView from './views/ChainsView.vue';
import MarketView from './views/MarketView.vue';
import StatsView from './views/StatsView.vue';

const g = useGameStore();
// Theme sync (meta theme-color, system-preference tracking): docs/implementation-notes.md#app-shell-srcappvue.
const LIGHT_BG='#F7F6F1', DARK_BG='#0A0D0A';
const darkMedia = typeof matchMedia==='function' ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme(theme: string){
  if(theme==='light'||theme==='dark') document.documentElement.dataset.theme=theme;
  else delete document.documentElement.dataset.theme;
  const isDark = theme==='dark' || (theme==='auto' && !!(darkMedia&&darkMedia.matches));
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', isDark?DARK_BG:LIGHT_BG);
}
watch(()=>g.s.theme, applyTheme, {immediate:true});
const onSystemThemeChange=()=>{ if(g.s.theme==='auto') applyTheme('auto'); };
if(darkMedia) darkMedia.addEventListener('change',onSystemThemeChange);

// Ambient atmosphere factors, published to documentElement style: docs/implementation-notes.md#app-shell-srcappvue.
const clamp01 = (v: number) => v<0 ? 0 : v>1 ? 1 : v;
const CYCLE_S = g.C.DAY_HOURS*3600;
const atmosphere = computed(()=>{
  const h = (((g.s.t%CYCLE_S)+CYCLE_S)%CYCLE_S)/CYCLE_S*24;
  const elev = Math.sin(Math.PI*(h-6)/12);
  const cloud = clamp01(g.s.weather ? g.s.weather.now.cloud : 0);
  const day = clamp01((elev+0.15)/0.55);              // 0 through the night, 1 by mid-morning
  const golden = clamp01(1-Math.abs(elev)/0.40);      // sun near the horizon, either side
  const heat = clamp01((g.ambient-g.C.AMBIENT_LOW)/(g.C.AMBIENT_HIGH-g.C.AMBIENT_LOW));
  const solar = clamp01(g.solarFactor);               // already cloud-attenuated by sky()
  return {
    '--amb-lum': clamp01(0.08+0.62*solar+0.30*day).toFixed(3),
    '--amb-warm': clamp01(0.80*golden*(1-0.55*cloud)+0.20*heat*day).toFixed(3),
    '--amb-cool': (1-day).toFixed(3),
    '--amb-haze': cloud.toFixed(3),
  };
});
const AMB_KEYS=['--amb-lum','--amb-warm','--amb-cool','--amb-haze'] as const;
const ambApplied: Record<string, string>={};
watch(atmosphere, vals=>{
  const st=document.documentElement.style;
  for(const k of AMB_KEYS) if(ambApplied[k]!==vals[k]){ ambApplied[k]=vals[k]; st.setProperty(k,vals[k]); }
}, {immediate:true});
// Rank-up screen flash (issue #47): docs/implementation-notes.md#app-shell-srcappvue.
const FLASH_MS=900;
const rankFlash=ref(0);
let flashTimer: ReturnType<typeof setTimeout> | null=null;
watch(()=>g.s.toast.n, ()=>{
  if(g.s.toast.cls!=='rankup') return;
  rankFlash.value++;
  if(flashTimer) clearTimeout(flashTimer);
  flashTimer=setTimeout(()=>{ rankFlash.value=0; }, FLASH_MS);
});
let timer: ReturnType<typeof setInterval> | null=null, saver: ReturnType<typeof setInterval> | null=null,
  lastTickAt: number | null=null;
/* Credits time lost to setInterval throttling or an outright stall, from
   either of two triggers — a backgrounded tab (onVisibility) or a stall
   visibilitychange never reports at all, like an OS sleep/lid-close that
   freezes a still-foreground tab (onTick's own gap check): docs/
   implementation-notes.md#app-shell-srcappvue. Both share lastTickAt as
   the single checkpoint of "game time is accounted for up to here" —
   background tabs aren't fully frozen, just throttled (often to ~1/min
   once hidden a while), so onTick can itself credit part of a background
   span before onVisibility's 'visible' branch runs; computing away from
   that same checkpoint (instead of a separate hidden-at timestamp) is
   what stops the latter from re-crediting time onTick already caught. */
const onVisibility=()=>{
  if(document.visibilityState==='hidden'){ g.saveNow(); return; }
  const now=Date.now();
  const away=lastTickAt!=null ? (now-lastTickAt)/1000 : 0;
  lastTickAt=now;
  if(away>60) g.creditAway(away);
};
const onTick=()=>{
  const now=Date.now();
  // A catch-up already in flight (from here or from onVisibility) is
  // replaying game time itself — stepTick()ing alongside it would inject a
  // stray live tick into the middle of that replay.
  if(g.s.catchUp){ lastTickAt=now; return; }
  const gap=lastTickAt!=null ? (now-lastTickAt)/1000 : 0;
  lastTickAt=now;
  if(gap>60) g.creditAway(gap); else g.stepTick();
};
const onLeave=()=>g.saveNow();
// Boot sequencing (booting flag, catchUp overlay reused for backup import): docs/implementation-notes.md#app-shell-srcappvue.
const booting=ref(true);
const catchUpPct=computed(()=> g.s.catchUp
  ? Math.round(g.s.catchUp.done/g.s.catchUp.credited*100) : 0);
onMounted(async ()=>{
  try{ await g.loadSave(); }                 // resume first, then start the clock
  finally{
    // Unconditional startup even if loadSave rejected: docs/implementation-notes.md#app-shell-srcappvue.
    booting.value=false;
    lastTickAt=Date.now();
    timer=setInterval(onTick,g.C.TICK_MS);
    saver=setInterval(()=>g.saveNow(),g.C.SAVE_EVERY*1000);
    g.saveNow();
    window.addEventListener('pagehide',onLeave);
    document.addEventListener('visibilitychange',onVisibility);
  }
});
onUnmounted(()=>{ if(timer) clearInterval(timer); if(saver) clearInterval(saver); if(flashTimer) clearTimeout(flashTimer);
  window.removeEventListener('pagehide',onLeave);
  document.removeEventListener('visibilitychange',onVisibility);
  for(const k of AMB_KEYS) document.documentElement.style.removeProperty(k);
  if(darkMedia) darkMedia.removeEventListener('change',onSystemThemeChange); });
const views: Record<string, unknown>={farm:FarmView,sites:SitesView,rigs:RigsView,build:BuildView,
             chains:ChainsView,market:MarketView,stats:StatsView};
const allTabs=[
  {id:'farm',  label:'Farm',  icon:'M3 12h3.5l2.5-7 4 14 2.5-7H21'},
  {id:'sites', label:'Sites', icon:'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6'},
  {id:'rigs',  label:'Rigs',  icon:'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2M7 7h10v10H7z'},
  {id:'build', label:'Build', icon:'M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2 2 0 0 1-2.8 0l-2.2-2.2a2 2 0 0 1 0-2.8z'},
  {id:'chains',label:'Chains',icon:'M9 7h6M9 12h6M9 17h6M5 7h.01M5 12h.01M5 17h.01M19 7h.01M19 12h.01M19 17h.01'},
  {id:'market',label:'Market',icon:'M4 19V5M4 19h16M8 14.5l3.5-4 3 2.5L20 8'},
  {id:'stats', label:'Stats', icon:'M5 20V10M12 20V4M19 20v-7'},
];
</script>

<template>
  <div v-if="booting || g.s.catchUp" class="boot" role="status" aria-live="polite">
    <!-- The cold start used to be a 34px outline and the word "Loading". The
         first thing a new player saw never once showed them what the game was
         about, and a catch-up after a long absence could hold that screen for
         several seconds. The key art is the same frame the icon set and the
         share card are cut from, so the app has one face wherever it turns up. -->
    <img class="boot-art" :src="keyArt" alt="" aria-hidden="true" />
    <span class="brandmark" aria-hidden="true"><svg viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>
      <circle cx="12" cy="12" r="2.5"/></svg></span>
    <span class="boot-wordmark" aria-hidden="true">Rigs &amp; Pools</span>
    <template v-if="g.s.catchUp">
      <p>Catching up on {{ fmt.dur(g.s.catchUp.credited) }} away&hellip;</p>
      <span class="cd-bar" role="progressbar" :aria-valuenow="catchUpPct" aria-valuemin="0" aria-valuemax="100">
        <i :style="{width:catchUpPct+'%'}"></i></span>
    </template>
    <p v-else>Loading&hellip;</p>
  </div>
  <template v-if="!booting">
  <div class="ambient" aria-hidden="true"></div>
  <TopBar />
  <OnboardingBanner />
  <WelcomeTour />
  <main class="body">
    <ErrorBoundary :key="g.s.tab">
      <Transition name="viewfade" appear>
        <component :is="views[g.s.tab]" />
      </Transition>
    </ErrorBoundary>
  </main>
  <nav class="tabs"><button v-for="t in allTabs" :key="t.id" class="tab" :class="{on:g.s.tab===t.id}"
      @click="g.s.tab=t.id" :aria-current="g.s.tab===t.id?'page':undefined">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="t.icon"/></svg>{{ t.label }}</button></nav>
  <div v-if="rankFlash" class="rankflash" :key="'rf'+rankFlash" aria-hidden="true"></div>
  <div v-if="g.s.toast.n" class="toast" :class="g.s.toast.cls" :key="g.s.toast.n"
       :role="g.s.toast.cls==='dark'?'alert':'status'" aria-live="polite" aria-atomic="true">
    <span>{{ g.s.toast.text }}</span><span class="num">{{ g.s.toast.amount }}</span></div>
  </template>
</template>
