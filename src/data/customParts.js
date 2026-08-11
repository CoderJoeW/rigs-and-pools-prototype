import { FRAMES, MOBOS, COOLERS, PSUS, CARDS } from './hardware.js';

/* ---- fab-designed parts. Every catalogue ladder elsewhere in the game is
   strictly monotonic and capped — the whole point of a fab (data/fab.js) is
   a part that goes past that cap. A design starts from the TOP tier of its
   slot's catalogue and pushes one or two stats further, paid for out of the
   fab's `budget` (a per-design allowance, not a resource that depletes
   across designs — see fab.js's own comment) plus real cash and build time.

   Two axes per slot, never more: the tradeoff this is meant to create is
   "which stat, and how far" within ONE shared budget, and a longer axis
   list would mostly just mean spreading thinner rather than choosing. */
export const DESIGN_AXES = {
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

const CATALOGUE_OF = { frame:FRAMES, mobo:MOBOS, cool:COOLERS, psu:PSUS, unit:CARDS };
export const designBaseStats = kind => ({ ...CATALOGUE_OF[kind][CATALOGUE_OF[kind].length-1] });

/* Triangular: the Nth point on an axis costs budgetCost*N, so reaching N
   points costs budgetCost*N*(N+1)/2 — climbing any one axis alone gets
   steadily more expensive, which is what forces a real split across the
   two axes instead of dumping every point into whichever is cheaper. */
export const pointCost = (axis,n) => axis.budgetCost*n*(n+1)/2;

export function designTotals(kind, picks){
  const axes=DESIGN_AXES[kind];
  let budget=0, cash=0, points=0;
  for(const ax of axes){
    const n=Math.max(0, picks[ax.key]||0);
    budget+=pointCost(ax,n); cash+=ax.cashPerPt*n; points+=n;
  }
  return { budget, cash, points };
}

export function designStats(kind, picks){
  const axes=DESIGN_AXES[kind], base=designBaseStats(kind), out={ ...base };
  for(const ax of axes){
    const n=Math.max(0, picks[ax.key]||0);
    let v=base[ax.key]+ax.step*n;
    if(ax.key==='w') v=Math.max(1,v);          // a wattage/draw stat can't reach zero
    if(ax.key==='eff') v=Math.min(0.995,v);    // efficiency can approach but never reach 100%
    out[ax.key]=Math.round(v*1000)/1000;
  }
  return out;
}

/* buildCash is the one-off R&D bill, paid to queue the manufacturing job
   (same as any other site-part purchase). unitPrice is what the finished
   design costs each time it's actually used to build a rig, forever after —
   a modest, points-scaled premium over the catalogue's own top tier, so a
   custom part stays true to "more expensive is always better" rather than
   becoming free hashrate once the R&D is paid off. */
export function designCost(kind, picks){
  const { cash, points }=designTotals(kind, picks), base=designBaseStats(kind);
  return {
    buildCash: Math.round(base.price*0.6 + cash),
    hours: Math.round(30 + points*7),
    unitPrice: Math.round(base.price*(1.1 + 0.12*points)),
  };
}
