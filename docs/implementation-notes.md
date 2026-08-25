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

## The `Game`/`GameExports` types (`src/game/types.ts`)

`G` is intentionally a partly-loose type. The installers described above
each contribute fields/methods to the same object, so `Game` grows a real,
named member for each piece as it's typed precisely, while an index
signature covers whatever installer output isn't worth naming yet — that
mirrors the object's own assembly, and claims no more precision than the
loosely-typed half of the codebase can back up. Rigs and pools specifically
stay `any`: they're assembled across several not-fully-typed installers
(`buildDraft.ts`, `pools.ts`, `poolMarket.ts`), and their shapes won't be
worth tightening until those call sites are.

`GameExports` — the flat surface `persistence.ts` publishes to components
via Pinia (`G.__exports`, returned verbatim as the store's setup-store
body) — is named explicitly even though every member is still `any`,
purely so Pinia's `defineStore` can infer a real object type for the
store: an index-signature-only type collapses to `any` as a whole, and
every `g.xxx` access in a component would fail to resolve. `s` gets the
one member precise enough to be cheap and worth it; the rest stay `any`
until naming their real types earns its keep.

## Weather async-readiness seam (`src/services/weatherService.js`, `src/game/weather.js`)

`weatherService` exposes `peek(day)` (sync, returns cached reading or
`undefined`) and `ensure(day)` (returns a Promise, fills the cache). Today
`ensure()` fills the cache synchronously — `generateLocal()` never actually
waits on anything — so this is a no-op behavior change. The split exists so
`weather.js`'s `ensureWeather()`, which `stepTick` calls synchronously every
tick and never awaits, is already correct once `ensure()` is swapped for a
real `fetch('/weather/'+day)`: it fires `ensure()`, reads via `peek()`, and
falls back to a neutral reading (`{cloud:0.3, wind:0.5}`) until the promise
lands, picking up the real value on the next tick. `weather.js` should be
the only place that needs no further change for that move; `weatherService`
is the one file that does.

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

## Construction-job part lookup (`jobPart` in `src/data/site-parts.js`)

A construction-queue job's `p` is a shell/source/plant/storage id for
every kind except `'fab'` (looks up `FABS` instead) and `'mfg'` — a
fab-designed custom part (`data/customParts.js`), which carries its own
finished part object on the job rather than an id into any catalogue,
since it was never in one to begin with. `paidCash` on an `'mfg'` job is
what rush/insolvency need `.price` to mean here: what was actually paid to
queue it, which is *not* the same number as the part's own `.price` (the
unit price Build charges each time the finished design gets used to build
a rig). Every place that turns a job back into its part (rush,
insolvency's cancel-a-job branch, ...) needs this discrimination; giving
it one shared home (`jobPart`) means a new job kind only has to teach it
here.

## Site hero backdrop (`src/components/SiteFilm.vue`)

The backdrop is two stills that cross-fade with the sim's own day/night,
plus — on the three biggest shells — a silent loop over the top.

**Why both plates are always mounted.** The cross-fade is the point.
Swapping one `<img>`'s src at dawn shows a blank frame while the new plate
decodes; holding both and animating opacity means the change is a
dissolve, and the browser has had the other plate decoded since mount
either way. They're the same room from the same camera, so a dissolve
reads as the light changing rather than as a different picture arriving.

**Why the film is never load-bearing.** Motion here is a decoration on a
card that must stay readable, so it's layered *over* a still doing the
real work, and every path that ends in "no video" — reduced motion, a
save-data connection, a codec the browser won't take, an autoplay
refusal, a shell with no film — simply leaves the still showing. There's
no fallback branch to get wrong because the fallback *is* the base layer.

The film is only shown against the night plate: it was cut from the night
generation, and running it over a daylit still would put two different
times of day in one frame. That also means it costs nothing for half the
game clock, a fair trade for one 65 KB file per shell.

`playsinline` and `muted` are what let iOS autoplay at all. The element
is only mounted once the hero is actually in its night phase, so by the
time `preload` matters the file is wanted — a site never seen after dark
never fetches it.

**Reduced-motion/save-data check runs once at mount, not per render**:
both are device preferences, and re-reading them on every tick would be a
`matchMedia` call inside a hot path for a value that changes about never.
A user who flips "reduce motion" mid-session gets the still on the next
reload, the same deal every other animation in the app offers.

**Manual `play()`, not just the `autoplay` attribute.** A muted inline
video is allowed to autoplay on every current browser, but the attribute
only fires if the element is in the document when the browser gets round
to it, and this element is mounted later — the moment the sim crosses
into night. Calling `play()` the tick after mount is the reliable half;
the `.catch()` is the other half, since a refusal is a normal outcome (a
strict autoplay policy, battery-saver mode) that must not surface as an
unhandled rejection. When refused, the poster stays up — the night plate,
which is what the card would have shown anyway. `showFilm` is watched
alongside the flag itself because it stays true across a move between two
film-bearing sites, so the flag alone would never re-fire. Play failures
are caught in two shapes because they aren't the same everywhere: browsers
reject the returned promise, while environments without a media stack
(jsdom, under component tests) throw synchronously instead.

## Tour spotlight tracking (`src/components/WelcomeTour.vue`)

`TOUR_SLIDES` (see docs/onboarding.md) is one fixed script shared by the
automatic first-session run and a later replay (`restartTour()`, TopBar's
"tour" pill). The only slide whose wording actually goes wrong for the
replay case is the last one, which frames Build as "your first rig"
(`nextId===1`); an established player replaying it already has one.
Everything else in `TOUR_SLIDES` reads fine either way (explanations of
what a tab *is*, not claims about the player's current state), so
`displaySlide` overrides just that one slide rather than threading an
`isReplay` flag through the whole script.

**The spotlight** is a single element sized to the real target's own
rect, with a `box-shadow` spread wide enough to cover the rest of the
viewport. `box-shadow` is pure paint, never hit-tested, so this dims
everything without a second overlay element and without ever intercepting
a click — the same "caption, not a lock" rule the rest of the tour
follows.

**Retry-until-ready measurement.** The tab switch, the view remount
behind it, and the target actually existing in the DOM don't all land in
the same tick, so `measureWhenReady` retries across a few animation
frames rather than assuming one `nextTick` is enough. `measure()` itself
scrolls to and measures a *newly arrived-at* target, but `main.css`'s
`.viewfade` transition (160ms, up to a 7px `translateY`) is still
animating when the target first exists, so an immediate read lands a few
px off its resting position — corrected by a second read once it's done.
`retrack()` re-measures *without* scrolling, for resize/scroll, where the
target hasn't changed and re-centering it would fight the player's own
scroll input every time they tried to look at anything else.

**`alive` flag.** The retry/settle chain is plain
`requestAnimationFrame`/`setTimeout` recursion, not a Vue watcher, so
unmounting mid-chain would otherwise keep it alive — and free to touch a
torn-down component's refs — until it ran itself out.

**Scroll-transition suppression.** `.tour-spot`'s CSS transition
(`main.css`) is what makes moving to a new slide's target feel like a
deliberate pop rather than a jump-cut — but during an active scroll,
`retrack()` fires many times a second, and that same transition makes the
highlight visibly lag a beat behind the content it's supposed to be glued
to, chasing rather than tracking. The `scrolling` flag turns the
transition off while a scroll is live, restored once it's been quiet for
a moment (not on every single event, since a scroll gesture is a stream
of them, not one).

**Two-directional tab sync.** One watcher drives the tab to match the
current slide (so the spotlight always lands on the real screen it's
describing) and resets to slide 0 whenever the tour transitions from
hidden to shown — covering both the ordinary first-session case and a
replay, where `step` would otherwise still be wherever a previous run
left off. It's registered *before* the tab-sync watcher so it always
resolves first within the same reactive flush.

The other watcher runs the reverse direction: several of the tour's own
spotlighted targets are themselves live buttons that jump tabs on click
(FarmView's "Go shopping", RigsView's "Build one", both pointing at
Build). Clicking one used to leave the tour's own step wherever
Next/Back last put it — caption still reading "Rigs," spotlight hunting
for a target that no longer exists on the Build tab underneath. This
watcher makes the tour follow instead: every tab is one of its own
slides, so any tab change while it's up (one of these buttons, or just
tapping the tab bar directly) resyncs the displayed slide to match,
keeping caption, spotlight and the real screen in agreement no matter
which of the two moves first. Guarded on actually differing so it can't
bounce against the other watcher.

## App shell (`src/App.vue`)

**Theme sync.** `'auto'` leaves no `[data-theme]` so `main.css`'s
`prefers-color-scheme` query decides the CSS palette; the
`<meta name="theme-color">` that colors the OS status bar has no such
query-based equivalent for content, so it's kept in sync here instead —
including tracking a live system-preference change while on `'auto'`.
`loadSave()` may overwrite `g.s.theme` after boot, and the watcher reacts
to that too.

**Ambient atmosphere.** The decorative `.ambient` layer reads the
simulation's own sky rather than sitting still. Purely presentational: it
consumes the same values TopBar already puts on screen as chips
(`solarFactor`, ambient temp, cloud cover) and publishes four unitless
0..1 factors that `main.css` folds into `.ambient`'s `color-mix()`
gradients. Set on `documentElement` next to the theme-color sync for the
same reason — it's a document-level paint detail, not something a
component should own.

The hour is restated here because `timeOfDay.js` keeps `hourOf()`
internal (not on the store's export surface) — on the same `DAY_HOURS`
cycle that module's `hourOf()` uses, not the 86400s-per-day economic
clock. `elev` is that module's own `sin(pi*(h-6)/12)` solar curve, kept
*signed* instead of clamped at 0 so it stays continuous through the
night: +1 at noon, 0 at 06:00/18:00, -1 at midnight. That sign is what
makes dawn and dusk a smooth crossing rather than a jump. The four
factors: `--amb-lum` is how much light there is at all (mostly solar,
with a daylight floor so an overcast noon still outranks midnight);
`--amb-warm` is golden hour, dulled by cloud, plus a little of the
afternoon's heat; `--amb-cool` is the night's cool cast, time-of-day only
regardless of brightness; `--amb-haze` is cloud cover, which desaturates
rather than dims. Only values that actually moved are written on each
tick, since at 1x most ticks change nothing past 3 decimals.

**Rank-up flash (issue #47).** #40 gave a rank-up its own toast, but a
toast is one fixed box at the top of the screen the player may not be
looking at, and the rarest, most permanent event in the game (5-6 in a
whole run) occupied exactly the same amount of the visual field as a
routine "Biggest block yet." Detected here rather than pushed from
`tick.js` for the same reason the `--amb-*` factors are computed here:
this is a presentational, document-level reaction to a game-state change,
and the game has no business knowing the screen flashed. `pop()` already
funnels every "worth interrupting the player for" moment through one
place and stamps it with a `cls`, and `s.toast.n` is the counter that
increments once per toast that actually lands — so watching it catches
exactly the rank-ups that reached the screen, and none that `pop()`'s
rate limit swallowed. Fires only for `cls==='rankup'`. The watch is not
immediate, so a save restored with a rank-up toast still in `s.toast`
doesn't re-flash it on reload. The flash element is mounted for
`FLASH_MS` then removed — with motion suppressed the layer is a static
edge glow present for that window and then gone (`.rankflash` in
`main.css`); the CSS animation is shorter than the window, so it has
settled to transparent before the node leaves. The `:key` is the
counter, so two rank-ups in quick succession restart the animation rather
than the second landing on an element mid-fade.

**Tab-visibility and stall time catch-up.** `setInterval` is throttled
(often to ~1/min once a tab has been hidden a while) or fully suspended
once a tab is backgrounded, so the tick loop effectively stalls while the
app isn't in front — without this, game time only caught up on a full
reload (via `loadSave`'s own away-time credit in `persistence.js`).
`onVisibility` mirrors that mechanism for the mid-session case: credit
the real time that passed once the tab is visible again. But a
foreground tab can lose the same real time with no hide/show transition
at all — an OS-level sleep, screen lock, or lid close freezes
`setInterval` right along with everything else, yet the tab was never
hidden from the page's point of view, so `visibilitychange` never fires
either at sleep or at wake. `onTick` (the timer's own callback) is the
backstop for that case: it stamps `lastTickAt` on every firing and, when
the gap since the last one exceeds the same 60s floor `creditAway`
already uses, treats that gap as away time instead of taking it as one
ordinary tick. The ordinary case (ticks arriving close to `TICK_MS`
apart) is untouched — `stepTick()` still runs with its usual fixed,
speed-scaled `dt`, so this only ever engages for a real stall.

Both paths read and advance the *same* `lastTickAt`, rather than
`onVisibility` keeping its own separate hidden-at timestamp — a
backgrounded tab isn't fully frozen, just throttled, so `onTick`'s own
gap check can fire (and credit part of the background span) before the
tab is ever revisited. If `onVisibility` computed `away` from an
independent hidden-at mark instead, its 'visible' branch would span the
whole background duration and re-credit the slice `onTick` already paid
out — real money for time already spent. Sharing the checkpoint means
whichever path last accounted for time is the one the other measures
from, so neither can double up on the other's work. `onTick` is also
guarded against overlapping a catch-up already under way (from either
path) the same way `hydrating` and `G.s.catchUp` already guard the other
two entry points — otherwise a live tick could land in the middle of a
replay that's mid-flight through `advance()`.

**Boot sequencing.** `loadSave()` yields periodically during a long
offline catch-up (`persistence.js`) rather than running as one blocking
synchronous task, so the tab stays responsive — but Vue still mounts and
paints the *default* state on the very first frame regardless, since
`loadSave` hasn't resolved yet. Without the `booting` flag that shows as
a flash of a fresh $500 start before the real save (and its catch-up)
lands on top of it a moment later.

The catch-up progress display itself (bound to `g.s.catchUp`) is
deliberately *not* nested inside the `booting` branch, only guarded by
`g.s.catchUp` being set on its own — a catch-up also runs on MarketView's
"Restore from backup" import, well after boot, with the rest of the app
fully mounted and interactive around it. Rendered as a full-screen
overlay there, it doubles as the fix for a real bug: two overlapping
catch-ups collide and corrupt each other (see the `hydrating` guard in
`persistence.js`) — the button that starts one is behind this overlay the
instant one is running, so a second click during the first import's
catch-up can no longer reach it.

Everything after the `try`/`finally` in `onMounted` runs unconditionally,
not just `booting.value=false` — a `loadSave()` that somehow rejected
must not strand the app on the loading screen forever with the tick loop,
autosave and pagehide listener all silently never having started either.
A `finally` block always runs to completion before the original rejection
(if any) continues propagating, so putting the real startup there rather
than after the `try`/`finally` is what makes it unconditional too.

## Audio service (`src/services/audio.js`)

Three short synthesized cues, no asset files.

**Why synthesis.** Every sound is built at play time from oscillators and
gain envelopes, so the bundle gains nothing but this file: no audio
assets to license, host, cache-bust or wait on before the first cue can
fire.

**Why a service, not a `game/*.js` module.** The game modules install
onto the shared context `G` because they read and write game state.
Sound has no game state — it's a pure side effect with exactly one
preference behind it, and that preference deliberately doesn't live in
the save (see below). So it's a plain singleton, imported directly by the
two places that need it, the same way `src/services/storage.js` is.

**Why its own `localStorage` key, not `g.s`.** `g.s.help`/`g.s.theme`
were the obvious precedent, but everything in `g.s` is written into the
save blob and is therefore also exported and imported (`persistence.js`
hydrates with `Object.assign(G.s, data.state)`). Loading someone else's
backup, or your own from another machine, would then reach across and
unmute a device that was deliberately muted. Whether this browser tab is
allowed to make noise is a property of the device and the moment, not of
the run — so it gets its own key and survives a save wipe, an import, and
starting a fresh game.

**`CUE` mapping** reuses `pop()`'s existing toast `cls`/`kind` vocabulary
unchanged — toast class first, then toast kind. Anything not named stays
silent, which is almost every toast: only the three moments issue #46
calls out actually earn a sound.

**`COOLDOWN`** is in real milliseconds, exactly like `C.TOAST_GAP` — a
speed multiplier moves game time, not `Date.now()`, so 3600x cannot beat
these. Tessera's 20s blocks arrive every 20,000 real ms at 1x and every
~5.6ms at 3600x; the block cue is the one that has to survive that, so it
carries the longest gap. A rank-up fires five or six times in an entire
run and is never throttled.

**Default volume is silent.** The originating issue floated "probably on,
but quiet"; this errs the other way on purpose. A tab that starts making
noise on its own is the one failure here that can't be undone after the
fact, and browser autoplay policy makes "on by default" a half-truth
anyway — nothing can sound until the first gesture, so a default-on
build's first cue would land unannounced in the middle of whatever the
player just clicked. Opt-in, one visibly-labelled click away in the top
bar, and remembered forever after.

**The `AudioContext` is never constructed at import or page load.**
Browsers start a context made outside a user gesture in `'suspended'` and
log about it, and a suspended context would silently queue everything the
offline catch-up replays. `unlock()` is called from the volume toggle's
own click handler, and from a one-shot document gesture listener armed in
`main.js` for players who already turned sound on in an earlier session
(`armUnlock`).

A caught `unlock()` failure logs rather than silently swallowing, because
a swallowed failure here is indistinguishable from "the player muted it,"
and this codebase has been bitten by exactly that before (see
`milestoneTracker.js`'s milestone catch) — the game stays playable in
silence, but not silently broken.

**Voice envelopes.** `exponentialRampToValueAtTime` never reaches 0, so
envelopes start and end at 0.0001 rather than 0 — ramping to a true zero
throws, and starting at a true zero makes the ramp a no-op (and an
audible click). The three cues are deliberately unequal in weight — the
rarer the event, the more there is to hear: a block is one soft falling
blip (routine income, nothing to notice twice); a jackpot is a rising
major-triad chord with a low sine under it for body, reading as bigger
without being louder; a rank-up is a four-note rise in fifths through an
opening lowpass filter, with the last note held — the only cue with a
tail, since it fires just 5-6 times in a whole run.

**The `rp-sfx` CustomEvent** dispatched from `play()` is a cheap,
dependency-free seam: an end-to-end check can prove a real block or
rank-up reached the audio path (and that muting suppresses it) without a
sound card. Nothing in the app itself listens for it.

**Volume control is a 3-state pill, not a slider.** Muted → quiet →
louder → muted. A separate slider would have to fit into a top bar
already full at 320px, and a game with three cues doesn't need continuous
gain — it needs "off," "on," and "on, I am across the room."

## Save migration steps (`src/game/persistence.ts`)

`hydrateUnsafe` used to be one 116-line function; it is now a fixed
sequence of named steps, each fixing exactly one gap a save can predate:
`resetTransientUiState`, `repairEmptySites`, `reindexCustomParts`, the
`allUnlocked()` refresh, `reseedOrReindexSims`, `migrateLegacyGroups`,
`migrateLegacyDefaults`, `rebalanceChains`, `retireServerPools`. The order
matters and mirrors the original inline sequence — later steps read state
earlier ones establish (`repairEmptySites` has to run before anything else
touches `G.s.sites`, since `migrateLegacyDefaults` iterates it directly;
`migrateLegacyGroups` needs every rig to already have a resolved
`group`-free legacy shape; `rebalanceChains` and `retireServerPools` both
read `G.s.sims`, which `reseedOrReindexSims` must have already seeded or
reindexed) — so don't reorder the calls in `hydrateUnsafe` without
checking what each step assumes is already true.

**`resetState`'s in-place clear.** Every `GameState` field is required, so
the object is transiently invalid by the type's own contract between the
clear and the following `Object.assign` — repopulated on the very next
line. Clearing in place (deleting each key rather than reassigning `G.s`
to a new object) keeps Vue's `reactive()` proxy identity, so every
existing computed/watcher stays wired to the same object instead of
observing a dead one.

**`repairEmptySites`.** `G.active` (`timeOfDay.ts`) and every `Site`-typed
caller downstream of it are typed non-nullable on the strength of an
in-app invariant — `decommissionSite` refuses to drop a farm's last site —
but a hand-edited or corrupted save isn't bound by that invariant, since
this game persists client-side with no server-side validation. Rather
than reintroduce `| undefined`/null-guards across the ~90 places `G.active`
is read, hydration repairs the one place the invariant can actually break:
an empty or missing `G.s.sites` falls back to `freshState()`'s starting
site (and matching `nextSite`/`activeSite`) before anything else runs.

## Sites view hero scrim (`src/views/SitesView.vue`)

The site hero's render is a backdrop, not a picture: it sits under a scrim
heavy enough that the name and the three readings clear contrast on it
whatever the shot is doing, and the card keeps its own border so it still
reads as a card.

The scrim is lighter overall than it used to be. The old plates were
bright skies over a quarry and needed holding down; the current plates
are interiors already shot with their mid-tones up and their top third
kept calm, so the same strength scrim buried the room the card exists to
show.

Two layers rather than one, because the two jobs are different. `::after`
is the overall wash, now gentle at the top. `::before` is a short band
behind the status pill alone — 9.5px uppercase, no plate of its own, and
the one piece of type here that the lighter wash left short of 4.5:1. It
decays inside 74px, so it buys that row its contrast without touching the
room below.

## Rigs view (`src/views/RigsView.vue`)

The Rigs tab's own chrome. Everything shared with the rest of the app —
the card, the pill, the `.dot` vocabulary, the swipe mechanics — still
comes from `main.css`; what lives in this file's `<style>` is the layout
the mockup asks for and nothing else uses: a page header, a hero that
fronts the site with a photograph, a list of rigs as separate cards
rather than rows of one, and the sort/select bar between them.

**One card per rig, not one card of rows** (`.riglist`): at this row
height a shared panel reads as a table, and the mockup's list reads as a
shelf of machines. The gap is what does it, so the swipe wrapper takes
over the card's own frame — and its overflow, which is what clips the
action panel underneath to the same rounded corners.

**The swipe-reveal panel under the row** (`.rigswact`) is filled from the
start rather than tinted-then-filled: it sits inside the rig's own card
with nothing else in it, so there is no neighbouring row for a pale wash
to get confused with, and the mockup shows it solid. The label uses
`var(--card)` rather than white for the reason `main.css` states at
`.rigswact.arm`: the dark theme's `--red` and `--green` are light enough
that white on them lands under 3.5:1, where the card colour clears AA
against both — which is also why `.arm` can no longer signal by filling
in (that is the resting state now) and instead signals with a ring in the
label's own colour. Darkening the fill would have been the obvious
alternative and is the one thing that cannot work: it drags the dark
theme's near-black label back under AA.

"Let go now" happens on the glyph rather than on the panel: the panel's
edges *are* the card's edges, so anything drawn there (a ring, a heavier
border) lands on top of the card frame and reads as trim rather than as a
change of state. The disc is well inboard, and flipping its fill costs no
contrast — the glyph and its ground simply swap the pair they already had.

Sort/select bar controls are padded to a real target rather than left at
the global `*{padding:0}` reset — as bare text these were ~17px tall on a
layout that is driven by thumbs, where the `.btn-sm` they replaced was
~28px. The negative margins keep the padding from moving the text off the
page's own margin.

## Chains view (`src/views/ChainsView.vue`)

**Chain card plate (`.cc-plate`).** The chain's own plate, bled in from
the left and masked out before it reaches the numbers on the right. Not a
full-bleed banner: the card's text is ink-on-card in both themes, and
turning it light to sit on a photograph would have made these the only
cards in the app that do.

The height is an accessibility constraint, not a look. `.cc-meta` and
`.cc-k` are 10-11px in `--ink-3`, which this project already runs at
about 3.1:1 on a bare card; a plate behind them dragged that to 2.6:1.
Ending at 34px keeps it above that line entirely — it sits behind the
gem, which is opaque, and behind the name, which is 17px semibold — so
those labels are back on plain card at exactly the contrast they had
before. Held at `--plate-a` so it reads at the same strength on either
ground.

**Segmented layout.** This tab used to be one scroll carrying five
unrelated sections: the chains, the pool market, the rivals in it, the
pools you run, and the form to found another. The segmented control
splits it along those seams — the chains you mine, the market you
compete in, the business you run — without moving or cutting anything;
the scroll was only ever the reason they were hard to find.

**Segmented control is a real ARIA tablist**, not just visually styled
like one: a single tab stop with the arrow keys moving between tabs
(`segKey`), one `tabindex=0` at a time, and focus follows selection —
implementing the roles the design implies rather than only announcing
them.

**`chainsInfo`'s own flag, not `s.help`.** The (i) beside ACTIVE CHAINS
is a reference someone comes back to, and hiding it behind the app-wide
hint preference would put it out of reach of a player who turned hints
off precisely because they didn't want them on every other row.

**`cards` computed once per chain, not called from the template.** Ticks
land ten times a second, five cards each read three or four of these
values, and `groupAdvice` alone walks every chain against every group
against every rig — called from the template that's O(chains² × groups ×
rigs) at 10Hz. Everything the card states is something the simulation
already computes; nothing here is a new number invented for the design.

**`bestPoolOn`** measures each pool candidate once via `poolHash` (a full
scan of the rigs) rather than re-measuring the incumbent for every
comparison.

**Solo-vs-pool comparison is deliberately about frequency, not amount.**
In this simulation a pool can never pay more per hash than solo —
`evMult` is `(1-fee)` against solo's `1+TX_FEES` — so a "pool advantage"
measured in money would always be a number below 1. What a pool actually
buys is frequency: its blocks land far more often than yours would, and
every one pays a share. That's the trade the two columns represent.

Gathered per pool rather than added per group: a pool's blocks pay every
member, so it contributes once however many of a player's groups sit in
it — but each of those groups still has to be counted into what the pool
would be holding, which a dedupe-and-skip would throw away. Two edge
cases: a chain with no pool at all counts solo the same on both sides
rather than vanishing from one side of the comparison; and `poolHash`
already counts groups that *are* in a given pool, so a group not yet
joined is added on top — that's the comparison being made (what would
change if you joined).

## Swipe gesture composable (`src/composables/useSwipeAction.js`)

Swipe-a-row-to-reveal-an-action, the pointer half of it. One row is open
at a time. Dragging left past `SW_ARM` claims the gesture from the page
scroll; past `SW_OPEN` it rests at `SW_REST` showing the button; past
`SW_FIRE` it fires on release without needing the button at all. `SW_MAX`
is a hard stop so a long drag can't pull the row off its own track.
Everything is in CSS pixels of leftward travel.

The composable knows nothing about rigs or any other domain: it deals in
opaque row ids and calls back out for the two decisions that are the
caller's — `can(id)` (checked on pointerdown and again before firing) and
`fire(id)` (the action itself). `within` is a selector for the row
wrapper; a pointerdown anywhere outside one closes the open row.

`sw` is `reactive()` because the template positions the slide from it;
`drag` is kept separate from `x > 0` so CSS can drop its transition only
while a finger is actually down. `close()` animates shut (x goes to 0
immediately, but the row stays mounted for the CSS transition's length so
it slides home instead of vanishing); `reset()` shuts instantly with no
animation, for when the list underneath changes and the open row may not
even exist any more.

In `onMove`, vertical wins ties (a mostly-vertical flick still scrolls the
list), and once a drag is claimed, `SW_ARM` is subtracted back out of the
travel distance so the row starts moving from where the finger actually
is, not with a jump of the arming distance. A finished drag lands as a
click on the row underneath; `takeClick()` lets the row's own click
handler check first, so opening a detail sheet isn't the accidental
result of swiping. Pressing the revealed button (`fireNow`) is not a
drag, so there's no click to eat there.

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

## Rival/sim pool naming (`nextRivalName` in `rivals.js`)

One naming sequence shared by every place that mints a rival/sim pool name
(`mkRival`, `sims.js`'s `seedStarterPools`/`tryFoundPool`,
`persistence.js`'s server-pool replacement) so they can't drift into
different conventions — they previously did, including one path that
dropped the disambiguating suffix entirely and would have produced
duplicate names once its sequence ran past `RIVAL_NAMES.length`. `seq` is
1-based: the count of names minted so far, including the one being named.
First pass through the list gets no suffix; each further pass appends its
cycle number (2, 3, ...).

## History series (`sampleHistorySeries` in `historySampling.js`)

Four of the sampled series look like they could collapse into fewer:

- **`powerHist`** is its own series (not derived from `netHist`) because
  Farm's "Cost today" card needs a cost trend, and `netHist` is profit —
  under a cost heading, a rising profit line reads as rising spend,
  exactly backwards.
- **`effHist`** can't be `hashHist` over `powerHist` either: `powerHist` is
  the power COST in dollars, while MH/W is hashrate over watts drawn — the
  two are only proportional while the tariff and the band hold still,
  which is exactly what this game moves around. It's stored the way
  `effMhw` computes it, once per sample.
- **`netCumHist`** is net TO DATE, sampled — not a running sum of
  `netHist`. `netDay` is `today().earned - today().power`, and `today()`
  resets at every midnight, so `netHist` holds partial-day snapshots taken
  at whatever fraction of the day the 0.75-day cadence lands on; adding
  them up gives a number with no meaning and about half the real total.
  `lifetimeNet` is the cumulative figure itself, so the series records
  that directly.

## Tweened display numbers (`useTweenedNumber.ts`)

Every figure in the UI is a plain interpolation of a store value, so a
block landing and paying out $40 renders exactly like a page reload — one
string on one frame, a different string on the next. `useTweenedNumber`
eases the *displayed* number toward the real one over a short window so
the change is visible without staring at the pixel (issue #43).
Presentation only: the source of truth is never touched. Only a
deliberately short list of figures opts in — TopBar's cash and the Farm's
"Net today" hero (ambient: they move continuously in the background),
and Build's verdict panel (discrete: it only moves because the player
just acted, so the same easing reads as feedback on that action).
Formatting stays the caller's job — pass the returned ref through the
same `fmt.*` helper the raw value used.

**Retargeting.** The simulation ticks 10x/second, so a new target usually
arrives mid-flight. Each change re-aims from wherever the display
currently sits rather than restarting from the old target, so the number
never jumps backwards and only one flight is ever in progress. With
ease-out, ~100ms into a 320ms window the display has already covered two
thirds of the gap, so under a continuous stream of ticks it trails the
true value by a fraction of one tick's delta — at any speed multiplier,
since `SPEEDS` scales simulated dt, not the real-time tick rate. The
window is wall-clock, so a bigger per-tick jump is covered faster rather
than crawling.

**`snapRatio`/`snapFloor` (discontinuity).** A change larger than
`snapRatio` times the value's own magnitude isn't the simulation moving,
it's the ground shifting under it (a save loading over a fresh store) —
counting through it would be noise, so it snaps instead. The multiple is
deliberately generous: spending most of your cash on a rig is a change
worth watching, and still tweens. `snapFloor` is the scale below which
nothing counts as a discontinuity, so a figure near zero — "Net today"
just after the day rolls over — still animates its first real move
instead of snapping it.

**`epsilon`.** A live rig moves cash and the day's net by a tiny fraction
of a cent on every tick from power accruing. Animating a change no
formatter could render would re-render the component for nothing and
keep the RAF loop alive permanently, so anything under epsilon is applied
outright and exactly. It's compared against the *displayed* value, so a
small tick arriving mid-animation doesn't cut that animation short.

**Reduced motion.** `main.css`'s blanket rule only flattens CSS
transition/animation durations; a JS tween is invisible to it, so the
media query is checked here directly and re-read on every change, so
toggling the OS setting takes effect without a reload.

## Site photography (`utils/siteArt.ts`)

The old scheme dealt three plates by `(site.id - 1) % 3`, so the picture
had no relationship to the place it labelled — a spare bedroom and a
warehouse bay were equally likely to show any of them — and all three
were photographs of an open-pit *ore* mine, a different industry from the
one this game is about. Every shell in `data/site-parts.ts` now has its
own interior, shot to the same direction: real light, mid-tones held up
so the top third of the frame stays calm under the status pill and name,
and enough recognisable kit in frame (a breaker panel, ducting, a battery
on the wall) that the picture says which tier you're on before you read
a word.

**Day/night.** Each shell was shot twice, the night plate produced as an
edit of the day one so room, layout and camera are identical and only
the light differs — which is what lets the two cross-fade rather than
cut. `sitePhase`'s threshold is the solar elevation crossing zero (06:00/
18:00 on the `DAY_HOURS` cycle), exactly where the day and night plates
were lit to meet; it restates `timeOfDay.ts`'s internal `hourOf()` logic
the same way `App.vue` does for the ambient layer, so the photograph
always agrees with the sky and tariff.

**Film.** The three biggest shells also have a five-second silent loop
cut from their night plate — only those three, since they're the tiers a
player spends real time looking at, and a loop costs about six stills in
bytes. `siteFilm` returns null for the rest and `SiteFilm.vue` shows the
still instead. Each loop ships as both WebM (VP9) and MP4 (H.264): H.264
is the format every browser takes, Safari included, but it's
patent-encumbered and a Chromium built without it treats the element as
undecodable rather than falling back, so WebM is listed first for those
that can take it.

**Fallback.** A save written before a shell existed can still name it,
but an unknown shell id must not blank the hero, so `sitePlate` falls
back to `bedroom` — the one every run starts in.

### Farm-row thumbnail (`src/components/SiteShot.vue`)

Replaces `RackShot`, which showed the same studio photograph of a rack
for every site whatever it was: a spare bedroom and a warehouse bay were
the same picture, and the picture was of neither. This shows the shell,
in the light the simulation says it is — the same plates the Sites hero
uses, so tapping a row takes you to a bigger version of what you just
tapped rather than to somewhere you have not seen.

No film here, deliberately. The Farm lists every site at once, and three
or four videos decoding behind a scrolling dashboard buys nothing at
104px — motion belongs on the one site you have actually opened.

Still per-state at the border, as before: the render is of a place, and
whether that place is running, hot or dark is state the photograph
cannot carry.

## Build draft search (`src/game/buildDraft.ts`)

`candidateBuilds` is the one search both `generatePreset` and
`openBuildCost` run over, replacing two copies that had silently diverged
(issue #27): `generatePreset` writes the result into `G.s.draft` and runs
the full `canBuild` gate including cash; `openBuildCost` skips the cash
check and tests power headroom directly, read-only. The preset generator
tries real drafts against the real `canBuild`/`checks` gate — cash-bound
favours cheap cards, power-bound favours MH/W — rather than a separate
heuristic; the 16x rig-positions-vs-frame-slots bug and the rejected
cooling-escalation idea that motivated this are both in design-spec.md §6n.

`openBuildCost` answers issue #7's idle-cash advisory ("is something
buildable, and what would it cost") without depending on `G.s.draft`,
which only refreshes on BuildView's mount and goes stale the moment site
constraints move past it. It mirrors `generatePreset`'s search read-only.

## Chain anchor decay (`advanceChainAnchor` in `chainEconomy.js`)

`chain.anchor0` freezes the save's *starting* anchor so decay always
relaxes toward a fraction of THAT, not of whatever `chain.anchor` last
was. `persistence.js`'s sim-reseed/reset/retune paths overwrite
`chain.anchor` directly without touching `anchor0`, so a mid-decay save
that goes through one of those keeps its original maturity floor instead
of resetting it.

## Single-series stat chart (`src/components/StatChart.vue`)

One measure, one hue, over the ~80 days of samples the simulation keeps.
Three of these sit on the Stats tab (one per measure) rather than sharing
an axis — efficiency, hashrate and money have nothing in common to put on
one scale, and two y-axes on one frame is the one thing a chart must never
do.

One series means no legend: the title names it. What replaces a legend is
the direct label at the live end — one value, on the last point, rather
than a number on every point.

There is deliberately no "sum these for me" mode. A cumulative chart has
to be fed a cumulative series: the per-day series here are snapshots of
counters that reset at midnight, so adding them up produces a number with
no meaning. The caller passes the series that already means what the
chart claims. `avg` is opt-in for the same reason — an average is
meaningful for a level sampled at an instant (hashrate, MH/W, cash) and
misleading for one of those resetting counters, where it reports roughly
half the real daily figure.

Interaction is a scrub rather than a hover crosshair: this is a 440px
touch layout, so the pointer that reads a chart here is a finger already
resting on it — dragging moves a marker and swaps the direct label for
the value under it. Releasing returns the label to the live end.

## Part catalogue tiles (`src/components/PartTile.vue`)

The component thumbnail beside each row of the Build tab's parts list, and
beside every option inside the pickers those rows open. Keyed by part, not
by slot — it used to take a slot name ('unit', 'frame', 'psu') and hand
back one of five pictures, so all twelve cards shared a photograph and so
did all ten power supplies. The Build tab is a shop, and every ladder in
`data/hardware.ts` is monotonic: a dearer part is better on every axis
that matters. None of that was visible with one photo per slot. Now every
catalogue id has its own tile, and opening a picker shows the ladder as
objects rather than as a column of identical squares over changing text.

**How they were shot.** Five contact sheets, one per family, every member
of a family in a single frame on one seamless studio floor under one soft
key from upper left, then cut apart on a shared square box. That is what
makes a column of five read as one set: the objects differ, the framing
and the light do not. It is also why this cost five generations rather
than forty-three — and why a sixth family could be added the same way.

The warm studio ground is deliberate and is the one place the app's art
departs from the near-black used for installed hardware (RigShot,
RackTile, Chassis). Those show machines in a room; these show goods on a
shelf. The tile's own background is set to match the sheets' floor so the
crop sits on it rather than fighting a dark frame.

The tile itself is decorative (`aria-hidden` unless a caller passes
`label`) — every row and every option already names its own part in text
beside the tile.

**Runtime fallback for minted parts.** The catalogue is not fixed. Two
kinds of part are minted at runtime and can never have a tile of their
own: `hardware.ts` grows the ladder every `GEN_DAYS` with `g<n>a`/`g<n>b`
cards and a matching `gp<n>` supply — an endless series, so shipping art
for it is not a thing that can be finished — and the fab mints
`custom-<kind>-<stamp>` parts a player designed themselves. Both sit above
the top of the ladder they extend, so the honest picture for either is the
top static part of that family — a top-end card really is what a
next-generation card looks like. `tileFor()` falls back to
`TOP_OF_FAMILY[kind]`'s tile, keeping the column of tiles full instead of
putting an empty square against the best hardware in the game from
in-game day 14 onward.

`TILES` is an eager `import.meta.glob` over `../assets/part/*.webp` rather
than forty-three import lines: the set is exactly the contents of the
directory, and a part added to the catalogue needs only its tile dropped
in beside the others.

## Rig hero shot (`src/components/RigShot.vue`)

The wide hardware shot that fronts every row of the Rigs list. Its own set
of renders, and the reason it is not one of the app's other hardware
visuals: `Chassis` is a 36–44px square badge that sits inside a line of
text, and `RackTile` is a macro crop of a rack's mesh with no cabinet
outline left in frame. This one is a 16:9 studio shot of a single rig with
the whole enclosure in frame, because the Rigs row is the one place in the
app that shows one machine at a size where the machine itself is the
subject rather than a marker for it.

**Two axes, not one.** Until this shot existed, every rig in the fleet —
a two-card milk crate and a sixteen-slot rack shelf alike — shared one
photograph, so the single most legible decision the Build tab offers was
invisible everywhere it mattered. The frame is now the second axis;
`utils/rigArt.ts` owns which of the three art classes a frame id wears,
and why there are three.

No chain LED, unlike `RackTile`'s version of this idea: a tile on the
floor plan is wordless and needs the bar to say which chain it points at,
where this row names the chain in text two lines down, with its
`ChainMark` beside it. Painted here as well it was pure duplication — and
a bright bar laid over a photograph whose own LEDs are the subject read as
a fault in the picture rather than as a label.

## Chain emblem (`src/components/ChainGem.vue`)

A chain's emblem — the faceted stone that fronts its card on the Chains
tab. One cut, five colours, and that is the whole idea: a chain's identity
in this app has always been its OKLCH hue (`chains.ts`, `ChainMark`), so
five different stones would have introduced a second, competing identity
system for the same five things. Rendered once and recoloured per chain,
they read as one set of five rather than five unrelated ornaments, and the
hue in the render is the hue on the mark beside it.

All five share one 1740px crop box measured on the base render, so the
stone holds its exact size and position from card to card — only the
colour moves, the same rule the rack, floor and rig sets follow.

Decorative by default (the name is right beside it on a chain card); a
caller with no such text passes `label` and gets a described image back.
Falls back to the flat `--chain-h` swatch for any chain id without a
render, so adding a chain to the catalogue cannot break this tab before
its art exists.

## Career-rank medallion (`src/components/RankBadge.vue`)

One badge, six metals, climbing: copper, brass, gunmetal, silver, gold,
platinum. The form never changes — same hexagonal frame, same pickaxe
over a gearwheel, same crop box measured on the copper render — so the
ladder reads as one object being upgraded rather than six unrelated
awards, and the only thing that moves between ranks is what it is made
of. The same rule the rack, rig and gem sets follow.

Keyed by index into `RANKS` rather than by name: the ladder is ordered
and what a rank is called is a label on it, so renaming one in
`milestones.ts` cannot silently unhook its art. An index past the art
falls back to the last badge rather than rendering nothing — a seventh
rank added to the catalogue should look unfinished, not broken.

The dark tile it sits on (in its `<style>`) is the same one every other
generated asset in the app wears — `RigShot`, `ChainGem` and `PartTile`
all frame their render rather than trying to knock its ground out.
Blending it away was the first attempt and it does not survive both
themes: the render's ground is near-black but not black, so `screen` left
a grey plate on the dark card and would have blown the badge out on the
light one. A framed tile is what the rest of the app already looks like,
and it reads as deliberate in both.

## Owned pool card (`src/components/MyPoolCard.vue`)

One pool you own, on the Chains tab: capacity and bond, the members you
can point at it, the fee dial and its projection, and the close/top-up
controls. In the view this used to be a `v-for` body whose every piece of
local state was a map keyed by pool id — `feeDraft[p.id]`,
`poolRenameOpen[p.id]`, `poolRenameDraft[p.id]`. One card per component
means those are just refs, and the keying disappears.

**Hashrate sparkline.** `tick.ts` appends a `poolHash` sample to
`pool.hist` every four in-game hours, so it only draws once a pool has
been running a while — which is why an earlier extraction lost it
silently: a freshly founded pool has an empty `hist` and never reaches
the branch.

**Fee draft.** An unset fee draft means "showing the live fee" — the
projection and the Move/Cancel pair only appear once the player has
actually moved the slider.

**Why `demand`/`tierBond` are memoised and `poolHash`/`poolPnl` are not.**
`demand` and `tierBond` scan every miner on the pool's chain — tens of
thousands of them once the network has filled — and the template asks
for them a dozen times per render between the "Turning away" line, the
top-up button's four states and the fee projection. Through `computed()`
each is one call per render, which measured as the difference between
~90ms and ~15ms for an open card; the fee slider re-renders on every
input event, so that is a live cost. They are cacheable because they walk
`G.s.sims`, which *is* reactive: a miner's hashrate or chain moving
invalidates them.

`poolHash` and `poolPnl` look like the same kind of thing but are
deliberately not memoised. `poolHash` reads the sim half of a pool's book
out of `G._simPoolHash` — a plain object `sims.ts` keeps off Vue's
reactivity on purpose (see that file's header) — so a `computed()` over
it caches a value nothing will ever invalidate. Memoised, a card whose
members were all simulated rendered a frozen "holding 0 MH/s", and with
it a frozen FULL badge, capacity bar, blocks-a-day and projection delta.
They are cheap anyway: a walk of the player's own groups and rigs, not of
the network.

## Floor-plan rack tile (`src/components/RackTile.vue`)

One position on a site's floor plan. Its own set of renders, alongside
`Chassis` (square 64px badges beside a single rig) and `RigShot` (the
16:9 shot fronting a Rigs row): these are macro crops of a rack's front
face, framed so the mesh and its LED rows fill a wide tile edge to edge
with no cabinet outline to shrink at this size. All five states come from
one crop box and differ only in what colour the LEDs burn, so a position
holds its exact framing as it changes state and only the light moves.

An empty position renders as a `<div>` rather than a `<button>` — there
is nothing to open — and drops the render for a dashed outline.

## Chain colour mark (`src/components/ChainMark.vue`)

The colour half of a chain's name. Renders nothing on its own account —
it always sits immediately before the text it belongs to, so the name is
what a screen reader reads and the mark is what the eye catches. Hence
`aria-hidden` and no title: a tooltip here would announce "Tessera" next
to the word Tessera.

The hue comes from the static `CHAIN_HUE` map rather than from the live
chain record, so a world restored from a save made before chains had
hues still shows its colours — see the note in `chains.ts`.

## Duck-typed part lookups (`PART`/`SITEPART` in `src/game/types.ts`, `SP`/`P` in `src/game/dispatch.ts`)

`Part` (`Frame | Mobo | Psu | Cooler | Card`) and `SitePart` (`Shell |
Source | Storage | Plant`) are discriminated unions of very different
shapes — a solar source's `peak`/`yield`/`rate` has nothing in common with
a cooler's `cap`/`pue` or a PSU's `eff`/`conn`. Every caller of
`G.PART`/`G.SITEPART` (and `dispatch.ts`'s own `SP`/`P` aliases for them)
reads whichever fields its call site knows apply, by construction, without
a runtime discriminant check. Narrowing the return type would mean
threading a type guard through dozens of call sites for no caught bug,
since a field that doesn't exist on the wrong variant already fails
loudly at runtime — so both are typed `any` in `types.ts` rather than
their real union type. `FAB` has no such excuse (`Fab` is one concrete
shape) and is typed properly.
