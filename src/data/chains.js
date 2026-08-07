/* No algorithms and no hardware classes. Every chain is mined by graphics
   cards at full rate; chains differ by pay rate, block time, book depth, price
   volatility and floor — four axes without needing a fifth. */
/* Tessera's floor and mult were tuned so a single starter rig (~192 MH/s on
   the default preset) could sit below the floor indefinitely, at a rate
   above every other chain — with zero simulated competition (§1: "Tessera
   has no simulated miners at all"), that made it strictly dominant well
   past the first hour rather than just for it. Two changes, derived to keep
   the ladder's own invariant (constants.js: "revPerMh = PAY*mult" below the
   floor) intact rather than drifting out of sync with the rest of the file:
     mult   1.50 -> 1.00  — no longer literally the best-paying chain in the
                            game; matches Ferro, the workhorse baseline.
     floor  500  -> 150   — a single starter rig now sits ABOVE the floor
                            from its first build, not after days of idling,
                            so the "crossing the floor" moment (§1) and the
                            OUTGROWN advisory (chainCeiling/groupAdvice)
                            actually fire in the first session instead of
                            never firing at all for a passive player.
   reward recomputed to match: PAY*mult*floor*target/(86400*price)
     = 4.20*1.00*150*20/(86400*0.024) ≈ 6.08 (was 30, calibrated to the
   old floor*mult). */
export const CHAINS = [
  { id:'tessera', name:'Tessera', tick:'TSR', target:20, reward:6.08, price:0.024,
    mult:1.00, floor:150, vol:0.030, depth:4200, recover:0.50, orphan:0.050,
    blurb:'Twenty-second blocks and a tiny floor — constant small wins for one rig, worthless at scale.' },
  { id:'ferro', name:'Ferro', tick:'FRO', target:30, reward:2.124, price:4.12,
    mult:1.00, floor:6.0e3, vol:0.014, depth:15400, recover:0.40, orphan:0.045,
    blurb:'Frequent small blocks, a deep enough book. The workhorse.' },
  { id:'halcyon', name:'Halcyon', tick:'HAL', target:90, reward:99.4, price:3.07,
    mult:1.55, floor:4.5e4, vol:0.060, depth:2130, recover:0.14, orphan:0.015,
    blurb:'Pays 55% more per MH. Thin book and a violent price — small farms only.' },
  { id:'nova', name:'Nova', tick:'NVA', target:60, reward:71.12, price:11.81,
    mult:0.90, floor:3.2e5, vol:0.012, depth:26700, recover:0.55, orphan:0.020,
    blurb:'Deep book, calm price, the lowest pay per MH. Safe at scale.' },
  { id:'obelisk', name:'Obelisk', tick:'OBL', target:600, reward:8144.8, price:9.06,
    mult:1.15, floor:2.2e6, vol:0.020, depth:66700, recover:0.50, orphan:0.002,
    blurb:'Ten-minute blocks, enormous reward. Pays 15% more to carry the wait.' },
];

export const CHAIN_BASE = Object.fromEntries(CHAINS.map(c=>[c.id,c.price]));
