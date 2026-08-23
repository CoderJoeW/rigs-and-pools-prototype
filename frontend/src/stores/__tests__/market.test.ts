import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

describe('sell', () => {
  it('converts held coins to cash', () => {
    const g = freshStore();
    g.s.wallet.tessera = 100;
    const cashBefore = g.s.cash;

    g.sell('tessera', 0.5);

    expect(g.s.wallet.tessera).toBeCloseTo(50, 5);
    expect(g.s.cash).toBeGreaterThan(cashBefore);
  });

  it('never sells more than you hold', () => {
    const g = freshStore();
    g.s.wallet.tessera = 10;
    g.sell('tessera', 1);
    expect(g.s.wallet.tessera).toBeCloseTo(0, 5);
  });

  it('a bad amount never poisons the price', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    const refBefore = tessera.ref;
    g.s.wallet.tessera = NaN;
    g.sell('tessera', 1);
    g.s.wallet.tessera = -5;
    g.sell('tessera', 1);
    g.s.wallet.tessera = 0;
    g.sell('tessera', 1);
    expect(tessera.ref).toBe(refBefore);
    expect(tessera.impact).toBe(0);
  });

  it('selling into a thin book costs more slippage than a deep one', () => {
    const g = freshStore();
    const thin = g.s.chains.find(c => c.id === 'halcyon')!;  // depth 2470
    const deep = g.s.chains.find(c => c.id === 'obelisk')!;  // depth 222700
    g.s.wallet.halcyon = 500;
    g.s.wallet.obelisk = 500;

    g.sell('halcyon', 1);
    g.sell('obelisk', 1);

    expect(thin.impact).toBeGreaterThan(deep.impact);
  });
});

describe('buy', () => {
  it('spends cash and adds coins to the wallet', () => {
    const g = freshStore();
    const cashBefore = g.s.cash;
    g.buy('tessera', 0.5);
    expect(g.s.cash).toBeLessThan(cashBefore);
    expect(g.s.wallet.tessera).toBeGreaterThan(0);
  });

  it('buying 100% of cash spends exactly what you have, not a cent more', () => {
    const g = freshStore();
    g.s.cash = 500;
    g.buy('tessera', 1);
    expect(g.s.cash).toBeCloseTo(0, 5);
    expect(g.s.wallet.tessera).toBeGreaterThan(0);
  });

  it('never overdraws — a request for more than you have is clamped', () => {
    const g = freshStore();
    g.buy('tessera', 1000); // frac far past 100% of cash
    expect(g.s.cash).toBeCloseTo(0, 5);
  });

  it('a bad amount is a no-op', () => {
    const g = freshStore();
    const cashBefore = g.s.cash;
    g.buy('tessera', NaN);
    g.buy('tessera', -5);
    g.buy('tessera', 0);
    expect(g.s.cash).toBe(cashBefore);
    expect(g.s.wallet.tessera).toBe(0);
  });

  it('pushes the price up, the mirror of how selling pushes it down', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    const priceBefore = g.price(tessera);

    g.buy('tessera', 0.9);

    expect(tessera.impact).toBeLessThan(0);
    expect(g.price(tessera)).toBeGreaterThan(priceBefore);
  });

  it('a buying premium fades back toward fundamental over time, same as a discount', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    g.buy('tessera', 0.9);
    const impactAfterBuy = tessera.impact;
    expect(impactAfterBuy).toBeLessThan(0);

    for (let i = 0; i < 20; i++) g.stepTick(3600); // most of a day

    expect(tessera.impact).toBeGreaterThan(impactAfterBuy); // magnitude shrank back toward 0
  });

  it('buying then immediately selling loses money to slippage and fees', () => {
    const g = freshStore();
    g.s.cash = 100000; // enough that slippage on a single order is the dominant cost
    const cashBefore = g.s.cash;

    g.buy('tessera', 0.05);
    g.sell('tessera', 1);

    expect(g.s.cash).toBeLessThan(cashBefore);
  });
});
