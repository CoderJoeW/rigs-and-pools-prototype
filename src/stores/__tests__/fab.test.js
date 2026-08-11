import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

// installs 'fab-bench' (slots: cool, psu; budget 30) at the active site and
// finishes construction instantly, the same rush-style shortcut sites.test.js
// uses — a fab's real build time is hours too long to loop stepTick to
function withBench(g){
  const f=g.active;
  g.s.cash=1000000;
  g.chooseFab(f.id,'fab-bench');
  f.queue[0].left=0.0001;
  g.stepTick(1);
  return f;
}

describe('openDesign', () => {
  it('refuses without a fab installed', () => {
    const g=freshStore();
    g.openDesign(g.active.id,'cool');
    expect(g.s.design).toBe(null);
  });

  it('refuses a slot type the installed fab tier does not support', () => {
    const g=freshStore();
    withBench(g); // slots: cool, psu only
    g.openDesign(g.active.id,'frame');
    expect(g.s.design).toBe(null);
  });

  it('opens with an empty pick set for a slot type the fab supports', () => {
    const g=freshStore();
    const f=withBench(g);
    g.openDesign(f.id,'cool');
    expect(g.s.design).toEqual({ fid:f.id, kind:'cool', picks:{} });
  });
});

describe('bumpDesignPick', () => {
  it('does nothing without an open design', () => {
    const g=freshStore();
    g.bumpDesignPick('fac',1);
    expect(g.s.design).toBe(null);
  });

  it('increases a pick, and decreasing never goes below zero', () => {
    const g=freshStore();
    const f=withBench(g);
    g.openDesign(f.id,'cool');
    g.bumpDesignPick('fac',1);
    expect(g.s.design.picks.fac).toBe(1);
    g.bumpDesignPick('fac',-5);
    expect(g.s.design.picks.fac).toBe(0);
  });

  it('refuses a bump that would exceed the fab\'s design budget', () => {
    const g=freshStore();
    const f=withBench(g); // budget 30, cool.fac costs 2 per triangular step
    g.openDesign(f.id,'cool');
    // fac alone: n=5 costs 2*5*6/2=30 (exactly the cap), n=6 costs 2*6*7/2=42 (over)
    for(let i=0;i<5;i++) g.bumpDesignPick('fac',1);
    expect(g.s.design.picks.fac).toBe(5);
    g.bumpDesignPick('fac',1);
    expect(g.s.design.picks.fac).toBe(5); // refused — stayed put
  });
});

describe('manufacturePart', () => {
  it('does nothing without an open design', () => {
    const g=freshStore();
    const cashBefore=g.s.cash;
    g.manufacturePart();
    expect(g.s.cash).toBe(cashBefore);
  });

  it('refuses when cash is short, leaving the design open to retry', () => {
    const g=freshStore();
    const f=withBench(g);
    g.s.cash=1; // withBench set 1,000,000 then spent 150,000 on the fab — force it back down
    g.openDesign(f.id,'cool');
    g.bumpDesignPick('fac',1);
    g.manufacturePart();
    expect(g.s.design).not.toBe(null); // still open — nothing was consumed
    expect(f.queue).toHaveLength(0);
  });

  it('spends cash, queues a real construction job, and clears the design', () => {
    const g=freshStore();
    const f=withBench(g);
    const cashBefore=g.s.cash;
    g.openDesign(f.id,'cool');
    g.bumpDesignPick('fac',1);
    g.manufacturePart();

    expect(g.s.design).toBe(null);
    expect(f.queue).toHaveLength(1);
    expect(f.queue[0].kind).toBe('mfg');
    expect(f.queue[0].part.kind).toBe('cool');
    expect(g.s.cash).toBeLessThan(cashBefore);
  });

  it('on completion, adds the part to s.customParts and makes it resolvable via g.PART, past the catalogue ceiling', () => {
    const g=freshStore();
    const f=withBench(g);
    g.openDesign(f.id,'cool');
    g.bumpDesignPick('fac',3); // push cooling factor past the catalogue's best (2.20)
    g.manufacturePart();
    const job=f.queue[0];

    job.left=0.0001;
    g.stepTick(1);

    expect(f.queue).toHaveLength(0);
    expect(g.s.customParts).toHaveLength(1);
    const part=g.s.customParts[0];
    expect(part.fac).toBeGreaterThan(2.20); // past the Immersion tank kit, the top catalogue cooler
    expect(g.PART(part.id)).toBe(part); // resolvable the same way any catalogue part is
  });

  it('refuses when the fab was upgraded away from supporting the drafted kind mid-design', () => {
    const g=freshStore();
    const f=withBench(g); // cool, psu only
    g.openDesign(f.id,'cool');
    g.bumpDesignPick('fac',1);
    f.fab=null; // simulate the fab having vanished from under the design
    const cashBefore=g.s.cash;
    g.manufacturePart();
    expect(g.s.cash).toBe(cashBefore);
    expect(f.queue).toHaveLength(0);
  });
});
