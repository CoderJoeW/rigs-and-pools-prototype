import type { Frame, Mobo, Cooler, Psu } from '../data/hardware.js';

type FrameSub = Pick<Frame, 'slots' | 'air'>;
type MoboSub = Pick<Mobo, 'pcie' | 'w'>;
type CoolerSub = Pick<Cooler, 'fac' | 'w'>;
type PsuSub = Pick<Psu, 'w' | 'conn' | 'eff'>;

// The one-line "what does this part do" description shown on the Build tab,
// a rig's retrofit sheet, and that sheet's part picker — same four slot
// kinds, same wording, wherever a frame/board/cooler/supply is offered.
export function partSub(slot: 'frame', p: FrameSub): string;
export function partSub(slot: 'mobo', p: MoboSub): string;
export function partSub(slot: 'cool', p: CoolerSub): string;
export function partSub(slot: 'psu', p: PsuSub): string;
export function partSub(slot: string, p: FrameSub | MoboSub | CoolerSub | PsuSub): string | undefined {
  switch (slot) {
    case 'frame': { const f = p as FrameSub; return 'fits ' + f.slots + ' · airflow ' + f.air.toFixed(2); }
    case 'mobo':  { const m = p as MoboSub;  return 'drives ' + m.pcie + ' · ' + m.w + 'W idle'; }
    case 'cool':  { const c = p as CoolerSub; return '÷' + c.fac.toFixed(2) + ' heat · ' + c.w + 'W'; }
    case 'psu':   { const s = p as PsuSub; return fmt.w(s.w) + ' · ' + s.conn + ' PCIe · ' + (s.eff * 100).toFixed(0) + '%'; }
  }
}

export const fmt = {
  // For counters/totals that should always hold a real number by render
  // time (issue #5's root cause: `X||0` on a NaN state field silently
  // rendered a plausible-looking 0 instead of surfacing the bug). Use this
  // instead of `||0` wherever the field being missing/NaN is corruption,
  // not a legitimate "not set yet" state — a genuine "not yet" case should
  // keep its own explicit default rather than this sentinel (issue #14).
  n(x: number): number | string {
    return Number.isFinite(x) ? x : '—';
  },
  hash(mh: number): string {
    return mh >= 1e6 ? (mh / 1e6).toFixed(2) + ' TH/s'
      : mh >= 1000 ? (mh / 1000).toFixed(2) + ' GH/s'
      : mh.toFixed(0) + ' MH/s';
  },
  usd(n: number): string {
    const a = Math.abs(n);
    return (n < 0 ? '-$' : '$') + (a >= 10000 ? a.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a.toFixed(2));
  },
  usd2(n: number): string {
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  },
  c(n: number): string {
    return n >= 100 ? n.toFixed(1) : n.toFixed(3);
  },
  pct(n: number, d = 1): string {
    return (n * 100).toFixed(d) + '%';
  },
  w(x: number): string {
    return Math.abs(x) >= 1000 ? (x / 1000).toFixed(2) + ' kW' : x.toFixed(0) + ' W';
  },
  day(t: number): number {
    return Math.floor(t / 86400) + 1;
  },
  clock(t: number): string {
    const h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  },
  hm(t: number): string {
    return 'd' + (Math.floor(t / 86400) + 1) + ' ' + fmt.clock(t);
  },
  dur(s: number): string {
    if (s < 60) return Math.max(1, Math.round(s)) + ' sec';
    if (s < 3600) {
      const m = Math.floor(s / 60), x = Math.round(s % 60);
      return m + ' min' + (x ? ' ' + x + ' sec' : '');
    }
    const d = s / 86400;
    return d >= 1 ? d.toFixed(1) + ' d' : (s / 3600).toFixed(1) + ' h';
  },
  eta(d: number): string {
    if (!isFinite(d) || d > 9e4) return 'never';
    return d < 1 ? (d * 24).toFixed(1) + ' h' : d < 200 ? d.toFixed(1) + ' d' : Math.round(d) + ' d';
  },
};
