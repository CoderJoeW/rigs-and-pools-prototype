import { describe, it, expect } from 'vitest';
import { sparkPath } from '../spark.js';

describe('sparkPath', () => {
  it('returns empty for fewer than 2 points', () => {
    expect(sparkPath([], 36, 32)).toBe('');
    expect(sparkPath([5], 36, 32)).toBe('');
    expect(sparkPath(undefined, 36, 32)).toBe('');
  });

  it('starts with M and continues with L, one command per point', () => {
    const d = sparkPath([1, 2, 3, 4], 36, 32);
    const commands = d.split(' ').filter(t => t === 'M' || t.startsWith('M') || t.startsWith('L'));
    expect(d.startsWith('M')).toBe(true);
    expect(d.match(/L/g)).toHaveLength(3);
  });

  it('maps the series min to the baseline and max to baseline-range', () => {
    const d = sparkPath([0, 10], 36, 32);
    // first point (the min) sits at y=baseline, last point (the max) at y=baseline-range
    expect(d).toBe('M0.0 36.0 L100.0 4.0');
  });

  it('a flat series (no range) still produces a finite path, not NaN', () => {
    const d = sparkPath([5, 5, 5], 36, 32);
    expect(d).not.toMatch(/NaN/);
  });

  it('loFloor clamps the low end below the data when given', () => {
    // all-positive data with loFloor=0: the baseline should represent 0, not the data's own min
    const withFloor = sparkPath([10, 20], 31, 28, 0);
    const withoutFloor = sparkPath([10, 20], 31, 28);
    expect(withFloor).not.toBe(withoutFloor);
    // "M0.0 <y0> L100.0 <y1>" — with a 0 floor, 10 is 1/2 of the way from 0
    // to 20, not at the very bottom of the range
    const yAt10 = parseFloat(withFloor.split(' ')[1]!);
    expect(yAt10).toBeCloseTo(31 - (10 / 20) * 28, 5);
  });

  it('loFloor never raises the low end above the data minimum', () => {
    // a floor ABOVE the data's own min (e.g. flooring at 5 when data goes to 0)
    // should not clip — Math.min(loFloor, ...data) keeps the true min
    const d = sparkPath([0, 20], 31, 28, 5);
    expect(d).toBe('M0.0 31.0 L100.0 3.0');
  });
});
