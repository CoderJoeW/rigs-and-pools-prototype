import { CHAINS } from './chains.js';

export const C = {
  TICK_MS:100, DT:0.1, SPEEDS:[1,60,600,3600],
  AMBIENT_LOW:16, AMBIENT_HIGH:28,   // the day swings, peaking mid-afternoon
  BASE_WEAR:0.003,
  PAY:4.20,                 // $/day per MH/s on a 1.00x chain
  EXCH_FEE:0.004, START_CASH:500,
  BUILD_BASE:22*60,         // rig assembly, real seconds
  RUSH_PER_HOUR:70,
  // time-of-use tariff: grid rates are multiplied by the band of the hour
  TOU:{ off:0.70, shoulder:1.00, peak:1.55 },
  OFF_START:23, OFF_END:7, PEAK_START:17, PEAK_END:21,
  GEN_DAYS:14,              // a new card generation lands every fortnight, forever
  SAVE_KEY:'rigs-and-pools-save', SAVE_KEY_OLD:'hashline-save', SAVE_VER:1,
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

let rivalSeq=0;
export function mkRival(cid,t){
  const c=CHAINS.find(x=>x.id===cid);
  const scheme=Math.random()<0.35?'PPS':'PPLNS';
  const fee=scheme==='PPS' ? 0.015+Math.random()*0.045 : 0.005+Math.random()*0.035;
  // capitalised to carry a slice of its own chain under the SAME two rules
  // the player faces, so a PPS rival on a rare-block chain arrives properly
  // heavy rather than opening with capacity for nobody
  const want=SIM_RATIO*c.floor*(0.12+Math.random()*0.45);
  const N=Math.max(1e-9, 86400*COVER_DAYS*want/Math.max(1,c.floor*c.target));
  const bv=c.reward*c.price*(1+TX_FEES);
  const bond=Math.round(Math.max(
    want*C.PAY*c.mult*(scheme==='PPS'?1.0:PPLNS_COVER),
    scheme==='PPS' ? VAR_K*Math.sqrt(N)*bv : 0));
  return { id:'r'+(++rivalSeq), chain:cid, owner:'rival',
    name:RIVAL_NAMES[(rivalSeq-1)%RIVAL_NAMES.length]+(rivalSeq>RIVAL_NAMES.length?' '+Math.ceil(rivalSeq/RIVAL_NAMES.length):''),
    scheme, fee, bond, bond0:bond, cap:0, born:t||0, live:true, earned:0,
    found:0, feeMoved:-1e9, lapse:0 };
}
