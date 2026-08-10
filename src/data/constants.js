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
  // time-of-use tariff: grid rates are multiplied by the band of the hour
  TOU:{ off:0.70, shoulder:1.00, peak:1.55 },
  OFF_START:23, OFF_END:7, PEAK_START:17, PEAK_END:21,
  GEN_DAYS:14,              // a new card generation lands every fortnight, forever
  // v2: the full onboarding pass (coach's 'automate' step, the Chains-tab
  // rival-pool nudge, chainsNudgeDismissed) — bumped deliberately so every
  // existing save starts the new coach from scratch rather than hydrating
  // into steps it never saw introduced.
  SAVE_KEY:'rigs-and-pools-save', SAVE_KEY_OLD:'hashline-save', SAVE_VER:2,
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
   (Halcyon +55%, Nova -10%) instead of the mults cancelling out. The
   rungs then sit ~7x apart, so every stage of a farm's life has a chain where
   it is a real participant instead of a rounding error. Before this, all four
   chains sat at 1.4-2.4 TH and a 60-rig warehouse still owned 1.4% of the
   smallest one. */
export const SIM_RATIO   = 0.6;      // each chain sits BELOW its floor: fresh territory
export const SIM_GROWTH  = 0.0025;   // they build too — 0.25%/day, 2.5x a year. At the old
                              // 0.6% (8.9x a year) a farm that stood still lost half
                              // its share every five weeks.
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
