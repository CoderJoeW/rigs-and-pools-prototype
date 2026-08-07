<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import { useGameStore } from './stores/game.js';
import TopBar from './components/TopBar.vue';
import OnboardingBanner from './components/OnboardingBanner.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import FarmView from './views/FarmView.vue';
import SitesView from './views/SitesView.vue';
import RigsView from './views/RigsView.vue';
import BuildView from './views/BuildView.vue';
import ChainsView from './views/ChainsView.vue';
import MarketView from './views/MarketView.vue';
import StatsView from './views/StatsView.vue';

const g = useGameStore();
// 'auto' leaves no [data-theme] so main.css's prefers-color-scheme query decides
// the CSS palette; the <meta name="theme-color"> that colors the OS status bar
// has no such query-based equivalent for content, so it's kept in sync here
// instead — including tracking a live system-preference change while on auto.
// loadSave() may overwrite g.s.theme after boot, and this reacts to that too.
const LIGHT_BG='#F5F6F4', DARK_BG='#14181A';
const darkMedia = typeof matchMedia==='function' ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme(theme){
  if(theme==='light'||theme==='dark') document.documentElement.dataset.theme=theme;
  else delete document.documentElement.dataset.theme;
  const isDark = theme==='dark' || (theme==='auto' && !!(darkMedia&&darkMedia.matches));
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', isDark?DARK_BG:LIGHT_BG);
}
watch(()=>g.s.theme, applyTheme, {immediate:true});
const onSystemThemeChange=()=>{ if(g.s.theme==='auto') applyTheme('auto'); };
if(darkMedia) darkMedia.addEventListener('change',onSystemThemeChange);
let timer=null, saver=null;
const onHide=()=>{ if(document.visibilityState==='hidden') g.saveNow(); };
const onLeave=()=>g.saveNow();
onMounted(async ()=>{
  await g.loadSave();                       // resume first, then start the clock
  timer=setInterval(()=>g.stepTick(),g.C.TICK_MS);
  saver=setInterval(()=>g.saveNow(),g.C.SAVE_EVERY*1000);
  g.saveNow();
  window.addEventListener('pagehide',onLeave);
  document.addEventListener('visibilitychange',onHide);
});
onUnmounted(()=>{ clearInterval(timer); clearInterval(saver);
  window.removeEventListener('pagehide',onLeave);
  document.removeEventListener('visibilitychange',onHide);
  if(darkMedia) darkMedia.removeEventListener('change',onSystemThemeChange); });
const views={farm:FarmView,sites:SitesView,rigs:RigsView,build:BuildView,
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
  <TopBar />
  <OnboardingBanner />
  <main class="body">
    <ErrorBoundary :key="g.s.tab"><component :is="views[g.s.tab]" /></ErrorBoundary>
  </main>
  <nav class="tabs"><button v-for="t in allTabs" :key="t.id" class="tab" :class="{on:g.s.tab===t.id}"
      @click="g.s.tab=t.id" :aria-current="g.s.tab===t.id?'page':null">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="t.icon"/></svg>{{ t.label }}</button></nav>
  <div v-if="g.s.toast.n" class="toast" :class="g.s.toast.cls" :key="g.s.toast.n"
       :role="g.s.toast.cls==='dark'?'alert':'status'" aria-live="polite" aria-atomic="true">
    <span>{{ g.s.toast.text }}</span><span class="num">{{ g.s.toast.amount }}</span></div>
</template>
