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
