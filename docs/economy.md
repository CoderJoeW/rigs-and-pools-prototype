# Economy — tuning log

Design rationale for *why* a mechanic exists lives in `design-spec.md`. This
file is the narrower thing underneath it: why a specific tunable constant
sits at the specific number it does, and what evidence justified moving it
there. Entries are keyed to the constant name in `src/data/constants.js`
unless noted otherwise.

## `BASE_WEAR` (0.05)

At the old value (0.003), an untuned card at a cool site (`tw=1, heat=1`)
took `REPAIR_AT/0.003 ≈ 117 days` to cross the repair threshold — far
outside any session ordinary play would reach. Issue #3: a 46-hour playtest
still read 1% wear with repair disabled the whole time, so the "purely
scheduled maintenance" design-spec.md §3 describes as one of the game's few
recurring decisions, and the "Fifty repairs" Craft milestone, were both
unreachable in practice.

Retuned so the repair line arrives within roughly a week — a real rhythm
without being frantic: `REPAIR_AT/0.05 = 7 days` at `wr`'s mean of 1 (the
0.75–1.25 spread in `random.js` moves it between roughly 5.6 and 9.3 days
per card; afternoon heat pulls it a little earlier still, so 7 days is a
ceiling, not a guarantee).

On the default starter site, a neglected rig never actually reaches "fully
worn" (`u.w=1`) at this rate — that's a property of the site's power
budget, not of `BASE_WEAR` itself: wear also raises card draw
(`dispatch.js`: `rigCoreW` scales each unit's watts by `1+0.5·u.w`), and by
roughly the two-week mark that growing draw trips a brownout on a
capacity-constrained site — it sheds the rig for exceeding capacity
(`tick.js`) — which freezes its wear right where it stood (worn units are
skipped, but so is the whole rig once it's off). A site with power to
spare has no such ceiling and a card left alone there will eventually hit
`u.w=1` for real. Either way it lands close to `GEN_DAYS` (14), not safely
inside it: repairing within the first week, well before the brownout, the
next generation, or full wear-out, is the actual point — ignore all of
that and the rig either disciplines itself into an outage or grinds down
to its ~60% worn-out hashrate floor. Repairing clears the excess draw
along with the wear, so on a capacity-bound site the brownout is a
backstop for neglect, not a new dead end.

## `DAY_HOURS` (6)

The day/night + tariff cycle runs on its own clock, faster than real time,
purely so a player can watch a full sunrise-to-sunrise power-grid cycle
without a 24h wait. `DAY_HOURS` is that cycle's real-time length;
`timeOfDay.js`'s `hourOf()` is the only reader (`band`/`solarFactor`/
`ambient` all build on `hourOf`, so this one knob covers all three).
Everything that turns real dollars — block cadence, `PAY`, wear, billing,
`GEN_DAYS`, pool trust, price drift — stays on `s.t` at its original
real-time pace and never reads `DAY_HOURS`, so payouts are exactly as they
were; only the sky and the tariff sign move faster.

## `TOU` — time-of-use tariff (2026-08-21 widening)

design-spec.md's "Time-of-use tariff" section still describes the
original `{0.70, 1.00, 1.55}` split; as of 2026-08-21 this widened to
`{0.65, 1.00, 1.90}`. Off-peak got cheaper and peak got sharply more
expensive — the blended 24h average for a site that runs flat and never
manages its schedule still rises (~0.99x → ~1.03x), so power is a bigger
drag by default, while the much wider off/peak spread makes actually
watching the clock — the drip/rush/autoOff levers, sizing a battery to
shift load, deciding which rigs to shed for the 17:00–21:00 window —
worth meaningfully more than before. Shoulder, the reference band the
multiplier is anchored to, is untouched.

*(design-spec.md's own numbers should be refreshed to match next time
that section is touched; noted here rather than silently left stale.)*

## Chain ladder premiums (2026-08-21 rebalance)

design-spec.md §2a documents the chain ladder's original v40 tuning
(Halcyon +55%, Nova −10%, rungs ~7x apart, network growth 0.25%/day). As of
2026-08-21 this rebalanced further: **Halcyon +35%, Nova +75%, Obelisk
+120%**, all measured against Ferro's `mult:1.00`, with rungs now sitting
8-10x apart (up from ~7x). Each rung's network is still twice its own
floor (`revPerMh = PAY*mult/2`), so the mults don't cancel out — every step
up the ladder still pays strictly more per MH than the one below it, and
graduating to the next chain is never a pay cut. §2a's table should be
refreshed to match next time that section is touched.

## Simulated miner population model (`src/game/sims.js`)

design-spec.md §6o (The network grows, instead of arriving finished) and
§6e (The newcomer cliff and the first hour) cover the player-facing shape
of this model — start on the terminology there. This section covers the
implementation-level derivations behind the constants and functions in
`sims.js` that aren't spelled out in the spec.

**Arrivals (`SIM_JOIN_BASE`, `SIM_JOIN_WORD`).** Logistic, not a flat rate:
a trickle who find the chains on their own, plus word of mouth from
everybody already mining, tapering off as the network saturates. The old
rule was a flat 18/day scaled by `(1-n/cap)^2`, which needed roughly 900
game-days to fill the network — far past the end of any farm's arc
(`GEN_DAYS` caps the hardware ladder at 168 days) — so the "miners arrive
over time" half of the model never actually showed up in play. The current
constants fill it over about four months instead.

**`SIM_MIN_HASH` (20 — one RX-470).** A simulated miner is a person with a
farm, not a share of a chain's hashrate: they start at a card or two and
build from there, so the floor on what one of them can hold is one card.

**`SIM_SEATS_MIN` (12).** Every chain keeps this many miners whatever its
size, so the pool market on the bottom rungs always has somebody to
recruit, and a player who founds a Ferro pool is never told nobody mines
there.

**`SIM_EXPAND_MAX_DAY` (0.25).** The most one miner can add to their own
farm in a day. Space, power and lead times bind for them exactly as the
build queue binds for the player; without it a sim converts cash to
hashrate instantly and compounds at ~90%/day.

**`SIM_TRIM_AT` (1.15).** How far over what a chain supports it has to run
before miners there start retiring cards. A dead band, not a line: a world
is seeded *at* its target, so trimming at 1.0 had the opening network
shrinking for its first fortnight while the population caught up — the
retirement branch eating the seed faster than anybody could build.

**`SIM_DECIDE_MAX_H` (336 — a fortnight).** Ceiling on the gap a single
decision may account for. Decisions are budgeted (`SIM_DECIDE_BUDGET` an
hour, whatever the population), so at the soft cap a miner's turn comes
round about every 190 hours — and the old 48-hour clamp meant they were
billed for a quarter of the power they actually burned and allowed a
quarter of the building they actually had time for. Still a clamp, because
a save resumed after a long absence must not hand anybody a year's bill in
one turn; just set above the cadence the model reaches rather than under
it.

**`seatsFor` / `simTargetOf` / `simRoomOf`.** Seats per chain are weighted
by floor, because the ladder *is* the chain sizes: Obelisk is not a bigger
version of Ferro, it is the chain that thousands of miners work.
`SIM_SEATS_MIN` is held back for every chain first so the small rungs keep
a pool market. The two rules agree at the soft cap — 16k miners spread by
floor weight put about 96 MH on every seat of every chain, i.e. one small
farm each, which is what a simulated miner is supposed to be. Before this
model, `seedSims` handed every chain `0.6 * floor` at t=0 and split it
among 25 accounts — which is how Obelisk came up reading 1.3 TH off the
gate, 25 "new players" holding 48 GH each, about 250 starter rigs apiece.

`simRoomOf` is the brake the model was missing: below a chain's floor the
difficulty clamp means revenue per MH never falls however much hashrate
piles in, so an agent that simply reinvests while `net > 0` compounds
without limit — a 30-day run reached 27x Obelisk's floor and was still
climbing toward the price cap at ~51x.

**`chainDraw` (crowding).** Pay alone cannot rank chains: below the floor
the difficulty clamp holds revenue per MH flat at `PAY * mult` however
much hashrate piles in, so a rule that compared only pay had no crowding
term in it at all — one lucky swing in Halcyon's price (vol 0.060, the
most violent book in the game) sent every miner in the world there and
none ever came back, leaving Ferro and Nova at literally zero hashrate
within a week. `chainDraw` compares people against the seats a chain's
size supports instead, clamped to keep it a nudge rather than a stampede
in either direction.

**A newcomer's starting reserve.** Sized to its own power bill — a
fortnight to a month of runway. `mkSim`'s default is a newcomer's few
hundred dollars, which on Obelisk is a couple of days: seeded with that,
the big chains' solo miners were selling cards to pay the power inside a
week, every time, because one Obelisk block takes a small farm months to
find and there is nothing else coming in until the seeded pools have aged
into enough trust to recruit them.

**`decide()`'s two binds.** *Room* — a chain carries the hashrate its
economics support, no more; once the miners on it have built that out
they stop adding, and the chain grows again only as new miners arrive.
Reinvesting on `net > 0` alone has no stopping point otherwise (see
`simRoomOf` above). *Lead time* — a farm is bought in cards and racked in
a room, so `SIM_EXPAND_MAX_DAY` caps the pace, with a card a day as the
floor for the small miners the cap would otherwise pin at zero.

## Chain ladder derivation (`src/data/chains.ts`)

Every chain is mined by graphics cards at full rate — no algorithms, no
hardware classes. Chains differ only along pay rate, block time, book
depth, price volatility and floor; that's deliberately four axes, not
five.

**Block timing.** `target:20` means the network's mean block interval is
exactly 20s once hashrate sits at the floor: `diffOf = max(floor,obs) *
target`, `T = diff/net * (K+1)/K`, so mean = target. Below the floor,
`net < floor`, so the same formula makes every block take longer — "below
floor takes longer" falls out of the formula, it isn't a special case.

**Tessera** is the newcomer refuge: 20s blocks, a $3 prize (`reward:125`,
solved from `reward = mult*PAY*floor*target/(86400*price)` so `revPerMh`
still equals `PAY*mult` at the floor). Floor (350) sits just above one
starter rig (~192 MH) so the first build gets a genuine below-floor
period, and is crossed by a second rig's worth. `depth` (1.2e7) is scaled
down in the same ratio as the lower emission so a solo starter doesn't pin
price at the global $0.02 floor.

**The Ferro → Obelisk ladder** (2026-08-21 rebalance, superseding the
v40 numbers in design-spec.md §2a): `mult` now climbs every rung — Ferro
1.00 (the `PAY` reference) < Halcyon 1.35 < Nova 1.75 < Obelisk 2.20 — so
`revPerMh` at the floor, and the full block's dollar value, both increase
monotonically all the way up. (Tessera stays outside this ladder on
purpose — it's priced to be worthless at scale, not a rung to graduate
through.) Floor now steps 10x into Halcyon and 8x a rung above that
(6,000 → 60,000 → 480,000 → 3,840,000) instead of the old flat ~7x, so a
farm sized for one rung is a rounding error on the next until it has
genuinely grown into it. Steeper than 8x starts starving `sims.ts`'s
population model (which seats each chain's miners by floor *share* of the
four-chain total — see "Simulated miner population model" above, and
`stores/__tests__/simGrowth.test.ts`'s "seats the chains by floor weight"
case, the actual ceiling this ladder is tuned against). Nova's block
target also moved 60s → 150s so cadence climbs the ladder too
(20 < 30 < 90 < 150 < 600) instead of dipping between Halcyon and Obelisk.

`depth` is carried by the same ratio as the chain's daily coin emission
(`86400/target*reward`), old to new, so slippage-per-dollar-mined is
unchanged and only the absolute numbers grew: Halcyon x1.161, Nova
x2.917, Obelisk x3.339.

| Chain   | reward (old→new)  | block $ (old→new)      | note |
|---------|--------------------|--------------------------|------|
| Halcyon | 99.4 → 115.44      | $305 → $354 (+35%/MH)   | thinnest book, most violent price |
| Nova    | 71.12 → 518.66     | $840 → $6,126 (+75%/MH) | no longer the worst-paying rung |
| Obelisk | 8144.8 → 27192     | $73,792 → $246,360 (+120%/MH) | biggest prize on the network |

## Chain hue assignment (`CHAIN_HUE` in `chains.ts`)

`hue` is an OKLCH hue angle and *only* the hue — lightness/chroma come
from `--chain-l`/`--chain-c` in `main.css`, set per theme — so a chain
stays at constant perceived lightness against whichever card it sits on
instead of five hex colours drifting differently when the theme flips.

The five angles aren't free choices: `main.css` already spends four hues
on status meaning (red 28 bad, gold 78 warning, green 162 good, blue 250
info in the same OKLCH space), and a chain landing on one of those would
read as a status rather than a name. Every chain hue sits at least 33°
off all four status hues and at least 35° off every other chain, putting
the closest pair (Nova/Obelisk) about 0.08 apart in OKLab in both
themes — several times a just-noticeable difference. Chain marks are also
rounded squares, not the circles `.dot` uses for status, so shape backs
up the distinction too.

Where there was room left, hue went to character: Tessera 200 (teal,
mosaic glass — the newcomer's refuge), Ferro 128 (moss — the grounded
workhorse), Halcyon 355 (rose — thin book, violent price, hot without
being red), Nova 285 (indigo — the calm blue chip), Obelisk 320 (purple —
monolithic, imperial, pays the most of any real chain).

`CHAIN_HUE` is exported as its own static map rather than read off
`g.chain(id).hue` because save state is rehydrated with
`Object.assign(G.s, data.state)` — `s.chains` is whatever the save file
held, so a world created before a chain gained an updated hue would carry
the old value, while the static map is always current.

## Anchor decay (`ANCHOR_DECAY` in `chains.ts`)

`fundOf`'s ratio term is `chainHash/floor/anchor`, so shrinking `anchor`
over game-time raises the fundamental price even at flat hashrate — a
slow structural drift layered under the hashrate- and trade-driven moves
`tick.ts` already models. `half` is the game-days half-life of the
relaxation; `floor` is where anchor asymptotes, as a fraction of its
start-of-save value (`installTick` lazily captures that as `c.anchor0`).
Values are ordered to match each chain's blurb: Tessera, the newcomer
refuge, matures fastest and furthest; Nova, the calm blue chip, barely
moves.

## Generation card pricing exponent (`genCardsFor` in `hardware.js`)

Price tracks hashrate's growth exponent (1.22), not a steeper curve. At
1.38 the top card cost 6,000x more after a year while earning only 158x
more, so generations quietly became unaffordable — the treadmill's own
answer (design-spec.md §3b) outran the player. The price exponent (1.30)
is deliberately steeper than the hashrate one (1.22) so a bigger farm
still finds money a real constraint, just not an impossible one.

## Grid electricity flat-rate baseline (`src/data/site-parts.js`, 2026-08-21)

design-spec.md §4 describes the earlier per-tier grid rate ladder (each
service tier priced its own $/kWh rate). As of 2026-08-21 this changed:
grid electricity moved off the per-tier rate ladder onto one flat
$15/kWh baseline (the `rate:'grid'` entries only). That baseline *is* the
shoulder rate — `TOU:{off,shoulder,peak}` in `constants.js` still
multiplies it exactly as before (shoulder's multiplier is 1.00 by
definition) — so a bigger grid service no longer buys a cheaper rate; the
ladder's job now is purely peak *wattage* (1,500 → 96,000 W), at a rising
upfront price and build time. Prior rates, for reference: 4.60/4.40/3.95/
3.40 (and before that, 4.20/4.00/3.60/3.10).

The diesel generator (`s-gen`) was rebalanced alongside it to hold the
same relationship it always had: strictly worse than grid at any band,
including peak — the old rate (9.90) was 13% above the old domestic peak
rate (4.60 × 1.90 = 8.74); the new rate (32.30) is the same 13% above the
new one (15.00 × 1.90 = 28.50). Its own rate stays flat (off-grid power
doesn't see the tariff band), so what it buys is flexibility — no service
to build, no capacity ceiling tied to it — never a price a grid-connected
site would prefer.

## `s-solmini` — the impulse-buy solar tier (`site-parts.js`)

design-spec.md §4 covers the general shape of the small-renewables ladder
(each tier's `yield` factor, effective-$/watt staying monotone). `s-solmini`
deliberately *breaks* that monotone trend at the very bottom: one small
panel, no tracking, cheap enough to buy turn one ($75 against $500
starting cash) and small enough to barely matter (75 W nameplate). Its
$2.50 effective cost/watt is the worst of any solar tier — 50% worse than
`s-sol1`'s $1.67 — so it's a fine impulse buy while every other source is
still out of reach, and a bad one to keep buying once `s-sol1` isn't:
matching `s-sol1`'s 840 W delivered would take 28 of these, for $2,100 —
50% more than `s-sol1`'s own $1,400.

## Block-count milestone thresholds (`b2`/`b3` in `milestones.js`)

design-spec.md §8 covers the career board generally. `b2`/`b3` are pure
block-*count* milestones, deliberately distinct from `b4`'s dollar
threshold, and their specific numbers needed real derivation: post-issue
#17 (Tessera's $-value rebalance), an untouched passive single rig on
Tessera still solves ~2,300 blocks/day purely from its ~20s block target
— pure elapsed-time volume, not skill or decisions. At the old thresholds
(25, 500) both cleared inside the very first sim-day, before the player
had made a single choice beyond the opening build.

`h1`/`b1` stay untouched on purpose: `h1` deliberately mirrors
onboarding's `earn` step (see `onboarding.js`), and `b1` is meant to be a
quick, celebratory first-block moment — both are supposed to fire fast.

`b2`/`b3` are raised to actually require sustained operation: ~7,500
(~3 days at that same passive rate) for "habit"; ~50,000 for "machine" is
out of reach of a rig left running with zero further attention — wear
drags a never-repaired rig's own output down over time, and it
permanently brownouts (measured: day 12-14, plateaued around 24k-28k
blocks) well short of 50k, the same "neglect has real consequences" bar
the wear/brownout system already sets elsewhere. Reaching it means either
some stewardship (a repair, an added rig) or the ordinary early-game path
of banking blocks on fast Tessera before migrating elsewhere — it does
*not* require staying on Tessera forever, since `blocksSolved` is a
lifetime total a chain switch never resets, but it does mean this one
track is inherently paced by how much fast-chain volume a run
accumulates, the same way the Pools track is paced by whether a run ever
founds one. Both remain within reach of patient idle play (design-spec.md
§12 explicitly protects that pattern) without being clearable before
breakfast on day one.

## `IDLE_CASH_MULT` (2)

Issue #7: nothing pulled cash toward the next purchase once a rig and site
existed — cash could sit at any multiple of the next rig's cost with no
nudge beyond a one-time, dismissible onboarding tip. 2x means "could
afford this rig again and still have money left" — comfortably past
"could afford one," which would nag the instant a player saved a single
dollar past viable.

## `JACKPOT_MULT` (3) / `BLOCK_BASELINE_MIN` / `BLOCK_BASELINE_WINDOW`

Issue #9: "Biggest block yet" only fired on a genuine all-time record,
which is trivially broken almost immediately on the tiny starter chain and
then rarely challenged again — so most real jackpot moments (a block far
above what a player's been seeing lately, e.g. right after graduating to
a bigger chain) got the same flat toast as routine income. 3x matches the
issue's own example ("3x your usual"); `BLOCK_BASELINE_MIN` samples of
real baseline are required before it can fire, so the first few blocks —
with no "usual" yet to compare against — never falsely read as a jackpot.
