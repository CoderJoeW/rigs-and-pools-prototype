import { computed } from 'vue';
import { C, TX_FEES } from '../data/constants.js';
import type { Game, ChainState, Site } from './types.js';

// Installed into the shared context G — docs/implementation-notes.md#shared-context-g-module-pattern.
// Cross-module references go through G, so the 7 mutually dependent
// module pairs still resolve at call time exactly as the closure did.
// Declarations are untouched: hoisting, evaluation order and
// intra-module references are the same code they always were.
export function installTimeOfDay(G: Game): void {
  /* ---- time of day drives solar; tariff band drives grid prices ----
     hourOf runs on a DAY_HOURS-long real-time cycle, not the 86400s-per-day
     economic clock s.t otherwise keeps — see constants.ts's DAY_HOURS. */
  const cycleS = C.DAY_HOURS * 3600;
  const hourOf = (t: number) => ((t % cycleS) / cycleS) * 24;
  const bandOf = (h: number): 'off' | 'peak' | 'shoulder' => (h >= C.OFF_START || h < C.OFF_END) ? 'off'
                    : (h >= C.PEAK_START && h < C.PEAK_END) ? 'peak' : 'shoulder';
  const band = computed(() => bandOf(hourOf(G.s.t)));
  const rateAt = (P: { kind: string; rate: number }) => P.kind === 'grid' ? P.rate * C.TOU[band.value] : P.rate;
  const solarFactor = computed(() => {
    const h = hourOf(G.s.t);
    const raw = (h < 6 || h > 18) ? 0 : Math.max(0, Math.sin(Math.PI * (h - 6) / 12));
    return raw * G.sky();
  });
  /* Ambient peaks around 14:00 — a few hours after solar does. So the room is
     hottest shortly after your power is cheapest, and cooling has to work
     hardest exactly when you can most afford to run it. */
  const ambient = computed(() => {
    const h = hourOf(G.s.t);
    const k = (h < 6 || h > 22) ? 0 : Math.max(0, Math.sin(Math.PI * (h - 6) / 16));
    const clouds = G.s.weather ? G.s.weather.now.cloud * 4 : 0;   // overcast days run cooler
    return C.AMBIENT_LOW + (C.AMBIENT_HIGH - C.AMBIENT_LOW) * k - clouds * k;
  });

  const site = (id: number): Site | undefined => G.s.sites.find(x => x.id === id);
  const active = computed(() => site(G.s.activeSite) || G.s.sites[0]);
  const chain = (id: string): ChainState | undefined => G.s.chains.find(c => c.id === id);
  const rig = (id: number) => G.s.rigs.find((x: any) => x.id === id);
  const poolOf = (id: string) => G.s.pools.find((p: any) => p.id === id) || null;
  const price = (c: ChainState) => Math.max(0.02, c.ref * (1 - c.impact));
  const evMult = (p: { fee: number; scheme: string } | null) => p ? (1 - p.fee) * (p.scheme === 'PPS' ? 1 : 1 + TX_FEES) : 1 + TX_FEES;

  Object.assign(G, { active, ambient, band, bandOf, chain, evMult, hourOf, poolOf, price, rateAt, rig, site, solarFactor });
}
