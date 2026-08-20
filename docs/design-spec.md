# Rigs & Pools — Design Specification

*Renamed from Hashline at v26. Same game, same document.*

**Status:** A continuous single-player run. No seasons, no prestige, no halving. Sites are built rather than chosen; pools are permanent or player-founded. Working document.
**Stack:** Vue 3 frontend (mobile-first), Kotlin backend (authoritative simulation).

> **Prototypes.** Sources now live in `src/`; `python3 build.py` assembles them into the single file (§13d). `rigs-and-pools-v67.html` is current — a quadratic heat sweep removed, up to 17.9x faster on large farms (§13f). `v66` made `src/game/` real modules on a shared context (§13e). Both verified behaviour-identical by state fingerprint. `v64` rebuilt the Rigs page around orient/find/act, closed threads 6, 13, 32 and 38, and fixed a 16x preset bug. `v63` was a cleanup pass: one owner per duplicated quantity, named constants, dead surface removed, and `smoke.js` checked in beside `audit.py`. `v62` was — site management: rename, expand a shell in place, decommission. `v61` was — Rigs split out of Sites, and a serrated tab bar. `v57` was — coach removed, everything ungated. `v56` was — realised earnings replace projections. `v55` was — the chain field stays plural for a full game-year. `v54` was — newcomer cliff closed, first hour fixed, career board rescaled. `v53` was — the 1:1 economy rescaled so sessions matter. `v52` was — generation supplies now appear in the build picker. `v51` added `v50` was `rigs-and-pools-v49.html` was — the site page: power flow strip, per-band cost breakdown, compact rig grid. `hashline-v25` and earlier are pre-rename history. — continuous run, built sites with generation,
> player-founded pools, rebuilt rig cards. `v13` was the last seasonal build: — real time 1:1, a picker-driven build screen,
> and the full comparison UI. `v9` was the first alpha: multi-season play, a prestige
> workshop spending tokens on the four axes, fleet actions, second-tier automation and the
> bankruptcy floor. Earlier: $500 cold start, six part types with distinct
> `v7` added refit and the PPLNS forfeit, `v6` the parts overhaul, `v5` the $500 cold start.
> A solo player is always *below the floor*, so every prototype demonstrates the below-floor half
> of §1 and never the above-floor case. There is no persistence between page loads.

---

## 0. Design philosophy

**The game does the arithmetic. The player makes the judgement.** Network hashrate, difficulty floors and their schedules, pool statistics, part condition, market depth, live selling pressure, co-op ledgers — all public, live and exact. Derived metrics are computed rather than left as homework. What is not provided is judgement: whether that chain is worth mining in three days, whether you'll have cooling headroom, whether that card is worth its watts once your ceiling binds.

This is what makes full build compatibility survivable (§3).

**Idle floor, active ceiling.** Rigs run whether or not anyone is watching. Presence buys nothing; foresight buys everything. Every mechanic that could punish absence must be answerable in advance through configuration. At scale this becomes mandatory (§10), and collectively it becomes governance (§11).

**Zero terminal value deflates backward.** Any asset worthless on a known date starts losing value well before it. True of coins and parts, and the largest identified risk in the design. **Prestige tokens and blueprints are the only exceptions** — stored value and stored knowledge.

**Automation is the skill ceiling, so it is never for sale** (§13).

---

## 1. World model

### Block timing

**Each chain runs a block window**, sized when the previous block lands from the network hashrate present at that moment. The chance of finding early rises as the window fills:

```
P(block found by time t) = (t / T)^K,  K = 3
mean interval = T·K/(K+1) = the intended block time
hard ceiling  = T        = 1.33 × the intended block time
```

So **luck pays and droughts cannot happen.** Measured over 1,241 Ferro blocks at a 30s target: mean 32.2s, minimum 3.1s, maximum 43.0s — exactly the computed ceiling. Over 40 Obelisk blocks at ten minutes: minimum 3.2 min, median 12.1, maximum 14.4.

**Pure Poisson was rejected.** It is memoryless, so a countdown would be a lie — after waiting 42 seconds the expected remaining wait is still 42 seconds. A visible clock needs a process that ages.

**This costs nothing.** Network block regularity and individual miner variance are separate: even with metronomic blocks, a miner holding 1% of a chain waits a wildly variable number of blocks for their turn. The solo-versus-pool lesson lives in *whose* block it is, not *when* it lands.

The interface shows a per-chain countdown, a fill bar, and your share of the next block, so waiting is legible rather than empty.

### Reward scales with block time

Longer blocks carry bigger prizes: 20s/$0.02, 30s/$81, 60s/$177, 90s/$238, 600s/$2,247.

But block value is `pay rate × floor × block time / 86400`, so **the floor sets the prize as much as the timing does.** Tessera's prize is small because its floor is small — which is what protects a newcomer — and it previously carried the *longest* block time in the game to compensate, making the starter chain feel like the worst one. It now has the shortest window at 20 seconds and the smallest prize, so the rule holds and a first rig gets constant small wins instead of one long wait.

### Difficulty — the hybrid floor, retargeted per block

```
difficulty(chain) = max( floor(chain), observedHash ) × blockTarget
observedHash += (actualHash − observedHash) × 0.03      once per block
```

**Difficulty is set from observed hashrate, not live**, so it lags by design. Hashrate arriving finds it stale-low and the chain **runs easy** until it catches up; hashrate leaving strands it stale-high and the chain **runs hard**. Measured swings of +21% to −13% appear and decay continuously across the four main chains — the timing arbitrage this document has promised since the first draft and never actually delivered. Chains are tagged **RUNNING EASY** and **RUNNING HARD**, with the gap shown as a percentage.

Each chain has a **high published floor**. Below it, difficulty is fixed and returns are **linear** — twice the hashrate is exactly twice the income, and no other player affects you. Above it, difficulty tracks the playerbase and miners **dilute each other** in the classic treadmill.

**The floor and its schedule are published in advance and fully plannable.**

This one mechanic does five things:

**The floor is an attractor.** Above it returns dilute, so players leave; below it returns are linear and attractive, so players arrive. Each chain's hashrate therefore settles near its floor and oscillates around it. Chain popularity self-corrects rather than running away.

**The arbitrage becomes concrete.** The best place to be is a chain sitting *just under* its floor. "Find the underserved chain" stops being asserted and starts being a computable question.

**Newcomers get clean linear progression**, because they will be on thin chains that sit below their floors. Whales get the treadmill, because they are on the popular chains that have crossed over.

**Plannability becomes a gradient that maps onto risk.** Below the floor, returns are deterministic — buy a rig on day 100 and you can compute what it earns on day 400. Above it, returns depend on what other people do. So thin, uncrowded chains are predictable and popular chains are uncertain, which lines up exactly with the thin-book / deep-book gradient in §6. Two systems telling the player the same thing about where risk lives.

**Crossing the floor is a visible event.** "Ferro has crossed its floor" is something the playerbase notices and reacts to — the moment a chain stops being free money.

*Rejected alternatives:* pure player-driven difficulty caps aggregate player income no matter what anyone invests, so collective investment is futile, margins grind to zero every season by construction, and margins are already squeezed from day one. A pure published schedule removes crowding entirely and reduces chain choice to the risk ladder alone.

### The simulated network

**A hundred other miners share the chains with you on day one, and thousands do by month four.** Each is a person with a farm, not a share of a chain's hashrate: they start at a card or two, pay a power bill, sell coin, and build from there.

They **choose chains by rate and crowding, and pools by fee**, a few reconsidering each hour so the network moves without stampeding. Crucially, they are **who your pool's members actually are** — founding a pool and undercutting a rival is how you take them.

**The population is the clock.** A chain's hashrate is what the miners who have turned up have actually built, so every chain opens as fresh territory far below its floor and fills as the network matures — Obelisk in gigahashes at t=0, not the 1.32 TH it used to be handed. `SIM_RATIO` is where a chain **ends up** once everybody has arrived, not where it starts. Newcomers arrive on a logistic curve and land on the chain furthest below the seats its size supports, which converges the split on the chains' floor weights: at the soft cap that puts about one small farm on every seat of every chain. §6o has the detail and what it replaced.

Tessera has no simulated miners at all — it stays a refuge below its floor where a newcomer gets linear returns.

**One consequence worth naming.** Network growth erodes everyone's rate, and with no seasons there is no reset. The counters are: mine Tessera, grow faster than the network, or **run a pool** — fee income scales *with* the network rather than against it, which makes pool operation the natural hedge against the treadmill.

Above the floor, network hashrate is the sum of **all miners' installed, powered-on rigs**. Nothing simulated takes a cut of issuance. Players earn 100% of what the chains emit.

Note the consequence: below the floor, issuance **scales with population**, so supply grows as the game grows. §6's requirement that baseline demand scale with player count is therefore load-bearing, not optional.

### Offline behaviour

Rigs run **24/7 at full rate**, logged in or not. Power bills accrue offline at the same rate. Network hashrate tracks *installed capacity*, not who is awake, so difficulty does not crater at 4am and there is no timezone warfare.

**Abandoned farms self-terminate.** A quitter mines until their cash reaches zero, the supply is cut, and their hashrate leaves. No inactivity timer — the power bill does the work.

### Sharding

A **fixed set of 4–5 coins per season**, all live from the first minute. No mid-season launches.

### No seasons

**The run is continuous and nothing ever resets.** Seasons, the wipe, and the prestige economy built on top of them are all removed.

That closes four problems at once. The twenty-day wind-down disappears with the boundary that caused it. The short cash-bound phase stops mattering without a clock to measure it against. The *zero terminal value deflates backward* principle — which forced both the coin and parts markets to price in a deadline — no longer applies to anything. And the absence of scheduled events is answered instead by ongoing pressures: pool competition, wear, and a power supply that varies through the day.

**What it costs.** Seasons and prestige were the only things bounding a long-running player. Without them an early account compounds indefinitely. That is fine for a single-player tycoon and would not be with a shared leaderboard — **this is no longer an MMO**, and §11 should be read as unbuilt rather than pending.

### Clock

**Real time, 1:1. One real minute is one game minute.** There is no compression and no calendar fiction: a day is a day, and every duration in the design — block times, build times, wear, paybacks — is measured in the same unit the player experiences.

Earlier drafts ran at 24× with a "dates are sim, durations are real" rule to keep the two straight. That rule is gone, along with the confusion it managed.

**The season length is a consequence.** At 1:1 a payback has to fit inside a season, and with a tariff that keeps power a meaningful share of revenue the efficient cards need 23–31 days to earn out. A thirty-day season made them literally unbuyable — the A5000 needed 102% of a season — which would have deleted the power-bound endgame the whole card ladder exists for. Ninety days puts it at 34%, and a quarterly cycle suits a mining operation anyway.

**The cost is a longer quiet tail.** See §7 and thread 23.

**Global scheduled events run on server real time**, so the season boundary falls at the same wall-clock instant for everybody. It is now the only scheduled event in the game.

---

## 2a. The chain ladder (v40)

**The problem.** Every chain except Tessera sat at 1.4–2.4 TH — a **4,726× cliff** from Tessera's 500 MH floor to Ferro, with nothing in between. A 60-rig warehouse farm still owned 1.4% of the *smallest* real chain. Tessera was not the first rung of a ladder; it was the only rung, and everything else was a wall. Compounding it, the simulated network grew 0.6%/day — **8.9× a year** — so a farm that stood still lost half its share every five weeks.

**The fix is structural.** Each chain's network is now **twice its own floor**, and the floors are geometric, so the rungs sit roughly 7× apart. Rewards were recomputed as `reward = PAY × mult × floor × target / 86400` — prices and book depths untouched, since coin flow falls exactly as fast as player share rises, leaving slippage economics intact. Growth dropped to **0.25%/day (2.5× a year)**.

| Chain | Floor | Network | revPerMh | vs PAY |
|---|---|---|---|---|
| Tessera | 500 MH | — | 0.2074 | ×0.99 |
| Ferro | 6 GH | 12 GH | 0.1050 | ×0.50 |
| Halcyon | 45 GH | 90 GH | 0.1628 | **×0.78** |
| Nova | 320 GH | 640 GH | 0.0945 | ×0.45 |
| Obelisk | 2.2 TH | 4.4 TH | 0.1208 | ×0.58 |

Setting networks to `2 × floor` rather than `2 × mult × floor` matters: the latter is the exact migration equilibrium, but it **cancels the mults out**, flattening every chain to the same rate and erasing Halcyon's +55% and Nova's −10%. Personality is worth more than a perfectly still ecology.

**The real measure of participation is solo block cadence**, not rate — and that is now a ladder:

| Farm | Tessera | Ferro | Halcyon | Nova | Obelisk |
|---|---|---|---|---|---|
| 1 rig | 2 min | **55 min** | 20.5 h | 4 d | 278 d |
| garage | — | 2 min | **42 min** | 3.2 h | 9 d |
| warehouse | — | 1 min | 14 min | **58 min** | 3 d |
| 60 rigs | — | — | 6 min | 20 min | **22 h** |

Verified over 667 game-hours: one starter rig soloing Ferro found 895 blocks, one every 45 minutes against a predicted 55. **A single first rig is now a real participant on the second chain**, which was the whole complaint.

**Two pre-existing flaws surfaced only once chains differed in size:**

- **An emptied chain could never recover.** No hashrate means no blocks, no blocks means `obs` never updates, so difficulty stays high forever and nobody can profitably return. Ferro and Halcyon died permanently within 30 days of the first rebalance attempt. Difficulty now relaxes toward the floor when a chain is idle, and an emergency retarget fires when a chain runs 4× past its block time — which is what real networks do.
- **Whales flattened small chains.** Migration followed rate alone, so one Obelisk miner (200 GH) landing on Ferro (12 GH) erased the rung. Miners now refuse to move somewhere they would exceed 25% of the network: crashing your own return is not rational.

With both fixed, a full game-year keeps the ladder in order, Ferro grows 2.04×, and **a newcomer joining on day 365 can still solo Ferro every 1.9 hours.** Old saves are migrated onto the new ladder rather than stranded: floors, rewards and sim networks rescale in place, preserving relative miner sizes and elapsed growth.

## 2. Chain

### The coin set

4–5 coins differentiated on **all three axes**: algorithm, block time and reward, and price behaviour. Plus, from §1, a **floor** — and from prototype 4, a **revenue multiplier** that makes chain choice a risk ladder rather than a wash.

| Coin | Block time | Pays per MH | Depth | Role |
|---|---|---|---|---|
| **Nova (NVA)** | 60s | 0.90× | Deep | Blue chip. Calm, crowded, the lowest rate. Safe at scale. |
| **Ferro (FRO)** | Memory-hard, GPU-only | 30s | 1.00× | Medium | The newcomer's home. Cards at full rate. |
| **Obelisk (OBL)** | 10 min | 1.15× | Deep | Enormous reward, long wait. Pays to carry the variance. |
| **Halcyon (HAL)** | Mixed | 90s | 1.55× | Thin, slow recovery | Pays most. Violent price, punishing exit. Cards get 70%. |

What a player earns is the chain's **multiplier**, full stop — every chain runs on cards. Halcyon pays the most and carries the worst risk, Ferro is the safe baseline, Nova pays least and absorbs the most, Obelisk pays a premium for a ten-minute wait.

Block time is a **second, independent variance dial** on top of the pool-scheme choice.

### No halving

**There is no scheduled reward cut.** Rewards are flat for the whole season.

The halving previously carried the cheap-versus-efficient tension: bargain cards paid well until day 15 and became liabilities after. That job turns out to be done by the **power ceiling** instead, and done better.

When cash is the constraint, ranking by payback puts the cheap used cards on top — GTX-1660S at 43 days, RX-580 at 46, RX-470 at 54. When watts are the constraint, ranking by net dollars per watt inverts almost exactly — A4000 first, then the 3070, then the 3090. Same catalogue, opposite answer, and *which question applies depends on whether you have spare watts or spare cash.*

So the strategic flip still happens. It just happens when a player **fills their room** rather than when a clock fires, which makes it personal, always true, and computable from state rather than announced.

What is lost is the **shared spectacle** — a single moment the whole playerbase experiences together — and the three-act season shape. Those were social and aesthetic rather than mechanical. **Worth watching in playtesting:** with no halving, no hardware failures and no notifications, the game now contains no scheduled drama whatsoever. That is either serene or flat, and only play will say which.

### Transaction fees

**Dynamic, rising with network congestion.** A secondary income stream worth reading, and proportionally more significant on the low-reward chains.

### Orphan blocks

**Modelled.** Rate scales inversely with block time — Ferro at 30-second blocks bleeds 2–3% of everything mined; Obelisk loses almost nothing. A **hidden tax on the friendly-looking coin.** Connection quality reduces it.

### Automated shutdown policy

**Simple threshold by default** — "switch off anything earning under $X/day" — with conditional rule tiers unlocked through progression. Server-enforced while offline. Extended with **auto-sell rules** (§6) and **bulk part replacement** (§3).

Load-bearing because rigs run 24/7 and cards wear continuously. A rig can slide into losing money over hours without anything announcing it, and with no notifications (§12) nothing will tell you. The policy is what makes absence safe.

---

## 3. Rigs — parts, building, wear, tuning

Rigs are **built from parts**, not bought assembled. This is what makes MH/W — the number the second act turns on — something the player *engineers*.

### Two build types, one shape

Both reduce to **chassis + N compute units + power supply**.

**There are no ASICs.** Every rig is a graphics-card build, and every chain is mined by cards at full rate. The algorithm dimension went with them — it existed only to make hashboards exclusive, and without it Nova and Obelisk would have been dead chains where cards earned 10%.

Chains still differ four ways without it: **pay rate, block time, book depth and price volatility**, on top of each one's floor. That is enough.

**Six part types**, each with a job the player can state in one line:

| Part | Its job | Second axis |
|---|---|---|
| **Frame** | how many cards fit, and how hot they run | **airflow**, which divides the rig's heat |
| **Motherboard** | how many cards the system can *address* | **idle watts**, pure overhead |
| **Cooling** | trades watts for card life | divides heat further, costs power that mines nothing |
| **Power supply** | watts and connectors | efficiency (deliberately minor) |
| **Cards** | the hashrate | MH/W against $/MH |
| **Risers** | one per card, flat cost, no decision | — |

CPU, RAM and boot drive are deliberately excluded — fixed costs with no interesting variation.

### Frame versus motherboard

This confused players twice, and distinct second axes were not enough on their own. Two parts capping the same number will always read as one part split in half unless the interface **says which one is currently binding**.

So each part now states its job in the row itself — *the frame holds the cards and decides how well they breathe*, *the board drives the cards and burns power doing nothing* — and the build screen carries a permanent line beside the quantity control:

> **Limit 6, set by the motherboard** — frame fits 12, board drives 6

**Every option in both pickers is annotated with what it would do to that limit**: *raises your limit to 8*, *drops your limit to 4*, or *limit stays 6 (the board caps you)*. So the consequence of a choice is visible before it is made, not discovered afterwards through an error message.

The stepper is also clamped to the limit, so you cannot silently build an invalid configuration and then be told off for it.

The underlying rule stands: **cards fit in the frame but have to be addressed by the board, and the smaller of the two is your real limit.** Board idle watts are pure overhead, which hurts most on a small rig — exactly when a cheap low-overhead board is the right call anyway.

The same trap applies to cooling, which now exists at two scopes (§4). Label parts by their job in the interface, not just their name.

### Compatibility

1. Units ≤ min(frame slots, motherboard PCIe slots)
2. Total watts ≤ PSU capacity × 0.85
3. PCIe connectors required ≤ connectors available

**The checker must be constructive, never a gate.** Not "invalid build" — always *"your eight cards need sixteen connectors, this supply has six; the 1600W Platinum would fit."* The skill is choosing between **valid** builds. Discovering that part A doesn't connect to part B is trivia.

**PSU efficiency ratings are deliberately downplayed** — the real 82–96% spread is worth little across a season against a much pricier part. The PSU is a capacity gate with headroom rules that bite when overloaded.

### Building

Assembly takes **minutes — a small friction, not a throughput limit.** You cannot instantly convert cash into hashrate, but you are not queued behind your own logistics either.

*Consequence:* build capacity is **no longer a prestige axis** (§8) and there is no build-slot ladder. Both only existed as throughput brakes, and a five-minute build needs no brake.

### Blueprints

Save a build; rebuild with one tap and a parts list the game assembles. **Essential** — solving the same compatibility puzzle for a fourteenth rig is data entry.

**Private, and they persist across seasons** — stored knowledge, so they survive the wipe alongside tokens. *Tradeoff:* private blueprints move sharing to Discord and make players re-enter builds by hand.

### Wear — and nothing else

**Parts wear. Nothing fails suddenly.** No riser failures, no cards dying mid-season, no catastrophic PSU events.

The game already carries variance in block discovery and in the market; hardware bad luck was a third source of randomness doing no new work. Removing it means:

- Maintenance is **purely scheduled** — replace units when wear crosses a line, which is a bulk action and an automation rule rather than a fire drill.
- **Cooling's job changes.** It no longer prevents failures; it controls the *wear rate*, which controls replacement cost and resale value. Still a real investment, on a slower clock.
- The §4 rule "you eat the downtime" is **deleted** — the situation no longer exists.
- **Nothing urgent ever happens while you're away at all**, which is consistent with automation-first design and reduces §12 to almost nothing.

**Decay must be asymptotic.** Wear raises draw, more watts means more heat, higher temperature accelerates wear. Bound it: hashrate falls toward ~60% of original, draw rises toward ~150%, approaching rather than passing.

Parts wear individually and are individually swappable, so a rig **degrades gracefully**. The refurbishment ceiling ratchets per part: 95%, then 88%, then 80%.

**Risers are a flat per-card cost with no decision in them.** They were originally justified as the authentic failure point; with failures removed they are simply a consumable. Kept because per-card cost makes adding cards slightly superlinear, which quietly favours fewer, bigger cards.

### Big rigs — the supply ceiling (v46)

Frames and boards already reached sixteen slots, but nothing could feed them. Twelve RTX A5000s need **36 PCIe connectors and 3.81 kW of core draw** — 4.5 kW usable after the 85% headroom rule — against a top supply of 3000 W with 16 connectors. The rig was unbuildable for want of a power supply, and the checker said so without a fix existing.

Two **server shelves** now sit above the desktop range, which is what real twelve-card rigs use — server PSUs on a breakout board rather than an ATX unit:

| Supply | Watts | Connectors | Efficiency | Price |
|---|---|---|---|---|
| 4000W Titanium | 4,000 | 22 | 96.0% | $560 |
| 5.6 kW server shelf | 5,600 | 40 | 96.5% | $790 |
| 7.5 kW server shelf | 7,500 | 52 | 97.0% | $1,060 |

The ladder stays monotone — price always buys more watts, more connectors and better efficiency. A twelve-card A5000 rig now builds: **1.58 GH/s at 3.95 kW wall**, on a $790 supply.

**They were also invisible (fixed v52).** The Build tab's picker and the checker's "would carry it" suggestions both read the *static* `PSUS` array rather than the live catalogue, so every generation supply existed, was priced, was reachable by the rebuild planner — and never appeared in the one place you go to choose a supply. Both now read the live list. This is the same shape as the generation-catalogue bug in §13d: a live collection with a static twin, where only one of them is wired up.

**A live catalogue has to be read live (v52).** Generation shelves were being created correctly but never appeared on the Build tab, because the picker read the module-level `PSUS` table rather than the live list — the same mistake in two more places, where the checker's *"which supply would carry it"* advice also searched the static table and would have said nothing was big enough while a generation shelf sat in the catalogue. Both now read the live list. The lesson generalises: anything that grows at runtime has exactly one authoritative array, and every reader must go through it.

**And the ladder cannot dead-end.** Card draw grows about 6% per generation forever, so a fixed supply range would quietly make big rigs unbuildable again within a year. Each generation now also lands a matching server shelf scaled by the same 1.06, with four more connectors. Verified out to generation 10: a Basalt 829 draws 509 W, twelve need 6.30 kW core, and the top shelf of that generation is 13.4 kW at 92 connectors — still fitting, with the connector budget pulling ahead so card connector counts can rise later without stranding anything.

### Retrofit is a rebuild — planned, confirmed, and paid for in downtime

A retrofit is no longer an instant tap. **It is a rebuild**: open the planner from a rig's panel, stage any set of changes — every slot swappable, card count up or down — and confirm one combined bill. On confirm the rig **goes down for the assembly time** (`BUILD_BASE × (0.5 + 0.1·n)` — a little quicker than a fresh build, since it is already wired), earning nothing until it comes back. The instant swaps this replaces made retrofitting strictly free of the cost that makes it a decision; batching means five changes cost one outage instead of five.

The planner is the build screen pointed at an existing rig: the same five pickers, the same live checker with the reason on every cross, a diff summary (hashrate →, wall →, downtime, net cost), and a **CHANGED** tag on every staged slot. Going down forfeits a PPLNS window, and the planner warns with the exact amount before you commit.

Credits are unchanged — half price back, cards at half *remaining* value, and **reducing the count trades the worst-worn cards first** (verified: cutting 8→5 kept wears 0.02/0.05/0.10/0.20/0.40). Measured end-to-end: a bedroom starter staged to f8+m8+p3000 with 8× RTX-3070 cost $1,809 net, went dark for 28.6 real minutes — pending forfeited, hashrate zero — and came back at 560 MH/s, announced in the feed.

**Fleet refit inherits all of it**: every eligible rig goes down for its own rebuild, so refitting the whole farm is a rolling outage you schedule, not a free click. Mid-rebuild saves resume correctly; the planner itself never persists.

### The rig is the unit of configuration

Each rig carries **build, tuning profile, chain, and pool.**

**Tuning is per-rig.** Hashrate moves with the slider; power moves nearly twice as fast, and heat with it. Overclocking pays while watts are free and cash is short; undervolting pays once the ceiling binds. The same inversion as the card catalogue, on a slider.

**Pool and solo choice is per-GROUP (§5b).** The quiet win of the layer survives the grouping: **different variance profiles inside one farm** — one group on PPS to cover the power bill, another solo for the upside — are now deliberate, one group per strategy, instead of an accident of per-rig clicking.

Assignment lives on the group, so eight rigs is a handful of group settings plus hardware; fleet actions cover the rest.

---

## 3b. Hardware generations — the treadmill answer

**Every fourteen real days a new card generation lands**, permanently: ~22% more hashrate and **~15% better MH/W** than the generation before, at a matching price, announced in the feed and by toast. The catalogue is deterministic from the clock, so a loaded save regrows it exactly — including cards a rig already holds.

The arithmetic against the treadmill: the simulated network grows ~8.7% per fortnight, a generation improves your ceiling ~15% per fortnight, so **a player who refits keeps a ~6% edge per cycle** — and refit, already the longest phase of a run, becomes the forever-loop. Generation names walk a series (Axion, Vireo, Kestrel…), and the Stats screen shows which generation is current. The catalogue re-sorts by price on every extension, and the interleaved ladder stays strictly monotone — verified through generation 3 — so *more expensive is always better* survives across generations, not just within the base set.

## 4. Sites — built, not chosen

**There are no facility tiers.** You start in a spare bedroom on a 1.5 kW domestic outlet, and everything past it you construct: a **shell** for floor space, then **power** and **cooling** installed piece by piece. Capacity is whatever you have paid to install, with no cap. You may run several sites.

### Power

Each source has a peak output, a running rate, a capital cost and a build time.

| Kind | Character |
|---|---|
| **Grid service** | Reliable and metered. Larger services cost less per kWh, so scale buys a better rate. |
| **Diesel generator** | Reliable, fast to install, and by far the most expensive fuel. A stopgap. |
| **Solar** | No running cost, and output **follows the actual clock** — full at midday, nothing at night. |
| **Wind** | No running cost, output wanders stochastically. |

**Sources are dispatched in merit order, cheapest first**, so free solar and wind are consumed before metered grid and before diesel. Your effective cost per kWh is therefore a *blend* that changes through the day, and building renewables lowers it rather than adding to it.

**Capacity falls at night.** If you have overbuilt on panels, demand exceeds supply after dark and rigs are **shed automatically**, worst-earning first, with the count surfaced on the dashboard. That is the central engineering tension of the system: cheap daytime power against a supply you cannot rely on.

### Fleet actions (v50)

Fleet was two buttons that silently acted on every rig you owned. It now opens by default and every action carries a **scope** — this site, or all of them — stated in the button before it spends anything: *"Repair 8 worn cards across 2 rigs · $384"* versus *"32 cards across 5 rigs · $2,904"*. The toggle only appears once you have more than one site.

**Bulk group move** joins repair and refit: point every rig in scope at a chosen group, with the count and hashrate on the button. Safe by construction — reassigning a rig never forfeits, because the payout window belongs to the group and not the machine (§5b), and the hint says so. Verified: moving one site's rigs left the other site's untouched, and moving a whole farm back into a group with 5 coins pending kept all five.

**Refit stays all-at-once**, by choice. Every eligible rig goes down together and the farm goes dark for the rebuild — fastest, and the button says so rather than pretending otherwise. Scope contains the damage: refitting one site left the other running.

**No standing policies.** Auto-repair, auto-refit and peak-hour shutdown were all considered and declined — the levers stay manual, so improvements to a farm remain something a player does rather than something that happens to them.

### Fleet actions (v50)

Every fleet action now takes a **scope** — this site, or all sites — chosen with one toggle at the top of the card, and the collapsed header reports which is active: *"Garage · 5 rigs · 26 worn cards"*. Passing a site id narrows the operation; passing nothing means the whole business. Verified across two sites: repairing Site A left Site B's eight worn cards untouched, and refitting A took only A's three rigs down.

**Rebuild the fleet to one specification.** A card refit keeps whatever chassis each rig happens to have, so a farm that grew in stages stays mixed forever. This action rebuilds every rig in scope to one *full* spec — frame, board, cooling, supply, card and count — regardless of what is installed. The target is the Build tab's draft, so a rig is designed in one place and then stamped across the farm. The card quotes the whole job before you commit, counts what is already on spec, and names why anything is refused; it either does the entire job or none of it, so you cannot half-fund a rebuild.

Verified on a deliberately mixed farm — 2×RX-470 on a milk crate, 4×1660S, 6×5700XT, 8×3070 — normalised to 8×RTX-3080 on f8/m8/p5600 for $8,062: four identical 768 MH/s rigs, one distinct spec on the farm, and re-running the action reports all four already on spec.

**Bulk group moves.** Point every rig in scope at one mining group in a single action, with the button quoting what will move — *"Move 2 rigs (243 MH/s)"* — and saying so when there is nothing to do. This is safe to do to a whole farm at once precisely because assignment never forfeits anything: the PPLNS window belongs to the group, not the rig (§5b), and the card says that in a hint.

**No standing policies.** Auto-repair, auto-refit and auto-shutdown were all considered and deliberately rejected — the game's active-play reward (§6c) comes from making these calls yourself, and automating them would hollow out exactly the loop the tuning pass was built to reward.

**Fleet refit stays all-at-once**, and now warns before you commit: every eligible rig goes down for its own rebuild and the farm earns nothing until they return. Staggering was considered and rejected as a false kindness — it would hide the cost of the decision rather than making it legible.

The section defaults **open**, unlike the rest of the site page, because it is the one place you go to act rather than to read.

### Folding the site page (v49)

Adding the flow strips and the bill made a page that was already long into a very long one. Every section now folds behind a one-line summary — the pattern rigs and pools already use, so it is the third place in the app that behaves the same way.

What a collapsed site reads as, measured on a five-rig garage:

```
Power     28.57 kW available · 2 sources · $52.82/day
Battery   20.0 of 50 kWh · idle
Cooling   31°C · 2 units
Fleet     0 worn cards across 0 rigs
Rigs      5 · 2.80 GH/s
```

Each summary carries the number you would have opened the section to find, so the page answers most questions without being expanded at all. The dashboard — flow strips, firm capacity, today's bill by band — stays open at the top, because that is the thing you came to look at. **Rigs** defaults open since it is the primary content; everything else defaults closed. The per-source breakdown moved off the dashboard and behind the Power fold, where it was duplicating what the flow strip already showed in aggregate.

Status still escapes the fold when it matters: a **COOKING** tag sits on the collapsed cooling header, so a site cannot cook quietly just because its section is shut.

### Reading the site (v49)

The energy layer was fully simulated and almost entirely invisible: `sitePlan` had always computed where every watt came from and went, and two numbers of it reached the screen.

**Power flow strips.** Two stacked bars — what feeds the site, and what consumes it. Solar, battery and paid grid on one; rigs, cooling and battery charging on the other, with unserved power in red if it ever appears. It makes the day's story legible at a glance:

| Hour | From | To |
|---|---|---|
| Noon | solar 3.33 kW · grid 9.54 kW | rigs 11.43 kW · cooling 1.43 kW |
| 19:00 peak | **battery 12.87 kW · grid 0** | rigs 11.43 kW · cooling 1.43 kW |
| 02:00 off-peak | grid 12.87 kW | rigs 11.43 kW · cooling 1.43 kW · **charging 11.13 kW** |

That is the battery paying for itself, visible for the first time — buying cheap at 2 a.m. and carrying the whole peak hour.

**A bill attributed as it is charged**, not reconstructed afterwards. Every tick adds its cost to the tariff band it actually fell in, splits out cooling's share by draw, and records what the free sources saved at the prevailing grid rate. Today's totals sit under the flow strips. Measured across a twelve-hour window: off-peak $18.86, shoulder $19.31, peak $0.00, cooling 11% of the bill. It resets at midnight, which is what "today" means.

**A compact rig grid.** Above three rigs the site offers a dense tile view — each rig a card with hashrate, a wear bar and a state word, tinted by status (running, wearing, worn out, shed, no cash, building) — plus sorting by name, wear or output. Tapping a tile opens that rig's full panel. At twenty rigs the list was a long scroll; the grid makes a large farm scannable.

### Small renewables — the entry rung (v37)

The cheapest renewable used to be a \$7,800 array, so a bedroom player could never touch one. Four small options now sit below the existing kit, and they are **genuinely bad**, not merely small — each carries a `yield` factor, the fraction of nameplate it actually delivers:

| Source | Nameplate | Yield | Real | Price | Real \$/W |
|---|---|---|---|---|---|
| Rooftop panel set | 1.2 kW | 70% | 840 W | \$1,400 | **1.67** |
| 3 kW panel array | 3 kW | 85% | 2.55 kW | \$3,300 | 1.29 |
| 8 kW solar array | 8 kW | 100% | 8 kW | \$7,800 | 0.97 |
| 30 kW solar farm | 30 kW | 100% | 30 kW | \$26,000 | 0.87 |
| Rooftop turbine | 1 kW | 45% | 450 W | \$1,900 | **4.22** |
| 4 kW turbine | 4 kW | 70% | 2.8 kW | \$5,400 | 1.93 |
| 15 kW wind turbine | 15 kW | 100% | 15 kW | \$17,500 | 1.17 |
| 60 kW wind turbine | 60 kW | 100% | 60 kW | \$62,000 | 1.03 |

The derate is real physics, not a tax: budget panels with no tracking on a poor roof, and micro-turbines sitting in turbulent air near the ground — small wind is genuinely dreadful, which is why the rooftop turbine is the worst \$/W in the game. **Effective cost per watt still improves monotonically with price within each kind**, so the catalogue rule holds: paying more always buys better. The picker states it plainly — *"840 W real — 1.20 kW nameplate at 70% yield"* — with real \$/W as the sub-value, so the ladder is legible rather than a trap.

Measured: a bedroom rig on the domestic outlet pays \$9.54/day; adding the \$1,400 panel set drops it to \$6.58/day, a **473-day payback** — slow, which is correct for the worst rung, but reachable in the first week instead of never.

**Solar and wind are not redundant at this tier.** Over 24 hours at cloud 0.2 / wind 0.8, the \$1,400 panels make 5.4 kWh entirely in daylight while the \$1,900 turbine makes 8.6 kWh round the clock. The turbine is worse per dollar and unreliable (wind wanders), but it produces at night — exactly the brownout hours when a solar-only site sheds rigs, and the only renewable that can charge a battery after dark.

### Time-of-use tariff

Grid rates are no longer flat. Every grid service is multiplied by the band of the hour — **off-peak ×0.70 (23:00–07:00), shoulder ×1.00, peak ×1.55 (17:00–21:00)** — so a domestic outlet runs $0.44 / $0.63 / $0.98 per kWh across a day. The header shows the current band, and the bill accrues at the live rate, so a farm's cost genuinely breathes with the clock. Peak sits just after solar dies, which is the squeeze the whole energy layer now revolves around.

### Batteries

Three sizes (8 kWh / 50 / 350). A battery does three jobs at once: **soaks free solar surplus** that would be wasted, **buys off-peak grid to spend at peak** (a toggle), and **counts toward capacity while charged**, carrying a renewable site through the night that would otherwise shed. Round-trip losses ~10%. Discharge defaults to peak-only, with a toggle to cover any deficit.

**A measured finding worth keeping:** battery value is gated by *night headroom and solar surplus*, not by battery size. A 24 kW farm on a 24 kW service has only ~3 kW of spare night capacity to charge from, so a container battery there saves $16/day, not the $33 naive arbitrage suggests. Right-sized batteries pay in ~150–300 days; oversized ones idle. That constraint is real engineering and stays.

### Power accounting — three parallel calculations, all wrong (v38–v39)

A site could sit at **1.52 kW drawn against 1.50 kW available with nothing happening**. It was not one bug but a family, and they share a single cause: **four places computed "what will this draw?" independently, and three of them drifted from the real function.**

**1. The battery counted capacity it did not have (v38).** `battAvail()` credited a battery's full kW rating whenever it held more than 0.01 kWh — a cell with one minute of runtime counted as 3 kW — and credited it even when the discharge policy refused to dispatch it. Fixed with `battFirm(f) = min(kW rating, stored kWh / 0.25 h)`, the same function the dispatch, the brownout and the restore now all use. Dispatch also split into **emergency** discharge (always covers a genuine shortfall — the preference is about saving money, not refusing to keep the lights on) and **economic** discharge (shaves expensive bands).

**2. The restore check forgot tuning (v39).** The brownout's dawn-restore recomputed wall watts by hand and omitted the `×(1+1.9τ)` tune multiplier, so a rig tuned +15% looked ~28% lighter than it was: restored, immediately re-shed, and **flapping forever** while the site sat permanently over capacity. It now flips the rig on and asks `siteDemand` — the real function — then decides.

**3. Nothing accounted for cooling (v39).** The build checker added a new rig's wall watts but not the extra *cooling* its heat would demand. With AC at 42% PUE that is a large omission: you could build to exactly capacity and be over it the moment the rig went live. `sitePlantW(f, extraHeat)` now answers "what would cooling cost with this much more heat?", and the build checker, the rebuild checker and the restore all include the delta. The build screen states it: *"Power at Spare bedroom: 2.78 kW of 2.25 kW available (incl. 201 W more cooling)."*

The consequence of all three was the same and worse than a display error: `sitePlan` silently left the excess **unserved — rigs running on power from nowhere, billed to nobody.**

**Verified by exhaustive sweep: 320 configurations** — every combination of source mix, cooling plant, tune setting and battery — run 50 game-days each. **Zero persistent over-capacity states, zero unserved watts**, with 376 shed events across the sweep confirming brownouts still fire when they should.

**A second parser trap (v51).** `{{ a < b }}` in a template is read as an opening tag `<b...>` by the HTML parser Vue compiles with — the same family as the `<option>` rule from §13b. The structural audit caught it as an unbalanced element with a nonsense tag name. Comparisons in templates are written the other way round (`b > a`), and the audit now scans every interpolation for `<` followed by a letter.

**The rule this earns:** *never recompute a physical quantity a function already owns.* Where a hypothetical is needed, either flip the state and measure with the real function, or give that function a parameter for the hypothetical. Every one of these bugs was a copy that fell behind its original.

### Reading the site (v49)

Three additions, all fed by the same `sitePlan` dispatch that charges the money — no parallel estimates.

**Power flow strip.** Two stacked bars: where the watts come from (renewable, battery, paid grid, and unserved if it ever appears) and where they go (rigs, cooling, charging). The energy layer was the most-modelled part of the game and the least legible; now a day reads as a story:

| Hour | From | To |
|---|---|---|
| 03:00 off-peak | paid 8.50 kW | rigs 7.62, cooling 0.88, **charging 14.00** |
| 12:00 solar | **renew 3.11**, paid 5.38 | rigs 7.62, cooling 0.88 |
| 19:00 peak | **battery 8.50, paid 0** | rigs 7.62, cooling 0.88 |
| 23:00 night | paid 8.50 | rigs 7.62, charging 14.00 |

**Cost breakdown, booked per site.** The bill is split live by tariff band and by cause, with a finished day kept for comparison. The same farm above: off-peak \$21.24, shoulder \$16.10, **peak \$0.00** — the battery's value stated as a number rather than implied — plus cooling's share (\$3.85) and what the renewables spared (\$15.25).

**Compact rig grid.** Above three rigs a grid/list toggle appears. Tiles carry the rig number, current output or build countdown, a wear bar, and a status stripe — running, worn, stopped, building — sortable by order, output, wear or stopped-first. Tapping a tile opens that rig's full card; in grid mode the unopened cards stay collapsed, so a twenty-rig farm is one screen instead of a scroll.

### Firm capacity — the battery bug (v38)

A site could show **1.52 kW drawn against 1.50 kW available with nothing happening**. Three faults compounded, and the root was one: *the capacity check and the actual dispatch used different logic.*

- `battAvail()` credited a battery's **full kW rating** whenever it held more than 0.01 kWh. A cell with 0.05 kWh — about a minute of runtime — counted as 3 kW of firm capacity.
- It credited that power even when the discharge policy (peak-only by default) **refused to dispatch it**, so the capacity was imaginary in both size and availability.
- With the brownout check satisfied by capacity that did not exist, nothing shed — and `sitePlan` silently left the excess **unserved: 223 W of rigs running on power from nowhere, billed to nobody.**

The fix is one shared function. `battFirm(f) = min(kW rating, stored kWh / 0.25 h)` — what the battery can actually hold up for a quarter of an hour — used by the dispatch *and* the brownout *and* the restore check, so they cannot drift apart again.

Dispatch is now two-stage and the distinction matters: **emergency discharge always happens** when paid sources cannot cover the load, regardless of the peak-shaving preference — that preference is about saving money, not about refusing to keep the lights on. **Economic discharge** then spends what remains to dodge expensive bands. This preserves the v27 intent that a battery carries a renewable site through the night.

Verified — nearly-empty battery: 200 W firm, site sheds, bill charged. Full battery on peak-only policy: 223 W emergency cover, nothing sheds. Discharge-anytime: battery carries the whole load, bill $0.00. Thirty days of grid+solar+battery+wear: **zero unserved watts**. And a solar site at nightfall degrades gracefully — battery firm falls 3.00 kW → 881 W → 620 W as it empties, shedding one rig at a time rather than collapsing.

The site header now states it: *"Battery adds 881 W of firm capacity right now — 8.28 kW usable."*

### Weather

Drawn daily with a one-day forecast. Cloud cover scales solar (down to 25% on the worst day) and cools the afternoon peak; the day's wind level sets what each turbine wanders around. A cloudy chip appears in the header when it matters.

### Construction

Everything takes real hours — ten for a 30A service, two hundred for a large turbine. Jobs show a progress bar, and **cash accelerates them** at a fixed rate per hour. Construction is the main sink for large balances and the reason a big site is a commitment rather than a purchase.

### Cooling, and why heat has weight

An earlier build gave cooling plants a **flat wattage**, which made heat a $700 problem solved once and never revisited. Worse, it scaled backwards: an immersion loop cost 213% of a bedroom farm's load and 13% of a large one's.

**Cooling now draws a fraction of the heat it removes.** Each plant has a PUE overhead, heat is dispatched **cheapest-PUE-first** exactly as power is, and the running cost therefore scales with the farm. That gives cooling the same shape as the card ladder — cheap to buy means expensive to run:

| Plant | Capacity | Overhead | Cost | On a 24 kW farm |
|---|---|---|---|---|
| Extractor fans | 6 kW | 8% | $700 | hopeless — 173°C, throttled to half |
| Air conditioning | 20 kW | 42% | $5,500 | 72°C, wear ×2.3, **35% of the power bill** |
| Evaporative | 34 kW | 20% | $14,000 | 54°C, clean, 18% overhead |
| Immersion loop | 90 kW | 5% | $22,000 | 38°C, clean, 5% overhead |

**Heat also hurts immediately, not only through slow wear.** Above 70°C cards **throttle**, losing up to half their hashrate by 100°C. Wear still compounds on top — 1.3× at 65°C, 2.0× at 70°C, 3.3× at 76°C.

**And ambient temperature follows the clock**, peaking around 14:00 — a few hours after solar does. So the room is hottest shortly *after* your power is cheapest, and a bedroom at full load swings from 32°C overnight to 44°C mid-afternoon. Heat gains a daily rhythm that couples to the generation cycle rather than sitting as a constant.

**Cooling exists at two scopes** and must be labelled as such:

- **The site** is how much heat the room can shed.
- **A rig's cooler** is how efficiently heat leaves that rig and enters the room.

They multiply rather than duplicate.

## 5. Pools and payout schemes

| Scheme | Fee | EV vs solo | Variance |
|---|---|---|---|
| Solo | 0% | 100.0% | Extreme |
| PPLNS | 1.0% | 99.0% | Low — holds a forfeitable balance |
| PPS | 4.0% | 90.6% | None |

**PROP and FPPS were cut** — unreachable once only PPS and PPLNS could be created.

PPS pays on the block reward only. **Assignment is per mining group (§5b)**, so one farm holds several schemes by running several groups.

**PPLNS holds a rolling window balance — roughly one block's share — forfeited if the rig switches scheme, switches chain, or powers down.** PROP settles every round in full and costs 0.5% more for the freedom to leave whenever you like.

This is not decoration. Without it, PPLNS and PROP behave identically for a steady miner, which made **PROP strictly dominated** — same payouts, higher fee — turning one of five schemes into a trap for anyone who didn't read carefully. The forfeit is the entire reason PPLNS is cheaper, and it should not be removed without also removing PROP.

It interacts well with the chain risk ladder: a block share on a slow high-reward chain is large and on a fast low-reward chain is small, so **PPLNS's commitment cost scales with the variance the player already chose.**

### Two permanent pools, plus any you found

**Every chain carries a PPS pool at 4% and a PPLNS pool at 1%, permanently.** They never close, so a player is never stranded. Everything else is founded by players.

**Founding requires a bond**, sized as a multiple of one block's value — 20× for PPLNS, 200× for PPS. That produces a real ladder: a Tessera PPLNS pool costs **$73**, a Ferro PPS pool **$16,480**, an Obelisk PPS pool **$454,000**.

**Exactly one participant finds each block.** One Poisson draw per chain, then a single winner chosen by hashrate share. Earlier builds sampled each pool independently *and* the player separately, which allowed several finders in the same instant — wrong, and it inflated income. Verified over 200,000 draws: block share matched hashrate share to a tenth of a percent, and every draw returned exactly one winner.

**A pool only gains funds when that pool finds a block.** Income is credited in the award step and nowhere else. A PPS operator's *liability* still accrues continuously — that is precisely the underwriting — but nothing is ever credited except on a block.

**Operators may withdraw anything above the opening bond.** Below it, the pool keeps running but should be topped up; at zero it cannot pay its miners and **closes automatically**, returning members to solo and costing the operator the remainder.

*Measured caveat:* that closure rule is correct but rarely fires. A PPS operator keeps the 6% transaction fees whatever fee they charge, so even a zero-fee pool has a structural edge. Twenty-five zero-fee Obelisk pools opened at the minimum bond produced **no failures**, with a worst dip of 12.9% and a median of 1.9%. Insolvency needs sustained early bad luck on a slow chain, not merely a thin margin.

**Members choose on price and solvency.** Attractiveness is `(1 − fee) × trust`, where trust is the ratio of your bond to its opening size, ramped over about two days so a new pool has to earn its reputation. Undercutting works — a PPLNS pool at 0.5% on Ferro drew 200,521 MH off the server pools, about a quarter of that chain's pool market.

### The two schemes are different businesses

**PPLNS earns your fee and nothing else**, with no exposure: members carry the variance.

**PPS earns your fee plus the transaction fees you keep** — roughly four times the margin — but you owe members expected value whether or not blocks land, and a dry spell comes out of the bond.

### The bond caps what you may underwrite

This had to be added after testing. A Ferro PPS pool grew its bond from $16,480 to $176,137 with no risk whatever, because at ~500 blocks a day the variance simply averages out — the bond was protecting against nothing.

**A PPS pool may therefore take on only as much hashrate as its bond covers**, at four days of member payouts. That is how insurance actually works, and it makes **capital rather than fee-cutting the growth lever**: adding $100,000 to a bond moved a pool from 38,745 MH to 162,544 MH.

**And the danger scales with how rarely the chain pays out**, which is emergent rather than tuned. On Obelisk, with ten-minute blocks, a $454,000 bond swings **28–59%** across a run. On Ferro the same structure barely moves. Underwriting a lottery is hazardous; underwriting a metronome is not.

If a bond reaches zero the pool fails, members are returned to solo, and the operator loses the lot.

### Pool risk

**Downtime and luck streaks. No fraud.** The server enforces the advertised scheme. Reputation is *published operating statistics*.

**Pool luck is genuinely random and mean-reverting**, so chasing "lucky" pools is a mistake. Players will do it anyway — a deliberate trap and the cheapest lesson in the game.

### Centralisation

**Soft, rising penalties as a pool's share of a chain grows.** No cliff at 51%. The penalty hits the **coin's price**, so members of an oversized pool are damaged by their own pool's success — individual incentive to leave, not merely collective. *Curve undecided.*

### Payouts

**No minimum thresholds.** Everyone paid every block. **Rejected shares from latency** — connection quality has two payoffs from one investment, fewer orphans solo and fewer rejects pooled.

---

## 5. The pool market (v44)

**There are no official pools.** Every pool on the network is somebody's business — rivals run by simulated operators, or whatever you open yourself. The permanent server pools that used to anchor each chain are gone, and with them the idea of a fixed backdrop to compete against.

**Capital caps hashrate, and the bond is priced off two separate rules — the tighter one binds.**

**Settlement float** is money you are holding on members' behalf, so it scales straight with the payouts you carry: PPS holds a full day of it, PPLNS 0.35 of a day (about a ninth), because PPLNS only holds the rolling window.

**Dry-spell cover** applies to PPS alone, and it is where block value finally enters the maths. A PPS operator owes members a flat rate whether or not blocks land, so the exposure is how far actual block income can fall short of expected — and that depends entirely on *how many blocks the pool expects in the window*. Income deviation is roughly `√N` blocks' worth, so the bond must hold `VAR_K · √N · blockValue`, and capacity therefore scales with the **square** of the bond.

The old flat rule — four days of payouts, block value nowhere in it — priced these identically:

| Chain | Block value | Pool blocks/day | Income swing vs liability |
|---|---|---|---|
| Ferro | $0.88 | 2,880 | **0.49%** |
| Obelisk | $7,379 | 0.39 | **42.3%** |

An 86× difference in real risk, charged the same. Under the new rule, underwriting 12 GH/s costs **$5,040 on Ferro** (float binds — it finds blocks constantly) and **$98,037 on Obelisk** (dry-spell cover binds — it can easily find none for a week while still owing everyone). Raise Ferro's block to $40 and the binding rule flips to dry-spell cover at $13,137 for a single GH/s.

Capacity from capital follows: on Ferro it is linear ($10k → 23.8 GH/s), on Obelisk quadratic ($10k → 125 MH/s, $100k → 12.5 GH/s, $1M → 1.25 TH/s) — a real economy of scale for anyone willing to underwrite rare, enormous blocks. The pool card names which rule is holding you back and shows the block value and expected blocks per day behind it. Rivals are capitalised under the same two rules, so a PPS operator on a rare-block chain arrives properly heavy rather than opening with capacity for nobody.

**Reputation is four things a miner can actually see**, and solvency gates the rest — a pool that cannot pay is not reputable however lucky it has been:

`rep = √solvency × (0.40 + 0.22·age + 0.22·luck + 0.16·fee stability)`

*Solvency* is bond against its high-water mark. *Age* ramps over a day. *Luck* saturates on blocks found, so a pool that has been finding blocks looks strong. *Fee stability* recovers over three days after any change — which makes undercutting a genuine trade rather than a free move: you gain on price and lose on reputation at the same moment. Measured: raising a mature pool's fee to 5% drops it from 1.00 to 0.84 instantly.

**The rivals are alive.** Each hour every operator looks at its own book: a pool below 6% share cuts its fee to win members back, a pool at capacity *raises* it and reinvests in bond because capacity is the scarce thing, and one that sits empty for three days folds — its members scattering to solo. New operators open when a chain drops below its complement. Over 58 measured days the field settled into a real spread of 0.3% to 9.0%, with only 4 of 100 miners left unpooled.

**The field** — one ranked table with you and every rival on the same axes: fee, reputation, members against capacity, blocks found, yours highlighted. It replaces two sections with different layouts, so "am I winning?" is a glance rather than mental arithmetic. Filters to your chains by default.

**A fee preview that quotes an honest price.** Dragging the fee slider does not change anything; it shows what that fee would settle at, with a confirm or cancel. The projection runs the *real* scoring function with the jitter softened to match how near-ties actually split — verified to converge exactly (predicted 464.82 GH/s, actual 464.82 after five days). Crucially it prices in the reputation hit of moving at all, which surfaces a genuine strategic insight: on a mature pool, cutting 2% → 1% *loses* members, because three days of damaged fee-stability outweighs the price cut. Leaving a working fee alone is often correct, and now the interface says so.

**An operator P&L.** Fee income per day, capital tied up in the bond, return on that capital, and payback in days — so running a pool can be compared against simply mining with the same money. A measured example: $893/day of fee income on $56,645 of capital, 576%/yr, paying for itself in 63 days.

**Members over seven days**, sampled four-hourly, as a sparkline with the net change — so a fee change has a visible consequence instead of a number you have to watch.

**One-tap capacity funding.** When capital is the binding constraint the card says what it is turning away — *"50.99 GH/s wants in but your capital will not carry it"* — and offers the exact top-up to take all of it.

**Operator cards collapse**, like rigs. Each of your pools shows a one-line header — scheme, chain, members against capacity, blocks found, reputation, fee and bond, plus a FULL tag when capacity binds — and expands to the whole operator book: capacity bar, fee slider, add and release capital, the rival comparison and the point-your-rigs buttons. The separate summary list that used to sit above them is gone; a collapsed card already says everything it did.

**Your side of it.** Founding still costs a bond and defaults to the chain your rigs are on; the pool card carries the capacity bar, the fee slider, add/release capital, and a button to point your own groups at it. The rival scoreboard expands to show any competitor's reputation broken into its four parts and the capital behind it — so "why are they beating me" always has an answer on screen.

Verified end to end: a 0.4% pool opened against three rivals held its members and reached full reputation in a week; adding $30,000 of bond lifted its ceiling from 146 MH/s to 204 GH/s and it pulled in 12.16 GH/s of members. Old saves migrate — the officials wind up, a rival field is seeded in their place, and anyone pointed at a defunct pool falls back to solo.

## 5a. How the pool business became playable (v41)

Founding a pool worked; *running* one did not, for four reasons that together made it look like the feature did not exist.

**The founding chain defaulted to Tessera — the one chain with no simulated miners at all.** A player's first pool was, by default, opened somewhere nobody could ever join. It now defaults to the chain your rigs are actually on, the sheet states how many miners are there to recruit from, and founding on an empty chain says so outright: *"No other miners work Tessera — this pool can only ever hold your own rigs."*

**Nothing told you how to point your own rigs at it.** The group pool selector always listed player pools, but only for the group's current chain, and nothing connected the two screens. The pool card now carries a direct button per eligible group: *"Point Main (1.2 GH/s) here."*

**A new pool could not win anyone for two days, at any fee.** Reputation started at 0.55 and ramped over 48 hours, so even a 0% fee scored below a 1% official pool until the ramp finished — the fee lever did nothing observable for two real days. The floor is now 0.80 over a 24-hour ramp, and the card shows a reputation bar with time remaining, so the wait is legible rather than mysterious.

**The fee barely mattered.** Miner choice carried ±10% noise against a fee difference of one or two points, so cutting your fee was lost in the jitter. Scoring now applies `FEE_BITE = 3` against ±3% noise, and opening a pool or moving its fee triggers an immediate re-evaluation on that chain instead of waiting for the hourly drift.

Measured against ~15 Ferro miners, the lever is now monotone and both-ways:

| Your fee | 24 h | 48 h | 96 h |
|---|---|---|---|
| 0.0% | 2 | 10 | 10 |
| 0.5% | 1 | 5 | 7 |
| 2.0% | 0 | 4 | 2 |
| 6.0% | 0 | 0 | 0 |

Raising a full pool to 9% empties it completely. A 0.5% pool reaches 13 members and 9.6 GH/s over 30 days. Official pools keep their share elsewhere — no monopoly — and the PPS bond cap still binds.

**One structural fix behind it:** the pool-choice scoring existed in *two copies*, one in the hourly drift and one in the new shake. That is the same fault as the power-accounting family (§Power accounting), so it is now a single `pickPool`/`poolScore` pair used by both.

### The bond as a capacity dial (v42)

The bond used to be a fixed opening stake with a single "top up to where it started" button. It is now the second lever of the pool business, alongside the fee — and on PPS it is *the* capacity control.

**On PPS the relationship is literal**: the bond underwrites `COVER_DAYS` of member payouts, so every dollar buys a fixed slice of hashrate you may take on — $1.30 of bond per MH/s on Halcyon, stated on the card. Add capital and the ceiling rises; measured end to end:

| Bond | Capacity | Members actually held |
|---|---|---|
| $3,041 | 2.34 GH/s | 1.66 GH/s |
| $23,191 | 17.81 GH/s | 10.87 GH/s |
| $84,064 | 64.57 GH/s | 49.01 GH/s |
| $235,779 | 181.09 GH/s | 115.34 GH/s |

A capacity bar shows how full you are and says *"full — add bond to grow"* when the cap binds. Add and release buttons scale to the pool's own size, so they stay useful at $50 and at $50,000.

**On PPLNS the bond buys no capacity at all**, because members carry their own variance — and the card says exactly that rather than implying a lever that is not there. It buys only solvency and reputation.

**Two floors keep it honest.** You cannot release below the bond that founding the pool required, and on PPS you cannot release below cover for the members you already have — otherwise you could pull your capital the moment a dry spell began and leave them underwritten by nothing. Verified: a release-everything attempt on a 115 GH/s PPS pool returned $85,602 and stopped dead at the $150,177 cover line.

**Deliberate downsizing is not punished; losses still are.** Releasing capital lowers `bond0` with it, so trust stays intact — you have announced a smaller promise. A bond that falls *because the pool paid out more than it took* still drops below its high-water mark and costs reputation, exactly as before.

Measured over 30 days operating a PPS pool and topping up whenever it filled: $173,310 of bond carrying 77.9 GH/s of members and $10,258 booked.

## 5b. Mining groups — one account, many rigs

**Rigs are workers, not competitors.** A mining group owns the chain and pool choice; rigs simply belong to one. The group is drawn as a **single participant** in every block lottery — many machines, one ticket — and holds **one PPLNS window**, exactly the way real mining hangs many workers off one wallet.

The payoff is the forfeit semantics. The window forfeits only when the *group* leaves — switching chain, switching pool, a pool closing under it, or the group being disbanded. **Rig maintenance never touches it**: rebuilds, brownouts, shutdown-policy trips, power cycles and insolvency shutdowns all leave the group's pending intact. Verified: a rig rebuilt (down 20+ minutes) mid-window with 7.5 FER pending — the window survived to the coin.

Groups are managed on the Farm tab — chain and pool selects per group (labels static by the §13b dropdown rule), combined hashrate, your share of the next block, the live window, and disband-when-empty. A rig's panel shows its group and lets you move it, which also never forfeits anything. New rigs join the first group; the coach's Solo step reads group state.

**Old saves migrate.** v30 rigs carried chain, pool and pending individually; on load, groups are synthesized from the distinct combinations, each rig's pending pours into its group, and the legacy fields are removed. The migration triggers off the *rigs'* shape, not the absence of groups — `Object.assign` never deletes keys, so the fresh default group would otherwise mask a legacy save.

## 6. Coin market

### Price formation — price follows the miners (v33)

The old model had no clear upward force: sells dented, a drifting walk did the rest. Now each coin has a **fundamental that tracks its chain's hashrate**:

`fund = base × (net/floor ÷ anchor)^0.45`, ratio capped at 100× — where *anchor* is the ratio at launch, so every price opens exactly at its listed value (measured: 0.0% gap on all five chains at t0). The reference price relaxes toward fund over ~3 days; the walk is pure zero-drift noise (personality by volatility, Halcyon 6% daily, Nova 1.2%); player sells still dent below fund through impact and the dent heals.

**Hashrate flowing in is demand made visible.** The sim network's 0.6%/day growth compounds into price appreciation — measured, Obelisk +58% over 90 idle days, growth *plus* sim migration toward it. And a player who moves real hash onto a small chain watches the market notice: 6.3 GH landing on Tessera took it ×3.1 while revPerMh still *fell* (0.207→0.074) — the 0.45 exponent keeps the loop damped, since difficulty scales revenue by net⁻¹ and price only by net^0.45. Inflows never make mining freer; they make **held coins worth more**. Holding versus autosell is now a real decision, and a dumped stack (19% dent on 3,000 FER) heals toward wherever the fundamental has moved since — down as well as up, because migration away from a chain deflates it by the same law.

The chain card states the mechanism plainly: *Market — tracks the miners*, with "rising toward $X" or "cooling toward $X" when price sits >10% off its fundamental. `doSell` is guarded against non-finite amounts, so no bad call can poison a price permanently.

Issuance is **capped by the difficulty floor.** Below the floor, blocks per day scale with hashrate on the chain; above it, difficulty tracks the miners and blocks per day is pinned to the target. So each chain has a hard maximum:

```
maxIssuance = 86400 × reward / blockTarget          coins per day
```

More players above the floor produce no more coins. Demand therefore only ever needs to absorb `maxIssuance`, and a **fixed demand capacity per chain, calibrated to the floor, is sufficient at any population.** A small playerbase leaves supply well under capacity and prices firm — early miners do well, which is thematically correct and self-corrects as the game grows.

### The three components of price

```
price = basePrice × sentiment × (1 − impact)
```

**Sentiment** is a slow exogenous random walk. It is the only part not caused by players, and it is what makes chain price behaviour a personality (Halcyon at 6% daily volatility, Nova at 1.2%).

**Slippage** is charged on the transaction itself, at `0.5 × amount / depth`, and it is **individual** — you alone pay it, and it scales with *your* order size. This is what caps how large a single farm can profitably get on a thin chain (§8), and it survives a populated market intact.

**Impact** accumulates from every sale on the chain at `amount / depth` and decays at `recovery` per day. It is **collective** — everyone receives the same discounted price regardless of who caused it. A whale who is 30% of a chain's selling causes 30% of the impact and pays the same price as the smallest miner.

That asymmetry matters and should be designed for rather than discovered: **slippage is a personal cost, impact is a commons.** Thin-book chains therefore have both a personal size cap *and* a tragedy of the commons, which is the same shape as the pool centralisation problem in §5.

### The calibration identity

At steady state, impact added equals impact decayed:

```
d(impact)/dt = Q/depth − recovery × impact = 0
⟹  impact* = Q / (depth × recovery)
```

So the **product** `depth × recovery` is fixed by how much discount you will tolerate at full issuance, and only their **ratio** is a free design choice:

```
depth × recovery = maxIssuance / toleratedDiscount
```

With an 8% tolerance that is `12.5 × maxIssuance`. A high depth with slow recovery is a deep book that heals badly; a low depth with fast recovery is a thin book that bounces. Both can hit the same product and behave completely differently.

### One number per chain

Express a chain's liquidity health as its ratio to that identity:

```
k = (depth × recovery) / (maxIssuance / 0.08)
```

| Chain | maxIssuance | Value/day | Target k | Discount at full issuance | Depth required |
|---|---|---|---|---|---|
| Nova | 21,600/d | $255,096 | 1.20 | 7% | 589,000 |
| Obelisk | 35,880/d | $325,794 | 1.10 | 7% | 987,000 |
| Ferro | 57,600/d | $237,312 | 1.00 | 8% | 1,800,000 |
| Tessera | 58/d | $105 | 0.70 | 11% | 1,000 |
| Halcyon | 72,000/d | $221,040 | **0.30** | **27%** | 1,929,000 |

Halcyon's danger is now a single number: its book is deliberately calibrated at 30% of what its issuance requires, so a fully-subscribed Halcyon trades at a 27% discount to its own base price. That is why it pays 55% more per MH — the extra rate is compensation for an exit that costs a quarter of the proceeds.

**Prototype depths are solo-scale**, and further from production than they look. With one seller, `Q` is a fraction of a coin per day and impact never registers. Measured against the identity, prototype 13's books sit at k = 0.24 on Tessera, 0.05 on Nova, 0.009 on Ferro and 0.0003 on Halcyon — between four and three thousand times below target. They are correct for what they test and must be rebuilt from this identity before any populated build.

### Depth and market impact

**Large sells slip the price against you. Depth varies by coin.**

The most valuable emergent mechanic in the design. A large farm on a thin coin cannot cash out without wrecking the price on itself, so **liquidity caps how big a farm can profitably get on a thin chain.** Whales are forced onto deep coins; small miners profitably work thin coins large players structurally cannot exit.

With the prestige ceiling reaching 10× (§8), this is the primary onboarding mechanism. Depth curves must be tuned with that job explicitly in mind.

**Recovery speed varies by coin** and correlates with depth.

### Execution

**Instant market sell only.** Large sellers eat full slippage. Manual chunking on a phone is miserable, so the automation system is extended with **auto-sell rules**.

### Transparency

**Live server-wide selling pressure is fully visible, and bank runs are accepted.** The market's worst moments become social events.

**Coins are worthless at season end.**

---

## 6b. The sell drip is a lever (v35)

Auto-sell was a hidden constant — a quarter of every holding per day, not adjustable. It is now two controls: **order size** (25% / 50% / 100% of a stack per order) and **cadence** (hourly / every 6h / daily), plus a **per-coin Hold** that exempts a coin from the drip entirely, which v33's appreciating fundamentals made worth having.

**Why size is a real decision.** Slippage is charged per order — `0.5 × amount / depth` — and the dent heals between orders at each chain's own `recover` rate. So four quarter-orders realise more than one whole-stack exit. Measured over 30 days on farm-sized stacks:

| Chain | Book depth | 25%/6h | 100%/day | Patience worth |
|---|---|---|---|---|
| Halcyon | 2,130 | $2,964 | $2,851 | **+4.0%** |
| Ferro | 15,400 | $11,494 | $10,957 | **+4.9%** |
| Obelisk | 66,700 | $2,791 | $2,794 | **−0.1%** |

**The counter-intuitive result is the useful one:** patience pays *most* on Ferro, not on the thinnest book. Halcyon is thin **and** slow-healing (`recover` 0.14/day against Ferro's 0.40), so the dent lingers whatever you do — being thin punishes you either way. Obelisk's book is deep and heals fast, so order size is simply irrelevant there. Depth alone does not predict the lever's value; depth *and* recovery do.

The Market card names the cost live, in the checker's grammar: *"Slippage bites hardest on Halcyon: this order would lose 7.3% — a 25% order would cost 1.8%."* It goes quiet when every order is under 1%, which is the honest signal that the lever does not matter for the current book.

## 6i. Farm as a dashboard (v59)

With the coach gone the Farm tab was a hero figure and a feed. It is now what you read to know where the operation stands, while acting happens on Sites, Pools and Build.

**Today card** — earned, power, blocks found today, best block ever. All realised figures, consistent with §6g.

**Sites overview** — every site on one row: rigs, hashrate, draw against usable capacity, cost per day, with a HOT tag when one is cooking. The whole operation without opening Sites.

**Per-group blocks** — each group now reports its own block count alongside hashrate, rigs, chain, pool and window. Fed from the same award path as pool reputation, so the number is genuinely that group's.

**Feed filters** — all / blocks / money / problems, with an empty state when a filter has nothing.

*Noted:* the block counter includes pool blocks the group took part in, not only solo wins. Honest, but "blocks credited" may read better once it is seen in play.

## 13f. Keeping a growing prototype honest

This file is now around 3,500 lines in one document, and the failure modes have been consistent enough to name. Every one below actually happened, more than once.

**A patch script that dies mid-batch writes nothing.** Five separate builds lost edits this way: earlier replacements succeed in memory, a later one misses, the script aborts, and the file is untouched while the log still reads as progress. **Rule: after every write, `grep -c` a marker from each edit.** Never trust the success line.

**`node --check` cannot see template bugs.** Vue templates are strings, so a broken component is valid JavaScript. Two live crashes hid there: `<option>` labels that re-render every tick (v24), and `{{ a < b }}` parsing as an opening tag (v51). **Rule: a structural pass over every template — tag balance, component registration, `<` inside interpolations, and every identifier a template uses being returned by its setup.**

**Duplicated calculations drift.** The worst bugs were all one shape: two places computing the same physical quantity, one of them left behind. Power accounting had four copies and three were wrong; pool scoring had two and only one got the fee fix. **Rule: one function owns a quantity. Where a hypothetical is needed, flip the state and measure, or give the real function a parameter.**

**`Object.assign` cannot delete keys.** Four migrations broke because they gated on the *new* field being absent, which a fresh default always fills. **Rule: gate on the legacy field's presence, and verify by stripping a save to the old shape and loading it.**

**Anything that grows at runtime needs one authoritative array.** Generation cards and supplies both shipped invisible because a reader used the static table. **Rule: when a catalogue can grow, grep every reader.**

**What is still fragile.** The audit suite is retyped from memory each build rather than living in a file, which is the single biggest risk to quality here — it should be checked in beside the prototype and run unchanged every time, so a check can never quietly go missing. The same applies to the headless harness: it is rebuilt per session, and its bugs have twice been mistaken for game bugs.

## 6l. Cleanup pass (v63)

No new mechanics. This is §6f's rule — *one function owns a quantity* — applied to the places that had quietly stopped obeying it.

**The free-power bug.** The marginal cost of a watt was written out longhand in three places. Two of them ended `(marg || 0.63)`, which reads a legitimate zero as missing data — so **a site with no metered source was charged the full $0.63/kWh default anyway**. It lived in `unitEcon` (the card picker's per-card $/day and payback) and in `netIfOn` (the auto-off decision). `draftExpected` was already correct and was never affected. Measured on an all-solar site running a 618 W rig: the card picker understated each card by **$3.09/day**, and a 618 W rig carried **$9.35/day** of electricity it does not buy. At current balance the auto-off consequence is theoretical — revenues are in the hundreds, so a $9 phantom charge never crosses the shutdown threshold — but it was wrong in the direction that punishes exactly the renewable build the power model exists to reward. There is now one `margRate(f)`, and the three call sites use it.

**`1.06*0.99` was an inlined `evMult`** at a nominal 1% PPLNS fee, sitting in two projections. Written as a literal it hardcoded `TX_FEES`, so changing that constant would have moved realised income and left both projections quoting the old number — the drift failure in its classic form, caught before it fired. Now `evMult(NOMINAL_POOL)`, and `bestChainRate()` owns the best-chain lookup both projections needed.

**Two different `0.85`s** sat as bare literals across seven sites: the fraction of a supply's nameplate a build may draw, and Appendix A's flip. They are `C.PSU_HEADROOM` and `C.FLIP_AT` now, so they can be tuned apart. A third copy of the flip was inline in a Farm template; it reads the `binding` computed instead. `psuCarrying`/`psuWithConn` replace four copies of the "which supply would fix this?" filter shared by the build and rebuild checkers.

**Dead surface.** The game object exported 163 names; 22 were never read as `g.X` by any view, including `fmt`, `FRAMES` and `COOLERS` (views use the module-scope originals). Down to 141, all live. Also removed: three vestigial `const fit=1` remnants of per-chain card compatibility, `s.soldOnce` (written, never read, since the v57 coach removal), and `.stickybar` (dead since v60 replaced the Build totals bar). `s.orphaned` was also write-only; it earned a Stats row instead of deletion, since the data was already being collected.

**A note on measuring this.** The export scan reported 15 unused names, then 22 after the first removal — its regex was consuming delimiters and undercounting. The corrected parser converged at 22 and then 0. A tool that reports partial success is the same failure mode as the patch scripts in §6f, and it is why the count is stated here as measured twice rather than once.

## 6n. The Rigs page rebuilt — orient, find, act (v64)

**What was wrong.** The page opened with Fleet actions already expanded, so eight controls and five paragraphs of prose stood between the player and their rigs. Every rig was a four-row card with *two* separate expand affordances (header and footer both toggled the same panel). A full site was an enormous scroll with no way to find the one rig that had stopped. Grid/list and sort hid behind unlabelled toggles that only appeared above three rigs, and tapping a grid tile silently switched the page back to list — a mode change on tap.

**The shape now** is three layers, in the order a player actually needs them.

*Orient.* A summary strip — rigs, hashrate, net/day — answers "is this site healthy" without scrolling. Sites are chips carrying their own rig counts.

*Find.* Filter chips carry counts, so **a problem is visible before you go looking for it** and one tap away when you do: All · Needs attention · Running · Off · Worn. The attention chip turns amber when it is non-zero. Sort is a labelled control that shows its current state and expands to name its options, rather than a three-state cycle button reading "by name".

*Act.* Rigs are one compact row each — status dot, name, spec, hashrate, net, wear bar. A rig opens in a **sheet**, the pattern the app already uses everywhere else for one-thing-at-a-time, rather than an accordion inside a scrolling list. Fleet actions moved into their own sheet.

**One function decides a rig's state.** `stateOf(r)` returns the dot colour, the label and the sub-line, and the chips, filters and sheet header all read it. The old page derived "is this rig fine" three separate ways — `tileState`, `tileBg`, and the inline tags in the card header — which is why a rig could show a green tile and a LOSING MONEY tag at once.

**Thread 6 closed, and it was a UI problem all along.** Bulk refit at scale needed selection. Every fleet action already routed through `fleetRigs(scope)`, so teaching that one function to accept an array of rig ids gave selection to repair, move, refit and rebuild-to-spec simultaneously, without touching any of them. Selection mode turns the status dots into checkboxes and a bar at the foot of the list reports the count; fleet actions apply to the selection when there is one and to the whole site otherwise — one rule, stated on screen.

**Thread 38 closed.** `draftExpected` and `unitEcon` priced a rig against the best chain on the network. `build()` puts every new rig in `groups[0]`, so `draftRate()` now prices the group it will actually join, and the verdict panel names the chain: *"Expected on Tessera"*, not a bare *"Expected"*.

**Thread 32 closed.** `groupAdvice` only spoke when another chain paid 1.5× more, so a farm already on the best chain hit its ceiling in silence. `chainCeiling(c, extraMh)` owns the condition with no reference to alternatives — are you taking enough of this chain that your own hash sets its difficulty? It shows as an amber advisory in the Build verdict and an AT CEILING tag on the group card, and is deliberately **absent from `canBuild`**: it is a reason to point the rig elsewhere, never a reason you may not build it. `grossCap` is derived from the same primitives as `revPerMh` rather than from `C.PAY*mult*floor`, so it cannot drift if the chains are recalibrated.

**A 16× bug found while testing the above.** `generatePreset` bounded cards-per-rig by the site's free *rig positions* — two different units. On a 24-position garage with 96 kW spare, the last rig was offered one card at 24 MH where the frame carried sixteen at 384. Across the shell that is 6,336 MH where 9,216 was available: **+45% hashrate from the same building**. Whether a position exists at all is `checks[3]`'s job and always was. Also fixed: a failed search left `s.draft` holding a half-built candidate, so "nothing fits" scrambled the customise fields.

**The v60 cooling gap was not real, and the fix was worse than the bug.** §6i recorded that the preset should escalate cooling. Implemented inside the card-count loop, it bought a $420 immersion kit to add two $3 cards, turning a 0.51-day payback into 0.78. Implemented as a fallback, a 36-scenario sweep and a 12-scenario fill-to-ceiling sweep both showed it never firing. The arithmetic says why: a better cooler adds its own watts while only dividing the *plant's* share, so below about three cards it makes the power check **harder**, and "nothing fits" only ever happens at one card. Cooling escalation cannot rescue a failing build. It was removed and the gap struck from the record — it was an assertion written into the spec without ever being measured.

## 6m. The smoke harness (v63)

`smoke.js` is checked in beside `audit.py`, for the same reason: it was rewritten from scratch every session and its own bugs were twice reported as game bugs. It shims Vue in about ten lines, loads the prototype's script block, and asserts on boot state, the preset agreeing with `canBuild`, the clock advancing, and site management taking effect.

Two rules are baked in, both learned the hard way while writing it:

- **Assert on observable state, never on a return value.** An early probe treated every void function as a failure and reported `renameSite` and `upgradeShell` broken while they worked perfectly.
- **Probe the function that carries the bug.** The free-power regression guard originally checked `draftExpected` — which never had the bug — and so passed cleanly against the broken build. Pointed at `unitEcon`, it fails on v62 and passes on v63, which is the only evidence that a guard guards anything.

`computed` in the shim recomputes on every read rather than caching, and `watch` does nothing. Anything depending on caching or watcher ordering will behave differently here than in a browser, so a failure here means *suspect the harness first*.

**`audit.py`'s binding check was extended in v64**, because the Rigs rebuild made the gap dangerous. It only ever checked identifiers followed by `(` — calls — so a bare `v-if="picking"` against a ref that setup forgot to return sailed straight through. It now reads every expression Vue evaluates (`{{ }}`, `v-*`, `:`, `@`) and resolves bare reads too, discounting v-for aliases, arrow parameters and inline `const` declarations. Verified the way any guard should be: on a copy of v64 with one name deleted from `RigsView`'s setup return, `node --check` passes, `smoke.js` passes, and `audit.py` names the missing binding. Vue cannot be installed in this environment, so a static check is the only compile-time cover the templates get.

## 6k. Site management: rename, expand in place, decommission (v62)

**Sites could only be founded, never managed.** The SHELLS ladder (bedroom → shed → garage → unit → warehouse) existed, but the only door onto it was "+ New site" — picking any shell, even the warehouse, always started a brand-new location from zero. There was no way to grow the site you already had power and cooling built on, no way to rename one once you had more than a bedroom, and no way to close one down.

**Expand reuses the shell job, not a new mechanic.** `upgradeShell` queues a `kind:'shell'` construction job at the *existing* site — the exact job type a fresh shell already used — so the completion path that sets `f.shell=j.p` needed no change at all. Only shells bigger than the current one are offered; half the outgoing shell's price is credited toward the incoming one, matching the credit convention retrofits already use (§ rebuild). Power, cooling and rigs keep running through the build, because nothing about the site except its shell entry changes.

**Rename** is a straight text field, capped at 24 characters, local to the card until saved.

**Decommission** is a genuine deletion, guarded three ways: it's disabled if this is the player's only site (there must always be one), if any rigs still live there (move them first — Rigs tab), or if anything is mid-construction. It requires a second tap to confirm, and pays back half the value of the shell plus every installed source, plant and battery — the same 0.5 salvage factor as everywhere else a part is given up. Both the confirm-arm and the rename field reset if the active site changes underneath them, so a stray tap can never confirm the wrong site's decommission.

## 6j. Rigs split out of Sites, serrated tabs (v61)

**Sites and Rigs were one screen.** Power, battery and cooling — the building — sat in the same scroll as fleet actions and the rig list — what lives in it. The fleet tools were buried below three collapsible infrastructure cards, and the tab label ("Sites") named half of what was on it.

**Two tabs now.** Sites keeps the site switcher, Power/Battery/Cooling, the construction queue and the site-part picker sheet — all questions about the building itself. Rigs gets its own tab: a compact site-switcher chip row (so changing which site you're looking at never means a trip back to Sites), Fleet actions, the rig list in both list and grid view, individual rig panels, and the retrofit/rebuild sheet. Nothing in the fleet or rebuild logic changed — this is a screen split, not a mechanics change. The one behavioural change: finishing a build now lands on Rigs, not Sites, since that is where the new rig actually shows up.

**The tab bar got a serrated top edge** — a torn-ticket zigzag between the scrolling body and the fixed nav, done as a repeating 45°-gradient mask rather than an image, so it holds at any width.

## 6i. The Build screen overhaul (v60)

**Three problems, one screen.** The card count was a number next to a sentence about a limit; picking parts meant working the field list even for an obvious build; and the verdict was six checks in no particular order, visible mainly when something failed.

**The visual rig.** One cell per physical position on the current frame. Filled cells are cards committed in the draft; a dashed, greyed cell past the frame-versus-board limit is a position that exists but can't be wired — the binding constraint as a shape, the same information the frame/board copy already stated in words.

**Preset first, customise second.** Opening Build now runs a generator against the active site and current cash and lands on a complete, buildable draft — no field list required. **The generator is not a second opinion:** it tries real drafts against the same `canBuild`/`checks` gate the manual path uses, in order, and keeps the first one that passes. Below the site's power flip (§ Appendix A, ~85% of capacity) it orders cards cheapest-first, matching the cash-bound ranking; above it, most efficient first, matching the power-bound one. Customise opens the fields with whatever the preset landed on already loaded, so refining a suggestion never means starting over.

**The verdict panel is now fixed order, always visible.** Cost and payback first, hashrate and MH/W second, site impact — watts against capacity, heat, floor space — third. Each group shows its numbers whether or not anything in it currently fails, so the checker reads as standing guidance rather than only firing on an error.

**Revised: Quick pick got its own, condensed verdict.** The rule above still holds in Customise — full order, every check, always visible. But Quick pick only ever activates a draft the preset generator already ran the whole gate against, so its six checks are guaranteed to pass the instant a preset exists at all; showing them anyway is a wall of green confirming what tapping Quick pick already promised. Quick pick now shows only Cost & payback and Hashrate, with the itemized checks and MH/W/site-impact detail reserved for Customise, where a player is actually troubleshooting. The failing checks fall back into view in Quick pick too, the moment `canBuild` actually goes false (cash draining, site capacity shifting under an already-open panel) — condensed is not the same as silent.

**Payback uses `expectedDay`'s method, not `netDay`'s.** `netDay` is realised earnings and a draft hasn't earned anything, so the new `draftExpected` computed mirrors `rigRev`/`rigPow` — best live chain, the site's marginal $/kWh — and is labelled *expected* on screen for the same honesty reason §6g gave `expectedDay` its name.

**Left open:** the preset does not currently escalate cooling — it always starts from the cheapest cooler and only the power/heat check can fail it — so a build that would pass with better cooling and nothing cheaper is reported as "nothing fits" rather than found. Worth revisiting if that turns out to bite in play.

## 6h. Coach and gating removed (v57)

The onboarding coach and every unlock gate are gone for now. All six tabs — Farm, Build, Sites, Chains, Pools, Market and Stats — are available from the first minute, and the auto-sell and policy controls no longer wait on a milestone.

Removed: the `STEPS` table, the step index and its completion handling in the tick, the `Coach` component and its styles, `goStep`, and the tab filter. `s.unlocked` is now a proxy that answers true to everything, so the many `v-if="g.s.unlocked.x"` checks scattered through the views keep working untouched — which made this a deletion rather than a rewrite. One catch worth noting: a proxy cannot survive JSON, so `loadSave` rebuilds it, otherwise a reloaded save silently re-gated itself.

This is a deliberate step backwards on guidance. Nothing now explains the first hour, and the §6g rebalance made that hour slower — so onboarding is a real open question, not a solved one, and should return before this is played by anyone new.

## 6g. Honest numbers and the first minute (v56)

**Net and revenue per day were projections, not results.** They were computed as `hashrate x rate`, so pointing 131 MH at solo Obelisk advertised roughly $500 a day on a chain where a block might not land for a year. They now report **what actually happened today**: coin credited at the price it was earned at, minus the electricity actually paid, reset at midnight. Measured — an hour of solo Tessera shows $11.45 earned against a projection of $298/day; an hour of solo Obelisk on 48 MH shows **$0.00**, which is the truth.

The projection was still worth keeping, so it survives under an honest name (`expectedDay`) and sits beside the realised figure as *"earning about $X/day at this hashrate"*. The headline reads **Net today**.

**Tessera rebalanced** — mult 4.00 → 1.50. A single starter rig soloing it now realises about $263 revenue and $229 net over a full day, rather than the ~$1,600 the old subsidy implied.

**The first rig always assembles in one minute**, whatever it is built from, and finishing the build now takes you to the Sites tab where the rig lives.

**Timers are finer.** `fmt.dur` reports seconds below a minute and minutes-and-seconds below an hour — "1 min 26 sec" rather than "1 min" — so a build in progress actually feels like it is moving.

## 6o. The network grows, instead of arriving finished (v68)

**The symptom.** Obelisk read 1.5 TH off the gate. Twenty-five supposedly-new miners were holding 48 GH each — about 250 starter rigs apiece — on a chain nobody had had time to build.

**Two separate bugs, sharing a cause: the model had a size but no clock.**

`seedSims` handed every chain `SIM_RATIO * floor` at t=0 and split it among a quarter of the starting population. §6e's note that "chains now sit below their own floor" was implemented as a *starting* value, so a world opened with a fully-built network and the "simulated players growing over time" half of the design existed only in a population counter that ticked 18 miners a day — about 900 game-days to fill, against a hardware ladder that caps at 168.

Worse, the network then ran away. Below a chain's floor the difficulty clamp holds `revPerMh` flat at `PAY x mult` — roughly $4.83/MH/day on Obelisk — against a power bill of $0.55, and an agent that reinvests whenever `net > 0` has no stopping point at all against a margin like that. Measured: **Obelisk at 27x its own floor thirty days in**, still climbing toward the ~51x where the price feedback (`fundOf`'s 0.45 exponent) finally caps out. The ladder §2a built was being erased inside a month, every game.

**The population is now the clock.**

- **A chain carries what the miners on it have built.** `simTargetOf` sizes each chain from the population that has actually arrived — `SIM_RATIO * floor * (population / SIM_SOFT_CAP)`, floored at one card per miner present. `SIM_RATIO` keeps its meaning as the mature end state.
- **Seats are weighted by floor**, because the ladder *is* the chain sizes: Obelisk is not a bigger Ferro, it is the chain thousands of miners work. `SIM_SEATS_MIN` is held back for every chain first so the small rungs keep a pool market, and a player founding a Ferro pool is never told nobody mines there. The two rules meet at the soft cap: 16k miners spread by floor weight put ~96 MH on every seat of every chain.
- **Expansion has a brake and a lead time.** Reinvestment is scaled by the room the chain has left and capped at `SIM_EXPAND_MAX_DAY` — the sims' version of the build queue the player waits on. Past `SIM_TRIM_AT` they retire cards instead.
- **Arrivals are logistic**, a trickle who find the chains alone plus word of mouth from everyone already mining, filling the network over about four months.

**A third bug fell out of the first fix, and is worth naming.** Chain choice compared pay alone — and below the floor there is no crowding term in pay at all, so once the miners were small enough to move freely, one lucky swing in Halcyon's price (vol 0.060, the most violent book in the game) took every miner in the world there and none ever came back: **Ferro and Nova at literally zero hashrate inside a week.** §6f's `SWITCH_EDGE` was stickiness holding a field plural, not a force restoring it, and it had been masked purely by the old seed making the agents too big to move. Crowding is now measured where it is actually visible — in *people*, against the seats a chain's size supports — so a chain that fills becomes less attractive and an empty one pulls miners back.

Measured over 150 game-days: population 100 → 15,306, four of four chains populated and growing monotonically throughout, splits tracking their floor weights (Obelisk 85%, Nova 12%, Halcyon 2%, Ferro 0.3% of the miners), and the chains filling bottom-up as a ladder should — Ferro 42% of floor, Halcyon 51%, Nova 35%, Obelisk 20%, none of them ever past `SIM_RATIO`.

**What this does not change: the player's income.** `blocksDay` is `86400 * myHash / diffOf`, and `diffOf` is floored — so what the rest of the network holds never touched what a player earns, before or after. What it changes is what the chains *are* early on: empty frontier with long block windows, where a small farm is a real share of a slow chain, filling into a busy network over the run. Pooling gets more valuable as the network arrives, rather than being the answer from the first minute.

**Old saves are not migrated** (`SAVE_VER` 5). A v4 world holds a network seeded at 0.6 x floor and compounded from there; the population is what sets a chain's size now, and there is no honest rescale from one shape to the other.

## 6f. Keeping the field plural (v55)

With chains sitting below their floors (§6e) there is no dilution to push back, so every below-floor chain pays a flat `PAY x mult` and the highest-mult chain simply drained the rest — 2 of 4 populated at day 38.

Miners now need a **clear margin before switching**: `SWITCH_EDGE = 1.85`, deliberately set above the widest mult ratio in the table (Halcyon 1.55 / Nova 0.90 = 1.72). Below that spread, no chain is enough better to be worth the move, so the field holds. Measured over a game-year: **4 of 4 chains populated at day 38, 120 and 365**, all growing, with Ferro 8.97 GH → Nova 394 GH → Obelisk 3.29 TH still a clean ladder. A starter rig can still solo Tessera in a minute and Ferro in 40, so the player ladder is intact.

The honest caveat: this is stickiness, not a market force. It holds because it is tuned above a known constant — if the mult spread ever widens, the edge must move with it, and the two are now coupled in a way the code comments but does not enforce.

**The two-year audit remains unrun** (thread 31) — the harness still exceeds the execution limit, and the economy has changed twice since it was written.

## 6e. The newcomer cliff and the first hour (v54)

**Chains now sit below their own floor.** `SIM_RATIO` fell from 2 to 0.6, so every chain has headroom: arriving somewhere new pays the **full** rate until you fill it, and dilution only begins once the chain is genuinely busy. That is what turns graduating from a pay cut into an upgrade.

**Tessera is an outright newcomer subsidy** — mult 1.00 → 4.00 with its reward to match. Nobody else mines it, so it pays 4× per MH, but its 500 MH floor caps the total, so you outgrow it within hours rather than parking on it.

The handover is now smooth, measured:

| Farm | Tessera | Ferro | Halcyon | Best |
|---|---|---|---|---|
| 114 MH | **$1,891** | $479 | $742 | Tessera |
| 500 MH | **$8,294** | $2,100 | $3,255 | Tessera |
| 2.1 GH | $8,294 (capped) | $8,821 | **$13,671** | Halcyon |
| 20 GH | $8,294 | $21,358 | **$124,660** | Halcyon |

Tessera leads until ~2 GH and then Halcyon takes over paying *more*, not less. **Thread 32 is closed.** The first hour now earns **0.47 starter rigs** — against 0.09 in v53 and 0.002 before the rescale — so roughly two hours of play buys your first new rig.

**Career board rescaled** to the new economy: 50 GH → 250 GH, a $1,000 block → $25,000, $500/day → $20,000/day, and the Economy track respread to $25k / $500k / $5M lifetime. The old thresholds were calibrated to an economy ten times smaller and had stopped pacing anything.

**One interaction fixed.** The v40 no-domination rule stopped a miner moving anywhere they would exceed 25% of the network — which made an *emptied* chain unrepopulatable, since any arrival would be 100% of it. Chains below their floor are now exempt: difficulty is pinned there, so there is nobody to dominate and no return to crash.

**Not fully solved.** One chain in four still empties in a 38-day run — the rate-chasing equilibrium concentrates miners on Halcyon's higher mult faster than stragglers return. It recovers rather than dying permanently, but the ecology wants another pass. The two-year audit and the coach's later steps were also not reached in this build.

## 6d. Rescaling for real time (v53)

At 1:1 the numbers did not support actually sitting down and playing. Measured on the old build, a thirty-minute session earned **$0.89 at the first rig — 0.17% of one rig**, meaning 290 hours of play to afford a second. And with no mechanical difference between presence and absence, thirty minutes of playing paid exactly what thirty minutes of not playing paid.

**Why a flat multiplier could not work.** To make a first session buy a starter rig outright needs ×304 income. Applied evenly that hands a warehouse **$134,847 per session against a $5,000 rig** — twenty-seven rigs an hour. The curve had to bend, not lift.

**What was changed.** PAY ×10 (0.42 → 4.20) with every chain reward to match, and grid rates ×10 alongside it so **energy keeps its share of revenue** — the pillar the design rests on still bites at 10–25% of gross. The hardware ladder was then bent at both ends: entry cards fall to scrap (RX-470 $26 → $3, and the cheapest buildable rig is now $72), while the top climbs (A5000 $231 → $290) and generation pricing steepens from ×1.22 to ×1.30 per generation. Site tiers rise steeply — shed $220 → $700, warehouse $72,000 → $400,000 — so the wallet, not just the calendar, gates a large farm.

| Stage | Net/day | Per 30 min | Rig of that tier | Rigs per session |
|---|---|---|---|---|
| First rig | $415 | $9 | $72 | **0.12** |
| Bedroom | $1,093 | $23 | $72 | 0.32 |
| Shed | $6,039 | $126 | $486 | 0.26 |
| Garage | $19,274 | $402 | $1,184 | 0.34 |
| Unit | $63,057 | $1,314 | $3,848 | 0.34 |
| Warehouse | $192,238 | $4,005 | $3,848 | 1.04 |

Roughly flat at a third of a rig per session, against 0.002 before — a **60–170× improvement** — and money stays a real constraint, which the bond lever, battery paybacks and the pool business all depend on.

**Where it falls short, honestly.** The brief was *a session buys the cheapest rig*; this delivers about an eighth of one at the very start, so roughly four hours of play buys a first rig rather than thirty minutes. Closing that last gap needs a richer newcomer chain, and Tessera's cap is deliberately placed just below what a shed on Ferro earns — raise it and graduating becomes a large income cut, which is thread 32 made worse. That is a design fork, not a number to nudge.

**A session-feel bug found while measuring.** Total value grew $6.54 in the first hour but *cash* moved −$1.02: the drip defaulted to 25% every six hours, so earnings sat as unsold coin and the number a player watches did not move. The drip now defaults **on, at 50% hourly**, so a session's progress is visible. The lever is unchanged for anyone who wants to hold.

**Still to build:** the presence-only mechanics that make playtime beat idling — EASY-window sniping, manual market timing, event response, weather planning, hashrate contracts and hardware lots — plus new chains opening as you outgrow the old. This build fixed the scale; it has not yet made presence pay.

## 6c. The tuning overhaul (v43)

Measured first, then tuned. A year-long headless run of the pre-tuning build ended at **206 MH/s, $23/day, $2,725 lifetime**, still in the spare bedroom, still on Tessera. The intent — incremental gains from active play, large jumps from long horizons — was failing at both ends. Five faults, each measured:

**1. Climbing the card ladder destroyed your return.** $/MH ran 1.08 → 3.64, so an RX-470 paid back in 9.6 days and an A5000 in 22. The rational play was to buy the worst card forever, which capped efficiency and therefore scale. Prices are re-cut so **$/MH runs 1.08 → 1.75 and payback is nearly flat (7.5 → 9.8 days)**. A better card now buys *density and efficiency* — hashrate per slot and per watt — which are the constraints that actually bind later.

**2. Generations outran the player.** Card prices grew ×1.38 per generation against ×1.22 hashrate, so after a year the top card cost 6,000× more while earning 158× more. Generation pricing now tracks hashrate at **×1.22**, holding $/MH flat forever and making each generation a pure +15% MH/W win. This closes thread 27.

**3. Early infrastructure was priced against income you could not earn until you owned it.** Escaping the bedroom cost $3,300 while the bedroom capped you at ~$30/day — over 100 days of grinding. Each rung is re-priced to roughly a week of the *previous* rung's income: shed $2,400 → $220, 30A $900 → $120, garage $11,000 → $2,200, 100A $3,600 → $900, and the upper tiers roughly halved. Grid rates dropped about a third (domestic $0.63 → $0.42/kWh), since power was eating 46% of a starter's revenue.

**4. Margins were too thin to both maintain and grow.** A full bedroom netted $39/day, which could not fund repairs *and* expansion, so every farm ground down to worn cards and stalled. **PAY doubled, 0.21 → 0.42**, with every chain reward doubled to match — revenue rises against unchanged power and hardware, and that gap is the reinvestment margin.

**5. Three absorbing states, any of which silently ended a run.** Insolvency powered the *whole* farm down and nothing ever restarted it — no rigs, no income, no recovery. Worn cards produced *nothing*, so a farm whose cards died could never fund the repair that would revive it. And cards bought together wore out together, presenting one lump bill instead of a trickle. Now: insolvency sheds only the worst earner and **never takes the last machine**; a fully worn card **limps at 25%** rather than dying; wear halved to 0.003/day and **each card ages at its own rate** (±25%).

Measured after, same harness, 365 days:

| Day | Passive | Active |
|---|---|---|
| 7 | $37/day | $37/day |
| 30 | $86/day | $87/day |
| 60 | $24/day | $80/day |
| 120 | −$0/day | **$132/day** |
| 365 | $5/day | **$133/day** |

Active play is worth **~30× passive at a year** and, importantly, the two are identical for the first month — the early game is forgiving, and the divergence comes from maintenance and refit decisions compounding over months. That is the requested shape: incremental while you play, decisive over long horizons.

**Known ceiling, logged as thread 32.** A farm plateaus around 575 MH/s because Tessera's floor caps gross revenue at `PAY × floor` = $210/day however much hardware you add, while the crossover to Ferro only pays above ~1.08 GH/s. The advisor is right to stay silent — moving early would earn less — but the wall is invisible, and a player can sit against it indefinitely. The fix is a signal, not a number: the chain card should say *"you are at this chain's ceiling; it pays $210/day no matter what you add."*

## 7. Player economy

### Faucets and sinks

| Direction | Source |
|---|---|
| **In** | Selling mined coins to simulated demand (essentially the only faucet) |
| **In** | Prestige token redemptions; co-op distributions (redistribution, not creation) |
| **Out** | Electricity — continuous, scales with farm size |
| **Out** | Prestige token purchases — voluntary, unbounded, escalating |
| **Out** | Standing capacity charge (tier 2+) |
| **Out** | Vendor parts, replacement units, marketplace fee |

Electricity is the standout: a sink that scales *with farm size*, so growth is self-limiting.

### Vendor

**Unlimited stock, prices rise with demand — per part.**

This produces an event nobody designed: during the land grab, when everyone builds at once, **graphics cards specifically get expensive.** A GPU shortage arriving for the reason real ones do, from two mechanics that didn't know about each other. Cards spike while frames and PSUs stay flat, so the optimal build shifts mid-season toward whatever isn't scarce.

It reverses in the back third of the season, once the deadline makes new hardware pointless: demand collapses, used parts flood in, prices crater below new.

### Secondhand market

**A parts market.** Player-set listings, browsable, full transparency on condition and refurbishment count. The UI computes a value metric; players sort freely. Richer than whole-rig trading — a stripped rig's good units still have value.

**Transaction fee: flat percentage, seller pays.** Discourages flipping.

### The bankruptcy floor

**Cash can never go below zero, and a failing farm can never reach a dead end.**

Without this the game has a genuine hole. A player who builds badly drains their cash to zero, everything shuts off, they strip a rig for roughly half its value, rebuild something smaller, and repeat — each cycle bleeding about 50%. Eventually salvage value falls below the cheapest viable build and they are **permanently dead with hundreds of days left in the season**. There is a softer version too: above tier 1 the standing charge keeps running with every rig switched off, so an idle farm bleeds against a zero balance forever.

The fix is an **escalating liquidation**, cheapest step first, each one announced in the activity feed so a failing farm visibly dismantles itself rather than silently locking up:

1. **Power everything down.** Stops the bleed immediately. Any PPLNS window balance is forfeited, same as any other shutdown.
2. **Shed a facility tier**, recovering 45% of it. Cascades down to tier 1, where the standing charge is zero. Thematically: you could not hold the lease, so you moved out.
3. **Sell the least valuable rig.** Repeats until something left can pay for itself.
4. **The room provides one basic rig.** With no hardware left and less than the cost of the cheapest possible build, the player is given that build — a milk crate, a salvaged board, a 350W supply and one used card.

**Step 4 is a capability floor, not a cash faucet**, and the distinction matters. It hands over hardware rather than money, so it adds nothing to the money supply (§7's faucet list is unchanged). It is the worst rig the shop can assemble and precisely what a new player could have afforded on day one. And it cannot be farmed: reaching it requires destroying everything of value first, so the exchange is always strictly bad.

**Failure therefore costs a player everything except the ability to continue**, which is the right price. They have lost their hardware, their facility tier, their position and a large part of the season — but not the run.

Worth noting what this replaces. The recovery path *existed* before, by accident, as strip-and-rebuild — but nothing told the player it was there, and it terminated. Designing it deliberately turns an invisible trap into a legible consequence.

Since there are no notifications (§12), the interface has to carry the warning: a runway figure while cash is draining, and an explicit insolvency notice naming the three ways out — sell held coin, strip a rig, drop a tier.

### The deflation problem

**Parts are worth nothing at the boundary**, so price equals remaining expected earnings, marching to zero as day 90 approaches. Buying stops making sense once the remaining season is shorter than a payback, which is **day 59 for the A5000, day 67 for the A4000 and around day 70 for anything at all** — the **same backward induction affecting the coin market**, in a second system.

That leaves roughly **twenty days with no purchase worth making.** The proportion is unchanged from the thirty-day season (22% against 27%), but eight quiet days and twenty quiet days are very different experiences, and it lands hardest on exactly the efficient cards the endgame is supposed to be about. Logged as thread 23.

**Prestige tokens are the mitigation** — cash converts to the one thing that survives.

**Signal to monitor:** median coin holding time by season day. Holding into day 25 means the deadline is behaving; collapse around day 18 means the unravelling has begun.

---

## 8. Progression — the career board (v32)

**Progression is the run; the career board gives it direction.** Twenty-four milestones across six tracks — Hashpower, Blocks, Infrastructure, Pools, Economy, Craft — spanning the first hundred megahash to fifty gigahash, the first block to the thousand-dollar block, the first rebuild to fifty lifetime repairs. Completing them climbs a rank ladder: Hobbyist → Tinkerer → Operator → Engineer → Mogul → Magnate. The board lives at the top of the Stats tab, each finished milestone timestamped with its day.

**Deliberately: no cash, no perks.** Free money inflates the economy the game *is*; permanent perks are prestige power-creep by another door; daily-chore quests are the manipulation §13 refuses. A milestone is a *record* — celebration and direction, not payment. The economy itself remains the only source of power.

Measured: a stewarded six-rig farm on a deep chain reaches **14/24 (Engineer) by day 42**, with exactly the long-horizon ten remaining. Milestones fire once, survive reload, and old saves start the board fresh with counters defaulting to zero. *(This figure predates issue #10's b2/b3 threshold raise — a farm committed to a slow chain from the start now clears fewer of the two block-count milestones by day 42, though Engineer rank itself, which only needs 12, still holds. Needs re-measuring against the current thresholds.)*

**Running a pool remains the second progression axis** (§5) — capital rather than hardware — and the Pools track ties the board to it: founder, PPS operator, terahash pool, five thousand withdrawn.

**What testing this exposed** (both threaded): a group that outgrows its chain earns the chain's fixed emission, not its hashrate — a 6 GH farm on Tessera makes what a 500 MH one does, silently; and an uncooled dense farm can cook every card to death with the rigs still 'on' and nothing louder than per-card feed lines. Both are the systems working; both deserve louder surfacing.

## 9. Progression and onboarding

**Live from minute one, with a guided overlay for the first hour.** No sandbox, so no graduation cliff. The overlay must be reactive, since world state varies enormously between a day-3 and a day-22 arrival.

**Flat starting grant regardless of when a player joins.**

**Unlocks are account-permanent** — learn the game once — and **driven by milestones rather than elapsed time.** A fast learner has everything inside a day; a casual player takes a week. Nobody is taxed for arriving late, which is what makes the flat grant survivable.

### The first hour

Two variants are now viable, and prototype 4 tests the second:

**Warm start:** two prebuilt rigs, one bleeding money. First action is switching it *off*, and the net figure goes green. Sixty seconds to learn that margin beats hashrate.

**Cold start:** an empty room and $1,000. First action is shopping and building. Slower to the first lesson, but it front-loads the parts system and the compatibility checker, and there is no moment where the player owns something they didn't choose.

### Unlock order

1. **Margin** — the bleeding rig, or the first build's net figure
2. **Variance** — solo on a thin chain. Wait. Nothing happens. A block lands and it's enormous. *Then* pools unlock.
3. **The parts shop**
4. **Power and heat** — once density bites
5. **Tuning**
6. **Automation**
8. **Pool founding, co-ops, the marketplace**

Each step is motivated by the discomfort of the previous one. **The first hour must use prebuilt rigs or a guided first build** — a five-part compatibility puzzle before the player knows what a watt costs is the wrong order.

### Scoring

No season-end formula; prestige is purchased continuously. Because parts and coins are both worthless at the boundary, **final cash balance is exactly lifetime net profit** — any leaderboard can read the bank balance and be automatically honest.

---

## 10. Interface and scale

**Group control from the start, fleet actions with scale.** Mining assignment is a few group settings however many rigs exist; hardware still scales to dozens of machines and hundreds of units.

The interface shifts from controlling *rigs* to controlling *fleets* — grouping, bulk operations, blueprint rebuilds, rules applied to categories. A progression rather than a problem: a new player manages two rigs by hand and learns what margin means; a veteran cannot manage forty and graduates to managing **rules**. **The skill ceiling moves from tapping switches to writing good policy.**

**The build screen is the hardest UI in the game.** It needs a focused flow with live running totals — watts committed against PSU capacity, projected MH/W, connectors remaining — not a catalogue cross-referenced by hand.

---

## 10b. Farm health — the game says what binds (v34)

Three threads closed in one pass, all the same disease: the simulation was honest but quiet. Each fix follows the build checker's grammar — name the constraint, give the number, point at the fix.

**COOKING (was thread 30).** A site crossing 70°C with live rigs announces itself once, loudly — *"Spare bedroom is cooking — 91°C: throttling, and cards wearing 9× faster"* — with a red `COOKING 91°` tag on the cooling card and hysteresis so it re-arms below 64°C. The last working card in a rig dying is now a farm event with its own always-through toast, not a footnote, and repair or rebuild clears the flag. The v32 garage that died in silence now warns within six game-minutes.

**OUTGROWN (was thread 29).** A group holding >40% of a chain that is above its floor, where another chain would genuinely pay ≥1.5× more, gets an amber tag and a plain sentence: *"You are 100% of Tessera — above the floor a chain pays its emission, not your hashrate. Obelisk would pay about 3.4× per MH, even after your hash raises its difficulty."* The projection is honest: the target's rate is quoted **after** the group's hash lands on it, so moving never looks better than it is. Starters below the floor are never nudged.

**Battery advice (was thread 28).** The battery card names whichever cap binds, with numbers: *"Charging is capped by 214 W of spare night capacity — the battery could take 90 kW"*, or *"Peak hours use only 17 of its 350 kWh — oversized for this load"*, or *"Nothing charges it"*, or — when the sizing is right — *"Well matched."* A fresh game shows none of the three systems; they only speak when something binds.

## 11. Social and co-ops

### Two orthogonal affiliations

A **pool** is where a mining group's hashrate is pointed — payout scheme, fees, variance, chosen per group (§5b). A **co-op** is where hardware physically lives — facility, power, cooling, connection. Separate businesses, as in reality.

### Co-ops as jointly-owned ventures

Contribute cash, receive **shares**. Co-op funds buy **fixed facility tiers** and co-op-owned rigs. Those rigs mine; revenue lands in a **treasury** paying the co-op's own electricity, standing charges and replacements. **Net profit distributes pro rata by shares.** Proposals and **share-weighted votes** decide purchases.

**Governance runs on voted rules, not a manager.** Members vote on shutdown thresholds, pool assignment and purchase triggers; the co-op then executes itself. Two properties make this work: **a majority holder's vote passes on its own**, so there's no quorum or timezone problem — the largest contributor is effectively the manager without the role. And **share-weighted voting is safe because profits distribute pro rata**: the majority holder cannot vote themselves a better deal.

**Fixed tiers need no membership cap** — price does that job.

### Withdrawal

Members withdraw **at any time**, forcing asset sales. Payout is **pro rata at realised value** — in a classic bank run, first movers are paid in full and latecomers get the remainder, and that asymmetry *is* the panic. Pro-rata removes the first-mover advantage, so withdrawal freedom survives without the run.

Where demands exceed liquidatable assets, a **redemption queue** pays out as assets sell. **Shares sell only back to the treasury**, so selling shares and withdrawing are one mechanic.

A co-op under pressure **visibly shrinks**, so prospective members can see one bleeding out. Holding a cash buffer becomes a management skill that gets voted on. **Withdrawal pressure peaks in the back third**, as members liquidate ahead of the boundary.

### Season boundary

The co-op **persists**; assets and tier **wipe**. What survives is identity, roster and history — social capital rather than a balance sheet.

### Why co-ops belong

The binding constraint is watts, not money — capital saturates against a personal ceiling. **Co-ops are the overflow valve**, catching capital that would otherwise be dead. They also create a playstyle nothing else serves: **the investor**, who contributes capital, takes a share and never touches a rig.

### Leaderboards, chat, rivalry

**Wealth per season; categories in an all-time hall of fame.** **No chat** — co-op coordination runs on structured proposals and an auditable ledger. Blueprints are private, so build knowledge is shared externally.

**Rivalry is structural**: a fixed pot above the floor, bidding against others for scarce parts, racing them to exit a dump. No direct sabotage. **Social alpha is interpretation, not information** — external guides and spreadsheets are a feature rather than a leak.

---

## 12. Time, pacing and architecture

### Simulation

**Continuous simulation of every player, on a 1-second tick.** Lazy catch-up was rejected: it's a notorious exploit surface — clock manipulation, boundary conditions, double-crediting on reconnect — and continuous simulation eliminates that class of bug.

**Engineering constraints:**

- Hold state **in memory**; never touch a database per tick.
- Lay parts out as **flat arrays of primitives**. At 1-second ticks there is no budget for per-part allocation or map lookups, and part-level wear multiplies object count roughly sixfold.
- Persist through **periodic snapshots**.
- **Use integer or fixed-point accumulators** for wear and earnings. At 86,400 ticks a day, adding tiny floats to large accumulators loses precision measurably.
- Block discovery is global and authoritative: one process per chain draws a winner per block.

### Notifications

**None.** With hardware failures removed (§3) and the halving removed (§2), there is no longer any event a well-configured ruleset cannot handle in advance. The season boundary is scheduled and visible from day one.

This is an unusually strong position for an idle game and follows directly from automation-first design: if something needed your attention, your rules were wrong. It also means the design has no re-engagement hook at all, which is a retention question rather than a design one.

### Opening the app

**Nothing but the live dashboard.** The **activity feed is the sole record** of anything that happened while away, so it must persist across sessions and cover the full absence.

---

## 13. Monetisation

**Deferred. The game is free, with no purchases of any kind for now.**

Two constraints are locked permanently, because they are the two things that would invalidate the design underneath:

**Automation is never purchasable.** In most idle games automation is the obvious and harmless purchase. Here §10 makes managing *rules* the entire skill ceiling — selling it would be selling the top of the skill curve.

**No purchasable power, ever.** Prestige tokens, the permanent axes, the facility ladder and build throughput are all earned in-game only.

Those two rules narrow any future model to **cosmetics, non-automation convenience, and persistence** (a free season for everyone, payment buying a career).

**Known problem for later:** the cosmetic surface is weak. Rigs & Pools is a data dashboard — no avatars, no visible hardware, nothing to decorate — so a cosmetics model would require *building a visual farm view specifically to have something to sell*. That's scope, not pricing.

Also worth recording: the exponential token ladder is a natural spend ceiling. At 18% per token, number forty costs ~700× the first, so no amount of money could buy an unbounded lead even if power were sold. That does not make selling power acceptable, but it means the ladder is doing structural work beyond balance.

---

### Notification gating

Tessera's twenty-second blocks made every solved block fire a toast, which at 1× is one every couple of minutes and at 3600× is a strobe. Three rules fix it:

- **A real-time gate.** Four wall-clock seconds minimum between toasts, measured against `Date.now()` rather than game time, so a speed multiplier cannot turn a fast chain into a flicker.
- **A per-kind cap.** The first three of any kind land while you are learning; after that the activity feed carries it silently.
- **Exemptions.** Critical events — insolvency, a pool failing, a milestone reached — always get through, subject only to a one-second floor. So does a **personal-best block**, so a genuinely big win never goes unremarked no matter how long you have played.

Measured. One real hour at 1×: 25 blocks, **5 toasts** — the build finishing and the first three wins, then silence. Thirty-three real minutes at 3600×: 8,174 blocks, **1 toast**. The feed shows a single coalesced line, `Your rig solved the Tessera pool block ×8174 · +8466.3 TSR`.

**A note on testing this.** The first measurement showed almost no toasts at 1× and looked like a bug. It was the harness: 36,000 ticks execute in about three seconds of wall clock, so the real-time gate correctly suppressed everything. Anything gated on `Date.now()` has to be tested against a stubbed clock that advances with the simulation, or the result is meaningless.

## 13e. The Object.assign migration trap — three sightings

Every save migration in this project has hit the same bug, and it is worth naming so the fourth one does not.

`loadSave` hydrates with `Object.assign(s, data.state)`. **Assign copies keys; it never deletes them.** So a field the fresh state defines but the saved state lacks survives the hydrate at its *default* value. Any migration gated on the new field being absent therefore never fires:

- **v27** — generation catalogues did not regrow on reload; the paired edit had silently never applied.
- **v31** — groups were synthesized only `if(!s.groups)`, but the fresh default group masked every legacy save. Fixed by gating on the *rigs'* shape instead.
- **v35** — `if(!s.drip)` never fired, so a v34 player with auto-sell on loaded with it off.

**The rule: gate a migration on the presence of the legacy field, never on the absence of the new one.** `if('autoSell' in s)` is correct; `if(!s.drip)` is not. And a migration is not verified until a save has been stripped to the old shape and loaded — every one of these was caught that way and none by reading the code.

## 13d. Quality of life (v27)

**Tuning is back, with the UI it never had.** The slider runs −15% (quiet) to +15% (pushed): hashrate ×(1+τ), card power ×(1+1.9τ), and pushing multiplies wear ×(1+3τ). Undervolt when power-bound, push when watts are spare — the lever §13a removed as dead code, restored as a real one. Measured: +10% tune = +10% hash, +16% wall draw (chassis watts don't scale).

**Fleet actions.** One card above the rig list: repair every worn card across all sites with a single priced button, and refit the entire fleet to a chosen card — rigs whose supply, connectors or site power can't take it are skipped and say why in their own panel.

**A Stats tab** (appears with the Market): net-per-day, hashrate and cash over ~80 days, plus a price strip for all five coins and the current hardware generation.

**Old saves load.** v26-shape saves hydrate cleanly — every new field (weather, batteries, tune, histories, generations) defaults defensively, verified by stripping a live save back to the old shape and running it.

## 13c. Persistence (v25)

**The game autosaves every 30 seconds and on leaving the page**, and resumes where it left off. This closes the second of the two blockers from the standing assessment — a 1:1 game with nine-to-thirty-day paybacks was unplayable while a refresh erased it.

**One save layer, two backends.** Browser `localStorage` is unavailable inside a Claude artifact, where a `window.storage` API persists instead; in a plain browser it is the other way round. A small adapter probes `window.storage` first, falls back to `localStorage`, and degrades to memory-only with the save chip reading *not saved — no storage here*. The chip in the speed bar always states which backend took the save (`saved · cloud` / `saved · local`).

**Offline time is credited by running the real engine**, not a formula: on return, the elapsed time is fast-forwarded in 30-second chunks through the ordinary tick — solar cycles, ambient, wear, construction, pool settlement and block windows all simulate. The exact-arrival block model (§13b) is what makes chunked time accurate; the per-tick hazard it replaced would have undercounted blocks badly here. Toasts are suppressed during catch-up and a single *Welcome back* reports the gain.

**Credit is capped at 24 hours.** Beyond a day away, further time is simply not simulated — the cap is stated in the welcome toast. This is a deliberate idle-game compromise: it bounds catch-up cost, bounds wear-while-away, and keeps a returning player from finding a farm that ran unattended for a month. It does bend the "a day is a day" clock principle for long absences; logged as a thread.

**Erasing (fixed in v36).** The erase button deleted the key and called `location.reload()` — and did nothing, for two independent reasons stacked on top of each other:

1. **`pagehide` fires *during* `location.reload()`**, and its handler called `saveNow()`. So the wipe deleted the key and the reload immediately wrote the live state straight back into it. The save was resurrected by the very act meant to clear it.
2. **`location.reload()` is unreliable in a sandboxed frame**, so a reset that depends on it may never happen at all.

The fix does not depend on a reload. `wipeSave` latches a `wiped` flag *before* its first `await` — so any racing `saveNow`, from pagehide or the 30-second autosave, is a no-op — deletes the key, then **rebuilds state in place**: a `freshState()` builder (also used at boot) produces a brand-new world, every key is deleted from the reactive state before assigning (Object.assign cannot clear keys, §13e), and the generation catalogue, toast gates and rank counters reset with it. A reload is still attempted afterwards, but only as a cosmetic extra.

Verified against the exact race: a day-38 farm with 4 rigs, 2 sites, 2 groups, a player pool, generation 2 and 10 milestones, with `saveNow()` called mid-wipe, resets to day 1 / 0 rigs / \$500 / 12 base cards; a relaunch finds the fresh run; wiping twice in a row works; and it still resets correctly with no storage backend at all.

**Save format.** Versioned (`SAVE_VER`); a version mismatch discards the save rather than migrating it — correct for prototypes, unacceptable for production, also logged. Payload is the whole state, ~13 KB. Erasing is a two-tap button in the Market ledger.

Measured: exact continuity on reload (clock, cash, blocks, wallet); 3 h away credits 3.00 h; 7 days away credits 24.0 h and says "(capped at 24h)".

## 13b. The v23 review — five bugs and where they hid

A dedicated bug-hunt pass, aimed at the places bugs live: high-speed paths, state transitions, and edge cases at zero.

**Fast-forward undercounted blocks 12×.** The per-tick hazard sample could fire at most one block per tick, so at 3600× Ferro ran 360-second blocks instead of 30 — starving every variance-scheme income stream while PPS drip stayed correct. The fix replaced hazard sampling with an **exact arrival drawn from the inverse CDF** when the window arms — `arrival = T·U^(1/K)` — with a loop that lands several blocks when one tick spans several windows. Measured after: 30.2s per block at 1×, 30.1s at 3600×. The drawn arrival stays hidden; the countdown shows only the ceiling.

**Brownout-shed rigs never recovered.** One night on a solar-heavy site turned rigs off permanently unless the optional shutdown policy happened to be on. Shed rigs are now marked and **restored automatically when capacity returns**, best earner first, with a 3% margin so sunrise cannot flap them. Verified: 3/3 at noon → 0/3 at night → 3/3 by next noon, unaided.

**An empty chain displayed RUNNING EASY +49900%.** `easeOf` divided the floor by max(1, zero hashrate). Guarded to neutral, and the countdown shows a dash on a chain nobody mines.

**All PPLNS risk sat on one rig.** The rolling at-risk balance was credited entirely to the first live rig in the pool, so switching any *other* rig forfeited nothing and switching the first forfeited everything. Each rig now holds its own slice **in proportion to its hashrate**.

**Difficulty opened with an artificial easy-run.** Observed hashrate initialised at the floor while the simulated network started well above it, so every chain ran easy for its first ~100 blocks. It now initialises from what is actually there at the start.

Also: part lookups moved from linear scans to maps (they sit on the per-tick hot path), and `myPoolHash` — orphaned by the PPLNS fix itself — was removed by the same use-count audit that closed §13a.

**v24 hotfix — the un-clickable dropdown.** The rig panel's chain selector embedded `revPerMh` in its option labels. That number moves every tick, and patching `<option>` text while a native dropdown is open dismisses it — ten repaints a second made the menu impossible to use. The rule that falls out: **nothing that ticks may render inside an `<option>`.** Labels are now snapshotted when the panel opens (with a note that rates drift while you look), and the same pass fixed the adjacent bug it was masking: switching a rig's chain left its pool pointing at the old chain — it now re-points to the new chain's official PPLNS, forfeiting any PPLNS window on the way out, exactly as a fresh rig defaults.

**Where they hid is the lesson.** None of these were visible at 1× in a short session with one rig. They needed speed, nightfall, an empty chain, or a second rig — exactly the states a quick manual test never reaches.

## 13a. Removed by the dead-code cut

Four systems were carrying weight from designs the game no longer is:

- **Per-rig tuning.** The overclock/undervolt slider was dropped in a UI rebuild and never replaced, so `tune` sat at zero inside the hashrate, power and wear formulas for five versions.
- **PROP and FPPS.** Unreachable once pool creation narrowed to PPS and PPLNS — defined, branched on in the payout code, never once executed.
- **Blueprints.** They existed to rebuild quickly after a season wipe. There are no wipes.
- **Poisson sampling.** Replaced by the block window; the function outlived it by a version.

Also removed: `POOL_MARKET` (superseded when pool membership became literal), plus `floorPct` and `rigInstW`, orphaned by interface changes.

**The lesson worth keeping:** every one of these looked live — defined, referenced inside formulas, present on the export surface. Only a use-count audit against the views found them. **Reversed design decisions leave code that reads as working.**

## 13d. The source split (v65)

The prototype had reached 4,264 lines in one file, of which `createGame` alone was 1,736 — 44% of the JavaScript in a single function. Editing meant finding a unique anchor in a quarter-megabyte of text; reviewing meant taking a whole new file on trust, with no way to see what had actually moved.

**Why a build step and not ES modules.** The prototype is opened by double-clicking it. That makes the origin `file://`, which is opaque, and module scripts are fetched with CORS — so `import` fails from disk. Splitting into real modules would have cost the thing that makes this project fast to iterate on. A build step keeps both: sources are separate files, the deliverable stays one file that opens with no server, no install and no npm.

**The split was proved to be a no-op before it was trusted.** `split.py` carved v64 at exact character offsets; `build.py` concatenates the parts in manifest order; the result is byte-identical to `rigs-and-pools-v64.html` (same MD5), with `audit.py` and `smoke.js` both clean on the rebuilt file. Nothing is minified, rewritten or reordered, so a line in `src/` is the same line in the output and the built file is still worth grepping.

| | files | largest |
|---|---|---|
| `src/game/` | 14 sections of `createGame`, cut at the dividers already in the file | `07-tick.js`, 401 lines |
| `src/ui/` | one per component | `06-RigsView.js`, 456 lines |
| `src/data.js` | catalogues and constants | 407 lines |
| `src/style.css`, `head/mid/tail.html` | the shell | 264 lines |

**The honest cost.** The files under `src/game/` are *fragments of one function body*, not standalone modules — they share `s`, `C` and the rest by lexical scope exactly as before. An editor will not parse one alone and `node --check` cannot check one alone; check the built file instead. Making them real modules means giving `createGame`'s closure an explicit context object, which is a large refactor of the highest-risk code in the project, and the guard rails do not yet cover enough to make that safe. It is worth doing only if the fragments start causing errors that the current checks miss.

**`build.py` also refuses to lose code quietly.** A file in `src/` that no manifest entry lists is reported as not built in — the same failure mode §13 describes, where a reversed decision leaves code that reads as working.

**Change trail.** Sources are in git, one commit per version, so a change is a diff over a few files rather than a new 237 KB artifact. `build.py --diff <previous>` additionally reports the line delta in the built output and writes a full unified diff, which is the cross-check that the source diff and the shipped diff agree.

## 13f. The heat sweep was quadratic (v67)

Profiling the simulation — which became possible only once `fingerprint.js` gave a repeatable scenario to profile — put three functions at **75% of all runtime**: `throttleOf` 28.7%, `PART` 27.7%, `siteHeat` 18.3%.

The chain explains it. `rigHash(r)` asks `throttleOf(f)`, which asks `siteTemp(f)`, which asks `siteHeat(f)`, which walks **every rig at the site** calling `rigCoreW`. So a hashrate sweep over N rigs cost N² calls, and every one of those did several `PART` map lookups. Nothing was wrong with any individual function; the cost was in the shape.

This was not only an audit problem. `C.TICK_MS` is 100ms and the speed control goes to 3600×, so the tick has a fixed 100ms budget at every multiplier:

| rigs | before | after | speedup |
|---|---|---|---|
| 10 | 4.6 ms/tick | 1.8 | 2.6× |
| 20 | 17.5 | 2.8 | 6.3× |
| 40 | 57.3 | 3.3 | 17.3× |
| 60 | **81.4** | 4.5 | 17.9× |

At 60 rigs — a farm size Appendix A explicitly designs for — the simulation alone was using 81% of the tick budget before Vue rendered anything. The after-curve is nearly flat, which is the signature of the quadratic term being gone rather than merely reduced. (Measured in the Node harness, whose uncached `computed` shim makes it slower than a browser in absolute terms; the *shape* and the ratios are the game's, not the harness's.)

**The fix is a versioned memo, not a timed one.** `siteHeat` caches per site against a `heatVer` counter, and `touchHeat()` bumps it in `stepTick` and immediately after the wear loop mutates card wear — so a cached value can never outlive the state it was derived from. One gap is stated rather than hidden: the tune slider writes `r.tune` straight from the template, so heat is stale until the next tick — under 100ms at `DT` 0.1, and self-correcting. Everything else routes through a function that bumps.

Verified behaviour-identical by state fingerprint across all seven checkpoints and both seeds.

**This unblocks thread 31.** The two-year balance audit was recorded as impossible because the harness exceeded the execution limit. At the measured 4.5 ms/tick, 730 sim-days at `dt`=600 is about 475 seconds for a 60-rig farm — still long, but splittable across passes, where before it was 81 ms/tick and simply out of reach.

## 13e. The closure refactor (v66)

§13d left `src/game/*.js` as fragments of one 1,736-line closure: they could not be parsed alone, and said the refactor was worth doing only if the fragments started causing errors. They now are real modules. The behaviour is unchanged, and that claim is checked rather than asserted.

**Design.** `createGame` had **7 mutually dependent module pairs**, so any scheme resolving references at install time would deadlock on the cycles. Everything therefore hangs off one context object `G`, and cross-module references resolve at *call* time — exactly the timing the closure already had. Each module is now `function install_x(G){ … Object.assign(G, {…}); }`. Declarations were left completely untouched, so hoisting, evaluation order and intra-module references are the same code they always were; only the 672 plain and 129 shorthand **cross-module** references were rewritten. Install order is the manifest order, which is what the single file already had, so install-time evaluation is unchanged too.

**The safety net came first.** `fingerprint.js` seeds `Math.random` and `Date.now`, runs a scenario touching building, the market, pools, wear, fleet actions and insolvency, and hashes the whole state at seven checkpoints under two seeds. It was validated before being trusted: it reproduces exactly across runs, and it diverges on a `BASE_WEAR` change of 0.0001 — a hashrate difference in the fourth significant figure. A fingerprint that has never diverged proves nothing.

**Four bugs the transform hit, each caught by a different layer.** Worth recording because they are the reasons this kind of refactor should never be done by eye:

| what broke | how it surfaced |
|---|---|
| The first analyser used **indentation** to find module-level symbols. `freshState()`'s body is written at the same two spaces as `createGame`'s top level, so its locals were counted as shared. | Reading the output — `per` and `chains` are obviously not shared. Scope is braces, not columns. |
| `for(const g of paid)` — for-loop declarations were absent from the scope map, so the loop variable was rewritten. | `node --check`: *Missing initializer in const declaration*. |
| `{ ...s.draft }` — spread looks like property access to a `(?<!\.)` lookbehind, so `s` was left pointing at a variable that no longer existed. | Ran and threw at the first `generatePreset`. |
| **`m.check(g)` inside a bare `catch(e){}`.** The export object's rename made this a `ReferenceError` that the catch swallowed. Milestones stopped firing entirely — and every visible number, cash to hashrate to blocks found, was identical. | The state fingerprint alone. Nothing else could have. |

That last one is the argument for the whole approach. `node --check` passed, `audit.py` passed, `smoke.js` passed, and the game looked correct. Only a whole-state hash showed `s.mile.done` empty. The catch has been made non-fatal but no longer silent: a failing predicate now warns once to the console instead of vanishing.

**The payoff, concretely.** Every `src/game/*.js` parses standalone, and `build.py` now runs `node --check` over all 29 JS parts on every build, so a syntax error names one file instead of surfacing as a mystery in a 4,400-line bundle. Modules were also given real names — `04-sites-and-rigs.js` rather than `04-a-site-s-live-output-dispatc.js`. The largest is `07-tick.js` at 418 lines; the median is 104.

**What did not change.** The shared surface is still 203 symbols on one context object, which is not the same as being decoupled — `07-tick.js` alone borrows 48. Splitting that surface into genuinely independent subsystems is a design question about the simulation, not a mechanical transform, and it is not attempted here.

## 14. Open threads

| # | Thread | System |
|---|---|---|
| 1 | **Floor values per chain.** Now the most important numbers in the game — they set where linear becomes diluted, and therefore where every player wants to be. | 1 |
| 2 | **Does the floor rise within a season, or only between them?** Published either way. | 1 |
| 3 | **Base power ceiling value.** The 10× target is relative to it. | 8 |
| 4 | **Token constants** — first cost, exponential rate, cash redemption value. | 8 |
| 5 | **Depth curves per coin.** Load-bearing for onboarding. | 6 |
| ~~6~~ | *Closed in v64 — selection. `fleetRigs` learned to take a list of rig ids, which gave repair, move, refit and rebuild-to-spec selection at once.* Was: bulk refit at scale. | 3/10 |
| 7 | Warm start or cold start for the first hour — both now prototyped. | 9 |
| 8 | Soft centralisation penalty curve | 5 |
| 9 | GPU chain-switching friction magnitude | 3 |
| 10 | Downsizing friction — fraction of upgrade cost recovered | 4 |
| 11 | Co-op tier ladder — capacity and cost per tier | 11 |
| 12 | Redemption queue — do queued shares keep earning while waiting? | 11 |
| ~~13~~ | *Closed in v64 — there is no threshold now. One compact row per rig at every count, with filters instead of a mode switch.* Was: where the fleet-view threshold sits. | 10 |
| 14 | Whether solving a block gets any acknowledgement, given no notifications | 12 |
| 15 | Activity feed retention and depth | 12 |
| 16 | A visual farm view, if cosmetics are ever to be sellable | 13 |
| 18 | Tolerated-discount constant (0.08) and the per-chain `k` values are first estimates — the ratio of depth to recovery within a fixed product is untested. | 6 |
| 19 | **Client/server split** — data model, API surface, authority boundary, reconciliation rule. Nothing can be built until this exists. | 12 |
| 20 | **Account, persistence and offline return.** Continuous simulation means the server ran your farm for three days; the feed for that period is tens of thousands of events, and §12 made the feed the only record. | 12 |
| 21 | **Season operations** — who computes the floors, in what format, through what rollover procedure. | 1 |
| 22 | **Telemetry** — what the server records so seasons can be retuned. | all |
| ~~23~~ | *Closed — seasons removed, so there is no boundary to deflate toward.* Was: the twenty-day wind-down. Nothing is worth buying after ~day 70 of 90. Options: shorter season, faster paybacks, or something that keeps late purchases rational. Created by the move to 1:1. | 1/7 |
| ~~24~~ | *Closed — no season to measure against; the flip now recurs daily with the sun.* Was: the short cash-bound phase. Half the central inversion gets 18% of the season. A higher starting ceiling or a slower early ramp would rebalance it. | 8 |
| 25 | **The 24-hour offline cap bends the 1:1 clock.** A week away credits one day. Options: raise the cap, decay the credit, or an "away mode" the player arms deliberately. | 1/13c |
| 26 | **Save-version mismatches discard the save.** Fine for prototypes; production needs migrations. | 13c |
| 27 | **Generations × economy long-run is unmeasured.** Card prices grow 1.38×/gen while PAY stays flat — at some generation count, entry cards and coin prices need a rebalance pass. | 3b |
| ~~28~~ | *Closed in v34 — the battery card names its binding cap with numbers.* Was: battery value gated by night headroom, silently. | 4/10b |
| ~~29~~ | *Closed in v34 — OUTGROWN tag with an honest post-move projection.* Was: a group can outgrow its chain silently. | 2/10b |
| ~~32~~ | *Closed in v64 — `chainCeiling` owns the condition, shown as an amber advisory on Build and an AT CEILING tag on the group card. Deliberately not in `canBuild`.* Was: Tessera's floor is an invisible ceiling. | 6c |
| 31 | **The two-year balance audit — now feasible.** It was recorded as blocked because the harness exceeded the execution limit; §13f found the real cause was a quadratic heat sweep, and at 4.5 ms/tick a 730-day run is ~475s for a 60-rig farm, splittable across passes. `fingerprint.js` supplies the deterministic scenario runner. Still to do, and still the reason Appendix B is stale by a measured 20x. | 3b/27 |
| ~~38~~ | *Closed in v64 — `draftRate` prices the group a new rig will actually join, and the verdict names the chain.* Was: projections quoted the best chain on the network. | 6i |
| ~~30~~ | *Closed in v34 — COOKING crossings, dead-rig announcements.* Was: mass wear-death too quiet. | 3/10b |
| 17 | **Does the game need any scheduled event at all?** With no halving, no failures and no notifications there is nothing on a clock but the season boundary. A rising difficulty floor within the season is the obvious candidate if playtesting finds it flat. | 1/2 |

**Closed since last revision:** riser failure rate, build time duration, build slot escalation, the fifth prestige axis, minimum difficulty floor as a concept (now §1's core mechanic), whether risers earn a slot (kept as a flat cost), frame-versus-motherboard differentiation, and the PROP/PPLNS collapse.

---

## Appendix A — The shape of a run

No calendar. The shape comes from which resource is binding.

| Phase | Driven by | Character |
|---|---|---|
| **Cash-bound** | Watts to spare, no money | Cheapest hashrate wins even when thirsty. Every purchase is productive. |
| **The flip** | Installed load passes ~85% of capacity | The question changes from *dollars per MH* to *dollars per watt*. The shop's ranking inverts and undervolting starts paying. |
| **Power-bound** | Capacity is full | Growth comes from **refit** — same watts, better cards — or from **building more capacity**, which is a construction project rather than a purchase. |
| **Operator** | Capital exceeds what watts can absorb | Found a pool. Growth is now the size of a bond rather than the size of a farm. |

The loop repeats at larger scale rather than resetting: a bigger site returns you to cash-bound with a higher ceiling.

**Solar adds a daily cycle on top.** Capacity peaks at midday and falls to nothing at night, so a renewable-heavy site is power-bound after dark and cash-bound at noon — the flip happens twice a day.

## Appendix B — Validated figures

> **⚠ Stale as of v63 — do not quote these numbers.** They were verified against prototype 13, before the v53 rescale and before seasons were removed. The anchor row below says $0.21 per MH/s per day; `C.PAY` in the current code is **$4.20**, exactly **20×** that. Every figure derived from it — paybacks, $/watt, the ceiling-fill day — is wrong by that factor or worse, and card prices were rescaled independently on top of it, so the error is not a single clean multiple. Measured against v63: the generated entry preset (4× RX-470, $192, 96 MH/s) quotes a payback of **0.30 days** against the 19.7 days below.
>
> These rows are left in place rather than patched, because replacing them with numbers from a single harness run would just be a fresher guess. Re-deriving them is thread 31's job — the two-year balance audit that has never run — and it should now be possible with `smoke.js` as the starting point rather than a harness built from scratch.

Verified numerically against prototype 13, at 1:1 in a ninety-day season.

| Constant | Value | Note |
|---|---|---|
| Clock | 1:1, real time | One real minute is one game minute. |
| Season | 90 days | Forced by the clock; see §1. |
| Revenue per MH/s per day | $0.21 at 1.00× | Anchor for the whole economy. |
| `ELEC` | $0.63/kWh flat | High — roughly 3× US residential. It is what keeps power a meaningful share of revenue while hardware stays realistically priced and paybacks fit a season. The three cannot all be realistic at once. |
| Power share of revenue | 43% on the cheapest card, 15% on the most efficient | The spread that makes the ladder work. |
| Entry build | 3× GTX-1660S, $254 of $500, 93 MH/s, 438W, $12.91/day | Payback 19.7 days of 90. |
| Best payback (cash-bound) | GTX-1660S 8.9d, RX-580 8.8d, RX-470 9.1d | Cheap used cards win when money is short. |
| Best $/watt (power-bound) | A5000 $18.95, A4000 $18.00, RTX-3070 $14.91 per kW/day | Near-exact inversion of the payback ranking. |
| Flip threshold | ~85% of the account power ceiling | Where the ranking changes over. |
| **Ceiling fills** | **~day 16 of 90**, greedy reinvestment | From $500 and 6.5 kW. Much earlier than the 24× build, where it was day 319 of 720 — see thread 24. |
| Buying stops | ~day 70 of 90 | Nothing pays back in the time remaining. |
| Refit gain | 1,581 → 3,422 MH/s at the same 6.2 kW | GTX-1660S → A4000, ~$13,000, zero extra watts. |
| Wear vs temperature | 1.3× at 65°C, 2.0× at 70°C, 3.3× at 76°C | Steep enough that cooling is a real purchase. |
| Thermal range | 29°C one rig · 76°C full tier 2 open · 43°C full tier 2 immersed | Cooling is worthless early and decisive late. |
| Card ladder | 0.20–0.58 MH/W across a 20× price spread | Both ends viable because the binding constraint changes. |
| Catalogue | 7 frames, 7 boards, 7 coolers, 8 supplies, 12 cards — all card builds | |
| Decay bounds | hash floor ~60%, draw ceiling ~150% | Asymptotic, to damp the heat/wear loop. |
| Build time | ~22 real minutes | A small friction, not a throughput limit. |
| Tessera cadence | pool pays ~7 min, solo block ~4.5 h | Idle rhythm at 1:1, for a 93 MH/s starter. |

---

## Appendix C — Simulation maths

**Difficulty.** `max(floor, observedHash) × blockTarget`, with `observedHash` chasing actual at 3% per block.

**Block discovery.** Poisson is additive, so sampling disjoint slices separately and summing is exactly equivalent to sampling the whole network at once — which is what lets a player's own rig legitimately be the one that solves a pool's block:

```
yourBlocks = Poisson(dt * yourHash / difficulty)
poolBlocks = Poisson(dt * poolCapacity / difficulty)
restBlocks = Poisson(dt * otherPlayerHash / difficulty)
```

**Payout expected value.** `evMult = (1 - fee) * (scheme == PPS ? 1 : 1 + txFeeRate)`

**Retarget, above the floor only.** `newDiff = max(floor, oldDiff * clamp(targetSpan / actualSpan, 0.25, 4.0))`

**Rig hashrate.** `Σ over cards of (cardMh × (1 - 0.4·wear)) × (1 + tune) × siteThrottle`

**Rig wall draw.** `(chassisW + Σ unitW × (1 + 0.5·wear) × (1 + 1.9·tune)) / psuEfficiency × facilityPUE`

**Tokens from cash spent.** With first cost `c` and rate `r`: `tokens ≈ log(1 + cash·r/c) / log(1+r)` — tokens grow as log(cash), so a player earning 87× more in a season gains roughly 4× the tokens.

**Coin issuance cap.** `maxIssuance = 86400 × reward / blockTarget` — pinned by the difficulty floor, so demand never needs a population term.

**Steady-state price discount.** `impact* = Q / (depth × recovery)`, hence `depth × recovery = maxIssuance / toleratedDiscount`. Only the ratio is free.

**Co-op share value.** `payout = (yourShares / totalShares) × realisedLiquidationValue`

**Chain rate for a player.** `revenuePerMh × chainMultiplier` — the risk ladder.
