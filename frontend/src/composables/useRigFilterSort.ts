import { computed, reactive, ref, type ComputedRef } from 'vue';
import type { Rig } from '../game/types.js';
import { type Store, rigChainHue } from './gameStore.js';

// Filter chips: design-spec.md §6n.
export function useRigFilterSort(g: Store, siteRigs: ComputedRef<Rig[]>) {
  const stateOf = (r: Rig) => g.rigState(r);
  const avgWear = (r: Rig) => g.rigWear(r);
  const needsEye = (r: Rig) => ['off', 'worn', 'losing', 'wearing'].includes(stateOf(r).k);
  const chainHueOf = (r: Rig) => rigChainHue(g, r);
  const chassisOf = (r: Rig) => {
    const n = r.units ? r.units.length : 0;
    return { state: stateOf(r).dot, size: n >= 9 ? 'lg' : n >= 5 ? 'md' : 'sm',
      chainHue: chainHueOf(r), label: stateOf(r).label };
  };

  const FILTERS = [
    { k: 'all', label: 'All', test: () => true, mark: 'layers' },
    { k: 'attention', label: 'Needs attention', test: needsEye, alert: true, mark: 'warn' },
    { k: 'run', label: 'Running', test: (r: Rig) => stateOf(r).k === 'run', mark: 'dot', dot: 'run' },
    { k: 'off', label: 'Off', test: (r: Rig) => stateOf(r).k === 'off', mark: 'dot', dot: 'off' },
    { k: 'worn', label: 'Worn', test: (r: Rig) => ['worn', 'wearing'].includes(stateOf(r).k), mark: 'dot', dot: 'warn' },
  ];
  const filt = ref('all');
  // One pass over siteRigs tallying every filter's count at once, rather
  // than a separate .filter().length per chip re-scanning the whole list.
  const counts = computed(() => {
    const o: Record<string, number> = {};
    for (const x of FILTERS) o[x.k] = 0;
    for (const r of siteRigs.value) for (const x of FILTERS) if (x.test(r)) o[x.k]!++;
    return o;
  });

  // Each sort names its own direction (e.g. "Net/day (high -> low)"); cmp is
  // always written ascending and reversed when flipped.
  const SORTS = [
    { k: 'name', label: 'Name',
      // By name, not id, since rigs are renameable here; numeric collation so
      // "Rig 2" precedes "Rig 10", id breaks a tie.
      cmp: (a: Rig, b: Rig) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id - b.id,
      ends: ['A–Z', 'Z–A'] },
    { k: 'net', label: 'Net/day', cmp: (a: Rig, b: Rig) => g.rigNet(a) - g.rigNet(b), ends: ['low → high', 'high → low'], desc: true },
    { k: 'hash', label: 'Hashrate', cmp: (a: Rig, b: Rig) => g.rigHash(a) - g.rigHash(b), ends: ['low → high', 'high → low'], desc: true },
    { k: 'wear', label: 'Wear', cmp: (a: Rig, b: Rig) => avgWear(a) - avgWear(b), ends: ['low → high', 'high → low'], desc: true },
  ];
  const sortBy = ref('name');
  // Direction held per column so switching sorts doesn't leak one's flip into another.
  const sortDesc = reactive(Object.fromEntries(SORTS.map(x => [x.k, !!x.desc])));
  const sortOpen = ref(false);
  const sortOf = (k: string) => SORTS.find(x => x.k === k)!;
  const sortEnd = (k: string) => sortOf(k).ends[sortDesc[k] ? 1 : 0];
  const sortLabel = computed(() => sortOf(sortBy.value).label + ' (' + sortEnd(sortBy.value) + ')');
  const flipSort = () => { sortDesc[sortBy.value] = !sortDesc[sortBy.value]; };
  const pickSort = (k: string) => {
    if (k === sortBy.value) flipSort(); else sortBy.value = k;
    sortOpen.value = false;
  };
  const shown = computed(() => {
    const test = FILTERS.find(x => x.k === filt.value)!.test;
    const s = sortOf(sortBy.value), dir = sortDesc[sortBy.value] ? -1 : 1;
    return siteRigs.value.filter(test).sort((a: Rig, b: Rig) => s.cmp(a, b) * dir);
  });

  return { stateOf, avgWear, needsEye, chainHueOf, chassisOf, FILTERS, SORTS,
    filt, counts, sortBy, sortDesc, sortOpen, sortLabel, sortEnd, flipSort, pickSort, shown };
}
