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

  // a fab job's `p` is a FAB id, not a SITEPART one — rush's feed message
  // used to look it up in SITEPART regardless of kind, which throws for a fab job
  it('rushes a queued fab job without throwing, naming it off the fab catalogue', () => {
    const g = freshStore();
    g.s.cash = 1000000;
    const f = g.active;
    g.chooseFab(f.id, 'fab-bench');
    const job = f.queue[0];
    const cost = g.rushCost(job);
    const cashBefore = g.s.cash;

    expect(() => g.rush(f.id, 0)).not.toThrow();
    expect(job.left).toBeLessThan(0.001);
    expect(g.s.cash).toBeCloseTo(cashBefore - cost, 5);

    g.stepTick(1);
    expect(f.fab).toBe('fab-bench');
    expect(g.s.feed.some(e => e.text === 'Paid to rush Bench fab')).toBe(true);
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

describe('chooseFab', () => {
  it('installs the first tier from nothing, at full price, and sets f.fab once construction finishes', () => {
    const g = freshStore();
    g.s.cash = 1000000;
    const f = g.active;
    expect(f.fab).toBe(null);
    const cashBefore = g.s.cash;

    g.chooseFab(f.id, 'fab-bench'); // $150,000, 400h, no prior tier to credit

    expect(g.s.cash).toBeCloseTo(cashBefore - 150000, 5);
    expect(f.queue).toHaveLength(1);
    expect(f.queue[0].kind).toBe('fab');
    expect(f.queue[0].p).toBe('fab-bench');
    expect(f.fab).toBe(null); // not installed yet — still under construction

    // Looping stepTick to reach 400h is what upgradeShell's test does for
    // its 60h shell, but stepTick does full simulation work every call
    // regardless of dt — and, counter-intuitively, a BIGGER dt per call
    // costs MORE, not less (measured: ~140ms/call at 10h steps vs ~25ms/
    // call at 1h steps), so a fab's order-of-magnitude-longer build time
    // makes either approach slow. rush()'s own technique — collapse `left`
    // directly, since it's a plain linear countdown with no other state
    // tied to how it got there — reaches the same finished state instantly.
    f.queue[0].left = 0.0001;
    g.stepTick(1);
    expect(f.fab).toBe('fab-bench');
    expect(f.queue).toHaveLength(0);
  });

  it('refuses when cash is short', () => {
    const g = freshStore();
    const f = g.active;
    g.chooseFab(f.id, 'fab-bench'); // $150,000, far more than the starting $500
    expect(f.queue).toHaveLength(0);
    expect(f.fab).toBe(null);
  });

  it('upgrading credits half the current tier\'s price toward the next one', () => {
    const g = freshStore();
    g.s.cash = 1000000;
    const f = g.active;
    g.chooseFab(f.id, 'fab-bench');
    f.queue[0].left = 0.0001;
    g.stepTick(1);
    expect(f.fab).toBe('fab-bench');

    const cashBefore = g.s.cash;
    g.chooseFab(f.id, 'fab-clean'); // $500,000, credit = 150,000*0.5 = 75,000
    expect(g.s.cash).toBeCloseTo(cashBefore - (500000 - 75000), 5);

    f.queue[0].left = 0.0001;
    g.stepTick(1);
    expect(f.fab).toBe('fab-clean');
  });

  it('refuses a tier that is not strictly higher than the one already installed', () => {
    const g = freshStore();
    g.s.cash = 1000000;
    const f = g.active;
    g.chooseFab(f.id, 'fab-bench');
    f.queue[0].left = 0.0001;
    g.stepTick(1);
    g.chooseFab(f.id, 'fab-bench'); // same tier again
    expect(f.queue).toHaveLength(0);
  });

  it('only allows one fab job in the queue at a time', () => {
    const g = freshStore();
    g.s.cash = 1000000;
    const f = g.active;
    g.chooseFab(f.id, 'fab-bench');
    expect(f.queue).toHaveLength(1);
    g.chooseFab(f.id, 'fab-clean'); // a second request while the first is still building
    expect(f.queue).toHaveLength(1);
  });

  it('is included in a decommissioned site\'s refund', () => {
    const g = freshStore();
    g.s.cash = 1000000;
    g.newSite('shed');
    const second = g.s.sites[1];
    for (let i = 0; i < 20; i++) g.stepTick(3600); // finish the shell
    second.fab = 'fab-bench'; // install directly — the refund math doesn't care how it got there

    const withoutFab = Math.round(0.5 * g.SITEPART(second.shell).price);
    const cashBefore = g.s.cash;
    g.decommissionSite(second.id);
    const refund = g.s.cash - cashBefore;
    expect(refund).toBeGreaterThan(withoutFab); // fab's value was folded in too
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
