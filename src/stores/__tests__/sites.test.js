import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';
import { fmt } from '../../utils/format.js';

describe('newSite', () => {
  it('refuses when cash is short', () => {
    const g = freshStore();
    g.newSite('shed'); // $700, more than the starting $500
    expect(g.s.sites).toHaveLength(1);
  });

  it('breaks ground as a bedroom-sized shell with the real shell queued', () => {
    const g = freshStore();
    g.s.cash = 5000;
    g.newSite('shed');

    expect(g.s.sites).toHaveLength(2);
    const site = g.s.sites[g.s.sites.length - 1];
    expect(site.shell).toBe('bedroom'); // starts small...
    expect(site.queue).toHaveLength(1);
    expect(site.queue[0].kind).toBe('shell');
    expect(site.queue[0].p).toBe('shed');
    expect(g.s.activeSite).toBe(site.id); // and becomes the active site

    // ...and becomes the real shell once construction finishes
    for (let i = 0; i < 20; i++) g.stepTick(3600);
    expect(site.shell).toBe('shed');
    expect(site.queue).toHaveLength(0);
  });
});

describe('addSitePart', () => {
  it('queues a paid source and installs it once its hours are up', () => {
    const g = freshStore();
    g.s.cash = 1000;
    const f = g.active;
    const cashBefore = g.s.cash;

    g.addSitePart(f.id, 's-30', 'source'); // 30A service: $120, 10 hours

    expect(g.s.cash).toBeCloseTo(cashBefore - 120, 5);
    expect(f.queue).toHaveLength(1);
    expect(f.sources.some(x => x.p === 's-30')).toBe(false);

    for (let i = 0; i < 20; i++) g.stepTick(3600);
    expect(f.sources.some(x => x.p === 's-30')).toBe(true);
    expect(f.queue).toHaveLength(0);
  });

  it('refuses when the site or part is unknown, or cash is short', () => {
    const g = freshStore();
    const f = g.active;
    g.addSitePart(999999, 's-30', 'source'); // no such site
    g.addSitePart(f.id, 'not-a-real-part', 'source'); // no such part
    g.s.cash = 0;
    g.addSitePart(f.id, 's-30', 'source'); // can't afford it
    expect(f.queue).toHaveLength(0);
  });
});

describe('rush', () => {
  it('charges to collapse the remaining build time to (near) zero', () => {
    const g = freshStore();
    g.s.cash = 1000;
    const f = g.active;
    g.addSitePart(f.id, 's-30', 'source');
    const job = f.queue[0];
    const cost = g.rushCost(job);
    expect(cost).toBeGreaterThan(0);

    const cashBefore = g.s.cash;
    g.rush(f.id, 0);
    expect(g.s.cash).toBeCloseTo(cashBefore - cost, 5);
    expect(job.left).toBeLessThan(0.001);

    g.stepTick(1); // now finishes almost immediately
    expect(f.sources.some(x => x.p === 's-30')).toBe(true);
  });

  it('does nothing when cash cannot cover the rush', () => {
    const g = freshStore();
    g.s.cash = 1000;
    const f = g.active;
    g.addSitePart(f.id, 's-30', 'source');
    const job = f.queue[0];
    const leftBefore = job.left;
    g.s.cash = 0;
    g.rush(f.id, 0);
    expect(job.left).toBe(leftBefore);
  });

  it('two same-part rushes at different costs collapse into one line with the correct summed total (issue #16)', () => {
    // say() now carries a real signed USD number alongside the display
    // string (issue #16), so a repeat can be collapsed into the feed's
    // usual "xN" line without losing what was actually spent — unlike
    // before, when a fixed-string amount had no numeric twin and merging
    // would have meant silently dropping one of the two costs. rushCost
    // depends on remaining hours, so two jobs of the same part queued at
    // different times cost differently — the collapsed total must be
    // their real sum, not either one alone.
    const g = freshStore();
    g.s.cash = 2000;
    const f = g.active;
    g.addSitePart(f.id, 's-30', 'source'); // job A: left = 10h
    g.stepTick(3600); // job A now has ~9h left
    g.addSitePart(f.id, 's-30', 'source'); // job B: left = 10h, fresh

    const costA = g.rushCost(f.queue[0]);
    const costB = g.rushCost(f.queue[1]);
    expect(costA).not.toBe(costB); // same part, genuinely different costs

    g.rush(f.id, 0);
    g.rush(f.id, 1);

    const rushLines = g.s.feed.filter(e => e.text === 'Paid to rush 30A service');
    expect(rushLines).toHaveLength(1);
    expect(rushLines[0].n).toBe(2);
    expect(rushLines[0].amount).toBe('-'+fmt.usd(costA+costB));
  });
});

describe('upgradeShell', () => {
  it('grows the current site in place and credits half the old shell\'s price', () => {
    const g = freshStore();
    g.s.cash = 20000;
    const f = g.active; // bedroom, price 0
    g.upgradeShell(f.id, 'garage'); // $9000, no credit since bedroom cost $0

    expect(f.queue).toHaveLength(1);
    expect(g.s.cash).toBeCloseTo(20000 - 9000, 5);

    for (let i = 0; i < 70; i++) g.stepTick(3600); // garage takes 60 hours
    expect(f.shell).toBe('garage');
  });

  it('refuses a shell that is not strictly bigger', () => {
    const g = freshStore();
    g.s.cash = 20000;
    const f = g.active;
    g.upgradeShell(f.id, 'bedroom'); // same size as what's already there
    expect(f.queue).toHaveLength(0);
  });

  it('only allows one shell job in the queue at a time', () => {
    const g = freshStore();
    g.s.cash = 100000;
    const f = g.active;
    g.upgradeShell(f.id, 'garage');
    expect(f.queue).toHaveLength(1);
    g.upgradeShell(f.id, 'unit');
    expect(f.queue).toHaveLength(1); // second request rejected
  });
});

describe('renameSite', () => {
  it('trims and truncates the name', () => {
    const g = freshStore();
    const f = g.active;
    g.renameSite(f.id, '  My Farm  ');
    expect(f.name).toBe('My Farm');
    g.renameSite(f.id, 'x'.repeat(40));
    expect(f.name).toHaveLength(24);
  });

  it('ignores a blank name', () => {
    const g = freshStore();
    const f = g.active;
    const before = f.name;
    g.renameSite(f.id, '   ');
    expect(f.name).toBe(before);
  });
});

describe('decommissionSite', () => {
  it('refuses to remove your only site', () => {
    const g = freshStore();
    const f = g.active;
    g.decommissionSite(f.id);
    expect(g.s.sites).toHaveLength(1);
  });

  it('refuses while rigs are stationed there or construction is running', () => {
    const g = freshStore();
    g.s.cash = 5000;
    g.newSite('shed');
    const second = g.s.sites[1];
    // construction still queued on the new site
    g.decommissionSite(second.id);
    expect(g.s.sites).toHaveLength(2);
  });

  it('refunds half the value of its infrastructure and falls back to the remaining site', () => {
    const g = freshStore();
    g.s.cash = 5000;
    g.newSite('shed');
    const second = g.s.sites[1];
    for (let i = 0; i < 20; i++) g.stepTick(3600); // finish construction
    expect(second.queue).toHaveLength(0);

    const cashBefore = g.s.cash;
    g.decommissionSite(second.id);

    expect(g.s.sites).toHaveLength(1);
    expect(g.s.cash).toBeGreaterThan(cashBefore);
    expect(g.s.activeSite).toBe(g.s.sites[0].id);
  });
});
