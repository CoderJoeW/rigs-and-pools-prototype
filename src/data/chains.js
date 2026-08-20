/* No algorithms and no hardware classes. Every chain is mined by graphics
   cards at full rate; chains differ by pay rate, block time, book depth, price
   volatility and floor — four axes without needing a fifth. */
/* Tessera is the newcomer refuge: short blocks, tiny prize, floor above a
   single starter rig so the first build gets a genuine below-floor period.

   Block timing (unchanged): target:20 means the network mean block interval
   is exactly 20 s once hashrate is at the floor (diffOf = max(floor,obs)*target;
   T = diff/net * (K+1)/K so mean = target). Below the floor net < floor, so
   the same formula makes every block take longer — the "before 100% floor
   it should take longer" behaviour is structural, not a special case.

   2026-08 payout retune: reward dropped so a block is worth ~$0.10
   (reward * price ≈ 0.10). Previous ~$0.39 blocks / ~$5+/MH/day made a
   single passive Tessera rig the dominant strategy for days; the new
   ~$1.23/MH/day (~$236/day on a 192 MH starter) still teaches the loop
   with constant small wins but no longer trivialises every later decision.
   mult set to 0.29 so the identity revPerMh = PAY*mult still holds at
   floor (4.20*0.29 ≈ 1.22). depth stays large so price does not clamp.

   Floor 350 stays above one starter (~192 MH) and is crossed by a second
   rig's worth, preserving the OUTGROWN advisory timing. */
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
  { id:'tessera', name:'Tessera', tick:'TSR', target:20, reward:4.17, price:0.024,
    mult:0.29, floor:350, vol:0.030, depth:4.0e5, recover:0.50, orphan:0.050, hue:200,
    blurb:'Twenty-second blocks and a ~$0.10 prize — constant small wins for one rig, worthless at scale.' },
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
