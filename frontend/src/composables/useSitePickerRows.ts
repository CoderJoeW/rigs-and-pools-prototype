import { computed, type ComputedRef } from 'vue';
import { fmt } from '../utils/format.js';
import { TRADE_IN_RATE } from '../data/constants.js';
import type { Site } from '../game/types.js';
import type { Source, Storage, Plant, Shell } from '../data/site-parts.js';
import type { Fab } from '../data/fab.js';
import type { Store } from './gameStore.js';

// The "install a ___" picker sheets on SitesView all reduce a catalogue to
// {id, name, sub, value, valueSub, locked?} rows for the Compare component,
// plus a pick() that installs the chosen id and closes the sheet.
export function useSitePickerRows(g: Store, f: ComputedRef<Site>) {
  const mix = computed(() => {
    const site = f.value, out = [];
    for (const src of site.sources) {
      const P = g.SITEPART(src.p)!;
      out.push({ id: src.p, name: P.name + (src.n > 1 ? ' ×' + src.n : ''), kind: P.kind,
        out: g.srcOut(site, src), rate: P.rate });
    }
    return out.sort((a, b) => b.out - a.out);
  });

  const sourceRows = computed(() => g.SOURCES.filter((p: Source) => p.price > 0).map((p: Source) => ({
    id: p.id, name: p.name,
    sub: (p.yield
          ? fmt.w(p.peak * p.yield) + ' real — ' + fmt.w(p.peak) + ' nameplate at '
            + (p.yield * 100).toFixed(0) + '% yield'
          : fmt.w(p.peak) + ' peak')
        + ' · ' + (p.rate > 0 ? fmt.usd2(p.rate) + '/kWh' : 'no fuel cost')
        + ' · ' + p.hours + ' h to build',
    value: fmt.usd(p.price),
    valueSub: p.rate > 0 ? p.kind : fmt.usd2(p.price / (p.peak * (p.yield || 1))) + '/W' })));

  const storageRows = computed(() => g.STORAGE.map((p: Storage) => ({ id: p.id, name: p.name,
    sub: p.kwh + ' kWh · ' + p.kw + ' kW · ' + p.hours + ' h to build',
    value: fmt.usd(p.price), valueSub: '' })));

  const plantRows = computed(() => g.PLANTS.filter((p: Plant) => p.price > 0).map((p: Plant) => ({ id: p.id, name: p.name,
    sub: fmt.w(p.cap) + ' of heat · ' + fmt.pct(p.pue, 0) + ' of it burned as power · ' + p.hours + ' h',
    value: fmt.usd(p.price),
    valueSub: 'at ' + fmt.w(g.siteHeat(f.value)) + ' it would draw ' + fmt.w(g.siteHeat(f.value) * p.pue) })));

  const shellRows = computed(() => g.SHELLS.filter((p: Shell) => p.price > 0).map((p: Shell) => ({ id: p.id, name: p.name,
    sub: p.slots + ' rig positions · ' + p.hours + ' h to build',
    value: fmt.usd(p.price), valueSub: '', locked: g.s.cash < p.price })));

  // Same TRADE_IN_RATE the actual upgrade action charges (sites.ts) — this
  // is only the preview, so it has to keep matching or the picker would
  // quote a price the click doesn't honor.
  const tradeInCost = (curPrice: number, newPrice: number) => {
    const credit = Math.round(curPrice * TRADE_IN_RATE);
    return { credit, cost: Math.max(0, newPrice - credit) };
  };

  const expandRows = computed(() => {
    const cur = g.SITEPART(f.value.shell) as Shell;
    return g.SHELLS.filter((p: Shell) => p.slots > cur.slots).map((p: Shell) => {
      const { credit, cost } = tradeInCost(cur.price, p.price);
      return { id: p.id, name: p.name, sub: cur.slots + ' → ' + p.slots + ' rig positions · ' + p.hours + ' h to build',
        value: fmt.usd(cost), valueSub: credit ? fmt.usd(credit) + ' credited' : '', locked: g.s.cash < cost };
    });
  });

  const fabRows = computed(() => {
    const cur = f.value.fab ? g.FAB(f.value.fab) : null;
    return g.FABS.filter((p: Fab) => !cur || p.tier > cur.tier).map((p: Fab) => {
      const { credit, cost } = tradeInCost(cur ? cur.price : 0, p.price);
      return { id: p.id, name: p.name, sub: p.slots.join(', ') + ' · ' + p.budget + ' design budget · ' + p.hours + ' h to build',
        value: fmt.usd(cost), valueSub: credit ? fmt.usd(credit) + ' credited' : '', locked: g.s.cash < cost };
    });
  });

  // Every picker sheet installs its choice, then closes itself the same way —
  // only the install call varies, so that part is factored out once.
  const closeAfter = (action: (id: string) => void) => (id: string) => { action(id); g.s.sitePicker = null; };
  const chooseSrc = closeAfter(id => g.addSitePart(f.value.id, id, 'source'));
  const choosePlant = closeAfter(id => g.addSitePart(f.value.id, id, 'plant'));
  const chooseStorage = closeAfter(id => g.addSitePart(f.value.id, id, 'storage'));
  const chooseShell = closeAfter(id => g.newSite(id));
  const chooseFabPick = closeAfter(id => g.chooseFab(f.value.id, id));
  const chooseExpand = closeAfter(id => g.upgradeShell(f.value.id, id));

  return {
    mix, sourceRows, storageRows, plantRows, shellRows, expandRows, fabRows,
    chooseSrc, choosePlant, chooseStorage, chooseShell, chooseFabPick, chooseExpand,
  };
}
