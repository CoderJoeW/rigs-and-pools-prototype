import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

describe('founding a pool', () => {
  it('requires the bond up front and refuses without enough cash', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const need = g.bondReq(tessera, 'PPS');
    expect(need).toBeGreaterThan(0);

    g.s.cash = need - 1;
    g.foundPool('tessera', 'PPS', 0.02);
    expect(g.s.pools.some(p => p.owner === 'you')).toBe(false);
  });

  it('deducts the bond and opens a live pool owned by you', () => {
    const g = freshStore();
    const cashBefore = g.s.cash;
    g.foundPool('tessera', 'PPLNS', 0.02);

    const pool = g.s.pools.find(p => p.owner === 'you');
    expect(pool).toBeTruthy();
    expect(pool.live).toBe(true);
    expect(pool.scheme).toBe('PPLNS');
    expect(pool.chain).toBe('tessera');
    expect(g.s.cash).toBeLessThan(cashBefore);
    expect(pool.bond).toBe(pool.bond0);
  });
});

describe('bond management', () => {
  it('addBond moves cash into the bond, capped at what you actually hold', () => {
    const g = freshStore();
    g.foundPool('tessera', 'PPLNS', 0.02);
    const pool = g.s.pools.find(p => p.owner === 'you');
    const bondBefore = pool.bond;
    const cashBefore = g.s.cash;

    g.addBond(pool, cashBefore + 1000); // ask for more than we have
    expect(pool.bond).toBeCloseTo(bondBefore + cashBefore, 5);
    expect(g.s.cash).toBe(0); // never overdrawn
  });

  it('releaseBond never drops the bond below its floor', () => {
    const g = freshStore();
    g.foundPool('tessera', 'PPS', 0.02);
    const pool = g.s.pools.find(p => p.owner === 'you');
    const floor = g.bondFloor(pool);

    g.releaseBond(pool, pool.bond); // try to pull it all out
    expect(pool.bond).toBeGreaterThanOrEqual(floor - 1e-6);
  });

  it('withdrawProfit only pays out bond above its opening size', () => {
    const g = freshStore();
    g.foundPool('tessera', 'PPLNS', 0.02);
    const pool = g.s.pools.find(p => p.owner === 'you');

    g.withdrawProfit(pool); // no profit yet
    expect(pool.bond).toBe(pool.bond0);

    pool.bond = pool.bond0 + 50; // simulate accrued fee income
    const cashBefore = g.s.cash;
    g.withdrawProfit(pool);
    expect(pool.bond).toBeCloseTo(pool.bond0, 5);
    expect(g.s.cash).toBeCloseTo(cashBefore + 50, 5);
  });
});

describe('closing a pool', () => {
  it('refunds the remaining bond and returns any of your groups pointed at it to solo', () => {
    const g = freshStore();
    g.foundPool('tessera', 'PPLNS', 0.02);
    const pool = g.s.pools.find(p => p.owner === 'you');
    g.setGroupPool(g.s.groups[0], pool.id);
    expect(g.s.groups[0].pool).toBe(pool.id);

    const cashBefore = g.s.cash;
    const refund = pool.bond;
    g.closePool(pool);

    expect(pool.live).toBe(false);
    expect(g.s.cash).toBeCloseTo(cashBefore + refund, 5);
    expect(g.s.groups[0].pool).toBe('solo');
  });
});

describe('a PPS pool\'s continuous liability', () => {
  it('a tiny tick still drains the bond by the expected-value owed to members', () => {
    const g = freshStore();
    g.foundPool('tessera', 'PPS', 0.02);
    const pool = g.s.pools.find(p => p.owner === 'you');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.setGroupPool(g.s.groups[0], pool.id);
    expect(g.poolHash(pool)).toBeGreaterThan(0);

    pool.bond = 100;
    // a dt far shorter than any block window, so this isolates the
    // continuous PPS liability from the (much larger, lucky) jackpot a
    // pool with 100% share of an uncontested chain would otherwise collect
    g.stepTick(0.01);

    expect(pool.bond).toBeLessThan(100);
    expect(pool.earned).toBeLessThan(0);
  });

  it('auto-closes once its bond drops to zero or below, forfeiting members back to solo', () => {
    const g = freshStore();
    g.foundPool('tessera', 'PPS', 0.02);
    const pool = g.s.pools.find(p => p.owner === 'you');
    g.setGroupPool(g.s.groups[0], pool.id);

    pool.bond = -1; // as if a dry spell or heavy underwriting had emptied it
    g.stepTick(0.01);

    expect(pool.live).toBe(false);
    expect(pool.bond).toBe(0);
    expect(g.s.groups[0].pool).toBe('solo');
  });
});
