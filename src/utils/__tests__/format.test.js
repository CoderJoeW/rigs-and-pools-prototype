import { describe, it, expect } from 'vitest';
import { fmt, partSub } from '../format.js';

describe('fmt.hash', () => {
  it('picks the unit by magnitude', () => {
    expect(fmt.hash(24)).toBe('24 MH/s');
    expect(fmt.hash(1500)).toBe('1.50 GH/s');
    expect(fmt.hash(2_500_000)).toBe('2.50 TH/s');
  });
});

describe('fmt.usd / fmt.usd2', () => {
  it('formats negatives with a leading minus before the sign', () => {
    expect(fmt.usd(-42.5)).toBe('-$42.50');
    expect(fmt.usd2(-3)).toBe('-$3.00');
  });
  it('drops cents past $10,000 but keeps them below it', () => {
    expect(fmt.usd(9999.4)).toBe('$9999.40');
    expect(fmt.usd(25000)).toBe('$25,000');
  });
  it('usd2 always keeps two decimal places', () => {
    expect(fmt.usd2(25000)).toBe('$25000.00');
  });
});

describe('fmt.c', () => {
  it('uses more precision for small coin amounts', () => {
    expect(fmt.c(0.5)).toBe('0.500');
    expect(fmt.c(150)).toBe('150.0');
  });
});

describe('fmt.pct', () => {
  it('defaults to one decimal place', () => {
    expect(fmt.pct(0.055)).toBe('5.5%');
  });
  it('accepts an explicit precision', () => {
    expect(fmt.pct(0.5, 0)).toBe('50%');
    expect(fmt.pct(0.02, 2)).toBe('2.00%');
  });
});

describe('fmt.w', () => {
  it('switches to kW above 1000W', () => {
    expect(fmt.w(850)).toBe('850 W');
    expect(fmt.w(1500)).toBe('1.50 kW');
  });
  it('picks the unit by magnitude but keeps the sign', () => {
    expect(fmt.w(-1500)).toBe('-1.50 kW');
  });
});

describe('fmt.day / fmt.clock / fmt.hm', () => {
  it('day 1 starts at t=0, not day 0', () => {
    expect(fmt.day(0)).toBe(1);
    expect(fmt.day(86400)).toBe(2);
  });
  it('clock wraps within a day as HH:MM', () => {
    expect(fmt.clock(0)).toBe('00:00');
    expect(fmt.clock(3661)).toBe('01:01');
    expect(fmt.clock(86400)).toBe('00:00'); // exactly one day wraps back to midnight
  });
  it('hm combines day and clock', () => {
    expect(fmt.hm(90000)).toBe('d2 01:00');
  });
});

describe('fmt.dur', () => {
  it('scales the unit with the magnitude', () => {
    expect(fmt.dur(45)).toBe('45 sec');
    expect(fmt.dur(90)).toBe('1 min 30 sec');
    expect(fmt.dur(120)).toBe('2 min');
    expect(fmt.dur(3600)).toBe('1.0 h');
    expect(fmt.dur(86400)).toBe('1.0 d');
  });
  it('never reports less than 1 second', () => {
    expect(fmt.dur(0.1)).toBe('1 sec');
  });
});

describe('fmt.eta', () => {
  it('reports never for non-finite or absurdly large durations', () => {
    expect(fmt.eta(Infinity)).toBe('never');
    expect(fmt.eta(1e6)).toBe('never');
  });
  it('scales the unit with the magnitude', () => {
    expect(fmt.eta(0.5)).toBe('12.0 h');
    expect(fmt.eta(50)).toBe('50.0 d');
    expect(fmt.eta(500)).toBe('500 d');
  });
});

describe('partSub', () => {
  it('describes each of the four hardware-slot kinds', () => {
    expect(partSub('frame', { slots: 6, air: 1.08 })).toBe('fits 6 · airflow 1.08');
    expect(partSub('mobo', { pcie: 6, w: 52 })).toBe('drives 6 · 52W idle');
    expect(partSub('cool', { fac: 1.22, w: 18 })).toBe('÷1.22 heat · 18W');
    expect(partSub('psu', { w: 650, conn: 3, eff: 0.85 })).toBe('650 W · 3 PCIe · 85%');
  });
});
