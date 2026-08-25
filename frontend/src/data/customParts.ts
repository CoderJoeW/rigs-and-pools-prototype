import { FRAMES, MOBOS, COOLERS, PSUS, CARDS, type Frame, type Mobo, type Cooler, type Psu, type Card } from './hardware.js';

// Fab-designed parts: push one or two stats past the catalogue's cap.
// Rationale: docs/economy.md#fab-designed-parts-srcdatacustompartsts

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

// liveTop must be the CURRENT top of the live catalogue for unit/psu designs
// (see docs/economy.md) — this module has no store access to ask for that itself.
export function designBaseStats(kind: DesignKind, liveTop?: DesignBase): Record<string, unknown> {
  return { ...(liveTop || STATIC_TOP[kind]) };
}

// Triangular cost curve — docs/economy.md#fab-designed-parts-srcdatacustompartsts
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

// buildCash vs unitPrice rationale — docs/economy.md#fab-designed-parts-srcdatacustompartsts
export function designCost(kind: DesignKind, picks: DesignPicks, liveTop?: DesignBase): { buildCash: number; hours: number; unitPrice: number } {
  const { cash, points } = designTotals(kind, picks);
  const base = designBaseStats(kind, liveTop) as { price: number };
  return {
    buildCash: Math.round(base.price * 0.6 + cash),
    hours: Math.round(30 + points * 7),
    unitPrice: Math.round(base.price * (1.1 + 0.12 * points)),
  };
}
