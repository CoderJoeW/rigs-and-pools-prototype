import { useGameStore } from '../stores/game.js';
import { CHAIN_HUE } from '../data/chains.js';
import { C } from '../data/constants.js';
import type { Rig } from '../game/types.js';
import type { Card } from '../data/hardware.js';

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

// A manufactured 'unit'-kind custom part is Card-shaped at runtime
// (customParts.ts's designStats), just not statically typed as one —
// CustomPart stays a loose bag since it holds every design kind. Shared by
// FleetSheet and RebuildSheet, which both offer custom cards in a picker
// alongside the catalogue ladder.
export function customUnitCards(g: Store): Card[] {
  return g.s.customParts.filter(p => p.kind === 'unit') as unknown as Card[];
}

// A site's temperature banding — same C.WARM_TEMP/HOT_TEMP cardWear.ts
// keys its wear-rate penalty off, so the UI's "hot"/"warm" always matches
// what's actually happening to the cards.
export function ambientOf(temp: number): 'hot' | 'warm' | 'cool' {
  return temp >= C.HOT_TEMP ? 'hot' : temp >= C.WARM_TEMP ? 'warm' : 'cool';
}
