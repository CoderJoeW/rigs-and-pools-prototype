export const C = {
  TICK_MS:100, DT:0.1, SPEEDS:[1,60,600,3600],
  AMBIENT_LOW:16, AMBIENT_HIGH:28,   // the day swings, peaking mid-afternoon
  // Tuning derivation: docs/economy.md#base_wear-005. Design rationale: design-spec.md §3.
  BASE_WEAR:0.05,
  // Manual repair line (RigsView's "worn past X%") — separate knob from
  // state.ts's fixAt (auto-replace's own threshold, defaulted higher at 0.45).
  REPAIR_AT:0.35,
  PAY:4.20,                 // $/day per MH/s on a 1.00x chain
  EXCH_FEE:0.004, START_CASH:500,
  BUILD_BASE:22*60,         // rig assembly, real seconds
  RUSH_PER_HOUR:70,
  // Real-time length of the visual day/night cycle; economic clocks (PAY,
  // wear, billing...) stay on real time regardless. docs/economy.md#day_hours-6.
  DAY_HOURS:6,
  // Time-of-use tariff multipliers by band. docs/economy.md#tou--time-of-use-tariff-2026-08-21-widening
  TOU:{ off:0.65, shoulder:1.00, peak:1.90 } as Record<'off' | 'shoulder' | 'peak', number>,
  OFF_START:23, OFF_END:7, PEAK_START:17, PEAK_END:21,
  GEN_DAYS:14,              // a new card generation lands every fortnight, forever
  // Version bump history: docs/saves.md. Mismatch policy: design-spec.md §13c.
  SAVE_KEY:'rigs-and-pools-save', SAVE_KEY_OLD:'hashline-save', SAVE_VER:5,
  SAVE_EVERY:30,            // autosave cadence, real seconds
  OFFLINE_CAP:86400,        // offline progress credited, capped at one real day
  TOAST_GAP:4,              // real seconds between toasts, whatever the speed multiplier
  TOAST_CAP:3,              // after this many of a kind, the activity feed carries it
  // Split from seven bare-literal 0.85s so they can be tuned apart: fraction of
  // a supply's nameplate a build may draw, and Appendix A's $/MH-to-$/watt
  // flip point. See design-spec.md §6l (Cleanup pass, v63).
  PSU_HEADROOM:0.85,
  FLIP_AT:0.85,
  // docs/economy.md#idle_cash_mult-2
  IDLE_CASH_MULT:2,
  // docs/economy.md#jackpot_mult-3--block_baseline_min--block_baseline_window
  JACKPOT_MULT:3,
  BLOCK_BASELINE_MIN:5,
  BLOCK_BASELINE_WINDOW:20,
};

export const TX_FEES = 0.06;

// Pool founding: design-spec.md §5 / §5a.
export const BOND_MULT  = { PPS:200, PPLNS:20 };   // multiples of one block's value
// Clamp on a simulated pool operator's fee — rival (poolMarket.ts) and
// sim-owned (sims.ts) pools both nudge their fee up when full, down when
// starved, and both stop at these same two bounds.
export const SIM_FEE_MIN = 0.002;
export const SIM_FEE_MAX = 0.09;
export const SIM_PLAYERS = 100;      // the rest of the network
// Chain ladder rationale: design-spec.md §2a. The per-mult premiums and rung
// spacing there predate a 2026-08-21 rebalance (now Halcyon +35%, Nova +75%,
// Obelisk +120% vs Ferro's mult:1.00, rungs ~8-10x apart) — see docs/economy.md
// for the current numbers until §2a's table is refreshed to match.
// SIM_RATIO is where a chain's independent miners END UP once the network has
// fully arrived, not where it starts — design-spec.md §6o.
export const SIM_RATIO   = 0.6;
// Block timing model (exact-arrival, not Poisson): design-spec.md §1.
export const BLOCK_K = 3;
export const RETARGET = 0.03;      // how fast observed hashrate chases actual, per block

export const SIM_CHAINS = ['ferro','halcyon','nova','obelisk'];   // Tessera stays a newcomer refuge
export const CONN_Q = 0.35;
export const TRUST_RAMP = 86400;                   // seconds for a new pool to earn full trust
export const COVER_DAYS = 4;                       // days of member payouts a PPS bond must cover
// Capital caps hashrate for both schemes, at different rates: design-spec.md §5a.
export const PPLNS_COVER = 0.35;                   // days — about a ninth of PPS
export const VAR_K = 10;                           // dry spells a PPS bond must cover
export const RIVAL_NAMES = ['Ironvault','Northwind','Kestrel Op','Blue Sky','Granite',
  'Mercer','Halcyon Bros','Longshore','Ardent','Copperline','Vantage','Rook',
  'Tidewater','Foxglove','Sable','Meridian'];
export const RIVAL_PER_CHAIN = 3;                  // how many rivals each chain opens with
