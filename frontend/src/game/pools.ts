import { C } from '../data/constants.js';
import { fmt } from '../utils/format.js';
import { trimName } from './state.js';
import type { Game, ChainState, Pool } from './types.js';

// Installed into the shared context G — docs/implementation-notes.md#shared-context-g-module-pattern.
// Cross-module references go through G, so the 7 mutually dependent
// module pairs still resolve at call time exactly as the closure did.
// Declarations are untouched: hoisting, evaluation order and
// intra-module references are the same code they always were.
export function installPools(G: Game): void {
  /* ---- running a pool ---- */
  function foundPool(chainId: string, scheme: 'PPS' | 'PPLNS', fee: number): void {
    const chain = G.chain(chainId)!, need = G.bondReq(chain, scheme);   // chainId always a real chain
    if (G.s.cash < need) return;
    G.s.cash -= need;
    G.s.pools.push({ id:'you'+Math.random().toString(36).slice(2,7), chain:chainId,
      name:'Your '+chain.name+' pool', scheme, fee, owner:'you',
      bond:need, bond0:need, cap:0, born:G.s.t, live:true, earned:0 });
    G.say('sys', 'Founded a ' + scheme + ' pool on ' + chain.name + ' at ' + (fee * 100).toFixed(1) + '%',
      '-' + fmt.usd(need));
    G.pop('Pool opened', 'bond posted: ' + fmt.usd(need), 'blu', { always: true });
    G.s.shakeAt = G.s.t + 300; G.s.shakeOn = chainId;
    if (!G.simsOn(chainId))
      G.say('bad', 'No other miners work ' + chain.name + ' — this pool can only ever hold your own rigs');
  }
  function renamePool(pool: Pool, name: string): void {
    if (pool.owner !== 'you') return;               // a rival's pool is not yours to rename
    const trimmedName = trimName(name);
    if (trimmedName) pool.name = trimmedName;
  }
  function setPoolFee(pool: Pool, fee: number): void {
    if (Math.abs(fee - pool.fee) > 0.0005) pool.feeMoved = G.s.t;
    pool.fee = Math.max(0, Math.min(0.15, fee));
    G.s.shakeAt = G.s.t + 300;      // word gets around in five minutes; debounces a slider drag
    G.s.shakeOn = pool.chain;
  }
  /* The bond is a lever, not a fixed opening stake. On PPS it is literally the
     capacity control — it is the capital backing four days of member payouts,
     so every dollar in buys a fixed slice of hashrate you may underwrite. On
     PPLNS members carry their own variance, so the bond buys no capacity at
     all; it only buys reputation, and the interface says so rather than
     implying a lever that is not there. */
  /* What the bond may not go below: on PPS, cover for the members you already
     have. Without this you could pull your capital the moment a dry spell
     started and leave members underwritten by nothing. */
  const bondFloor = (pool: Pool) => Math.max(
    G.bondReq(G.chain(pool.chain), pool.scheme),        // never below the entry stake
    G.bondFor(pool, G.poolHash(pool)));                 // nor below cover for current members
  function addBond(pool: Pool, amount: number): void {
    amount = Math.min(Math.round(amount), Math.floor(G.s.cash)); if (amount <= 0) return;
    G.s.cash -= amount; pool.bond += amount; pool.bond0 = Math.max(pool.bond0, pool.bond);
    G.say('sys', 'Added ' + fmt.usd(amount) + ' to ' + pool.name + "'s bond", '-' + fmt.usd(amount), undefined, undefined, -amount);
  }
  function releaseBond(pool: Pool, amount: number): void {
    const room = Math.max(0, pool.bond - bondFloor(pool));
    amount = Math.min(Math.round(amount), Math.floor(room)); if (amount <= 0) return;
    pool.bond -= amount; G.s.cash += amount;
    pool.bond0 = pool.bond;      // a deliberate downsize is an announcement, not a default:
    G.say('sys', 'Released ' + fmt.usd(amount) + ' from ' + pool.name + "'s bond", '+' + fmt.usd(amount), undefined, undefined, amount);
  }                      // losses still push bond below bond0 and cost you trust
  function topUpBond(pool: Pool, amount: number): void { addBond(pool, amount); }
  const poolProfit = (pool: Pool) => Math.max(0, pool.bond - pool.bond0);
  function withdrawProfit(pool: Pool): void {
    const amount = Math.round(poolProfit(pool));
    if (amount <= 0) return;
    pool.bond -= amount; G.s.cash += amount; G.s.poolTake = (G.s.poolTake || 0) + amount;
    G.say('sys', 'Withdrew profit from ' + pool.name, '+' + fmt.usd(amount), undefined, undefined, amount);
  }
  function closePool(pool: Pool): void {
    const back = Math.round(pool.bond);
    G.s.cash += back;
    /* Through the shared closing path, which releases the pool's simulated
       members as well as your own groups. Releasing only the groups left
       every sim member still marked as being in a dead pool: their hashrate
       sat in _simPoolHash for a pool drawSimWinner skips, and was in neither
       bucket it walks — counted in the chain's hashrate, so the blocks kept
       coming, but unreachable, so the ones that should have been theirs fell
       through to solo. */
    G.closeSimPool(pool, 'when you closed the pool');
    G.say('sys', 'Closed ' + pool.name + ' — bond returned', '+' + fmt.usd(back), undefined, undefined, back);
  }
  function doSell(chain: ChainState, amount: number, quiet?: boolean): void {
    if (!Number.isFinite(amount) || amount <= 0) return;   // one bad argument must not poison a price forever
    if (amount <= 0) return;
    const slip = Math.min(0.5, 0.5 * amount / chain.depth);
    const net = amount * G.price(chain) * (1 - slip) * (1 - C.EXCH_FEE);
    G.s.wallet[chain.id]! -= amount; G.s.cash += net; G.s.earned += net;
    chain.impact = Math.min(0.85, chain.impact + amount / chain.depth);
    if (!quiet) G.say('pay', 'Sold ' + fmt.c(amount) + ' ' + chain.tick +
      (slip > 0.005 ? ' (' + fmt.pct(slip) + ' slippage)' : ''), '+' + fmt.usd2(net));
  }
  const sell = (chainId: string, frac: number) => doSell(G.chain(chainId)!, G.s.wallet[chainId]! * frac);
  /* Buying is doSell's mirror image, not a separate model: the same book
     depth sets slippage, the same exchange fee applies, and impact moves
     the same way — just signed the other direction. Selling pushes impact
     positive (price sags below ref); buying pushes it negative (price runs
     above ref). Both decay back toward 0 via the same per-tick relaxation
     in chainEconomy.ts, so a premium fades exactly as a discount does. This is
     what completes the buy side the design spec's v33 fundamentals never
     shipped — no new price model, just the existing one used both ways. */
  function doBuy(chain: ChainState, usd: number): void {
    if (!Number.isFinite(usd) || usd <= 0) return;
    const cost = Math.min(usd, G.s.cash);     // total cash committed, fee included
    if (cost <= 0) return;
    const netUsd = cost / (1 + C.EXCH_FEE);      // what actually buys coins, after the fee
    const coins = netUsd / G.price(chain);         // what a frictionless fill would buy
    const slip = Math.min(0.5, 0.5 * coins / chain.depth);
    const filled = coins * (1 - slip);           // slippage: fewer coins for the same dollar
    G.spend(cost); G.s.wallet[chain.id]! += filled;
    chain.impact = Math.max(-0.85, chain.impact - coins / chain.depth);
    G.say('pay', 'Bought ' + fmt.c(filled) + ' ' + chain.tick +
      (slip > 0.005 ? ' (' + fmt.pct(slip) + ' slippage)' : ''), '-' + fmt.usd2(cost));
  }
  const buy = (chainId: string, frac: number) => doBuy(G.chain(chainId)!, G.s.cash * frac);
  function fireDrip(): void {
    for (const chain of G.s.chains) {
      if (G.s.hold && G.s.hold[chain.id]) continue;          // exempt what you are holding
      if (G.price(chain) < G.s.minSell) continue;            // and what is below your floor
      const amount = G.s.wallet[chain.id]! * G.s.drip.frac;
      if (amount > 0.0005) doSell(chain, Math.min(amount, G.s.wallet[chain.id]!), true);
    }
  }
  /* What one order at the current setting would cost this coin, as a fraction.
     Same formula doSell charges, so the number on screen is the real one. */
  const dripCost = (chain: ChainState, frac?: number) =>
    Math.min(0.5, 0.5 * (G.s.wallet[chain.id]! * (frac !== undefined ? frac : G.s.drip.frac)) / chain.depth);
  /* The coin the current setting treats worst — the one worth naming. */
  const dripWorst = () => {
    let worst: { c: ChainState; cost: number; at25: number } | null = null;
    for (const chain of G.s.chains) {
      if (G.s.hold && G.s.hold[chain.id]) continue;
      const cost = dripCost(chain);
      if (cost > 0.01 && (!worst || cost > worst.cost)) worst = { c: chain, cost, at25: dripCost(chain, 0.25) };
    }
    return worst;
  };
  // 'on' takes a boolean, 'frac'/'hours' take a number — one signature per
  // key would be truer, but the three UI callers already pass the right
  // shape for their own key, so this just needs to stay out of `any`.
  const setDrip = (key: 'on' | 'frac' | 'hours', value: boolean | number) => {
    (G.s.drip as unknown as Record<'on' | 'frac' | 'hours', boolean | number>)[key] = value;
    G.s.dripAt = G.s.t + G.s.drip.hours * 3600;
  };
  const toggleHold = (chainId: string) => { G.s.hold = G.s.hold || {}; G.s.hold[chainId] = !G.s.hold[chainId]; };

  Object.assign(G, { addBond, bondFloor, buy, closePool, doBuy, doSell, dripCost, dripWorst, fireDrip, foundPool, poolProfit, releaseBond, renamePool, sell, setDrip, setPoolFee, toggleHold, topUpBond, withdrawProfit });
}
