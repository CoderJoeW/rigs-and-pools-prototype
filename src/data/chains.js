/* No algorithms and no hardware classes. Every chain is mined by graphics
   cards at full rate; chains differ by pay rate, block time, book depth, price
   volatility and floor — four axes without needing a fifth. */
/* Tessera is the newcomer refuge: short blocks, floor above a single starter
   rig so the first build gets a genuine below-floor period.

   Block timing (unchanged): target:20 means the network mean block interval
   is exactly 20 s once hashrate is at the floor (diffOf = max(floor,obs)*target;
   T = diff/net * (K+1)/K so mean = target). Below the floor net < floor, so
   the same formula makes every block take longer — the "before 100% floor
   it should take longer" behaviour is structural, not a special case.

   2026-08-20: block value cut to $3 (reward * price = 3), from $20.
     reward  125      (3 / 0.024)
     mult    8.82     so revPerMh = PAY*mult still holds at floor
                      (4.20 * 8.82 ≈ 37.0 $/MH/day at floor)
   Floor 350 stays above one starter (~192 MH) and is crossed by a second
   rig's worth. depth 1.2e7 (scaled down with the lower emission, same
   ratio as reward) so a solo starter does not pin price at the global
   $0.02 floor. */
/* 2026-08-21: the ladder above Tessera rebalanced so graduating chains is
   unambiguously "up" on every axis, not just book depth.

   Before: mult ran 1.00 (Ferro) -> 1.55 (Halcyon) -> 0.90 (Nova) -> 1.15
   (Obelisk) — Nova paid LESS per MH than the chain below it despite needing
   7x the floor to compete on, so the chain a farm graduated onto next could
   feel like a pay cut. Floor also only stepped ~7x a rung, which reads as
   "a bit more" rather than "a different league" once a farm is already
   sized for the chain below.

   After: mult climbs every rung — Ferro 1.00 (the PAY reference) < Halcyon
   1.35 < Nova 1.75 < Obelisk 2.20 — so revPerMh at the floor, and the full
   block's $ value, both increase monotonically all the way up (Tessera
   stays outside this ladder on purpose: it is the newcomer's easy chain,
   priced to be "worthless at scale" per its blurb, not a rung to graduate
   through). Floor now steps 10x into Halcyon and 8x a rung above that
   (6,000 -> 60,000 -> 480,000 -> 3,840,000) instead of a flat ~7x, so a
   farm sized for one rung is a rounding error on the next until it has
   genuinely grown into it. Steeper than 8x starts pricing Halcyon and Nova
   out of the simulated population itself — sims.js seats each chain's
   independent miners by floor SHARE of the four-chain total
   (SIM_CHAINS: Ferro/Halcyon/Nova/Obelisk), so pushing Obelisk's floor up
   without bound starves the smaller chains of seats until each remaining
   one has to carry an unrealistic multiple of a single newcomer's hashrate
   (see stores/__tests__/simGrowth.test.js, "seats the chains by floor
   weight" — the actual ceiling this ladder is tuned against). Nova's block
   target also moved 60s -> 150s so block CADENCE climbs the ladder too
   (20 < 30 < 90 < 150 < 600) instead of dipping between Halcyon and
   Obelisk.

   reward is solved from the target mult so revPerMh = PAY*mult still holds
   exactly at the floor: reward = mult*PAY*floor*target/(86400*price).
   depth is carried by the same ratio as the chain's DAILY coin emission
   (86400/target*reward) moved, old to new — same method the Tessera cut
   above used — so a chain's slippage-per-dollar-mined is unchanged and
   only the absolute numbers grew with everything else:
     Halcyon  x1.161  (target unchanged, so this is just the reward ratio)
     Nova     x2.917  (reward x7.29, target x2.5 -> emission ratio x2.917)
     Obelisk  x3.339  (target unchanged, so this is just the reward ratio)

     Halcyon: reward 99.4->115.44, block $305->$354 (+35% per MH, "the hot
       one" still runs the thinnest book and the most violent price)
     Nova:    reward 71.12->518.66, block $840->$6,126 (+75% per MH; no
       longer the ladder's worst-paying chain, still the calmest price)
     Obelisk: reward 8144.8->27192, block $73,792->$246,360 (+120% per MH;
       now unambiguously the biggest prize on the network, not just the
       longest wait for one) */
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
     halcyon 355  rose — thin book, violent price; the hot one, without being red
     nova    285  indigo — the blue chip: calm, deep, crowded
     obelisk 320  purple — monolithic, imperial, ten minutes a block, pays the most of any real chain */
export const CHAINS = [
  { id:'tessera', name:'Tessera', tick:'TSR', target:20, reward:125, price:0.024,
    mult:8.82, floor:350, vol:0.030, depth:1.2e7, recover:0.50, orphan:0.050, hue:200,
    blurb:'Twenty-second blocks and a $3 prize — constant wins for one rig, worthless at scale.' },
  { id:'ferro', name:'Ferro', tick:'FRO', target:30, reward:2.124, price:4.12,
    mult:1.00, floor:6.0e3, vol:0.014, depth:15400, recover:0.40, orphan:0.045, hue:128,
    blurb:'Frequent small blocks, a deep enough book. The workhorse — and the floor the ladder is priced against.' },
  { id:'halcyon', name:'Halcyon', tick:'HAL', target:90, reward:115.44, price:3.07,
    mult:1.35, floor:6.0e4, vol:0.060, depth:2470, recover:0.14, orphan:0.015, hue:355,
    blurb:'Pays 35% more per MH than Ferro, at 10x its floor. Thin book and a violent price — small farms only.' },
  { id:'nova', name:'Nova', tick:'NVA', target:150, reward:518.66, price:11.81,
    mult:1.75, floor:4.8e5, vol:0.012, depth:77900, recover:0.55, orphan:0.020, hue:285,
    blurb:'Deep book, calm price, pays 75% more per MH than Ferro at 8x Halcyon\'s floor.' },
  { id:'obelisk', name:'Obelisk', tick:'OBL', target:600, reward:27192, price:9.06,
    mult:2.20, floor:3.84e6, vol:0.020, depth:222700, recover:0.50, orphan:0.002, hue:320,
    blurb:'Ten-minute blocks, the biggest prize on the network — more than double Ferro\'s rate per MH, for 8x Nova\'s floor.' },
];

export const CHAIN_BASE = Object.fromEntries(CHAINS.map(c=>[c.id,c.price]));

/* Read the hue from HERE, not from g.chain(id).hue. A save is rehydrated with
   Object.assign(G.s, data.state), so s.chains is whatever the save file held —
   every world created before this field existed carries chain records without
   it, and a mark bound to the live state would render colourless for those
   players until they started a new game. The id -> hue map is static data and
   is always current. */
export const CHAIN_HUE = Object.fromEntries(CHAINS.map(c=>[c.id,c.hue]));

/* Anchor decay: fundOf's ratio term is chainHash/floor/anchor, so shrinking
   `anchor` over game-time raises the fundamental price even at flat
   hashrate — a slow structural drift layered under the hashrate-driven and
   buy/sell-driven moves tick.js already models. `half` is the game-days
   half-life of the relaxation; `floor` is where anchor asymptotes, as a
   fraction of its start-of-save value (installTick lazily captures that as
   c.anchor0). Ordered to match each chain's blurb: Tessera, the newcomer
   refuge, matures fastest and furthest; Nova, the calm blue chip, barely
   moves. */
export const ANCHOR_DECAY = {
  tessera: { half:10, floor:0.15 },
  halcyon: { half:14, floor:0.25 },
  ferro:   { half:20, floor:0.40 },
  obelisk: { half:30, floor:0.55 },
  nova:    { half:45, floor:0.70 },
};
