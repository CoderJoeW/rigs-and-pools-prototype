# Saves — version history

design-spec.md §13c covers the persistence mechanism itself (autosave
cadence, offline catch-up, the wipe race fix, storage backends). This file
is the narrower log of why `SAVE_VER` (in `src/data/constants.js`) bumped
each time — a save whose version doesn't match current is discarded
rather than migrated (fine for a prototype; see §13c for why that's not
acceptable in production).

- **v2** — the full onboarding pass (coach's `automate` step, the
  Chains-tab rival-pool nudge, `chainsNudgeDismissed`). Bumped deliberately
  so every existing save starts the new coach from scratch rather than
  hydrating into steps it never saw introduced.
- **v3** — the guided first-session tour (default tab moved to Farm, the
  spotlighted tab-by-tab walkthrough, `tourDismissed`). Bumped again for
  the same reason: every existing save should meet the new tour fresh, not
  resume mid-farm on Build with no memory of it ever existing.
- **v4** — economic simulated players. Old thin sim arrays wiped on load.
- **v5** — the network now *grows*. Every v4 save held a network seeded at
  `0.6 * floor` on day one and compounded from there — Obelisk opening at
  1.3 TH across 25 accounts, and 27x its floor a month in. Neither shape
  can be rescaled into the new one (population is what sets a chain's size
  now, and a v4 save's is whatever the old 18/day rule left it at), so
  those worlds start over rather than hydrate into a network that
  contradicts its own rules.
