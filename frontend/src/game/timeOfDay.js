import { computed } from 'vue';
import { C, TX_FEES } from '../data/constants.js';

/* 03-clock-and-tariff.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installTimeOfDay(G){
  /* ---- time of day drives solar; tariff band drives grid prices ----
     hourOf runs on a DAY_HOURS-long real-time cycle, not the 86400s-per-day
     economic clock s.t otherwise keeps — see constants.js's DAY_HOURS. */
  const cycleS = C.DAY_HOURS*3600;
  const hourOf = t => ((t%cycleS)/cycleS)*24;
  const bandOf = h => (h>=C.OFF_START||h<C.OFF_END) ? 'off'
                    : (h>=C.PEAK_START&&h<C.PEAK_END) ? 'peak' : 'shoulder';
  const band = computed(()=> bandOf(hourOf(G.s.t)));
  const rateAt = P => P.kind==='grid' ? P.rate*C.TOU[band.value] : P.rate;
  const solarFactor = computed(()=>{
    const h=hourOf(G.s.t);
    const raw=(h<6||h>18) ? 0 : Math.max(0, Math.sin(Math.PI*(h-6)/12));
    return raw*G.sky();
  });
  /* Ambient peaks around 14:00 — a few hours after solar does. So the room is
     hottest shortly after your power is cheapest, and cooling has to work
     hardest exactly when you can most afford to run it. */
  const ambient = computed(()=>{
    const h=hourOf(G.s.t);
    const k=(h<6||h>22)?0:Math.max(0,Math.sin(Math.PI*(h-6)/16));
    const clouds=G.s.weather ? G.s.weather.now.cloud*4 : 0;   // overcast days run cooler
    return C.AMBIENT_LOW + (C.AMBIENT_HIGH-C.AMBIENT_LOW)*k - clouds*k;
  });

  const site = id => G.s.sites.find(x=>x.id===id);
  const active = computed(()=> site(G.s.activeSite) || G.s.sites[0]);
  const chain = id => G.s.chains.find(c=>c.id===id);
  const poolOf = id => G.s.pools.find(p=>p.id===id) || null;
  const price = c => Math.max(0.02, c.ref*(1-c.impact));
  const evMult = p => p ? (1-p.fee)*(p.scheme==='PPS'?1:1+TX_FEES) : 1+TX_FEES;


  Object.assign(G, {active,ambient,band,bandOf,chain,evMult,hourOf,poolOf,price,rateAt,site,solarFactor});
}
