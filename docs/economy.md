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
