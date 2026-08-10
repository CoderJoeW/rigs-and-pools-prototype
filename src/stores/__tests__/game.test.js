import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

describe('game store boot', () => {
  it('starts with the opening cash, one site, and no rigs', () => {
    const g = freshStore();
    expect(g.s.cash).toBe(500);
    expect(g.totalHash).toBe(0);
    expect(g.s.rigs).toHaveLength(0);
    expect(g.s.sites).toHaveLength(1);
    expect(g.s.sites[0].shell).toBe('bedroom');
    expect(g.s.groups).toHaveLength(1);
    expect(g.s.groups[0].chain).toBe('tessera');
  });

  it('lands a new player on Farm, not straight into the Build picker', () => {
    const g = freshStore();
    expect(g.s.tab).toBe('farm');
  });

  it('seeds a rival pool field on every simulated chain', () => {
    const g = freshStore();
    for (const cid of ['ferro', 'halcyon', 'nova', 'obelisk']) {
      const onChain = g.s.pools.filter(p => p.chain === cid && p.owner === 'rival');
      expect(onChain.length).toBeGreaterThan(0);
    }
    // Tessera stays a newcomer refuge with no simulated competition
    expect(g.s.pools.some(p => p.chain === 'tessera')).toBe(false);
  });

  it('advances state on repeated ticks without throwing', () => {
    const g = freshStore();
    const t0 = g.s.t;
    for (let i = 0; i < 50; i++) g.stepTick();
    expect(g.s.t).toBeGreaterThan(t0);
    expect(Number.isFinite(g.s.cash)).toBe(true);
  });

  /* Issue #40: the rank ladder moves 5-6 times in a whole run, so the toast it
     raises has to actually survive to the screen. It very nearly did not:
     pop() drops even always:true toasts within 900ms of the last one and
     G.s.toast is a single slot, so the 'Milestone' toast fired microseconds
     earlier ate the rank-up. These two pin the resolution — rank-up wins its
     own tick, an ordinary milestone is untouched. */
  it('a rank-up raises its own toast instead of the milestone that triggered it', () => {
    const g = freshStore();
    // three placeholders so the first real milestone is the 4th — Tinkerer
    g.s.mile = { done: { seedA: 1, seedB: 1, seedC: 1 }, rank: 0 };
    g.s.blocksSolved = 1; // satisfies the real 'First block' check
    g.stepTick();
    expect(g.s.mile.rank).toBe(1);
    expect(g.s.toast.cls).toBe('rankup');
    expect(g.s.toast.amount).toBe('Tinkerer'); // the rank name is the headline
    // the feed still records both the milestone and the rank-up
    const feed = g.s.feed.map(f => f.text);
    expect(feed.some(t => t.includes('Rank up — you are now a Tinkerer'))).toBe(true);
    expect(feed.some(t => t.startsWith('Milestone — '))).toBe(true);
  });

  it('an ordinary milestone with no rank change still raises the plain toast', () => {
    const g = freshStore();
    g.s.mile = { done: { a: 1, b: 1, c: 1, d: 1 }, rank: 1 }; // already Tinkerer
    g.s.blocksSolved = 1;
    g.stepTick();
    expect(g.s.mile.rank).toBe(1);
    expect(g.s.toast.cls).toBe('grn');
    expect(g.s.toast.text).toBe('Milestone');
  });

  it('a long run under high speed stays numerically sane', () => {
    const g = freshStore();
    g.s.speed = 3600;
    for (let i = 0; i < 200; i++) g.stepTick();
    expect(Number.isFinite(g.s.t)).toBe(true);
    expect(Number.isFinite(g.s.cash)).toBe(true);
    for (const c of g.s.chains) {
      expect(Number.isFinite(c.ref)).toBe(true);
      expect(c.ref).toBeGreaterThan(0);
    }
  });
});
