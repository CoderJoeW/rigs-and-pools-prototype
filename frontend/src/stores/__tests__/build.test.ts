import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

describe('build', () => {
  it('generatePreset finds an affordable draft that passes canBuild', () => {
    const g = freshStore();
    expect(g.generatePreset()).toBe(true);
    expect(g.canBuild).toBe(true);
    expect(g.dp.cost).toBeLessThanOrEqual(g.s.cash);
  });

  it('openBuildCost (via idleCashAdvice) quotes exactly what generatePreset would draft under unlimited cash (issue #27)', () => {
    // openBuildCost (the Farm idle-cash advisory) and generatePreset (the
    // Build tab) used to run two near-identical, hand-duplicated copies of
    // the same site-aware search — already caught silently diverging once
    // (a missing psu.price term). Both now share one candidateBuilds
    // generator; this pins them staying in exact agreement across a couple
    // of site/catalogue shapes rather than relying on a future reader to
    // notice a hand-edit only landed in one of the two. openBuildCost
    // itself isn't part of the store's public surface, so this reads it
    // through idleCashAdvice.cost, the one thing that actually calls it.
    const g = freshStore();
    g.s.cash = 1e9; // clear of both the cash check AND the 2x-idle threshold

    expect(g.generatePreset()).toBe(true);
    expect(g.idleCashAdvice.cost).toBeCloseTo(g.dp.cost, 5);

    // again after actually building once, so the catalogue/site state has
    // moved (a rig now occupies a position and draws power) — extra power
    // added directly (bypassing the source's install queue) so a second
    // rig has real headroom to search against, isolating this from the
    // unrelated "no capacity at all" case both functions already agree on
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
    g.active.sources.push({ p: 's-400', n: 1 });
    expect(g.generatePreset()).toBe(true);
    expect(g.idleCashAdvice.cost).toBeCloseTo(g.dp.cost, 5);
  });

  it('spends cash, assembles the first rig instantly, and switches to the Rigs tab', () => {
    const g = freshStore();
    g.generatePreset();
    const cashBefore = g.s.cash;
    const cost = g.dp.cost;

    g.build();

    expect(g.s.cash).toBeCloseTo(cashBefore - cost, 5);
    expect(g.s.rigs).toHaveLength(1);
    const rig = g.s.rigs[0];
    expect(rig.units.length).toBe(g.s.draft.n);
    expect(rig.building).toBe(0); // the very first rig assembles instantly
    expect(rig.on).toBe(true);
    expect(g.s.tab).toBe('rigs');
  });

  it('does nothing when canBuild is false', () => {
    const g = freshStore();
    // more cards than any frame/board combo can carry: the slot check fails
    g.s.draft.n = 999;
    expect(g.canBuild).toBe(false);
    const cashBefore = g.s.cash;
    g.build();
    expect(g.s.cash).toBe(cashBefore);
    expect(g.s.rigs).toHaveLength(0);
  });

  it('the first rig mines immediately; later rigs only once their build timer reaches zero', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.totalHash).toBeGreaterThan(0); // the very first rig assembles instantly

    g.s.cash += 20000;
    g.active.sources.push({ p: 's-400', n: 1 }); // headroom for a second, non-first rig
    g.generatePreset();
    g.build();
    const second = g.s.rigs[1];
    expect(second.building).toBeGreaterThan(0);
    expect(g.rigHash(second)).toBe(0); // not mining yet

    for (let i = 0; i < 60; i++) g.stepTick(60); // the real formula runs tens of minutes
    expect(second.building).toBe(0);
    expect(g.rigHash(second)).toBeGreaterThan(0);
  });
});

describe('scrapRig', () => {
  it('refunds salvage and removes the rig', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const id = g.s.rigs[0].id;
    const cashBefore = g.s.cash;

    g.scrapRig(id);

    expect(g.s.rigs).toHaveLength(0);
    expect(g.s.cash).toBeGreaterThan(cashBefore);
  });

  it('is a no-op for an id that does not exist', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const cashBefore = g.s.cash;
    g.scrapRig(999999);
    expect(g.s.rigs).toHaveLength(1);
    expect(g.s.cash).toBe(cashBefore);
  });
});

describe('swapWorn (repair)', () => {
  it('replaces cards at or above the wear threshold and charges for them', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    rig.units[0].w = 0.5; // simulate wear directly rather than ticking for real hours

    const cashBefore = g.s.cash;
    g.swapWorn(rig.id, 0.35);

    expect(rig.units[0].w).toBe(0);
    expect(g.s.cash).toBeLessThan(cashBefore);
    expect(g.s.repairs).toBeGreaterThan(0);
  });

  it('does nothing when nothing is worn past the threshold', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    const cashBefore = g.s.cash;
    g.swapWorn(rig.id, 0.35);
    expect(g.s.cash).toBe(cashBefore);
  });

  it('an untuned rig needs its first repair within about a week, not months (issue #3)', () => {
    // Drives real ticks rather than setting .w directly (that's what the two
    // tests above do, and what BASE_WEAR itself can't break). 10 sim-days at
    // tune=0 crosses the 0.35 repair line even for the unluckiest card —
    // wr's floor is 0.75 (random.js), and 0.35/(0.05*0.75) ≈ 9.3 days — so
    // this isn't relying on getting lucky rolls. Actual site heat is >=1
    // (tick.js), so real ambient swings only get there faster, never slower
    // — and this now genuinely exercises that swing (issue #22): stepping
    // by exactly one day at a time samples the SAME time-of-day every
    // iteration (86400s ≡ 0 mod a day), pinning ambient at its daily
    // minimum for the whole run and never letting site heat cross the 58°C
    // point where the wear-accelerating heat term actually engages.
    // 3-hour steps rotate through the full diurnal cycle instead, over the
    // same 10 sim-days (80*10800 = 864000s).
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
    for (let i = 0; i < 80; i++) g.stepTick(10800); // 10 sim-days, full tilt, rotating through the day

    const rig = g.s.rigs[0];
    expect(rig.units.every(u => u.w > 0)).toBe(true); // wear is actually accruing
    expect(g.fleetWorn(0.35, null).n).toBeGreaterThan(0); // and it reached the repair line
  });

  it('does nothing when cash cannot cover the repair', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    rig.units[0].w = 0.9;
    g.s.cash = 0;
    g.swapWorn(rig.id, 0.35);
    expect(rig.units[0].w).toBe(0.9); // untouched
  });
});

describe('rebuild (retrofit)', () => {
  it('startRebuild seeds a draft matching the rig\'s current spec', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    g.startRebuild(rig);
    expect(g.s.rebuild.rig).toBe(rig.id);
    expect(g.s.rebuild.draft.unit).toBe(rig.units[0].p);
    expect(g.s.rebuild.draft.n).toBe(rig.units.length);
  });

  it('rebuildInfo reports "changed:false" when the draft matches the rig exactly', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    const sameSpec = { frame: rig.frame, mobo: rig.mobo, cool: rig.cool, psu: rig.psu,
      unit: rig.units[0].p, n: rig.units.length };
    const info = g.rebuildInfo(rig, sameSpec);
    expect(info.changed).toBe(false);
    expect(info.ok).toBe(false); // "changed" is required before a rebuild is considered ok
  });

  it('applyRebuild takes the rig down and charges the net cost of a real change', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    // finish the initial build so we're rebuilding a live rig, not a queued one
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(rig.building).toBe(0);

    g.startRebuild(rig);
    g.s.rebuild.draft.n = Math.max(1, rig.units.length - 1); // drop one card: a real, cheap change
    const info = g.rebuildInfo(rig, g.s.rebuild.draft);
    expect(info.changed).toBe(true);

    if (info.ok) {
      const cashBefore = g.s.cash;
      g.applyRebuild();
      expect(g.s.rebuild).toBe(null);
      expect(rig.building).toBeGreaterThan(0);
      expect(rig.units.length).toBe(Math.max(1, rig.units.length)); // still >=1
      expect(g.s.cash).not.toBe(cashBefore);
    }
  });
});

describe('toggleRig / setRigGroup', () => {
  it('toggles power only when the rig is not mid-assembly', () => {
    const g = freshStore();
    g.generatePreset();
    g.build(); // the first rig assembles instantly, so build a second (non-first) to get one mid-assembly
    g.s.cash += 20000;
    g.active.sources.push({ p: 's-400', n: 1 });
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[1];
    expect(rig.building).toBeGreaterThan(0);

    g.toggleRig(rig.id); // still building: no-op
    expect(rig.on).toBe(true);

    for (let i = 0; i < 60; i++) g.stepTick(60); // the real formula runs tens of minutes
    expect(rig.building).toBe(0);
    g.toggleRig(rig.id);
    expect(rig.on).toBe(false);
  });

  it('setRigGroup reassigns which group a rig mines for', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    const newGroup = g.addGroup();
    g.setRigGroup(rig, newGroup.id);
    expect(rig.group).toBe(newGroup.id);
  });
});

describe('bulk build', () => {
  it('maxBuildQty is at least 1 when canBuild is true', () => {
    const g = freshStore();
    g.generatePreset();
    expect(g.canBuild).toBe(true);
    expect(g.maxBuildQty()).toBeGreaterThanOrEqual(1);
  });

  it('build(n) spends n× cost and adds n rigs, the very first assembling instantly', () => {
    const g = freshStore();
    g.s.cash = 1e9;
    // Extra power so more than one position can clear the power check
    g.active.sources.push({ p: 's-400', n: 1 });
    expect(g.generatePreset()).toBe(true);
    const max = g.maxBuildQty();
    expect(max).toBeGreaterThanOrEqual(2);
    const n = Math.min(3, max);
    const cost = g.dp.cost;
    const cashBefore = g.s.cash;
    g.build(n);
    expect(g.s.rigs).toHaveLength(n);
    expect(g.s.cash).toBeCloseTo(cashBefore - cost * n, 5);
    expect(g.s.rigs[0].building).toBe(0); // the very first rig ever built
    expect(g.s.rigs.slice(1).every(r => r.building > 0)).toBe(true);
    expect(g.s.tab).toBe('rigs');
  });

  it('build(qty) clamps to maxBuildQty rather than overspending', () => {
    const g = freshStore();
    g.generatePreset();
    const max = g.maxBuildQty();
    const cashBefore = g.s.cash;
    g.build(9999);
    expect(g.s.rigs.length).toBe(max);
    expect(g.s.cash).toBeCloseTo(cashBefore - g.dp.cost * max, 5);
  });

  it('build(1) remains the default and matches the single-rig path', () => {
    const g = freshStore();
    g.generatePreset();
    const cost = g.dp.cost;
    const cashBefore = g.s.cash;
    g.build(); // no arg
    expect(g.s.rigs).toHaveLength(1);
    expect(g.s.cash).toBeCloseTo(cashBefore - cost, 5);
  });

  it('maxBuildQty is 0 when canBuild is false', () => {
    const g = freshStore();
    g.s.draft.n = 999;
    expect(g.canBuild).toBe(false);
    expect(g.maxBuildQty()).toBe(0);
  });
});

describe('rushRig', () => {
  it('charges to collapse a mid-assembly rig\'s remaining build time to (near) zero', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();                                    // the first rig assembles instantly
    g.s.cash += 20000;
    g.active.sources.push({ p: 's-400', n: 1 });   // headroom for a second, non-first rig
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[1];
    expect(rig.building).toBeGreaterThan(0);
    const cost = g.rushRigCost(rig);
    expect(cost).toBeGreaterThan(0);

    const cashBefore = g.s.cash;
    g.rushRig(rig.id);
    expect(g.s.cash).toBeCloseTo(cashBefore - cost, 5);
    expect(rig.building).toBeLessThan(0.001);

    g.stepTick(1); // now finishes almost immediately
    expect(rig.building).toBe(0);
    expect(g.rigHash(rig)).toBeGreaterThan(0);
  });

  it('does nothing when cash cannot cover the rush', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    g.s.cash += 20000;
    g.active.sources.push({ p: 's-400', n: 1 });
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[1];
    const buildingBefore = rig.building;
    g.s.cash = 0;
    g.rushRig(rig.id);
    expect(rig.building).toBe(buildingBefore);
  });

  it('is a no-op once the rig is already built', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    expect(rig.building).toBe(0);
    const cashBefore = g.s.cash;
    g.rushRig(rig.id);
    expect(g.s.cash).toBe(cashBefore);
  });

  it('also rushes a rebuild in progress', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    const rig = g.s.rigs[0];
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish the initial build

    g.startRebuild(rig);
    g.s.rebuild.draft.n = Math.max(1, rig.units.length - 1);
    const info = g.rebuildInfo(rig, g.s.rebuild.draft);
    if (info.ok) {
      g.applyRebuild();
      expect(rig.building).toBeGreaterThan(0);
      const cost = g.rushRigCost(rig);
      const cashBefore = g.s.cash;
      g.rushRig(rig.id);
      expect(g.s.cash).toBeCloseTo(cashBefore - cost, 5);
      expect(rig.building).toBeLessThan(0.001);
    }
  });
});
