import { describe, it, expect } from 'vitest';
import { gauss, wearRate } from '../random.js';

describe('gauss', () => {
  it('produces finite values roughly centered on 0 over many draws', () => {
    let sum = 0, n = 2000;
    for (let i = 0; i < n; i++) {
      const v = gauss();
      expect(Number.isFinite(v)).toBe(true);
      sum += v;
    }
    // standard normal mean is 0; over 2000 draws this should land well within +-0.2
    expect(Math.abs(sum / n)).toBeLessThan(0.2);
  });
});

describe('wearRate', () => {
  it('stays within its documented 0.75-1.25 range', () => {
    for (let i = 0; i < 500; i++) {
      const r = wearRate();
      expect(r).toBeGreaterThanOrEqual(0.75);
      expect(r).toBeLessThan(1.25);
    }
  });
});
