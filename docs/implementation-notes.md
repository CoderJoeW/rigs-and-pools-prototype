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
