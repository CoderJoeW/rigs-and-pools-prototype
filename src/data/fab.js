/* ---- the fabrication bay. A late-game, one-per-site investment that
   unlocks manufacturing custom parts on-site — see game/fab.js for the
   design-and-build mechanic itself. Priced and timed well above the top
   SHELLS tier (site-parts.js): this is meant to read as the single
   biggest bet in the game, not another incremental site upgrade.

   Each tier gates which slot types you can design for (frame/mobo/cool/
   psu/unit, same vocabulary Build's FIELDS uses) and sets `budget` — the
   tuning-point pool a custom part's design spends from. Slots widen and
   budget grows together up the ladder, same shape as every other tiered
   catalogue here: paying more always buys strictly more. */
export const FABS = [
  { id:'fab-bench',   name:'Bench fab',       tier:1, budget:30,
    slots:['cool','psu'],                        price:150000,  hours:400 },
  { id:'fab-clean',   name:'Cleanroom fab',   tier:2, budget:70,
    slots:['cool','psu','frame','mobo'],          price:500000,  hours:800 },
  { id:'fab-foundry', name:'Silicon foundry', tier:3, budget:150,
    slots:['cool','psu','frame','mobo','unit'],   price:1500000, hours:1400 },
];
export const FAB_MAP = new Map(FABS.map(p=>[p.id,p]));
export const FAB = id => FAB_MAP.get(id);
