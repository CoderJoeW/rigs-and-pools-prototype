import { defineStore } from 'pinia';
import { installState } from '../game/state.js';
import { installGenerations } from '../game/generations.js';
import { installWeather } from '../game/weather.js';
import { installTimeOfDay } from '../game/timeOfDay.js';
import { installDispatch } from '../game/dispatch.js';
import { installSims } from '../game/sims.js';
import { installPoolMarket } from '../game/poolMarket.js';
import { installBuildDraft } from '../game/buildDraft.js';
import { installTick } from '../game/tick.js';
import { installInsolvency } from '../game/insolvency.js';
import { installActions } from '../game/actions.js';
import { installSites } from '../game/sites.js';
import { installFab } from '../game/fab.js';
import { installPools } from '../game/pools.js';
import { installFleetActions } from '../game/fleetActions.js';
import { installOnboarding } from '../game/onboarding.js';
import { installPersistence } from '../game/persistence.js';

/* createGame — assembles the game from its installers.

   Order matters only for INSTALL-TIME evaluation (e.g. `const s =
   reactive(freshState())`), which is why it is the same order the
   single-file prototype always used. Call-time references resolve through
   G, so cycles between modules are fine.

   The store returns G.__exports verbatim — the same flat object the
   pre-Pinia build handed out via provide/inject. Pinia auto-unwraps
   top-level refs/computed on the object a setup store returns, so
   components read e.g. `g.totalHash` (no `.value`) via useGameStore(),
   where the pre-Pinia build read `g.totalHash.value`. Code that stays
   inside this closure (the game/*.js installers) is unaffected — it never
   goes through the store's external proxy, so it keeps using `.value`
   exactly as before.

   The assembly is a named function rather than an anonymous store body only
   so the export-surface test can see both halves: what the installers put on
   G, and what of it G.__exports publishes. */
export function createGame(){
  const G = {};
  installState(G);
  installGenerations(G);
  installWeather(G);
  installTimeOfDay(G);
  installDispatch(G);
  installSims(G);
  installPoolMarket(G);
  installBuildDraft(G);
  installTick(G);
  installInsolvency(G);
  installActions(G);
  installSites(G);
  installFab(G);
  installPools(G);
  installFleetActions(G);
  installOnboarding(G);
  installPersistence(G);
  if(!G.s.sims.length){
    G.seedSims(0);
    for(const c of G.s.chains){
      const start = G.simHashOf(c);
      c.obs = Math.max(c.floor, start);
      c.anchor = Math.max(1, start / Math.max(1, c.floor));
    }
  }
  return G;
}

export const useGameStore = defineStore('game', () => createGame().__exports);
