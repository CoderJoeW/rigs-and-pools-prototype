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
npm run test      # Vitest — store smoke tests
```

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
                             site parts, milestones, network/rival simulation)
  utils/format.js           number/time formatting, small random helpers
  services/storage.js       save persistence (localStorage, memory fallback)
  game/                     simulation logic, one module per concern
                             (state, dispatch, tick, pools, sites, actions, ...)
  stores/game.js            the Pinia store — assembles game/ into one store
  components/               shared UI (TopBar, Feed, Compare, StatChart)
  views/                    the 7 tabs (Farm, Sites, Rigs, Build, Chains,
                             Market, Stats)
```

`stores/game.js` assembles the `game/` modules into a single Pinia setup
store and returns its flat API surface directly — components read it via
`useGameStore()`. `game/*.js` modules share state through an explicit
context object (`G`) rather than a closure, so each one is a real ES module.
