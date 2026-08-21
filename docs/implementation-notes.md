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

## Part picker sheet (`src/components/PartPickerSheet.vue`)

Which slot is open is store state (`g.s.picker`), and choosing writes
straight to `g.s.draft` — the sheet only needs props for what it can't work
out for itself: the field descriptions and the card limit the current
frame/board pair allows.

**Picking is emitted, not written locally.** The choice has to be clamped
against the limit the *new* frame/board pair allows, and a prop still
holds the value from the last parent render at the moment of the click —
so the parent, which owns the live computed, does the write. `cardLimit`
stays a prop (rather than being read from the store directly) because the
row notes below are read during render and need the same value.

**Fab-designed custom parts** (`data/customParts.js`) sit past the top of
every catalogue ladder rather than inside it — `generatePreset`'s own
search never reaches for them, deliberately, so the picker is the only
door in, appending custom parts to whichever ladder the design's slot type
matches. A custom part also has no catalogue id and so no photograph;
`PartTile` falls back to an empty tile to keep the column aligned.

## Build view verdict panel (`src/views/BuildView.vue`)

Verdict panel ranking (cost/payback, then hashrate/efficiency, then site
cost) is design-spec.md §6i; this section covers the implementation-level
notes/aria logic layered on top.

**`ceilingNote`** is thread 32's signal, stated in the checker's grammar
but deliberately *not* folded into `canBuild`: being at a chain's ceiling
is a reason to point the rig somewhere else, never a reason you may not
build it. `chainCeiling` is forward-looking — it folds this not-yet-built
rig's hash into the gate — so the chain may currently be below its floor
even when the projection clears it; the copy's tense follows that (issue
#25): "is at" only when the chain is already there *today*.

**`subsidyNote`** (issue #6): a brand-new player's first Build-tab numbers
can show a same-day payback worth several times the starting balance —
honest, but reads as "this must be broken" with no context. It's real:
below its floor a chain pays every miner the same flat rate no matter how
little hash they bring (design-spec.md §1), so a first rig on an empty
chain earns a rate the chain can't sustain once it fills. The flat rate is
governed by `diffOf`'s own condition (`dispatch.js`:
`Math.max(c.floor, c.obs)*c.target)`, not raw `chainHash` — `obs` can sit
stale-high after a brownout, in which case the chain is *not* paying the
flat floor rate even while `chainHash` is still under the floor. Gating on
`chainHash` alone previously hid `subsidyNote` in exactly the case it
matters most: right after a first rig lands (~192 MH, still under
Tessera's 350 floor), a second rig's draft already reads as "at ceiling"
via `ceilingNote` even though the currently-quoted rate is still the
fully undiluted flat one. Both notes are true at once and both render —
clarifying rather than contradicting: "you're on the welcome rate right
now, and this next rig would end it."

**Accessibility announcement snapshotting (`draftKey`/`gateKey`).** A
screen-reader user gets no equivalent of watching checkmarks flip live
while editing, so `buildStatus` announces the outcome via
`aria-live="polite"`, built from `g.checks` read directly (not through the
tweened `costShown` etc.). Reading `checks` directly is exactly why a
naive computed re-read on every render would be wrong: two of the six
check labels embed live figures (cash, site power draw) that drift on
*every* simulation tick, not just on a real draft edit — a plain computed
would re-announce a fresh cash figure up to 10x/second at high speed while
sitting unaffordable, worse than the tween-spam this was written to avoid
(`aria-live="polite"` queues every distinct string it's given, so that
reads as an unbroken stream of stale numbers blocking anything else from
being announced).

Snapshotting only on `gateKey` (which checks pass/fail) closes that but is
too coarse alone: a part swap that changes cost without flipping any
check's pass/fail (e.g. a pricier frame while still comfortably
affordable) would then never re-announce, leaving the reader stuck hearing
an increasingly wrong price. `draftKey` — a snapshot of the draft's own
fields, which only change on a real player edit, never on a tick — covers
that other half. Between the two: `draftKey` changing always means the
player did something; `gateKey` changing with `draftKey` held still means
the world moved the outcome out from under them (e.g. cash finally
catching up to an affordable total while idle) — both worth announcing
once. A tick that moves neither (cash draining further under an
already-failing check) correctly announces nothing.

**Quick pick's condensed checks.** Quick pick only ever lands on a
combination `generatePreset()` already ran the full `canBuild` gate
against, so every check is guaranteed to pass the *moment* a preset
exists. But that's a snapshot, not an invariant: `presetFound` only
re-runs on mount or switching back into Quick pick, never on a tick, so
cash draining or site capacity shifting underneath an already-open Quick
pick can make `canBuild` go false while nothing here regenerates. Showing
zero checks unconditionally would then leave the Order button reading
"Fix the crosses above" with no crosses on screen — worse than the wall of
green checkmarks this split exists to cut in the first place, since
`buildStatus` (which reads `g.checks` directly) would still correctly
announce a real failure to assistive tech while the visible panel had
nothing to show a sighted player. So: checks stay empty in the common case
(`canBuild` true) and fall back to the real failing ones the instant it
isn't. `ceilingNote`/`subsidyNote` stay visible in both modes regardless —
they're context about the chain, not gate diagnostics.

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
