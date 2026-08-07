/* No algorithms and no hardware classes. Every chain is mined by graphics
   cards at full rate; chains differ by pay rate, block time, book depth, price
   volatility and floor — four axes without needing a fifth. */
/* Tessera's floor let a single starter rig (~192 MH/s on the default
   preset) sit below it indefinitely, so the "above the floor a chain
   dilutes" mechanic (§1) — the game's actual pressure toward diversifying —
   never engaged under passive play, and with zero simulated competition
   (§1: "Tessera has no simulated miners at all") a comfortable rate never
   had to compete for share either.

   First pass here (mult 1.00, floor 150) overcorrected: it dropped a
   starter rig's realized rate below every other chain, including Nova
   (mult 0.90, the chain deliberately designed to be the worst payer), and
   because the floor sat below even a single unbuilt rig's projected
   hashrate, the Build tab's ceiling warning fired before the player owned
   any hardware at all — the opposite of "starters below the floor are
   never nudged" (§10b). Also missed that Tessera's price sits close enough
   to the global price floor to clamp there under normal selling pressure
   (see thread filed as a separate issue), which costs it ~17% of nominal
   rate that no other chain pays — so matching another chain's *mult*
   doesn't match its *realized* rate.

   Retuned with both of those accounted for:
     mult   1.50 -> 1.25   accounts for the ~17% clamp loss so the REALIZED
                            rate lands above Ferro/Nova, not just the
                            nominal one — comparable to the ladder's middle,
                            not literally best (Halcyon, Obelisk) or worst.
     floor  500  -> 350    stays above a single starter rig, so the first
                            build gets a genuine below-floor period — the
                            OUTGROWN advisory only starts firing once a
                            farm has actually grown past what one rig
                            makes, not before it exists.
   reward recomputed to match the ladder's own calibration (every chain in
   this file satisfies revPerMh = PAY*mult at/below its floor — see
   dispatch.js's diffOf/revPerMh): PAY*mult*floor*target/(86400*price)
     = 4.20*1.25*350*20/(86400*0.024) ≈ 17.72 (was 30).

   This mult is chosen to land right once the clamp loss above is netted
   out, which means it's coupled to that separate bug: fixing the price
   floor (so Tessera's price can actually sit at its base 0.024 instead of
   clamping to the global 0.02) would push Tessera's realized rate back up
   to its full nominal ~5.25, past Ferro and Obelisk into 2nd place on the
   ladder — this mult would need revisiting alongside that fix, not after
   it lands unnoticed. */
export const CHAINS = [
  { id:'tessera', name:'Tessera', tick:'TSR', target:20, reward:17.72, price:0.024,
    mult:1.25, floor:350, vol:0.030, depth:4200, recover:0.50, orphan:0.050,
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
