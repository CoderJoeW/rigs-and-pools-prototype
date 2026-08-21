import { C } from '../data/constants.js';

/* Which photograph — and which film — a site is wearing.

   WHY THE OLD SCHEME HAD TO GO. There were three plates, dealt out by
   `(site.id - 1) % 3`, so the picture had no relationship at all to the place
   it was labelling: a spare bedroom and a warehouse bay were equally likely to
   be showing any of them. Worse, all three were photographs of an open-pit ORE
   mine — haul trucks, spoil heaps, a rain-lit quarry — which is a different
   industry from the one this game is about.

   Every shell in data/site-parts.js now has its own interior, shot to the same
   direction: real light, mid-tones held up so the top third of the frame stays
   calm under the status pill and the name, and enough recognisable kit in
   frame (a breaker panel, ducting, a battery on the wall) that the picture
   says which tier you are on before you read a word.

   DAY AND NIGHT. Each shell was shot twice, the night plate produced as an
   edit of the day one so the room, the layout and the camera are identical and
   only the light differs — which is what lets the two cross-fade rather than
   cut. `phase` comes from the same solar curve App.vue already uses to drive
   the ambient layer, so the picture agrees with the sky the TopBar is
   reporting.

   FILM. The three biggest shells also have a five-second silent loop, cut from
   their night plate. Only those three: they are the tiers a player spends real
   time looking at, and a loop is worth about six stills in bytes. `siteFilm`
   returns nothing for the rest, and SiteFilm.vue simply shows the still.

   Each loop ships twice. H.264 in MP4 is the format every browser takes,
   Safari included, so it has to be there; but it is patent-encumbered and a
   Chromium built without it treats the element as undecodable rather than
   falling back, so VP9 in WebM is offered first for those. */
const STILLS = import.meta.glob('../assets/site/*-{day,night}.webp',
  { eager: true, import: 'default' });
const FILMS = import.meta.glob('../assets/site/*-film.{webm,mp4}',
  { eager: true, import: 'default' });

/* A save written before these existed can still name a shell we have art for,
   but a shell id that is somehow unknown must not blank the hero — the spare
   bedroom is the one every run starts in and the safest thing to show. */
const FALLBACK = 'bedroom';

export const sitePlate = (shell, phase) =>
  STILLS[`../assets/site/${shell}-${phase}.webp`]
  || STILLS[`../assets/site/${FALLBACK}-${phase}.webp`];

/* Both encodings, or null when this shell has no loop at all. Order matters
   at the call site: the WebM is listed first so a browser that can take it
   never downloads the MP4. */
export function siteFilm(shell) {
  const webm = FILMS[`../assets/site/${shell}-film.webm`];
  const mp4 = FILMS[`../assets/site/${shell}-film.mp4`];
  return webm || mp4 ? { webm, mp4 } : null;
}

/* Day or night, from the simulation's own clock.

   timeOfDay.js keeps hourOf() internal, so the hour is restated here the same
   way App.vue restates it for the ambient factors — both on the DAY_HOURS
   cycle, so the photograph always agrees with the sky and tariff, not the
   old 24-real-hour one. The threshold is the solar elevation crossing zero —
   06:00 and 18:00 on that cycle — which is exactly where the day and night
   plates were lit to meet. */
const CYCLE_S = C.DAY_HOURS * 3600;
export function sitePhase(t) {
  const h = (((t % CYCLE_S) + CYCLE_S) % CYCLE_S) / CYCLE_S * 24;
  return Math.sin(Math.PI * (h - 6) / 12) > 0 ? 'day' : 'night';
}
