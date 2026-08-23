// Which photograph a rig is wearing.
//
// Three art classes cover the whole seven-frame ladder in data/hardware.js,
// because the silhouette is what reads at thumbnail size and the ladder has
// exactly three silhouettes: an improvised box, an open rail frame, a rack
// chassis. Shooting f4 and f6 apart would have spent two more renders on a
// difference nobody can see at 104px.
//
// This lives in utils/ rather than in data/hardware.js because it is a fact
// about the ART, not about the hardware — the catalogue's job is slots,
// airflow and price, and it should not have to know that two of its entries
// share a photograph. It lives outside RigShot.vue because the Build tab's
// hero needs the same answer for the frame currently in the draft, and one
// mapping in two components is one mapping too many.
//
// Every class has all five states, all cut from one crop box measured on that
// class's `run` render, so a rig holds its exact framing as it changes state
// and only the light moves.

export type RigClass = 'crate' | 'frame' | 'rack';

const CLASS: Record<string, RigClass> = {
  f2: 'crate',
  f4: 'frame', f6: 'frame', f8: 'frame', f10: 'frame',
  f12: 'rack', f16: 'rack',
};

// The fallback is the open frame: the middle of the ladder, the shape most
// rigs actually are, and the right answer for a caller with no rig in hand.
export const rigClass = (frame: string): RigClass => CLASS[frame] || 'frame';

const SHOTS = import.meta.glob<string>('../assets/rig/*.webp', { eager: true, import: 'default' });

export function rigShot(frame: string, state: string): string {
  const cls = rigClass(frame);
  return SHOTS[`../assets/rig/${cls}-${state}.webp`]
      || SHOTS[`../assets/rig/${cls}-off.webp`]!;
}
