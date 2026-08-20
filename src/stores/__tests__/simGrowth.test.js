import { describe, it, expect } from 'vitest';
import { createGame } from '../game.js';
import { SIM_CHAINS, SIM_RATIO } from '../../data/constants.js';
import { SIM_MIN_HASH, SIM_SEATS_MIN, SIM_SOFT_CAP, SIM_START } from '../../game/sims.js';

/* The network is a population, not a constant.

   It used to be a constant: seedSims handed every chain SIM_RATIO * floor at
   t=0 and split it among 25 accounts, so Obelisk opened at 1.32 TH with 25
   "new miners" holding 48 GH each — about 250 starter rigs apiece — and then
   compounded from there to 27x its own floor inside a game-month. These tests
   pin the two halves of the replacement: a chain opens at what the miners who
   have turned up have actually built, and it grows as more of them turn up
   rather than by unbounded reinvestment. */

/* createGame() rather than freshStore(): the model this file is about lives
   on G and is deliberately NOT published through G.__exports (see
   exportSurface.test.js), so the store proxy cannot see simTargetOf, the
   per-chain head count, or the running hashrate totals. Nothing here needs
   Pinia — createGame is plain Vue — and nothing here shares a G. */
const freshStore = () => createGame();

const chainOf = (g, id) => g.s.chains.find(c => c.id === id);
const simsOn = (g, id) => g.s.sims.filter(m => m.chain === id);

/* Run the whole tick loop, not just simPulse: block awards, prices, pool
   payouts and the sims' own decisions all feed each other, and it was the
   feedback between them (hashrate lifting price lifting revenue) that carried
   the old runaway past the floor. */
function runDays(g, days, step = 1800) {
  const steps = Math.round((days * 86400) / step);
  for (let i = 0; i < steps; i++) g.stepTick(step);
}

describe('the network a world opens with', () => {
  it('opens every chain far below its floor — fresh territory, not a full network', () => {
    const g = freshStore();
    for (const cid of SIM_CHAINS) {
      const c = chainOf(g, cid);
      // The old seed put every one of these at exactly 0.6 — the value
      // SIM_RATIO describes as where a MATURE network settles.
      expect(g.chainHash(c) / c.floor).toBeLessThan(0.1);
    }
  });

  it('opens Obelisk in gigahashes, not the 1.3 TH it used to be handed', () => {
    const g = freshStore();
    const obelisk = chainOf(g, 'obelisk');
    expect(g.chainHash(obelisk)).toBeLessThan(50e3);       // < 50 GH
    expect(g.chainHash(obelisk)).toBeGreaterThan(1e3);     // but a real network
  });

  it('gives every simulated miner a farm a new player could recognise', () => {
    const g = freshStore();
    expect(g.s.sims).toHaveLength(SIM_START);
    for (const m of g.s.sims) {
      expect(m.hash).toBeGreaterThanOrEqual(SIM_MIN_HASH * 0.99);
      // One starter rig is ~192 MH. Nobody opens holding fifty of them.
      expect(m.hash).toBeLessThan(192 * 50);
    }
  });

  it('keeps a pool market alive on the small rungs as well as the big ones', () => {
    const g = freshStore();
    for (const cid of SIM_CHAINS) {
      expect(simsOn(g, cid).length).toBeGreaterThanOrEqual(SIM_SEATS_MIN);
      expect(g.simsOn(cid)).toBeGreaterThan(0);
    }
  });

  it('still ranks the chains by size — the ladder is the sim populations now', () => {
    const g = freshStore();
    const counts = SIM_CHAINS.map(cid => simsOn(g, cid).length);
    const floors = SIM_CHAINS.map(cid => chainOf(g, cid).floor);
    const biggest = floors.indexOf(Math.max(...floors));
    expect(SIM_CHAINS[biggest]).toBe('obelisk');
    expect(counts[biggest]).toBe(Math.max(...counts));
  });
});

describe('the network as it grows', () => {
  it('gains miners over time instead of standing still', () => {
    const g = freshStore();
    runDays(g, 12);
    expect(g.s.sims.length).toBeGreaterThan(SIM_START);
    expect(g.s.sims.length).toBeLessThan(SIM_SOFT_CAP);
  });

  it('grows the chains it is growing on, and never past what they support', () => {
    const g = freshStore();
    const before = SIM_CHAINS.map(cid => g.chainHash(chainOf(g, cid)));
    runDays(g, 12);
    const after = SIM_CHAINS.map(cid => g.chainHash(chainOf(g, cid)));
    expect(after.reduce((a, x) => a + x, 0)).toBeGreaterThan(before.reduce((a, x) => a + x, 0));
    /* The whole point. On the old model twelve days took Obelisk from 1.3 TH
       to roughly 25 TH — 11x its floor — on its way to the ~51x where the
       price feedback finally caps out. SIM_RATIO is the ceiling this side of
       a fully-arrived network; a healthy margin over it still fails loudly if
       the reinvestment brake comes off. */
    SIM_CHAINS.forEach((cid, i) => {
      expect(after[i] / chainOf(g, cid).floor).toBeLessThan(SIM_RATIO * 2);
    });
  });

  it('never empties a chain, however the prices swing', () => {
    const g = freshStore();
    runDays(g, 12);
    /* Chain choice compared pay alone, and below the floor the difficulty
       clamp holds pay flat however crowded a chain gets — so there was no
       crowding term at all, and one lucky swing in Halcyon's price emptied
       Ferro and Nova to literally zero within a week and they never
       recovered. */
    for (const cid of SIM_CHAINS) {
      expect(simsOn(g, cid).length).toBeGreaterThan(0);
      expect(g.chainHash(chainOf(g, cid))).toBeGreaterThan(0);
    }
  });

  it('keeps its head count per chain in step with the sims array', () => {
    const g = freshStore();
    runDays(g, 8);
    // The incremental counter behind simTargetOf — a drift here would quietly
    // mis-size every chain rather than throw.
    for (const cid of SIM_CHAINS) {
      expect(g._simChainN[cid]).toBe(simsOn(g, cid).length);
    }
  });

  it('holds the running hashrate totals to what the sims actually own', () => {
    const g = freshStore();
    runDays(g, 8);
    for (const cid of SIM_CHAINS) {
      const owned = simsOn(g, cid).reduce((a, m) => a + m.hash, 0);
      expect(g._simChainHash[cid]).toBeCloseTo(owned, 4);
    }
  });
});

describe('what a chain carries', () => {
  it('sizes a chain by the population that has arrived, not by its floor', () => {
    const g = freshStore();
    const obelisk = chainOf(g, 'obelisk');
    const opening = g.simTargetOf('obelisk');
    expect(opening).toBeLessThan(SIM_RATIO * obelisk.floor * 0.1);

    // Same chain, same floor, a network that has filled up: the target is the
    // mature one SIM_RATIO names.
    const full = g.simTargetOf('obelisk', SIM_SOFT_CAP, g.seatsFor('obelisk', SIM_SOFT_CAP));
    expect(full).toBeCloseTo(SIM_RATIO * obelisk.floor, -3);
  });

  it('opens a chain built out to exactly what it supports, and no further', () => {
    const g = freshStore();
    for (const cid of SIM_CHAINS) {
      const target = g.simTargetOf(cid);
      expect(g._simChainHash[cid]).toBeCloseTo(target, -1);
      /* Sitting on the line, not over it: the miners here have built what
         there was to build, so nobody is expanding and nobody is retiring.
         Compared with a tolerance rather than to 0 exactly — the seed splits
         the target across the chain's miners, so whether the sum lands a
         half-ULP under it (leaving 2e-16 of "room") or over is down to the
         draw. */
      expect(g.simRoomOf(cid)).toBeLessThan(1e-9);
      expect(g.overBuilt(cid)).toBe(false);
    }
  });

  it('opens room as miners arrive, and closes it again when the chain is swamped', () => {
    const g = freshStore();
    const cid = 'obelisk';
    runDays(g, 6);
    // More miners have turned up than the chain was sized for, so there is
    // something for the ones already here to build toward.
    expect(g.simRoomOf(cid)).toBeGreaterThan(0);

    const m = simsOn(g, cid)[0];
    g.setSimHash(m, m.hash + g.simTargetOf(cid) * 2);
    expect(g.simRoomOf(cid)).toBe(0);
    expect(g.overBuilt(cid)).toBe(true);
  });

  it('seats the chains by floor weight once the crowd is big enough to split', () => {
    const g = freshStore();
    const seats = SIM_CHAINS.map(cid => g.seatsFor(cid, SIM_SOFT_CAP));
    const floors = SIM_CHAINS.map(cid => chainOf(g, cid).floor);
    // Ordered by floor, and every seat worth about one small farm on any chain.
    for (let i = 1; i < seats.length; i++) {
      expect(seats[i] > seats[i - 1]).toBe(floors[i] > floors[i - 1]);
    }
    for (let i = 0; i < seats.length; i++) {
      const per = (SIM_RATIO * floors[i]) / seats[i];
      expect(per).toBeGreaterThan(SIM_MIN_HASH);
      expect(per).toBeLessThan(SIM_MIN_HASH * 12);
    }
  });
});
