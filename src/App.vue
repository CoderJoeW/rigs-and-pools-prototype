<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from './stores/game.js';
import { fmt } from './utils/format.js';
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
// 'auto' leaves no [data-theme] so main.css's prefers-color-scheme query decides
// the CSS palette; the <meta name="theme-color"> that colors the OS status bar
// has no such query-based equivalent for content, so it's kept in sync here
// instead — including tracking a live system-preference change while on auto.
// loadSave() may overwrite g.s.theme after boot, and this reacts to that too.
const LIGHT_BG='#F7F6F1', DARK_BG='#0A0D0A';
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

/* Ambient atmosphere — the decorative .ambient layer reads the simulation's own
   sky rather than sitting still. Purely presentational: it consumes the same
   values the TopBar already puts on screen as chips (solarFactor, ambient temp,
   cloud cover) and publishes four unitless 0..1 factors that main.css folds into
   .ambient's color-mix() gradients. Set on documentElement next to the
   theme-color sync above for the same reason: it's a document-level paint
   detail, not something a component should own.

   The hour is restated here because timeOfDay.js keeps hourOf() internal (it
   isn't on the store's export surface). `elev` is that module's own
   sin(pi*(h-6)/12) solar curve, kept SIGNED instead of clamped at 0 so it stays
   continuous through the night: +1 at noon, 0 at 06:00/18:00, -1 at midnight.
   That sign is what makes dawn and dusk a smooth crossing rather than a jump. */
const clamp01 = v => v<0 ? 0 : v>1 ? 1 : v;
const atmosphere = computed(()=>{
  const h = (((g.s.t%86400)+86400)%86400)/3600;
  const elev = Math.sin(Math.PI*(h-6)/12);
  const cloud = clamp01(g.s.weather ? g.s.weather.now.cloud : 0);
  const day = clamp01((elev+0.15)/0.55);              // 0 through the night, 1 by mid-morning
  const golden = clamp01(1-Math.abs(elev)/0.40);      // sun near the horizon, either side
  const heat = clamp01((g.ambient-g.C.AMBIENT_LOW)/(g.C.AMBIENT_HIGH-g.C.AMBIENT_LOW));
  const solar = clamp01(g.solarFactor);               // already cloud-attenuated by sky()
  return {
    // How much light there is at all: mostly solar, with a floor of daylight so
    // an overcast noon still outranks midnight.
    '--amb-lum': clamp01(0.08+0.62*solar+0.30*day).toFixed(3),
    // Golden hour, dulled by cloud, plus a little of the afternoon's heat.
    '--amb-warm': clamp01(0.80*golden*(1-0.55*cloud)+0.20*heat*day).toFixed(3),
    // The night's cool cast — time of day only, independent of how bright it is.
    '--amb-cool': (1-day).toFixed(3),
    // Cloud cover, which desaturates everything rather than dimming it.
    '--amb-haze': cloud.toFixed(3),
  };
});
const AMB_KEYS=['--amb-lum','--amb-warm','--amb-cool','--amb-haze'];
const ambApplied={};
/* Ticks land every TICK_MS, so only the values that actually moved are written
   — at 1x most ticks change nothing past 3 decimals. */
watch(atmosphere, vals=>{
  const st=document.documentElement.style;
  for(const k of AMB_KEYS) if(ambApplied[k]!==vals[k]){ ambApplied[k]=vals[k]; st.setProperty(k,vals[k]); }
}, {immediate:true});
/* Rank-up flourish (issue #47) — the screen acknowledges a rank-up, not just
   the toast. #40 gave a rank-up its own toast, but a toast is one fixed box at
   the top of the screen the player may not be looking at, and the rarest,
   most permanent event in the game (5-6 in a whole run) occupied exactly the
   same amount of the visual field as a routine "Biggest block yet".

   Detected here rather than pushed from tick.js for the same reason the
   --amb-* factors above are computed here: this is a presentational,
   document-level reaction to a game-state change, and the game has no
   business knowing the screen flashed. pop() already funnels every "worth
   interrupting the player for" moment through one place and stamps it with a
   cls, and s.toast.n is the counter that increments once per toast that
   actually lands — so watching it catches exactly the rank-ups that reached
   the screen, and none that pop()'s rate limit swallowed. It fires only for
   cls==='rankup'; every other kind of toast is unaccompanied, as before.

   Nothing is watched deeply and nothing is read on the first tick: the watch
   is not immediate, so a save restored with a rank-up toast still in s.toast
   does not re-flash it on reload.

   The element is mounted for FLASH_MS and then removed, which is what makes
   the reduced-motion fallback work: with motion suppressed the layer is a
   static edge glow that is simply present for that window and then gone (see
   .rankflash in main.css). The CSS animation is shorter than the window, so
   it has already settled to transparent before the node leaves. The :key is
   the counter, so two rank-ups in quick succession restart the animation
   rather than the second one landing on an element mid-fade. */
const FLASH_MS=900;
const rankFlash=ref(0);
let flashTimer=null;
watch(()=>g.s.toast.n, ()=>{
  if(g.s.toast.cls!=='rankup') return;
  rankFlash.value++;
  clearTimeout(flashTimer);
  flashTimer=setTimeout(()=>{ rankFlash.value=0; }, FLASH_MS);
});
let timer=null, saver=null;
const onHide=()=>{ if(document.visibilityState==='hidden') g.saveNow(); };
const onLeave=()=>g.saveNow();
/* loadSave() now yields periodically during a long offline catch-up (see
   persistence.js) rather than running as one blocking synchronous task, so
   the tab stays responsive — but Vue still mounts and paints the DEFAULT
   state on the very first frame regardless, since loadSave hasn't resolved
   yet. Without this flag that shows as a flash of a fresh $500 start
   before the real save (and its catch-up) lands on top of it a moment
   later. `booting` covers that gap with a loading screen instead, and
   doubles as the catch-up progress display once g.s.catchUp is set. */
const booting=ref(true);
onMounted(async ()=>{
  await g.loadSave();                       // resume first, then start the clock
  booting.value=false;
  timer=setInterval(()=>g.stepTick(),g.C.TICK_MS);
  saver=setInterval(()=>g.saveNow(),g.C.SAVE_EVERY*1000);
  g.saveNow();
  window.addEventListener('pagehide',onLeave);
  document.addEventListener('visibilitychange',onHide);
});
onUnmounted(()=>{ clearInterval(timer); clearInterval(saver); clearTimeout(flashTimer);
  window.removeEventListener('pagehide',onLeave);
  document.removeEventListener('visibilitychange',onHide);
  for(const k of AMB_KEYS) document.documentElement.style.removeProperty(k);
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
  <div v-if="booting" class="boot" role="status" aria-live="polite">
    <span class="brandmark" aria-hidden="true"><svg viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>
      <circle cx="12" cy="12" r="2.5"/></svg></span>
    <template v-if="g.s.catchUp">
      <p>Catching up on {{ fmt.dur(g.s.catchUp.credited) }} away&hellip;</p>
      <span class="cd-bar">
        <i :style="{width:(g.s.catchUp.done/g.s.catchUp.credited*100).toFixed(0)+'%'}"></i></span>
    </template>
    <p v-else>Loading&hellip;</p>
  </div>
  <template v-else>
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
      @click="g.s.tab=t.id" :aria-current="g.s.tab===t.id?'page':null">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="t.icon"/></svg>{{ t.label }}</button></nav>
  <div v-if="rankFlash" class="rankflash" :key="'rf'+rankFlash" aria-hidden="true"></div>
  <div v-if="g.s.toast.n" class="toast" :class="g.s.toast.cls" :key="g.s.toast.n"
       :role="g.s.toast.cls==='dark'?'alert':'status'" aria-live="polite" aria-atomic="true">
    <span>{{ g.s.toast.text }}</span><span class="num">{{ g.s.toast.amount }}</span></div>
  </template>
</template>
