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

   Issue #18: `depth` was sized without accounting for how much a cheap
   coin's price amplifies its own sell volume — Tessera's revPerMh is
   calibrated to PAY*mult like every other chain, so coin volume scales as
   1/price, and Tessera's price (0.024) is ~100x cheaper than Ferro's. A
   single starter rig autoselling into depth:4200 saturated market impact
   to its 0.85 cap within a few sim-hours and pinned price at the global
   $0.02 floor indefinitely — permanently costing Tessera ~17% of its
   nominal rate, right when a new player is forming their model of how
   rates work. depth:4.0e5 puts Tessera in the same volume-to-depth regime
   as the other four chains (their impact-added-per-day is 50-800x lower
   at 4200), so its realized rate now actually reaches close to PAY*mult
   under ordinary play instead of permanently clamping short of it.

   mult dropped 1.25 -> 1.15 to match: the old 1.25 was deliberately tuned
   to land at the ladder's middle only AFTER losing ~17% to the clamp
   above — removing that loss without lowering mult would have pushed
   Tessera's realized rate past Ferro and Obelisk into 2nd place, which
   was never the intent (see the retune above this comment). Impact no
   longer saturates at depth:4.0e5, but it isn't zero either — driven by
   continuous drip-selling against `recover`'s daily decay, it settles
   into a slow multi-day cycle (measured: roughly 0 to ~0.12 and back),
   so revPerMh genuinely fluctuates around its target rather than sitting
   dead-still. 1.05 (PAY*mult=4.41, matching 1.25-with-the-old-clamp
   exactly) put that fluctuation's low point close enough to Nova's own
   (stable, unclamped) rate to occasionally dip below it — an unforced
   error the old permanently-pinned number never had a chance to make.
   1.15 (PAY*mult=4.83, level with Obelisk) keeps the same "ladder's
   middle, not literally best" intent while giving the low point of that
   cycle real clearance above Nova. */
/* `hue` is the chain's visual identity: an OKLCH hue angle, and ONLY the hue —
   lightness and chroma come from --chain-l/--chain-c in main.css, which the
   two themes set separately. Storing one number rather than a hex means the
   five chains stay at a constant perceived lightness against whichever card
   they sit on, instead of five hand-picked colours that each drift a different
   way when the theme flips.

   The five angles are not free choices. main.css already spends four hues on
   meaning — red 28 (bad), gold 78 (warning), green 162 (good), blue 250 (info)
   in the same OKLCH space — and a chain that lands on one of those reads as a
   status rather than a name, which is worse than no colour at all. Every hue
   below therefore sits at least 33° off all four (Halcyon/red is the tightest),
   and at least 35° off the other chains, which puts the closest pair
   (Nova/Obelisk) about 0.08 apart in OKLab in both themes — several times a
   just-noticeable difference. Chain marks are also
   rounded squares, not the circles .dot uses for status, so shape carries the
   distinction even where hue alone would be doing a lot of work.

   Where there was a choice left over, it went to the chain's character:
     tessera 200  teal — mosaic glass; the newcomer's refuge, small quick wins
     ferro   128  moss — the grounded workhorse
     halcyon 355  rose — pays most, violent price; the hot one, without being red
     nova    285  indigo — the blue chip: calm, deep, crowded
     obelisk 320  purple — monolithic, imperial, ten minutes a block */
export const CHAINS = [
  { id:'tessera', name:'Tessera', tick:'TSR', target:20, reward:16.30, price:0.024,
    mult:1.15, floor:350, vol:0.030, depth:4.0e5, recover:0.50, orphan:0.050, hue:200,
    blurb:'Twenty-second blocks and a tiny floor — constant small wins for one rig, worthless at scale.' },
  { id:'ferro', name:'Ferro', tick:'FRO', target:30, reward:2.124, price:4.12,
    mult:1.00, floor:6.0e3, vol:0.014, depth:15400, recover:0.40, orphan:0.045, hue:128,
    blurb:'Frequent small blocks, a deep enough book. The workhorse.' },
  { id:'halcyon', name:'Halcyon', tick:'HAL', target:90, reward:99.4, price:3.07,
    mult:1.55, floor:4.5e4, vol:0.060, depth:2130, recover:0.14, orphan:0.015, hue:355,
    blurb:'Pays 55% more per MH. Thin book and a violent price — small farms only.' },
  { id:'nova', name:'Nova', tick:'NVA', target:60, reward:71.12, price:11.81,
    mult:0.90, floor:3.2e5, vol:0.012, depth:26700, recover:0.55, orphan:0.020, hue:285,
    blurb:'Deep book, calm price, the lowest pay per MH. Safe at scale.' },
  { id:'obelisk', name:'Obelisk', tick:'OBL', target:600, reward:8144.8, price:9.06,
    mult:1.15, floor:2.2e6, vol:0.020, depth:66700, recover:0.50, orphan:0.002, hue:320,
    blurb:'Ten-minute blocks, enormous reward. Pays 15% more to carry the wait.' },
];

export const CHAIN_BASE = Object.fromEntries(CHAINS.map(c=>[c.id,c.price]));

/* Read the hue from HERE, not from g.chain(id).hue. A save is rehydrated with
   Object.assign(G.s, data.state), so s.chains is whatever the save file held —
   every world created before this field existed carries chain records without
   it, and a mark bound to the live state would render colourless for those
   players until they started a new game. The id -> hue map is static data and
   is always current. */
export const CHAIN_HUE = Object.fromEntries(CHAINS.map(c=>[c.id,c.hue]));
