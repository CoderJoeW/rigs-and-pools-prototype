import { C } from '../data/constants.js';

// Which photograph — and which film — a site is wearing. See
// docs/implementation-notes.md#site-photography-utilssiteartts for why
// art is keyed by shell id rather than site id, and the day/night + film
// format rationale.

const STILLS = import.meta.glob<string>('../assets/site/*-{day,night}.webp',
  { eager: true, import: 'default' });
const FILMS = import.meta.glob<string>('../assets/site/*-film.{webm,mp4}',
  { eager: true, import: 'default' });

// Unknown shell id (e.g. a save predating it) falls back to the starter room.
const FALLBACK = 'bedroom';

export type SitePhase = 'day' | 'night';

export const sitePlate = (shell: string, phase: SitePhase): string =>
  STILLS[`../assets/site/${shell}-${phase}.webp`]
  || STILLS[`../assets/site/${FALLBACK}-${phase}.webp`]!;

export interface SiteFilm { webm?: string; mp4?: string }

// Both encodings, or null when this shell has no loop. WebM listed first so
// a browser that can take it never downloads the MP4.
export function siteFilm(shell: string): SiteFilm | null {
  const webm = FILMS[`../assets/site/${shell}-film.webm`];
  const mp4 = FILMS[`../assets/site/${shell}-film.mp4`];
  return webm || mp4 ? { webm, mp4 } : null;
}

// Day or night, from the simulation's own DAY_HOURS clock (restates
// timeOfDay.ts's internal hourOf() — see implementation-notes.md).
const CYCLE_S = C.DAY_HOURS * 3600;
export function sitePhase(t: number): SitePhase {
  const h = (((t % CYCLE_S) + CYCLE_S) % CYCLE_S) / CYCLE_S * 24;
  return Math.sin(Math.PI * (h - 6) / 12) > 0 ? 'day' : 'night';
}
