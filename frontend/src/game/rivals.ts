import { CHAINS } from '../data/chains.js';
import { C, TX_FEES, SIM_RATIO, COVER_DAYS, PPLNS_COVER, VAR_K, RIVAL_NAMES } from '../data/constants.js';

// Every pool is somebody's business — rivals, or your own. A founder posts a
// bond, sets a fee, and simulated miners choose between the pools on offer
// by price and by how well-bonded the operator is. mkRival lives here
// (rather than in data/constants.ts, where the rest of the network-sim
// tuning lives) because it isn't a constant — it's an entity factory with
// its own mutable sequence counter, i.e. game logic.
// Naming-sequence rationale: docs/implementation-notes.md#rival-sim-pool-naming-nextrivalname-in-rivalsjs.
export function nextRivalName(seq: number): string {
  const idx = (seq - 1) % RIVAL_NAMES.length;
  const cycle = Math.ceil(seq / RIVAL_NAMES.length);
  return RIVAL_NAMES[idx] + (cycle > 1 ? ' ' + cycle : '');
}

export interface RivalPool {
  id: string; chain: string; owner: 'rival'; name: string;
  scheme: 'PPS' | 'PPLNS'; fee: number; bond: number; bond0: number; cap: number;
  born: number; live: boolean; earned: number; found: number; feeMoved: number; lapse: number;
}

let rivalSeq = 0;
export function mkRival(cid: string, t?: number): RivalPool {
  const c = CHAINS.find(x => x.id === cid)!;
  const scheme: 'PPS' | 'PPLNS' = Math.random() < 0.35 ? 'PPS' : 'PPLNS';
  const fee = scheme === 'PPS' ? 0.015 + Math.random() * 0.045 : 0.005 + Math.random() * 0.035;
  // capitalised to carry a slice of its own chain under the SAME two rules
  // the player faces, so a PPS rival on a rare-block chain arrives properly
  // heavy rather than opening with capacity for nobody
  const want = SIM_RATIO * c.floor * (0.12 + Math.random() * 0.45);
  const N = Math.max(1e-9, 86400 * COVER_DAYS * want / Math.max(1, c.floor * c.target));
  const bv = c.reward * c.price * (1 + TX_FEES);
  const bond = Math.round(Math.max(
    want * C.PAY * c.mult * (scheme === 'PPS' ? 1.0 : PPLNS_COVER),
    scheme === 'PPS' ? VAR_K * Math.sqrt(N) * bv : 0));
  rivalSeq++;
  return { id:'r'+rivalSeq, chain:cid, owner:'rival',
    name:nextRivalName(rivalSeq),
    scheme, fee, bond, bond0:bond, cap:0, born:t||0, live:true, earned:0,
    found:0, feeMoved:-1e9, lapse:0 };
}
