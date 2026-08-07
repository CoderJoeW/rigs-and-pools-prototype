import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

/* insolvency() and rigSalvage() are internal-only — never part of the
   store's public API, in the original prototype or this port. insolvency()
   is invoked automatically by stepTick() whenever cash goes negative, so
   these tests drive it that way (with a tiny dt, so billing/mining/etc.
   from the rest of the tick don't perturb the hand-built scenario). It
   takes exactly one step down its escalation ladder per call — whichever
   rung matches the current state. rigSalvage() is exercised indirectly
   through scrapRig(), which is exported. */

function addRig(g, overrides = {}) {
  const rig = { id: g.s.nextId++, kind: 'gpu', frame: 'f2', mobo: 'm2', psu: 'p450', cool: 'x0',
    ctrl: 'k3', units: [{ p: 'c1', w: 0 }], risers: 1, refurb: 0,
    site: g.s.sites[0].id, group: g.s.groups[0].id, on: true, building: 0,
    open: false, name: 'Rig ' + g.s.nextId, ...overrides };
  g.s.rigs.push(rig);
  return rig;
}

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
