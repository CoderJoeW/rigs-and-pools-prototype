import { computed } from 'vue';
import { useGameStore } from '../stores/game.js';
import { CHAIN_HUE } from '../data/chains.js';

type Store = ReturnType<typeof useGameStore>;

// Dominant chassis state for a site row hero — prefer attention states, then
// running, then build, else off. Same vocabulary the Rigs list and Sites
// floor already use.
function siteChassisState(g: Store, f: any): string {
  const rigs = g.siteRigs(f);
  if (!rigs.length) return 'off';
  let hasBad = false, hasWarn = false, hasBuild = false, hasRun = false;
  for (const r of rigs) {
    const d = g.rigState(r).dot;
    if (d === 'bad') hasBad = true;
    else if (d === 'warn') hasWarn = true;
    else if (d === 'build') hasBuild = true;
    else if (d === 'run') hasRun = true;
  }
  if (hasBad) return 'bad';
  if (hasWarn) return 'warn';
  if (hasBuild) return 'build';
  if (hasRun) return 'run';
  return 'off';
}

// One row per site and per group, for FarmView's overview lists.
export function useFarmRows(g: Store) {
  const siteRows = computed(() => g.s.sites.map(f => {
    const rigs = g.siteRigs(f);
    const slots = g.siteSlots(f);
    const temp = g.siteTemp(f);
    const ambient = temp >= 70 ? 'hot' : temp >= 58 ? 'warm' : 'cool';
    const demand = g.siteDemand(f);
    const capacity = g.siteCapacity(f) + g.battFirm(f);
    const util = capacity > 0 ? Math.min(1, demand / capacity) : 0;
    const hash = rigs.reduce((a: number, r: any) => a + g.rigHash(r), 0);
    const online = rigs.some((r: any) => g.rigLive(r));
    const status = ambient === 'hot' ? 'HOT' : online ? 'ONLINE' : 'IDLE';
    const statusTone = ambient === 'hot' ? 'hot' : online ? 'online' : 'idle';
    let chainHue;
    for (const r of rigs) {
      const gr = g.groupOf(r);
      if (gr && gr.chain != null) { chainHue = CHAIN_HUE[gr.chain]; break; }
    }
    return {
      f, ambient, temp, hash, demand, capacity, util, status, statusTone,
      costDay: g.siteCostPerHour(f) * 24,
      chassisState: siteChassisState(g, f),
      chainHue,
      rigCount: rigs.length,
      slots,
    };
  }));

  const groupRows = computed(() => g.s.groups.map(gr => ({
    gr, advice: g.groupAdvice(gr), ceiling: g.chainCeiling(g.chain(gr.chain)),
  })));

  return { siteRows, groupRows };
}
