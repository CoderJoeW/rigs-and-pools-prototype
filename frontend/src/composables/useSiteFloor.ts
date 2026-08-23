import { computed, type ComputedRef } from 'vue';
import { useGameStore } from '../stores/game.js';
import { CHAIN_HUE } from '../data/chains.js';

type Store = ReturnType<typeof useGameStore>;

const MAX_TILES = 60, MAX_EMPTY = 12, FLOOR_COLS = 3;
const DOT_LABEL: Record<string, string> = { run: 'Running', build: 'Building', warn: 'Warning', bad: 'Bad', off: 'Off' };

// Positions are addressed the way a floor is walked rather than counted:
// row-column, both padded, so 01-04 is the fourth position of the first row
// and matches what a label on the actual rack would say. FLOOR_COLS has to
// be the number of columns .riggrid actually paints, or the row-column
// address contradicts the layout it claims to describe — the shell is
// capped at 440px, so the grid is a fixed three rather than auto-fill.
const posCode = (i: number) => String(Math.floor(i / FLOOR_COLS) + 1).padStart(2, '0')
  + '-' + String(i % FLOOR_COLS + 1).padStart(2, '0');

// The rack grid, its legend and status readout for the active site's floor.
export function useSiteFloor(g: Store, f: ComputedRef<any>) {
  const rigsHere = computed(() => g.siteRigs(f.value));
  const floorTemp = computed(() => g.siteTemp(f.value));
  const floorAmbient = computed(() => {
    const t = floorTemp.value;
    return t >= 70 ? 'hot' : t >= 58 ? 'warm' : 'cool';
  });
  const siteHash = computed(() => rigsHere.value.reduce((a: number, r: any) => a + g.rigHash(r), 0));
  const siteStatus = computed(() => {
    const t = floorTemp.value;
    if (t >= 70) return { label: 'HOT', tone: 'hot' };
    if (rigsHere.value.some((r: any) => g.rigLive(r))) return { label: 'ONLINE', tone: 'online' };
    return { label: 'IDLE', tone: 'idle' };
  });

  const floor = computed(() => {
    const rigs = rigsHere.value, slots = Math.max(g.siteSlots(f.value), rigs.length), cells = [];
    let running = 0;
    for (const r of rigs) {
      if (cells.length >= MAX_TILES) break;
      const st = g.rigState(r);
      if (st.dot === 'run') running++;
      const gr = g.groupOf(r), chain = gr ? gr.chain : null, cards = r.units ? r.units.length : 0;
      const code = posCode(cells.length);
      cells.push({ key: 'r' + r.id, id: r.id, dot: st.dot, code, chain, hue: chain != null ? CHAIN_HUE[chain] : undefined, cards,
        label: 'Position ' + code + ' — ' + r.name + ', ' + st.label + (st.sub ? ' (' + st.sub + ')' : '') });
    }
    const empties = Math.min(MAX_EMPTY, MAX_TILES - cells.length, slots - rigs.length);
    for (let i = 0; i < empties; i++) cells.push({ key: 'e' + i, id: null, code: posCode(cells.length) });
    return { cells, rigs: rigs.length, slots, running, hidden: Math.max(0, slots - cells.length),
      temp: floorTemp.value, ambient: floorAmbient.value };
  });

  const legend = computed(() => {
    const n: Record<string, number> = {};
    for (const r of rigsHere.value) { const d = g.rigState(r).dot; n[d] = (n[d] || 0) + 1; }
    return ['run', 'build', 'warn', 'bad', 'off'].filter(k => n[k]).map(k => ({ k, n: n[k], label: DOT_LABEL[k] }));
  });
  // Counted rather than inferred from legend.length: a full site draws no
  // empty tiles and must not claim a key for them, and a site that is
  // nothing but empty positions has no rig states yet and would otherwise
  // lose the legend entirely.
  const emptyDrawn = computed(() => floor.value.cells.filter(c => c.id === null).length);

  const openTile = (id: number) => { g.s.focusRig = id; g.s.tab = 'rigs'; };

  return { rigsHere, floorTemp, floorAmbient, siteHash, siteStatus, floor, legend, emptyDrawn, openTile };
}
