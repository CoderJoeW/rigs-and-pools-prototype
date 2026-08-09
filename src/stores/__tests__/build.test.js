import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

describe('build', () => {
  it('generatePreset finds an affordable draft that passes canBuild', () => {
    const g = freshStore();
    expect(g.generatePreset()).toBe(true);
    expect(g.canBuild).toBe(true);
    expect(g.dp.cost).toBeLessThanOrEqual(g.s.cash);
  });

  it('spends cash, adds a rig under construction, and switches to the Rigs tab', () => {
    const g = freshStore();
    g.generatePreset();
    const cashBefore = g.s.cash;
    const cost = g.dp.cost;

    g.build();

    expect(g.s.cash).toBeCloseTo(cashBefore - cost, 5);
    expect(g.s.rigs).toHaveLength(1);
    const rig = g.s.rigs[0];
    expect(rig.units.length).toBe(g.s.draft.n);
    expect(rig.building).toBeGreaterThan(0);
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

  it('a rig starts mining only once its build timer reaches zero', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.totalHash).toBe(0); // still assembling
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(g.totalHash).toBeGreaterThan(0);
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
    g.build();
    const rig = g.s.rigs[0];
    expect(rig.building).toBeGreaterThan(0);

    g.toggleRig(rig.id); // still building: no-op
    expect(rig.on).toBe(true);

    for (let i = 0; i < 5; i++) g.stepTick(60);
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
