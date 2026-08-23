import { computed, type ComputedRef } from 'vue';
import { useGameStore } from '../stores/game.js';
import { fmt } from '../utils/format.js';

type Store = ReturnType<typeof useGameStore>;

const FLOW_C: Record<string, string> = { solar: 'var(--gold)', battery: 'var(--blue)', grid: 'var(--ink-3)',
  rigs: 'var(--green)', cooling: 'var(--blue)', charging: 'var(--gold)', unserved: 'var(--red)' };

const segs = (parts: [string, number][], total: number) =>
  parts.map(([k, w]) => ({ k, w, pct: total > 0 ? Math.max(0, w) / total * 100 : 0, c: FLOW_C[k] }));

// The single biggest contributor to a flow bar — a headline beside it, since
// a list of every segment is what the bar underneath is already for.
const biggest = (list: any[]) => {
  const live = list.filter((x: any) => x.pct > 0);
  return live.length ? live.reduce((a: any, b: any) => (b.w > a.w ? b : a)) : null;
};

// Power flow, today's bill, battery charge and the cooling heat trace for
// the active site — everything SitesView's Power/Battery/Cooling sections read.
export function useSitePower(g: Store, f: ComputedRef<any>) {
  const plan = computed(() => g.sitePlan(f.value));
  const flow = computed(() => g.flowOf(f.value));
  const flowIn = computed(() => {
    const x = flow.value, tot = x.inRenew + x.inBatt + x.inPaid + x.unserved;
    return segs([['solar', x.inRenew], ['battery', x.inBatt], ['grid', x.inPaid], ['unserved', x.unserved]], tot);
  });
  const flowOut = computed(() => {
    const x = flow.value, tot = x.rigs + x.cool + x.charge;
    return segs([['rigs', x.rigs], ['cooling', x.cool], ['charging', x.charge]], tot);
  });
  // Unserved stays in the bar as its red segment, but it is demand that went
  // unmet, not somewhere power arrived from — headlining it would name a
  // source that does not exist.
  const flowInTop = computed(() => biggest(flowIn.value.filter(x => x.k !== 'unserved')));
  const flowOutTop = computed(() => biggest(flowOut.value));

  // f.bill only accumulates while the site draws, so a site that has not
  // drawn yet has no bill object at all and the whole strip stays honest by
  // reading zero.
  const billToday = computed(() => { const b = f.value.bill; return b ? b.off + b.sh + b.peak : 0; });
  const billCoolShare = computed(() => {
    const b = f.value.bill;
    return b && billToday.value > 0 ? b.cool / billToday.value : 0;
  });

  const battKwh = computed(() => g.battKwh(f.value));
  const battPct = computed(() => (battKwh.value > 0 ? Math.min(1, (f.value.batt || 0) / battKwh.value) : 0));
  const battMode = computed(() => {
    const p = plan.value;
    if (p.chW > 0) return { k: 'charging', text: 'charging ' + fmt.w(p.chW) + ' from solar', cls: 'pos' };
    if (p.gridChW > 0) return { k: 'charging', text: 'charging ' + fmt.w(p.gridChW) + ' off-peak', cls: 'blu' };
    if (p.disW > 0) return { k: 'discharging', text: 'discharging ' + fmt.w(p.disW), cls: 'amb' };
    return { k: 'idle', text: 'idle', cls: '' };
  });

  // The heat trace is a reading drawn as a waveform, not decoration: how hard
  // the wave swings is the site's heat against its cooling capacity, so a
  // plant that is coping draws a flat line and one that is losing draws a
  // ragged one. Deterministic — the same load always draws the same trace.
  const heatLoad = computed(() => {
    const cap = g.siteCooling(f.value);
    return cap > 0 ? Math.min(1.6, g.siteHeat(f.value) / cap) : (g.siteHeat(f.value) > 0 ? 1.6 : 0);
  });
  // The three sine terms sum to 1.06, so an amplitude past ~10.4 would push
  // the trace outside the 24-tall viewBox and clip flat — reading as calm at
  // exactly the overload this is here to show. 2 + 5.2*load tops out at 10.3.
  const heatPath = computed(() => {
    const amp = 2 + heatLoad.value * 5.2, pts = [];
    for (let i = 0; i <= 48; i++) {
      const x = i / 48 * 100;
      const y = 12 - (Math.sin(i * 0.62) * 0.62 + Math.sin(i * 1.37 + 1.1) * 0.28 + Math.sin(i * 2.9 + 0.4) * 0.16) * amp;
      pts.push((i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2));
    }
    return pts.join(' ');
  });

  return { plan, flow, flowIn, flowOut, flowInTop, flowOutTop, billToday, billCoolShare,
    battKwh, battPct, battMode, heatLoad, heatPath };
}
