import { FRAMES, MOBOS, COOLERS, PSUS, CARDS, type Frame, type Mobo, type Cooler, type Psu, type Card } from './hardware.js';

// ---- fab-designed parts. Every catalogue ladder elsewhere in the game is
// strictly monotonic and capped — the whole point of a fab (data/fab.ts) is
// a part that goes past that cap. A design starts from the TOP tier of its
// slot's catalogue and pushes one or two stats further, paid for out of the
// fab's `budget` (a per-design allowance, not a resource that depletes
// across designs — see fab.ts's own comment) plus real cash and build time.
//
// Two axes per slot, never more: the tradeoff this is meant to create is
// "which stat, and how far" within ONE shared budget, and a longer axis
// list would mostly just mean spreading thinner rather than choosing.

export type DesignKind = 'frame' | 'mobo' | 'cool' | 'psu' | 'unit';
export type DesignBase = Frame | Mobo | Cooler | Psu | Card;

export interface DesignAxis { key: string; label: string; step: number; budgetCost: number; cashPerPt: number }

export const DESIGN_AXES: Record<DesignKind, DesignAxis[]> = {
  frame: [
    { key:'slots', label:'Extra card slots', step:1,     budgetCost:3, cashPerPt:45 },
    { key:'air',   label:'Better airflow',   step:0.04,  budgetCost:2, cashPerPt:60 },
  ],
  mobo: [
    { key:'pcie',  label:'Extra PCIe lanes', step:1,     budgetCost:3, cashPerPt:70 },
    { key:'w',     label:'Lower idle draw',  step:-2,    budgetCost:2, cashPerPt:55 },
  ],
  cool: [
    { key:'fac',   label:'Cooling factor',   step:0.08,  budgetCost:2, cashPerPt:95 },
    { key:'w',     label:'Lower fan draw',   step:-2,    budgetCost:2, cashPerPt:40 },
  ],
  psu: [
    { key:'w',     label:'More wattage',     step:150,   budgetCost:2, cashPerPt:85 },
    { key:'eff',   label:'Efficiency',       step:0.003, budgetCost:3, cashPerPt:130 },
  ],
  unit: [
    { key:'mh',    label:'Hashrate',         step:4,     budgetCost:2, cashPerPt:95 },
    { key:'w',     label:'Lower draw',       step:-3,    budgetCost:2, cashPerPt:75 },
  ],
};
// Bounds the steppers in the UI; the budget check below almost always binds
// first, but this keeps a maxed-out foundry design finite either way.
export const MAX_AXIS_POINTS = 14;

const STATIC_TOP: Record<DesignKind, DesignBase> = {
  frame: FRAMES[FRAMES.length - 1]!,
  mobo: MOBOS[MOBOS.length - 1]!,
  cool: COOLERS[COOLERS.length - 1]!,
  psu: PSUS[PSUS.length - 1]!,
  unit: CARDS[CARDS.length - 1]!,
};

// unit and psu are the two ladders generations.ts keeps growing for as long
// as the game runs; frame/mobo/cool never do. A design's starting point for
// those two MUST be the CURRENT top of the live catalogue, not this file's
// static import — this module has no store access to ask for that, so
// every caller that designs a unit or psu has to pass `liveTop` in (the
// last element of g.cards() / g.livePsus). Skip that and a part designed
// early quietly falls behind the catalogue itself a few in-game weeks
// later: the opposite of "numbers nothing in any catalogue can match," the
// entire reason to pay for a fab. Frame/mobo/cool callers can omit it.
export function designBaseStats(kind: DesignKind, liveTop?: DesignBase): Record<string, unknown> {
  return { ...(liveTop || STATIC_TOP[kind]) };
}

// Triangular: the Nth point on an axis costs budgetCost*N, so reaching N
// points costs budgetCost*N*(N+1)/2 — climbing any one axis alone gets
// steadily more expensive, which is what forces a real split across the
// two axes instead of dumping every point into whichever is cheaper.
export const pointCost = (axis: DesignAxis, n: number): number => axis.budgetCost * n * (n + 1) / 2;

export type DesignPicks = Record<string, number>;

export function designTotals(kind: DesignKind, picks: DesignPicks): { budget: number; cash: number; points: number } {
  const axes = DESIGN_AXES[kind];
  let budget = 0, cash = 0, points = 0;
  for (const ax of axes) {
    const n = Math.max(0, picks[ax.key] || 0);
    budget += pointCost(ax, n); cash += ax.cashPerPt * n; points += n;
  }
  return { budget, cash, points };
}

export function designStats(kind: DesignKind, picks: DesignPicks, liveTop?: DesignBase): Record<string, unknown> {
  const axes = DESIGN_AXES[kind];
  const base = designBaseStats(kind, liveTop);
  const out: Record<string, unknown> = { ...base };
  for (const ax of axes) {
    const n = Math.max(0, picks[ax.key] || 0);
    let v = (base[ax.key] as number) + ax.step * n;
    if (ax.key === 'w') v = Math.max(1, v);          // a wattage/draw stat can't reach zero
    if (ax.key === 'eff') v = Math.min(0.995, v);    // efficiency can approach but never reach 100%
    out[ax.key] = Math.round(v * 1000) / 1000;
  }
  return out;
}

// buildCash is the one-off R&D bill, paid to queue the manufacturing job
// (same as any other site-part purchase). unitPrice is what the finished
// design costs each time it's actually used to build a rig, forever after —
// a modest, points-scaled premium over the catalogue's own top tier, so a
// custom part stays true to "more expensive is always better" rather than
// becoming free hashrate once the R&D is paid off.
export function designCost(kind: DesignKind, picks: DesignPicks, liveTop?: DesignBase): { buildCash: number; hours: number; unitPrice: number } {
  const { cash, points } = designTotals(kind, picks);
  const base = designBaseStats(kind, liveTop) as { price: number };
  return {
    buildCash: Math.round(base.price * 0.6 + cash),
    hours: Math.round(30 + points * 7),
    unitPrice: Math.round(base.price * (1.1 + 0.12 * points)),
  };
}
