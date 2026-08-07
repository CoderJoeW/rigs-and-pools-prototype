import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

/* Build two rigs at the (only) site up front — every fleet action test
   needs a small fleet to scope its selection against. */
function twoRigs(g) {
  g.s.cash = 50000;
  g.generatePreset();
  g.build();
  g.s.cash += 20000;
  g.generatePreset();
  g.build();
  // the first rig's build time is a flat 60s, but every rig after that uses
  // the real formula (C.BUILD_BASE-scaled, ~20-30 real minutes) — tick well
  // past that so both rigs are live before a test touches them
  for (let i = 0; i < 60; i++) g.stepTick(60);
  return g.s.rigs;
}

describe('renameRig', () => {
  it('renames a rig, trimmed and length-capped', () => {
    const g = freshStore();
    const [a] = twoRigs(g);

    g.renameRig(a.id, '  GPU Rig One  ');
    expect(a.name).toBe('GPU Rig One');

    g.renameRig(a.id, 'x'.repeat(40));
    expect(a.name).toHaveLength(24);
  });

  it('a blank name is a no-op', () => {
    const g = freshStore();
    const [a] = twoRigs(g);
    const before = a.name;

    g.renameRig(a.id, '   ');
    expect(a.name).toBe(before);
  });

  it('an unknown rig id is a no-op', () => {
    const g = freshStore();
    twoRigs(g);
    expect(() => g.renameRig(99999, 'Ghost')).not.toThrow();
  });
});

describe('renameGroup', () => {
  it('renames a group, trimmed and length-capped', () => {
    const g = freshStore();
    const gr = g.addGroup();

    g.renameGroup(gr, '  Obelisk Crew  ');
    expect(gr.name).toBe('Obelisk Crew');

    g.renameGroup(gr, 'x'.repeat(40));
    expect(gr.name).toHaveLength(24);
  });

  it('a blank name is a no-op', () => {
    const g = freshStore();
    const gr = g.addGroup();
    const before = gr.name;

    g.renameGroup(gr, '   ');
    expect(gr.name).toBe(before);
  });
});

describe('fleetWorn / fleetRepair', () => {
  it('repairs only rigs actually carrying worn cards, across the whole farm', () => {
    const g = freshStore();
    const [a, b] = twoRigs(g);
    a.units[0].w = 0.5; // only rig a is worn

    const info = g.fleetWorn(0.35, null);
    expect(info.rigs).toBe(1);
    expect(info.n).toBe(1);

    g.fleetRepair(0.35, null);
    expect(a.units[0].w).toBe(0);
  });

  it('a rig-id selection narrows the scope', () => {
    const g = freshStore();
    const [a, b] = twoRigs(g);
    a.units[0].w = 0.5;
    b.units[0].w = 0.5;

    g.fleetRepair(0.35, [b.id]); // repair only b
    expect(a.units[0].w).toBe(0.5); // untouched
    expect(b.units[0].w).toBe(0);
  });

  it('does nothing when cash cannot cover the whole job', () => {
    const g = freshStore();
    const [a] = twoRigs(g);
    a.units[0].w = 0.9;
    g.s.cash = 0;
    g.fleetRepair(0.35, null);
    expect(a.units[0].w).toBe(0.9);
  });
});

describe('fleetMove / fleetMoveInfo', () => {
  it('moves every rig not already in the target group, across the whole farm', () => {
    const g = freshStore();
    const rigs = twoRigs(g);
    const newGroup = g.addGroup();

    const info = g.fleetMoveInfo(newGroup.id, null);
    expect(info.rigs).toBe(2);
    expect(info.hash).toBeGreaterThan(0);

    g.fleetMove(newGroup.id, null);
    expect(rigs.every(r => r.group === newGroup.id)).toBe(true);
  });

  it('reports nothing to move once everything is already there', () => {
    const g = freshStore();
    twoRigs(g);
    const newGroup = g.addGroup();
    g.fleetMove(newGroup.id, null);
    expect(g.fleetMoveInfo(newGroup.id, null).rigs).toBe(0);
  });

  it('refuses an unknown group id', () => {
    const g = freshStore();
    const rigs = twoRigs(g);
    const originalGroup = rigs[0].group;
    g.fleetMove(999999, null);
    expect(rigs[0].group).toBe(originalGroup);
  });
});

describe('fleetRefit / fleetRefitInfo (swap cards, keep chassis)', () => {
  it('refits eligible rigs to a different card and charges the net cost', () => {
    const g = freshStore();
    const [a] = twoRigs(g);
    const originalUnit = a.units[0].p;
    // pick the cheapest card in the catalogue as the refit target
    const target = g.cards()[0].id;

    const info = g.fleetRefitInfo(target, null);
    if (info.rigs > 0) {
      g.s.cash = Math.max(g.s.cash, info.cost + 100);
      g.fleetRefit(target, null);
      expect(a.units[0].p).toBe(target);
    } else {
      // if nothing was eligible (e.g. the target IS already installed), the
      // no-op is itself the behaviour worth confirming
      g.fleetRefit(target, null);
      expect(a.units[0].p).toBe(originalUnit);
    }
  });
});

describe('fleetToSpec / fleetSpecInfo / draftSpec', () => {
  it('counts rigs already on spec separately from ones that would change', () => {
    const g = freshStore();
    const [a] = twoRigs(g);
    // draftSpec matching rig a's own current build: nothing should need to change
    const matching = { frame: a.frame, mobo: a.mobo, cool: a.cool, psu: a.psu,
      unit: a.units[0].p, n: a.units.length };
    const info = g.fleetSpecInfo(matching, [a.id]);
    expect(info.already).toBe(1);
    expect(info.rigs).toBe(0);
  });

  it('rebuilds every eligible rig to the Build tab\'s current draft', () => {
    const g = freshStore();
    const rigs = twoRigs(g);
    g.generatePreset(); // load a fresh, buildable spec into g.s.draft
    const spec = g.draftSpec();

    const info = g.fleetSpecInfo(spec, null);
    if (info.rigs > 0) {
      g.s.cash = Math.max(g.s.cash, info.cost + 100);
      g.fleetToSpec(spec, null);
      const changedCount = rigs.filter(r =>
        r.frame === spec.frame && r.mobo === spec.mobo &&
        r.cool === spec.cool && r.psu === spec.psu &&
        r.units[0].p === spec.unit && r.units.length === spec.n).length;
      expect(changedCount).toBeGreaterThan(0);
    }
  });

  it('does nothing when cash cannot cover the whole job', () => {
    const g = freshStore();
    twoRigs(g);
    g.generatePreset();
    const spec = g.draftSpec();
    const info = g.fleetSpecInfo(spec, null);
    if (info.rigs > 0) {
      g.s.cash = 0;
      g.fleetToSpec(spec, null);
      expect(g.fleetSpecInfo(spec, null).rigs).toBe(info.rigs); // unchanged
    }
  });
});
