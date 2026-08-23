import { useGameStore } from '../stores/game.js';
import { CHAIN_HUE } from '../data/chains.js';
import type { Rig } from '../game/types.js';

// The Pinia store's own type, shared by every composable that takes it as a
// parameter instead of calling useGameStore() itself — one declaration
// instead of the same ReturnType<typeof useGameStore> repeated per file.
export type Store = ReturnType<typeof useGameStore>;

// A rig's chain colour, or undefined if it isn't grouped onto one yet.
// Shared by useFarmRows (site rows) and useRigFilterSort (rig chassis dots)
// so the "which hue represents this rig" rule lives in exactly one place.
export function rigChainHue(g: Store, r: Rig): number | undefined {
  const gr = g.groupOf(r);
  const chain = gr ? gr.chain : null;
  return chain != null ? CHAIN_HUE[chain] : undefined;
}
