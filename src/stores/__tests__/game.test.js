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
