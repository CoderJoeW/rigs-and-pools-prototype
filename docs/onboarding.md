# Onboarding

design-spec.md §6h records the *old* onboarding coach (a `STEPS` table
with a step index and tab-gating) being removed in v57, closing with "onboarding
is a real open question... and should return before this is played by
anyone new." The coach and tour described here are that return — a
different design, not documented in the main spec yet. Covers
`src/game/onboarding.js` and `src/components/WelcomeTour.vue`.

## The reactive coach

No step index, nothing to drift out of sync: each step in `STEPS` is a
predicate over real game state, and the first one not yet satisfied is
what's shown. There's no "next" to advance and no state of its own to
desync from the game.

- **`grow`** (issue #8): the rival-pool layer (12 named competitors, live
  reputation, a PPS/PPLNS mix) is some of the game's best content, but it
  only exists on the non-Tessera chains — so it goes entirely unseen by a
  player who never has a concrete reason to leave the newcomer chain.
  Naming what's actually there (reputation, fills, the PPS/PPLNS choice)
  gives Chains a specific pull instead of a generic "or found a pool"
  afterthought; the second-site path stays equally valid.
- **`automate`**: rigs run 24/7 whether or not anyone is watching
  (design-spec.md §1's "idle floor"), and with no notifications a rig can
  drift into losing money over hours with nothing announcing it (§2's
  automated-shutdown section). Nothing had ever pointed a new player at
  the one lever that makes that safe. Placed last: it only matters once
  there's a farm worth protecting, and by `grow` there is.

**`showChainsNudge`** (issue #30): the coach's `grow` step names the
rival-pool ecosystem, but it lives in a banner that the *cheaper* of its
own two exits (a second site) erases before a player who took that path
ever opened Chains. This nudge lives on the Chains tab itself instead,
dismissed on its own — so it survives exactly the exit that used to eat
it, and only goes away by a direct dismissal or by the thing it's
pointing at actually happening (founding a pool).

## The walkthrough tour (`TOUR_SLIDES`)

A brand-new player has zero state for the coach's predicates to read yet —
no rig, no site choice, nothing to react to — so there's nothing for the
reactive coach to say until `build` resolves itself. The tour fills
exactly that gap: game basics and every tab, once, before the coach has
anything to work with. `TOUR_SLIDES` is deliberately the one click-through
exception to the reactive-predicate model.

Each slide names the real tab it's about *and* a `target` — a CSS
selector for the one element on that tab worth actually looking at,
tagged with a `data-tour` attribute in the view itself (FarmView's
empty-state card, BuildView's Order-parts button, etc.). The tour drives
navigation there itself (`WelcomeTour.vue` watches the slide and sets
`s.tab` to match), then spotlights the target: everything else on screen
dims, the target stays lit. So a slide always points at one real, live,
specific thing, not just the right tab in the abstract. It's a caption
and a spotlight, not a modal — the dimming is purely visual
(`pointer-events:none`, nothing blocks tapping around or through the
highlight on your own) — and doing the thing a slide points at (e.g.
actually building on the last one) ends the tour exactly the same way
skipping it would.

**`showTour` gating.** Shown once, before the first rig, and never again
once one exists — tour-dismissed or not — so it can't reappear over a
farm that's already running (an imported save, a second device). While
it's up, the reactive coach banner stays quiet: both would otherwise open
on the same "build your first rig" point at once.

Gated on `nextId`, *not* `rigs.length`: `rigs.length` isn't monotonic —
scrapping the last rig, or an insolvency sell-off (`insolvency.js`) taking
the farm to zero, both drop it back to 0 on an established save that
legitimately dismissed the tour long ago. `nextId` only ever increments
(every real build, plus insolvency's last-rig grant) and only resets via
`freshState`/`resetState` — a genuine fresh start — so `nextId===1` means
"no rig has ever existed," which is what "shown once, first session only"
actually requires. It also gates on `nextId` itself rather than tracking
its own slide index, so it can't drift the way a tracked tour could —
building a rig by any route ends it outright, tour or no tour.

`tourReplay` is the escape hatch from "once" — TopBar's "tour" pill, for a
player who skipped it, wants a refresher, or is just curious. It's a
second, independent way in rather than a hole punched in the `nextId`
gate itself, so the automatic first-session trigger stays exactly as
strict as above.
