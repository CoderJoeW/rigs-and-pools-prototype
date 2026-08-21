# Implementation notes

Rationale that is about *how the code is built* rather than *what the game
does* — performance choices, framework gotchas, bug histories tied to a
specific function. Game-design rationale belongs in `design-spec.md`;
tuning-constant derivations belong in `economy.md` / `saves.md`. This file
is the third bucket: notes that would otherwise sit as a comment block
next to the code, kept here so the source stays short.

## Shared context `G` module pattern

Every `src/game/*.js` file exports an `install*(G)` function that assigns
its functions onto a shared context object `G`, rather than a closure —
this is what replaced the old single-file closure design. Cross-module
references go through `G` so the (many) mutually-dependent module pairs
still resolve at call time exactly as the closure did; declaration order,
hoisting and intra-module references are otherwise untouched. See
design-spec.md §13e (The closure refactor) for the full migration story.

## Pool market (`src/game/poolMarket.js`)

**`FEE_BITE`.** One scoring function feeds both the hourly market drift
and the news-driven "pool just changed its fee" shake — they used to be
two separate copies, which is how a lever silently stopped matching its
own description. `FEE_BITE` sharpens the fee's effect above the ±3%
jitter noise floor: without it a two-point fee difference was invisible,
so cutting your fee did nothing a player could see.

**`poolScoreBase` / `poolScore` split.** Split into the half that is a
property of the *pool* (`poolScoreBase`) and the half that is a property
of the *miner* looking at it (`poolScore`, which multiplies in that
miner's jitter), because the pool's half is identical for every miner on
the chain and `poolTrust` is four derived quantities deep. `poolScore` is
what `sims.js` scores a pool with; `pickPool` reads the same base out of
`chainPoolTable` and draws its own jitter — one definition of each,
rather than either function carrying a second copy of the formula.

**`chainPoolTable`.** The half of a pool's book a miner moving cannot
change — its capacity, and the player's own rigs pointed at it — built
once per shake and passed down to every miner's `pickPool` call. Before
this, `poolOptsFor` called `poolHash` (which walks every group and every
rig) once per pool *per miner*: fine at a few hundred sims, seconds once
the network reaches five figures.

**`simIn`.** The simulated half of a pool's membership is read live on
every miner check, so a pool that fills up mid-shake reads full for
everyone checked after it in the same shake — capacity stays
first-come-first-served, exactly as a real fill would behave.

**`simsOn`.** Reads the per-chain sim head count that `sims.js` maintains
incrementally via `bumpN`, rather than scanning `G.s.sims`. This is read
from templates — three times per render on an open pool card, once per
chain inside `ChainsView`'s `cards` (which recomputes every tick because
it reads the block clock) — so at a five-figure population the scan
version cost tens of milliseconds per frame for a number the sim layer
already tracks. Deliberately skips `ensureMembers()`: the count is kept
current by `bumpN` as miners arrive, leave and switch chains, and forcing
a member-index rebuild from a render path would trade a scan for a bigger
one.

**`poolDemand`'s rival pass.** Each rival's score and remaining room are
computed once per call rather than once per miner in the loop — with
`poolHash` walking every group and rig each time, that used to cost
seconds on a busy chain against a pool card that renders it several times.
Rivals are then sorted by room so "rivals with room for a given hashrate"
is a *suffix* of the sorted list, letting the best-offer-among-them be a
running maximum computed once from the back and looked up per miner with
one binary search, instead of walking every pool for every miner.

Inside that same loop, each miner's `m.hash` is read into a local exactly
once: `G.s` is Vue's `reactive()`, so every property access is a proxy
trap and a dependency registration. At 13k miners × 30 pools that was
390k of them, measuring 42ms of the function's 48ms total.

## Activity feed (`say()` in `poolMarket.js`)

A repeat's numeric total lives in exactly one of two places, never both:
`num` (a coin quantity, paired with `unit`) or `usd` (a signed dollar
amount — positive in, negative out). `amount` is always the pre-formatted
display string re-derived from whichever one is present. Callers with
neither (a fixed-string amount, or no amount at all) still collapse
repeats into "×N", they just can't accumulate a total — issue #16: before
this, USD-denominated events had no numeric channel at all, so a call
site with a real amount to sum couldn't be told apart from one where the
number was simply never captured.

The "no quantity, no dollar amount" collapse path is gated on `amount`
too, not just `num`/`usd`: several calls (rush builds, site installs)
carry a fixed-string amount with no `num`/`usd` — those differ order to
order and must stay separate feed lines, or the feed would silently
under-report what was spent.

## Simulated economy (`src/game/sims.js`)

**Performance rules (battery / 20k target).** Running totals
`G._simChainHash` / `_simPoolHash` / `_simSoloHash` are updated
incrementally; the hot-path `simHash`/`poolHash` never scan the array.
Decision work is budgeted: at most `SIM_DECIDE_BUDGET` agents wake per
hourly pulse, staggered by each sim's `next` time. Block-winner sampling
picks a bucket (pool or solo) via aggregates, then walks only that
bucket's members — never the full population list. Individual sims carry
no Vue reactivity; they live in a plain array. The one exception is
`G._simChainN`, the per-chain head count templates read directly (via
`simsOn`) — the only aggregate here that has to be `reactive()`, written
only when a miner arrives, leaves or switches chains so the proxy cost is
negligible; `rebuildMembers` deliberately tallies into a plain object and
publishes those few values at the end rather than doing thousands of
reactive writes per rebuild.

**Largest-remainder seat allocation** (`seedSims`) — so seeded seats
actually sum to `SIM_START` instead of leaving a remainder for a filler
loop to dump on whichever chain happens to be listed last.

**Lognormal spare split** (`seedSims`) — everyone gets their minimum-hash
card first, and only what the chain carries on top of that is split
lognormally across the seeded miners. Clamping a lognormal draw up to the
minimum *afterwards* would have overshot the target by a third on the
chains where the minimum binds.

**"One MH, not five" purchase floor** (`decide()`). `pace` is a rate times
the elapsed hours, so the card-a-day floor it's meant to guarantee the
smallest miners came out as 2.5 MH over a three-hour turn — under a
five-MH minimum purchase, which silently pinned exactly the miners the
floor exists for at zero. Ferro sat at its seed for the whole of a 30-day
run before this was caught. The buy threshold is 1 MH, not a rounder
number.

**"Don't be the whale" migration check** (`decide()`'s chain-switch loop).
Measured against what a chain currently carries, not its floor: the floor
is where a chain ends up, and early on that is hundreds of times what is
actually there, so checking against the floor would let one big miner
swamp a chain that's still mostly empty.

**Pool-closure consolidation** (`closeSimPool`). Closing a simulated
operator's pool used to be handled by hand in three separate places — an
operator folding an empty pool, a PPS bond running dry, and an owner
giving up mining altogether — and they had drifted: the last one released
the pool's simulated members but not the player's own groups, so a group
left pointing at the corpse kept drawing the PPS flat rate out of a pool
with zero bond and nobody running it (measured at 4.1 coins/hour off one
starter rig, forever, because `flatDrip` only asked whether the pool was
PPS, not whether it still existed). All five closure paths — those three,
a rival operator folding, and the player closing their own pool — now go
through `closeSimPool`. The player-closes-own-pool path had the same bug
in reverse: it released the player's groups but not the pool's simulated
members, leaving their hashrate stuck in `_simPoolHash`, a bucket
`drawSimWinner` skips, and absent from `_simSoloHash`, the bucket it
walks. Callers keep their own bond handling and feed line; what they must
not each own separately is who gets released.

**Departure sampling scaled to population** (`simPulse`). Departures used
to sample one miner an hour, a rate written when the network held about a
hundred of them. At the population the network now reaches, a failed farm
could sit derelict for years — still counted in `_simChainN`, still
inflating both `chainDraw`'s crowding term and `simTargetOf`'s per-seat
floor with people who'd already left. The number of looks per pulse is
now scaled with population so the odds of any given broke miner giving up
stay what they always were.

**Hashrate-zero-before-release ordering** (`simPulse`'s departure branch).
A departing miner's hashrate is zeroed *through* `setSimHash` first, so
everything that follows (releasing any pool they owned) is a no-op against
the running totals. A bare `addHash(m, -m.hash)` here previously left
`m.hash` intact while `m` was removed from `G.s.sims`; if that miner owned
a pool, the release loop's `setSimPool(m, 'solo')` then subtracted the
same hashrate from `_simPoolHash` a second time and stranded it in
`_simSoloHash` permanently — and `drawSimWinner` reads `_simSoloHash` to
size the solo bucket.

## Insolvency floor rig spec (`src/game/insolvency.js`)

`FLOOR_RIG` / `FLOOR_COST` is the rig insolvency hands back when the farm
is completely gone, and what the player would pay to build it themselves.
Both used to be stated twice — the parts inline at the push site, and the
price as a hardcoded sum that had drifted badly (12+16+32+26+9 = $95
against a rig that actually costs $60, because the board and the card
were repriced — $16→$4, $26→$3 — and the literal sum was never updated).

Worth being exact about the impact of the fix: nothing observable changed
at the time. The one place `FLOOR_COST` is read is only reachable with
zero rigs and no construction queue, and every rung above it in
`insolvency()` returns first, so cash is still the 0 set at the top of the
function — the comparison is true at $95 and true at $60 alike. The guard
states an intent ("only give one away if the player cannot buy one") that
its position made vacuous at the time; it's kept because the intent is
right and the escalation ladder may grow a rung that leaves cash behind.
So this was a latent-correctness fix, not a balance change — one spec now,
priced with the same formula the Build tab charges (`buildDraft.js`: frame
+ board + supply + cooling + n × (card + riser)).

`n` on `FLOOR_RIG` is deliberately both the card count and the riser
count: the build formula bills one riser per card, so a separate `risers`
field on the spec would be a second number free to disagree with the
first — the exact class of failure being fixed. There is deliberately no
`ctrl` field on the spec itself: it's only read for non-gpu rig kinds, and
no controller catalogue exists, so `PART('k3')` is undefined and pricing
it into the sum would throw. `kind` lives on the spec because it decides
which pricing formula applies. The object is frozen because it's the
definition, not mutable state — changing it at runtime would put the spec
and the price back out of step with each other.

## Toasts (`pop()` in `poolMarket.js`)

**Sound hangs off `pop()`**, not off the twenty-odd individual event call
sites (issue #46), because `pop()` is already the single place the game
decides "this moment is worth interrupting the player for," and its
`cls`/`kind` vocabulary already separates the exact three moments that
earn an audio cue. Nothing has to be threaded through `tick.js`, and no
future event can be silently missed.

The `cue()` call sits *above* `TOAST_CAP`/`TOAST_GAP` deliberately.
`TOAST_CAP` is a teaching cap — the first few of a kind land while a
player is learning, then the activity feed carries it silently — and it
applies because a toast covers the screen. Sound does the opposite job:
it's for the player who is *not* looking, which is precisely later in the
run, so a block cue that went quiet after the third block would be a bug
rather than restraint. The hazard the cap also happens to guard against —
a fast-forward burst turning income into a machine gun — is instead
handled by `audio.js`'s own per-cue cooldowns, measured in real (not
game) milliseconds like `TOAST_GAP`, so no speed multiplier can outrun
them.
