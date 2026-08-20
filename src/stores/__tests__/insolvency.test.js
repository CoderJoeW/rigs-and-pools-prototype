import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';
import { installInsolvency } from '../../game/insolvency.js';
import { PART, RISER } from '../../data/hardware.js';

/* insolvency() and rigSalvage() are internal-only — never part of the
   store's public API, in the original prototype or this port. insolvency()
   is invoked automatically by stepTick() whenever cash goes negative, so
   these tests drive it that way (with a tiny dt, so billing/mining/etc.
   from the rest of the tick don't perturb the hand-built scenario). It
   takes exactly one step down its escalation ladder per call — whichever
   rung matches the current state. rigSalvage() is exercised indirectly
   through scrapRig(), which is exported.

   One exception, in "the floor rig" below: FLOOR_COST feeds a guard only
   reachable once cash has already been zeroed, so it is true at any value and
   nothing observable can pin it. That block installs the module against a bare
   context to read it directly, rather than publishing it to be testable. The
   store-level tests here still enforce that the module is wired into
   createGame, so the bare-context read is not a blind spot. */

function addRig(g, overrides = {}) {
  const rig = { id: g.s.nextId++, kind: 'gpu', frame: 'f2', mobo: 'm2', psu: 'p450', cool: 'x0',
    ctrl: 'k3', units: [{ p: 'c1', w: 0 }], risers: 1, refurb: 0,
    site: g.s.sites[0].id, group: g.s.groups[0].id, on: true, building: 0,
    open: false, name: 'Rig ' + g.s.nextId, ...overrides };
  g.s.rigs.push(rig);
  return rig;
}

describe('the floor rig', () => {
  /* The rig insolvency grants when everything is gone. FLOOR_RIG/FLOOR_COST
     stay internal — this module's convention, and publishing them purely for a
     test would widen the store's surface for no player-facing reason — so these
     go through the only thing a player can observe: the rig that arrives. */
  function granted(){
    const g = freshStore();
    g.s.rigs.length = 0;
    for(const f of g.s.sites) f.queue.length = 0;
    g.s.cash = -1;
    g.stepTick(0.01);
    return { g, rig: g.s.rigs[0] };
  }

  /* FLOOR_COST has no observable effect — the guard it feeds is only reachable
     once cash has already been zeroed, so it is true at any value. That makes
     it untestable through the store, and it is exactly why the old literal
     could drift to $95 unnoticed. Install the module against a bare context to
     read it directly, rather than publishing it just to be testable. */
  const spec = () => { const G = {}; installInsolvency(G); return G; };

  it('prices the floor rig with the Build tab’s formula', () => {
    const { FLOOR_COST, FLOOR_RIG } = spec();
    expect(FLOOR_COST).toBe(
      PART(FLOOR_RIG.frame).price + PART(FLOOR_RIG.mobo).price + PART(FLOOR_RIG.psu).price
      + PART(FLOOR_RIG.cool).price + FLOOR_RIG.n * (PART(FLOOR_RIG.unit).price + RISER.price));
    expect(FLOOR_COST).toBe(60);
    expect(FLOOR_COST).not.toBe(95);   // the sum that had drifted
  });

  it('keeps the spec frozen, so price and rig cannot part company at runtime', () => {
    const { FLOOR_RIG } = spec();
    expect(Object.isFrozen(FLOOR_RIG)).toBe(true);
  });

  it('carries no ctrl in the spec — there is no controller catalogue to price', () => {
    const { FLOOR_RIG } = spec();
    // PART('k3') is undefined; folding a ctrl into the sum above would throw.
    expect(FLOOR_RIG.ctrl).toBeUndefined();
    expect(PART('k3')).toBeUndefined();
  });

  it('arrives when the farm is completely gone', () => {
    const { g, rig } = granted();
    expect(g.s.rigs).toHaveLength(1);
    expect(rig.on).toBe(true);          // dark, it could never earn its way back
    expect(rig.building).toBe(0);
    expect(g.s.cash).toBe(0);
  });

  it('bills one riser per card, so the count cannot disagree with itself', () => {
    const { rig } = granted();
    // The build formula charges n x (card + riser). A separate riser count
    // would be a second number free to drift from the first.
    expect(rig.risers).toBe(rig.units.length);
  });

  it('costs exactly what the Build tab would charge to build it', () => {
    const { g, rig } = granted();
    // Drive the real draft to the granted rig and read the Build tab's quote.
    // This pins the FORMULA: drop the riser term, or price the cards singly,
    // and the two sides part company.
    Object.assign(g.s.draft, { frame: rig.frame, mobo: rig.mobo, psu: rig.psu,
      cool: rig.cool, unit: rig.units[0].p, n: rig.units.length });
    expect(g.dp.cost).toBe(60);
  });

  it('is the cheapest rig that can mine at all', () => {
    const { g, rig } = granted();
    // Pins the SPEC, not just the arithmetic. Nothing above stops the granted
    // rig quietly becoming an RTX A5000 — the price would follow the spec and
    // stay self-consistent while the bailout turned into a $290 gift.
    const cards = g.cards();
    const cheapestCard = cards.reduce((a, c) => c.price < a.price ? c : a);
    expect(rig.units[0].p).toBe(cheapestCard.id);
    expect(rig.units).toHaveLength(1);
    expect(g.PART(rig.cool).price).toBe(0);   // no cooler, the free option
  });

  it('is a GPU rig, so it is priced and salvaged down the gpu path', () => {
    const { g, rig } = granted();
    // kind decides which formula applies to it, both here and in rigSalvage.
    // An 'asic' here would send rigSalvage at PART(ctrl), and there is no
    // controller catalogue for it to find.
    expect(rig.kind).toBe('gpu');
    expect(() => g.scrapRig(rig.id)).not.toThrow();
  });
});

describe('insolvency escalation', () => {
  it('always zeroes cash once it fires, whatever rung it takes', () => {
    const g = freshStore();
    addRig(g);
    addRig(g);
    g.s.cash = -50;
    g.stepTick(0.01);
    expect(g.s.cash).toBe(0);
  });

  it('with more than one live rig, sheds the worst-earning one rather than going dark', () => {
    const g = freshStore();
    const a = addRig(g);
    const b = addRig(g);
    g.s.cash = -1;

    g.stepTick(0.01);

    const shed = [a, b].filter(r => !r.on);
    expect(shed).toHaveLength(1);
    expect(shed[0].cut).toBe('broke');
    expect([a, b].filter(r => r.on)).toHaveLength(1);
  });

  it('never takes the last live rig — it just notes the run is underwater', () => {
    const g = freshStore();
    const only = addRig(g);
    g.s.cash = -1;

    g.stepTick(0.01);

    expect(only.on).toBe(true);
    expect(g.s.brokeNote).toBe(1);
  });

  it('with no live rigs but construction queued, cancels a job for a partial refund', () => {
    const g = freshStore();
    addRig(g, { on: false }); // exists, but not live -> live.length===0
    const f = g.active;
    f.queue.push({ p: 's-30', kind: 'source', left: 5, total: 10 });
    g.s.cash = -1;

    g.stepTick(0.01);

    expect(f.queue).toHaveLength(0);
    expect(g.s.cash).toBeGreaterThan(0); // the refund
  });

  // a fab job's `p` is a FAB id, not a SITEPART one — this cancel path used
  // to look it up in SITEPART regardless of kind, which throws for a fab job
  it('cancelling a queued fab job refunds off the fab catalogue, not SITEPART', () => {
    const g = freshStore();
    addRig(g, { on: false });
    const f = g.active;
    f.queue.push({ p: 'fab-bench', kind: 'fab', left: 200, total: 400 }); // $150,000
    g.s.cash = -1;

    g.stepTick(0.01);

    expect(f.queue).toHaveLength(0);
    expect(g.s.cash).toBeCloseTo(150000 * 0.5, 5);
  });

  // an 'mfg' job's jobPart().price must be paidCash (what was actually spent
  // to queue it) — NOT part.price, which is a different number entirely (the
  // per-rig price Build charges each time the finished design gets used).
  // Deliberately far apart here so a refund computed off the wrong one is
  // caught by more than a rounding difference.
  it("cancelling a queued mfg job refunds off what was actually paid, not the finished part's future build price", () => {
    const g = freshStore();
    addRig(g, { on: false });
    const f = g.active;
    f.queue.push({ kind: 'mfg', paidCash: 10000,
      part: { id: 'custom-cool-x', name: 'Custom cooler', kind: 'cool', price: 50, fac: 3, w: 10 },
      left: 20, total: 40 });
    g.s.cash = -1;

    g.stepTick(0.01);

    expect(f.queue).toHaveLength(0);
    expect(g.s.cash).toBeCloseTo(10000 * 0.5, 5); // half of paidCash, not half of part.price
  });

  it('with no live rigs and nothing queued, sells the cheapest-salvage rig', () => {
    const g = freshStore();
    const a = addRig(g, { on: false });
    const b = addRig(g, { on: false, frame: 'f16', mobo: 'm16', psu: 'p7500' }); // pricier chassis
    g.s.cash = -1;

    g.stepTick(0.01);

    expect(g.s.rigs).toHaveLength(1);
    expect(g.s.rigs[0].id).toBe(b.id); // the cheaper-to-salvage rig (a) was sold
    expect(g.s.cash).toBeGreaterThan(0);
  });

  it('with no rigs left at all, hands back one free starter rig', () => {
    const g = freshStore();
    g.s.rigs = [];
    g.s.cash = -1;

    g.stepTick(0.01);

    expect(g.s.cash).toBe(0);
    expect(g.s.rigs).toHaveLength(1);
    expect(g.s.rigs[0].on).toBe(true);
    expect(g.s.rigs[0].units).toHaveLength(1);
  });
});

describe('rigSalvage (via scrapRig)', () => {
  it('a more expensive chassis salvages for more than a cheap one', () => {
    const g = freshStore();
    const cheap = addRig(g);
    const pricey = addRig(g, { frame: 'f16', mobo: 'm16', psu: 'p7500' });

    const cashBefore1 = g.s.cash;
    g.scrapRig(cheap.id);
    const cheapPayout = g.s.cash - cashBefore1;

    const cashBefore2 = g.s.cash;
    g.scrapRig(pricey.id);
    const priceyPayout = g.s.cash - cashBefore2;

    expect(priceyPayout).toBeGreaterThan(cheapPayout);
  });

  it('worn cards salvage for less than fresh ones', () => {
    const g = freshStore();
    const fresh = addRig(g);
    const worn = addRig(g, { units: [{ p: 'c1', w: 0.9 }] });

    const cashBefore1 = g.s.cash;
    g.scrapRig(worn.id);
    const wornPayout = g.s.cash - cashBefore1;

    const cashBefore2 = g.s.cash;
    g.scrapRig(fresh.id);
    const freshPayout = g.s.cash - cashBefore2;

    expect(wornPayout).toBeLessThan(freshPayout);
  });
});
