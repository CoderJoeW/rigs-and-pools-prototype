export const C = {
  TICK_MS:100, DT:0.1, SPEEDS:[1,60,600,3600],
  AMBIENT_LOW:16, AMBIENT_HIGH:28,   // the day swings, peaking mid-afternoon
  /* At the old 0.003, an untuned card at a cool site (tw=1, heat=1) took
     REPAIR_AT/0.003 ≈ 117 days to cross the repair threshold — so the
     "purely scheduled maintenance" §3 describes as one of the game's few
     recurring decisions, and the "Fifty repairs" Craft milestone, sat far
     outside any session ordinary play would reach (issue #3: a 46-hour
     playtest still read 1% wear with Repair disabled the whole time).
     Retuned so the repair line arrives within roughly a week — a real
     rhythm without being frantic:
       REPAIR_AT/0.05 = 7 days at wr's mean of 1 (the 0.75-1.25 spread in
       random.js moves it between roughly 5.6 and 9.3 days per card;
       afternoon heat pulls it a little earlier still, so 7 days is a
       ceiling, not a guarantee).

     On the default starter site, a neglected rig never actually reaches
     "fully worn" (u.w=1) at this rate — that's a property of the site's
     power budget, not of BASE_WEAR itself: wear also raises card draw
     (dispatch.js: rigCoreW scales each unit's watts by 1+0.5·u.w), and by
     roughly the two-week mark that growing draw trips a brownout on a
     capacity-constrained site — it sheds the rig for exceeding capacity
     (tick.js) — which freezes its wear right where it stood (worn units
     are skipped, but so is the whole rig once it's off). A site with
     power to spare has no such ceiling and a card left alone there will
     eventually hit u.w=1 for real. Either way it lands close to GEN_DAYS
     (14), not safely inside it: repairing within the first week, well
     before the brownout, the next generation, or full wear-out, is the
     actual point — ignore all of that and the rig either disciplines
     itself into an outage or grinds down to its ~60% worn-out hashrate floor. Repairing
     clears the excess draw along with the wear, so on a capacity-bound
     site the brownout is a backstop for neglect, not a new dead end. */
  BASE_WEAR:0.05,
  // The manual repair line — RigsView's "worn past X%" — named so it isn't
  // a bare literal BASE_WEAR is silently tuned against (issue #21). Not the
  // same knob as state.js's fixAt (auto-replace's own, separately tunable
  // threshold, defaulted higher at 0.45).
  REPAIR_AT:0.35,
  PAY:4.20,                 // $/day per MH/s on a 1.00x chain
  EXCH_FEE:0.004, START_CASH:500,
  BUILD_BASE:22*60,         // rig assembly, real seconds
  RUSH_PER_HOUR:70,
  /* The day/night + tariff cycle runs on its own clock, faster than real
     time, purely so a player can watch a full sunrise-to-sunrise power-grid
     cycle without a 24h wait. DAY_HOURS is that cycle's real-time length;
     timeOfDay.js's hourOf() is the only reader (band/solarFactor/ambient all
     build on hourOf, so this one knob covers all three). Everything that
     turns real dollars — block cadence, PAY, wear, billing, GEN_DAYS, pool
     trust, price drift — stays on s.t at its original real-time pace and
     never reads DAY_HOURS, so payouts are exactly as they were; only the
     sky and the tariff sign move faster. */
  DAY_HOURS:6,
  // time-of-use tariff: grid rates are multiplied by the band of the hour.
  // 2026-08-21: widened from {0.70, 1.00, 1.55}. Off-peak got cheaper and
  // peak got sharply more expensive — the blended 24h average for a site
  // that runs flat and never manages its schedule still rises (~0.99x ->
  // ~1.03x), so power is a bigger drag by default, while the much wider
  // off/peak spread makes actually watching the clock — the drip/rush/
  // autoOff levers, sizing a battery to shift load, deciding which rigs to
  // shed for the 17:00-21:00 window — worth meaningfully more than before.
  // shoulder, the reference band the multiplier is anchored to, is untouched.
  TOU:{ off:0.65, shoulder:1.00, peak:1.90 },
  OFF_START:23, OFF_END:7, PEAK_START:17, PEAK_END:21,
  GEN_DAYS:14,              // a new card generation lands every fortnight, forever
  // v2: the full onboarding pass (coach's 'automate' step, the Chains-tab
  // rival-pool nudge, chainsNudgeDismissed) — bumped deliberately so every
  // existing save starts the new coach from scratch rather than hydrating
  // into steps it never saw introduced.
  // v4: economic simulated players — old thin sim arrays wiped on load.
  // v3: the guided first-session tour (default tab moved to Farm, the
  // spotlighted tab-by-tab walkthrough, tourDismissed) — bumped again for
  // the same reason: every existing save should meet the new tour fresh,
  // not resume mid-farm on Build with no memory of it ever existing.
  // v5: the network now GROWS. Every v4 save holds a network seeded at
  // 0.6*floor on day one and compounded from there — Obelisk opening at
  // 1.3 TH across 25 accounts, and 27x its floor a month in. Neither shape
  // can be rescaled into the new one (the population is what sets a chain's
  // size now, and a v4 save's is whatever the old 18/day rule left it at),
  // so those worlds start over rather than hydrate into a network that
  // contradicts its own rules.
  SAVE_KEY:'rigs-and-pools-save', SAVE_KEY_OLD:'hashline-save', SAVE_VER:5,
  SAVE_EVERY:30,            // autosave cadence, real seconds
  OFFLINE_CAP:86400,        // offline progress credited, capped at one real day
  TOAST_GAP:4,              // real seconds between toasts, whatever the speed multiplier
  TOAST_CAP:3,              // after this many of a kind, the activity feed carries it
  /* Two different 0.85s used to sit as bare literals in seven places, which
     meant they could never be tuned apart. PSU_HEADROOM is how much of a
     supply's nameplate a build may draw; FLIP_AT is Appendix A's flip — the
     load fraction where the ranking changes from $/MH to $/watt. */
  PSU_HEADROOM:0.85,
  FLIP_AT:0.85,
  /* Issue #7: nothing pulled cash toward the next purchase once a rig and
     site existed — cash could sit at any multiple of the next rig's cost
     with no nudge beyond a one-time, dismissible onboarding tip. 2x means
     "could afford this rig again and still have money left" — comfortably
     past "could afford one," which would nag the instant a player saved a
     single dollar past viable. */
  IDLE_CASH_MULT:2,
  /* Issue #9: "Biggest block yet" only fires on a genuine all-time record,
     which is trivially broken almost immediately on the tiny starter chain
     and then rarely challenged again — so most real jackpot moments (a
     block far above what a player's been seeing lately, e.g. right after
     graduating to a bigger chain) get the same flat toast as routine
     income. 3x matches the issue's own example ("3x your usual"); needs
     BLOCK_BASELINE_MIN samples of real baseline before it can fire, so the
     first few blocks — with no "usual" yet to compare against — never
     falsely read as a jackpot. */
  JACKPOT_MULT:3,
  BLOCK_BASELINE_MIN:5,
  BLOCK_BASELINE_WINDOW:20,
};

export const TX_FEES = 0.06;

/* Every pool is somebody's business — rivals, or your own.
   A founder posts a bond, sets a fee, and simulated miners choose between the
   pools on offer by price and by how well-bonded the operator is. */
export const BOND_MULT  = { PPS:200, PPLNS:20 };   // multiples of one block's value
export const SIM_PLAYERS = 100;      // the rest of the network
/* The chains are a LADDER, not a wall. Each rung's network is twice its own
   floor, so revPerMh = PAY*mult/2 — each chain keeps its own personality
   (2026-08-21: Halcyon +35%, Nova +75%, Obelisk +120%, all measured against
   Ferro's mult:1.00) instead of the mults cancelling out, and every step up
   the ladder pays strictly more per MH than the one below it — graduating
   a farm onto the next chain is never a pay cut. The
   rungs then sit 8-10x apart (up from ~7x), so every stage of a farm's life has a chain where
   it is a real participant instead of a rounding error, and outgrowing one
   rung still leaves the next genuinely out of reach until the farm has grown
   into it. Before the original ladder, all four chains sat at 1.4-2.4 TH and
   a 60-rig warehouse still owned 1.4% of the smallest one. */
/* Where a chain's independent miners END UP once the whole network has
   arrived — below the floor, so there is always fresh territory. Not where it
   starts: the population fills toward SIM_SOFT_CAP over months and a chain's
   hashrate tracks the miners who have actually turned up (see sims.js,
   simTargetOf). Reading this as a starting value is what put 1.3 TH on
   Obelisk at t=0, split between 25 supposedly-new miners. */
export const SIM_RATIO   = 0.6;
/* SIM_GROWTH is gone. It named a flat "the network grows 0.25%/day" rule that
   nothing implements any more: a chain's hashrate is the miners who have
   arrived and what they have built (sims.js, simTargetOf), so the growth rate
   is an OUTPUT of the population curve rather than a constant to multiply by.
   Its last reader was persistence's floor-retune rescale, which asks
   simTargetOf now. */
/* The network is not all one kind of miner. Card owners work the memory-hard
   and mixed chains; hashboard owners work SHA-2. Without the split every
   simulated miner correctly flees the SHA-2 chains and they end up empty. */
/* Block timing. Each chain has a window T computed from network hashrate at the
   moment the last block landed. The chance of finding early rises as the window
   fills — P(found by t) = (t/T)^K — so luck pays but droughts cannot happen.
   Mean interval is exactly the intended block time; the ceiling is (K+1)/K of it.

   Pure Poisson was rejected: it is memoryless, so a countdown would be a lie —
   after waiting 42s the expected remaining wait is still 42s. A visible clock
   needs a process that ages. */
export const BLOCK_K = 3;
export const RETARGET = 0.03;      // how fast observed hashrate chases actual, per block

export const SIM_CHAINS = ['ferro','halcyon','nova','obelisk'];   // Tessera stays a newcomer refuge
export const CONN_Q = 0.35;
export const TRUST_RAMP = 86400;                   // seconds for a new pool to earn full trust
export const COVER_DAYS = 4;                       // days of member payouts a PPS bond must cover
/* Capital caps hashrate for BOTH schemes now — the difference is how much you
   need. PPS capital is underwriting: you owe members a flat rate whether or not
   blocks land, so you must hold days of cover. PPLNS capital is working
   capital — settlement float and infrastructure — so it carries far more
   hashrate per dollar, but it still binds. */
export const PPLNS_COVER = 0.35;                   // days — about a ninth of PPS
export const VAR_K = 10;                           // dry spells a PPS bond must cover
export const RIVAL_NAMES = ['Ironvault','Northwind','Kestrel Op','Blue Sky','Granite',
  'Mercer','Halcyon Bros','Longshore','Ardent','Copperline','Vantage','Rook',
  'Tidewater','Foxglove','Sable','Meridian'];
export const RIVAL_PER_CHAIN = 3;                  // how many rivals each chain opens with
