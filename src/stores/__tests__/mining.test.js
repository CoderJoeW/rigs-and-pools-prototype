import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

/* Mining is randomized (block arrival is drawn per-window), so these tests
   lean on large tick chunks against short-window chains rather than exact
   counts: Tessera's block window is well under two minutes for any rig-sized
   hashrate, so a single multi-hour tick should find many blocks with
   overwhelming probability, not flakily. */

describe('Tessera balance', () => {
  // revPerMh()/diffOf() (dispatch.js) never read mult — a mult comparison
  // alone proves nothing about realized pay. mult IS read elsewhere though
  // (pool float/bond sizing in poolMarket.js and rivals.js, and the Chains
  // tab's own pay-rate display), so it isn't dead — just not what determines
  // the number this test actually cares about. This drives the real
  // simulation and compares the number a player actually sees: Tessera
  // should no longer be a strict giveaway (drastically better than
  // everything else, permanently, with zero competition), but it also
  // shouldn't fall below Nova — the chain deliberately designed to be the
  // ladder's worst payer (see chains.js: "the lowest pay per MH").
  it('settles to a realized rate comparable to the ladder, not the worst chain in it', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const nova = g.s.chains.find(c => c.id === 'nova');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
    for (let i = 0; i < 100; i++) g.stepTick(3600); // let price and difficulty settle

    expect(g.revPerMh(tessera)).toBeGreaterThan(g.revPerMh(nova));
  });

  it('the floor sits within reach of a modestly grown farm, not just a single rig forever', () => {
    // The lower-bound test above alone isn't enough: it's satisfied by the
    // OLD, over-powered numbers too (old Tessera also beat Nova on realized
    // rate), so on its own it wouldn't have caught what issue #2 is actually
    // about. A rank-based "is Tessera the best payer" check doesn't work
    // either — measured directly, Halcyon already realizes a higher rate
    // than Tessera under BOTH the old and the new numbers, so "not the max"
    // is true either way and proves nothing (the same vacuousness the first
    // version of this test had, from a different angle).
    //
    // What actually changed is whether the floor is reachable by
    // chainCeiling's own AT CEILING gate (net>floor, share>=0.5 — see
    // dispatch.js) — NOT by groupAdvice's OUTGROWN gate, which needs
    // net>floor*1.2 plus another chain paying >=1.5x more and doesn't clear
    // until roughly a third rig's worth of hash. chainCeiling(chain,
    // extraMh) is the same check BuildView runs against a rig being
    // planned, so calling it with a second rig's worth of hash as extraMh
    // pins the real behaviour rather than just comparing raw numbers. Under
    // the old floor (500) a second rig's worth (~384 MH) never crossed it;
    // under the new floor (350) it does.
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    const oneRig = g.dp.mh;
    expect(g.chainCeiling(tessera)).toBeNull(); // one rig alone: still below the floor
    expect(g.chainCeiling(tessera, oneRig)).not.toBeNull(); // a second rig's worth pushes past it
  });
});

describe('solo block finding', () => {
  it('a rig mining solo on Tessera finds blocks and gets paid', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
    expect(g.totalHash).toBeGreaterThan(0);
    expect(g.s.groups[0].chain).toBe('tessera'); // the default starting chain

    g.stepTick(3600); // one game-hour in one chunk

    expect(g.s.blocksSolved).toBeGreaterThan(0);
    expect(g.s.wallet.tessera).toBeGreaterThan(0);
  });

  it("today's block count tracks real blocks found, not stuck at 0", () => {
    // today.blocks starts undefined on a legacy-shaped save and blocks++
    // silently produces NaN, which the UI's `|| 0` fallback then displays
    // as a plausible-looking but wrong zero — this pins the real count.
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.stepTick(3600);

    // blocksSolved counts every solo block found, including orphaned ones;
    // today.blocks only counts the ones actually credited, so it's <=, not ==.
    expect(g.s.today.blocks).toBeGreaterThan(0);
    expect(g.s.today.blocks).toBeLessThanOrEqual(g.s.blocksSolved);
    expect(Number.isNaN(g.s.today.blocks)).toBe(false);
  });

  it('repeated orphans collapse into one feed line instead of spamming one each', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    // The real roll is Math.random() < c.orphan*(1-CONN_Q) (tick.js) — CONN_Q
    // is 0.35, so orphan must clear 1/0.65 (~1.54) to make every solo find
    // orphan with certainty, not just orphan=1 (which is only p=0.65).
    tessera.orphan = 2;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.stepTick(3600); // plenty of blocks on a 20s-window chain

    expect(g.s.orphaned).toBeGreaterThan(1); // several orphan events really happened
    const orphanLines = g.s.feed.filter(e => e.text === 'Orphaned on Tessera');
    // other feed kinds (milestones etc.) can interleave and start a new run,
    // so this doesn't assert exactly one line — only that consecutive repeats
    // collapse rather than spamming one line per event, and none are lost.
    expect(orphanLines.length).toBeGreaterThan(0);
    expect(orphanLines.length).toBeLessThan(g.s.orphaned);
    expect(orphanLines.reduce((a, e) => a + e.n, 0)).toBe(g.s.orphaned);
  });

  it('difficulty (obs) retargets away from the floor once blocks land', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    expect(tessera.obs).toBe(tessera.floor); // nobody has mined it yet

    g.generatePreset();
    g.build();
    g.stepTick(3600); // finishes assembly and mines for about an hour in one chunk

    // a starter rig's hashrate sits below Tessera's floor (see chains.js),
    // so once blocks land and obs retargets per block, it should have
    // moved — direction (up or down) isn't asserted, only that retargeting
    // happened
    expect(tessera.obs).not.toBe(tessera.floor);
    expect(Number.isFinite(tessera.obs)).toBe(true);
  });
});

/* Issue #9: "Biggest block yet" only ever fires on a genuine all-time
   record — trivially broken almost immediately, then rarely challenged
   again — so a jackpot needs its own signal: far above what the player's
   actually been seeing lately, whether or not it's a new record.

   Round 1 review found the window was pooled across ALL chains, which
   falsely flagged almost every block on a chain that's a minority
   contributor (block value differs 20-90x between chains) — recentBlockUsd
   is keyed by chain id per-chain now, so these seed a specific chain's
   array (`{tessera:[...]}`), not a flat one. Round 1 also caught real
   flakiness in two of these tests: stepTick(60) alone finds zero credited
   blocks often enough (~2.7%, measured) to intermittently fail a test
   that assumes "at least one lands." Fixed with either a much longer
   window (virtually certain) or polling until a real change is observed,
   per test. */
describe('jackpot blocks', () => {
  it("stays quiet until there's a real baseline (BLOCK_BASELINE_MIN samples) to compare against", () => {
    // Tessera's 20s blocks land fast enough that a whole minute can cross
    // BLOCK_BASELINE_MIN mid-tick (legitimate — the gate should open the
    // moment 5 real samples exist, even mid-tick), so this can't assume
    // "however many blocks land, none should be a jackpot" over a long
    // window. Instead it resets the baseline to empty and uses a window
    // short enough that landing 5+ blocks would itself be the anomaly.
    // Landing zero is not a failure mode here (0 < 5 either way), unlike
    // the tests below that need at least one credited block.
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly (this alone can already find blocks)
    g.s.recentBlockUsd = {};
    g.s.bestBlock = 1; // isolate from the record path too

    g.stepTick(40); // ~2 Tessera blocks expected — safely under BLOCK_BASELINE_MIN(5)

    const tesseraSamples = g.s.recentBlockUsd.tessera || [];
    expect(tesseraSamples.length).toBeLessThan(5);
    expect(g.s.feed.some(e => e.kind === 'jackpot')).toBe(false);
  });

  it('a block clearing 3x the recent median fires a jackpot instead of a routine toast', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    // isolate from whatever record already exists — a real Tessera block at
    // this preset's default price/reward is worth ~$0.45 (17.72*1.06*0.024);
    // a $0.10 baseline puts the 3x line at $0.30, comfortably cleared
    g.s.bestBlock = 1;
    g.s.recentBlockUsd = { tessera: [0.1, 0.1, 0.1, 0.1, 0.1] };

    // poll until at least one new Tessera block is credited — a fixed
    // window here was measured flaky (~2/150) since stepTick(60) alone
    // sometimes finds nothing to credit
    const before = g.s.recentBlockUsd.tessera.length;
    let guard = 0;
    while (g.s.recentBlockUsd.tessera.length === before && guard++ < 400) g.stepTick(10);

    // feed, not toast: other same-tick events (milestones etc.) can pop()
    // after the jackpot and overwrite the single shared "last toast" field,
    // but every event still gets its own feed line regardless of ordering.
    expect(g.s.feed.some(e => e.kind === 'jackpot')).toBe(true);
    expect(g.s.bestBlock).toBe(1); // unaffected — this wasn't a record
  });

  it('a new all-time record still wins over a jackpot for the same block', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // this can already set a record on its own

    // reset explicitly rather than assuming a fresh store's bestBlock is
    // still 0 by this point — Tessera's 20s blocks likely already landed
    // (and recorded) during the assembly-finishing ticks above
    g.s.bestBlock = 0;
    g.s.recentBlockUsd = { tessera: [0.1, 0.1, 0.1, 0.1, 0.1] }; // would also qualify as a jackpot on its own

    // Neither a long nor a short fixed window is reliable here: too long
    // and a SECOND block can land in the same call — which is its own
    // real, separate jackpot against this seeded baseline (the first
    // block's record doesn't retroactively raise the median), not a
    // violation of what's under test; too short and often nothing lands
    // at all. Polling in small steps until exactly one new block has been
    // credited isolates a single block's own record-vs-jackpot resolution
    // deterministically, regardless of the K-model's arrival variance.
    const before = g.s.recentBlockUsd.tessera.length;
    let guard = 0;
    while (g.s.recentBlockUsd.tessera.length === before && guard++ < 400) g.stepTick(5);
    expect(g.s.recentBlockUsd.tessera.length).toBe(before + 1); // exactly one new block credited

    // "Biggest block yet" is the TOAST text specifically (pop()) — the feed
    // line for a record block was already, and stays, the routine "Block
    // solved solo on X" (kind:'block'); only a jackpot gets its own feed
    // wording. So the record path is verified via bestBlock itself plus
    // the absence of a jackpot line, not by a feed string that was never
    // there even before this change.
    expect(g.s.bestBlock).toBeGreaterThan(0);
    expect(g.s.feed.some(e => e.kind === 'jackpot')).toBe(false);
  });

  it('a low-value chain in the same save never drags down a bigger chain\'s own baseline', () => {
    // Reproduces round 1's exact finding: with a pooled window, Tessera's
    // tiny real blocks (~$0.45) dragged the shared median so low that
    // Ferro's own real blocks (~$9.28) cleared 3x of it almost every
    // time — simulated at 79/80 false positives. Seeding ONLY Tessera's
    // low baseline and switching mining to Ferro isolates exactly that:
    // Ferro starts with no baseline of its own (null — needs its own 5
    // samples first), so its first real blocks build up a Ferro-shaped
    // baseline untouched by Tessera's numbers, and none of them should
    // read as a jackpot once Ferro has enough of its own history.
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.s.bestBlock = 1e9; // isolate from the record path
    g.s.recentBlockUsd = { tessera: [0.1, 0.1, 0.1, 0.1, 0.1] };
    g.setGroupChain(g.s.groups[0], 'ferro');
    // the feed caps at 70 entries (poolMarket.js's say()), truncating the
    // OLDEST — a length-diff ("entries added" = feed.length - before) would
    // silently undercount, and could even miss the one entry that matters,
    // once enough ticks push it out of the window. feedId is a monotonic
    // counter untouched by that cap, so filtering on id is safe regardless
    // of how much else happens to land in the feed meanwhile; keeping the
    // sample target modest (2 past the 5-sample minimum, not 10) also keeps
    // this comfortably clear of the cap in the first place.
    const feedIdBefore = g.s.feedId;

    // enough real Ferro blocks to both build its own baseline
    // (BLOCK_BASELINE_MIN=5 samples) and then test a couple more against it
    let guard = 0;
    while ((g.s.recentBlockUsd.ferro || []).length < 7 && guard++ < 4000) g.stepTick(30);
    expect((g.s.recentBlockUsd.ferro || []).length).toBeGreaterThanOrEqual(7);

    const newEntries = g.s.feed.filter(e => e.id >= feedIdBefore);
    expect(newEntries.some(e => e.kind === 'jackpot')).toBe(false);
    expect(g.s.recentBlockUsd.tessera).toEqual([0.1, 0.1, 0.1, 0.1, 0.1]); // untouched by Ferro's own blocks
  });

  it('recentBlockUsd rolls and stays capped at the baseline window', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.recentBlockUsd = { tessera: Array(20).fill(0.2) }; // already at the window's cap

    // long enough that at least one of several Tessera blocks lands
    // uncredited-orphan odds against ALL of them are negligible
    g.stepTick(300);

    expect(g.s.recentBlockUsd.tessera.length).toBe(20); // grew and shed in step, never over the cap
  });

  it('a save (or a future smaller window) that leaves recentBlockUsd oversized settles back to the cap, not stuck above it', () => {
    // The natural cap-enforcement above (push then shift once) only ever
    // PREVENTS further growth from an already-correctly-sized array — it
    // can't recover one that starts oversized, since one shift for one
    // push nets zero change in length. A while-loop is needed to actually
    // converge back down; an if would leave this permanently oversized.
    // Uses a long window (not the polling pattern above): length starts
    // ABOVE before, not below, so "wait for length to change" would
    // trigger on the first correcting shrink regardless of whether a real
    // block landed — a long, virtually-certain window sidesteps that.
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.s.recentBlockUsd = { tessera: Array(23).fill(0.2) }; // past the cap by 3 — never happens in normal play

    g.stepTick(300); // however many blocks land, even just one push must fully re-converge

    expect(g.s.recentBlockUsd.tessera.length).toBe(20);
  });

  it('orphaned blocks pay nothing and never count toward the baseline', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    tessera.orphan = 2; // Math.random() < orphan*(1-CONN_Q) — guarantees every solo find orphans
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    g.stepTick(300);

    expect(g.s.orphaned).toBeGreaterThan(0);
    expect(g.s.recentBlockUsd.tessera).toBeUndefined(); // never even lazily created
  });
});

describe('chain price', () => {
  it('fundOf rises when a chain carries more hashrate than it did when it opened', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera');
    // with no hash yet, ratio clamps to max(1, 0)/anchor = 1: fundOf is par
    const parPrice = g.fundOf(tessera);
    expect(parPrice).toBeGreaterThan(0);

    // anchor tracks where the chain's hashrate stood when it opened; a chain
    // now carrying twice what it opened with should command a premium
    tessera.anchor = 0.5;
    expect(g.fundOf(tessera)).toBeGreaterThan(parPrice);
  });

  it('the reference price relaxes toward the fundamental over time', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    for (let i = 0; i < 3; i++) {
      g.s.cash += 100000;
      if (g.generatePreset()) g.build();
    }

    const tessera = g.s.chains.find(c => c.id === 'tessera');
    const refBefore = tessera.ref;
    // several game-days so the ~3-day relaxation constant has room to act
    for (let i = 0; i < 10; i++) g.stepTick(86400 / 3);
    expect(tessera.ref).not.toBe(refBefore);
    expect(Number.isFinite(tessera.ref)).toBe(true);
    expect(tessera.ref).toBeGreaterThan(0);
  });
});

describe('milestones', () => {
  it('fires a milestone once its condition is met, and never twice', () => {
    const g = freshStore();
    expect(g.s.mile.done.h1).toBeUndefined();

    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(g.totalHash).toBeGreaterThanOrEqual(100); // the preset clears h1's bar comfortably

    g.stepTick();
    expect(g.s.mile.done.h1).toBeTypeOf('number');

    const firstTimestamp = g.s.mile.done.h1;
    g.stepTick();
    expect(g.s.mile.done.h1).toBe(firstTimestamp); // unchanged, not re-fired
  });

  it('ranks up once enough milestones are done', () => {
    const g = freshStore();
    // seed 3 milestones as already done without touching real game state,
    // then let a 4th complete for real — RANKS[1] is 'Tinkerer' at 4 done
    g.s.mile.done = { fake1: 1, fake2: 1, fake3: 1 };
    expect(g.s.mile.rank).toBe(0);

    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.stepTick();

    expect(Object.keys(g.s.mile.done).length).toBeGreaterThanOrEqual(4);
    expect(g.s.mile.rank).toBeGreaterThanOrEqual(1);
  });

  it('pure block-count volume (b2/b3) does not clear from a single sim-day of passive, untouched play', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly, start earning
    for (let i = 0; i < 24; i++) g.stepTick(3600); // 1 full sim-day, zero decisions after the opening build

    // b1 (first block) is still meant to fire fast — confirms this fix didn't
    // accidentally raise the wrong milestone too
    expect(g.s.mile.done.b1).toBeTypeOf('number');
    expect(g.s.mile.done.b2).toBeUndefined();
    expect(g.s.mile.done.b3).toBeUndefined();
    // exactly h1, b1, c2 fire from one passive day on the preset rig — pin
    // the whole set, not just a rank number, so a future milestone that
    // starts firing passively fails loudly here instead of silently
    // creeping the margin against Tinkerer's 4-milestone bar
    expect(Object.keys(g.s.mile.done).sort()).toEqual(['b1', 'c2', 'h1']);
    expect(g.s.mile.rank).toBe(0); // still Hobbyist, not Tinkerer, from block volume alone
  });
});
