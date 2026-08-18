# Rigs & Pools

A crypto-mining idle tycoon prototype — build sites, run rigs, mine chains,
found pools. Vue 3 + Pinia, built with Vite.

See `docs/design-spec.md` for the game design.

## Develop

```
npm install
npm run dev       # http://localhost:5173
```

## Test

```
npm run test            # Vitest — the full suite (~150 tests)
npm run test:coverage   # same, plus an HTML/text coverage report
```

The suite is organized by what it exercises:

- `src/utils/__tests__/` — pure-function tests for formatting, the sparkline
  path helper, and the RNG primitives.
- `src/stores/__tests__/` — game-logic tests driven through the real Pinia
  store (`useGameStore()`), one file per concern: boot, build/rig lifecycle,
  mining/chains/blocks, power dispatch/brownout/cooling, pools, sites, fleet
  actions, insolvency, and save/load persistence.
- `src/components/__tests__/` and `src/views/__tests__/` — component smoke
  tests (`@vue/test-utils`), mounting every shared component and tab view
  against a real store to catch broken template bindings — the same class
  of bug the original prototype's `audit.py` linter existed to catch, now
  that real `.vue` SFCs let a template be malformed independently of its
  script.
- `src/test/` — shared test helpers (`freshStore()`, `reopenStore()`,
  `mountWithStore()`), not tests themselves.

Game-logic tests call `useGameStore()` directly rather than driving the UI,
so they run in milliseconds per test even though they exercise the full
simulation (ticking, mining, pricing, construction). A few intentionally
tick through long stretches of game time (offline catch-up, multi-day price
relaxation, hours-long construction) and take a few seconds each — that's
the real code path being exercised, not test overhead.

## Build

```
npm run build      # -> dist/
npm run preview    # serve the production build locally
```

## Project layout

```
src/
  main.js, App.vue          app entry, tab shell, tick/save lifecycle
  assets/main.css           the design system (one stylesheet, no scoped styles)
  data/                     static catalogs and constants (chains, hardware,
                             site parts, milestones, network-simulation tuning)
  utils/                    format.js (display formatting), random.js (gauss,
                             wearRate), spark.js (sparkline path math)
  services/storage.js       save persistence (localStorage, memory fallback)
  game/                     simulation logic, one module per concern
                             (state, dispatch, tick, pools, sites, actions,
                             rivals, ...)
  stores/game.js            the Pinia store — assembles game/ into one store
  components/               shared UI (TopBar, Feed, Compare, StatChart,
                             Chassis/RackShot/RackTile/RigShot hardware art,
                             ChainGem chain emblems, PartTile component thumbnails)
  views/                    the 7 tabs (Farm, Sites, Rigs, Build, Chains,
                             Market, Stats)
  test/                     shared test helpers (not tests themselves)
```

`stores/game.js` assembles the `game/` modules into a single Pinia setup
store and returns its flat API surface directly — components read it via
`useGameStore()`. `game/*.js` modules share state through an explicit
context object (`G`) rather than a closure, so each one is a real ES module.
