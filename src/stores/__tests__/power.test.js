import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

describe('site power dispatch', () => {
  it('an idle site draws nothing and has the domestic outlet\'s capacity', () => {
    const g = freshStore();
    const f = g.active;
    expect(g.siteCapacity(f)).toBe(1500); // the starting domestic outlet
    expect(g.siteDemand(f)).toBe(0); // no rigs, and open-air cooling draws nothing
  });

  it('demand rises once a rig is built and running', () => {
    const g = freshStore();
    const f = g.active;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(g.siteDemand(f)).toBeGreaterThan(0);
    expect(g.siteDemand(f)).toBeLessThanOrEqual(g.siteCapacity(f)); // the preset must fit
  });
});

describe('brownout shedding', () => {
  it('sheds the worst-earning rig when demand exceeds capacity, and restores it once capacity returns', () => {
    const g = freshStore();
    const f = g.active;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    const rig = g.s.rigs[0];
    expect(rig.on).toBe(true);

    // pull all power sources out from under the site
    const savedSources = f.sources;
    f.sources = [];
    expect(g.siteCapacity(f)).toBe(0);

    g.stepTick();

    expect(rig.on).toBe(false);
    expect(rig.cut).toBe('brownout');
    expect(g.s.shed).toBeGreaterThan(0);

    // capacity comes back: the rig should be restored automatically
    f.sources = savedSources;
    g.stepTick();

    expect(rig.on).toBe(true);
    expect(rig.cut).toBe(null);
  });
});

describe('cooling and thermal throttle', () => {
  it('throttles hashrate once the site runs hot', () => {
    const g = freshStore();
    const f = g.active;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(g.throttleOf(f)).toBe(1); // open-air cooling handles a single starter rig fine

    f.plants = []; // strip all cooling: siteCooling(f) becomes 0
    expect(g.siteCooling(f)).toBe(0);
    expect(g.siteTemp(f)).toBeGreaterThanOrEqual(70 + 5); // the cool<=0 branch: ambient+75

    expect(g.throttleOf(f)).toBeLessThan(1);
    expect(g.throttleOf(f)).toBeGreaterThanOrEqual(0.5); // throttle floors at 50%
  });

  it('rigHash reflects the throttle applied at its site', () => {
    const g = freshStore();
    const f = g.active;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    const rig = g.s.rigs[0];
    const hashCool = g.rigHash(rig);

    f.plants = [];
    const hashHot = g.rigHash(rig);

    expect(hashHot).toBeLessThan(hashCool);
  });
});

describe('battery', () => {
  it('a site with no storage has zero battery capacity', () => {
    const g = freshStore();
    const f = g.active;
    expect(g.battKwh(f)).toBe(0);
    expect(g.battKw(f)).toBe(0);
    expect(g.battFirm(f)).toBe(0);
  });

  it('installed storage contributes real kWh/kW', () => {
    const g = freshStore();
    const f = g.active;
    f.storage = [{ p: 'st-home', n: 1 }]; // 8 kWh / 3 kW home battery
    expect(g.battKwh(f)).toBe(8);
    expect(g.battKw(f)).toBe(3000);
  });
});
