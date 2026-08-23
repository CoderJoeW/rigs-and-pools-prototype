import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';

/* groupAdvice/chainCeiling drive the OUTGROWN / AT CEILING advisory tags on
   Farm — the warning that a group's own hashrate has grown large enough
   that it's setting the chain's difficulty rather than just buying a share
   of it. These guard clauses are what keeps that warning from firing on a
   perfectly normal, un-concentrated farm; a bug here would show players a
   misleading "you've outgrown this chain" nudge when they haven't. */
describe('rigHash wear decay', () => {
  it('is asymptotic at w=1: hashrate approaches ~60% and never cliffs past it (issue #20)', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60); // finish assembly
    const rig = g.s.rigs[0];

    rig.units.forEach((u: any) => u.w = 0.999999);
    const justBelow = g.rigHash(rig);
    rig.units.forEach((u: any) => u.w = 1);
    const atCeiling = g.rigHash(rig);

    // continuous — no discontinuous drop crossing w=1, unlike the old
    // WORN_OUT=0.25 special case (a 0.6->0.25 cliff)
    expect(atCeiling).toBeCloseTo(justBelow, 2);
    // bounded at the spec's ~60% floor (design-spec.md §3), not below it
    rig.units.forEach((u: any) => u.w = 0);
    const unworn = g.rigHash(rig);
    expect(atCeiling / unworn).toBeCloseTo(0.6, 2);
  });
});

describe('chainCeiling', () => {
  it('returns null for a missing chain', () => {
    const g = freshStore();
    expect(g.chainCeiling(undefined)).toBeNull();
  });

  it('returns null before any hash is on the chain', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    expect(g.chainCeiling(tessera)).toBeNull();
  });

  it('returns null for a real starter rig on Tessera — the floor gives a genuine below-floor period', () => {
    // Tessera's floor is tuned to sit above a single starter rig's hashrate
    // on purpose (see chains.js): the newcomer subsidy should mean something
    // before it starts fading, not vanish the instant a rig finishes.
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeGreaterThan(0);
    expect(g.totalHash).toBeLessThan(tessera.floor);
    expect(g.chainCeiling(tessera)).toBeNull();
  });

  it('returns null for the draft rig on the Build tab before any rig is actually owned', () => {
    // BuildView.vue calls chainCeiling(chain, draftHash) to warn about the
    // rig being planned — that must not fire before the player owns
    // anything, or the very first screen of a new game tells them their
    // starting chain is already maxed out (docs/design-spec.md §10b:
    // "Starters below the floor are never nudged").
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    g.generatePreset();
    expect(g.s.rigs).toHaveLength(0);
    expect(g.chainCeiling(tessera, g.dp.mh)).toBeNull();
  });

  it('fires once a group genuinely holds most of a chain above its floor', () => {
    // isolate the guard's actual logic from whatever Tessera's floor is
    // currently tuned to — this pins the function's behavior at the
    // boundary, not a specific production balance number.
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    tessera.floor = 100;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeGreaterThan(tessera.floor);
    const ceiling = g.chainCeiling(tessera);
    expect(ceiling).not.toBeNull();
    expect(ceiling!.share).toBe(1); // Tessera has no simulated miners
  });
});

describe('groupAdvice', () => {
  it('returns null for a group with no live hash pointed at its chain', () => {
    const g = freshStore();
    expect(g.groupAdvice(g.s.groups[0])).toBeNull();
  });

  it('returns null for a small share of a chain with real traffic, even mid-build', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);
    g.setGroupChain(g.s.groups[0], 'halcyon'); // a chain with a real simulated network

    expect(g.groupAdvice(g.s.groups[0])).toBeNull();
  });

  it('returns null for a real starter rig on Tessera, still within its below-floor period', () => {
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    expect(g.totalHash).toBeLessThan(tessera.floor);
    expect(g.groupAdvice(g.s.groups[0])).toBeNull();
  });

  it('nudges toward a better chain once a group has genuinely outgrown its own', () => {
    // Isolated from production tuning on two axes: floor, so the "above
    // floor, majority share" gate clears immediately, and reward — the
    // field revPerMh() actually reads at runtime (traced in dispatch.js).
    // mult is only ever read for pool float/bond sizing (poolMarket.js,
    // rivals.js) and the Chains tab's own pay-rate display, never by
    // revPerMh/diffOf, so overriding mult alone wouldn't change anything
    // here. Forcing a low reward makes this chain clearly the worst payer,
    // which is what it takes to clear groupAdvice's own >=1.5x-better bar —
    // Tessera's real tuning now sits close enough to the rest of the ladder
    // that it no longer clears that bar on its own (a good sign for the
    // balance, but it means this specific branch needs an isolated scenario
    // to reach).
    const g = freshStore();
    const tessera = g.s.chains.find(c => c.id === 'tessera')!;
    tessera.floor = 10;
    tessera.reward = 1;
    g.generatePreset();
    g.build();
    for (let i = 0; i < 5; i++) g.stepTick(60);

    const advice = g.groupAdvice(g.s.groups[0]);
    expect(advice).not.toBeNull();
    expect(advice!.share).toBe(1);
    expect(g.s.chains.map(c => c.id)).toContain(advice!.alt.toLowerCase());
  });
});

/* idleCashAdvice drives the "sitting idle" nudge on Farm (issue #7: nothing
   pulled cash toward the next purchase once a rig and site existed). It
   deliberately does NOT read the Build tab's shared draft (g.dp/g.canBuild)
   — that state only refreshes when a player visits Build, so it goes stale
   the moment the site's real constraints move past whatever was last
   drafted (see openBuildCost's derivation comment in buildDraft.js). It
   must also stay quiet whenever there's genuinely nowhere to put the
   money, so it never claims a purchase is available when it isn't. */
describe('idleCashAdvice', () => {
  it('returns null on a fresh game — starting cash is not 2x what a real build costs', () => {
    const g = freshStore();
    g.s.cash = 1e6; // learn the real, cash-independent cost first
    const cost = g.idleCashAdvice!.cost;
    g.s.cash = 500; // the actual starting balance
    expect(500).toBeLessThan(cost * 2);
    expect(g.idleCashAdvice).toBeNull();
  });

  it('returns null right after building — cash is spent, not idle', () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    expect(g.idleCashAdvice).toBeNull(); // ~$34 left, nowhere near 2x anything real
  });

  it('returns null once the active site has no open positions, no matter how much cash sits idle', () => {
    const g = freshStore();
    g.s.cash = 1e6;
    g.active.sources.push({ p: 's-400', n: 1 }); // remove power as a constraint — floor space only
    // fill every remaining position so there is genuinely nowhere to build
    let guard = 0;
    while (g.siteRigs(g.active).length < g.siteSlots(g.active) && guard++ < 20) {
      expect(g.generatePreset()).toBe(true);
      g.build();
    }
    expect(g.siteRigs(g.active).length).toBe(g.siteSlots(g.active));
    expect(g.idleCashAdvice).toBeNull();
  });

  it('stays accurate even when the shared Build-tab draft is stale or nonsensical', () => {
    // The bug this replaced: reading g.dp/g.canBuild meant the advisory
    // could go permanently silent the moment the site's power headroom no
    // longer fit whatever was last drafted, since nothing outside Build
    // ever re-runs generatePreset(). Verified in a real browser run: after
    // building one rig and letting cash regrow for days, the advisory
    // never fired under the old implementation. This pins the fix by
    // forcing the draft into a state that could never itself be built
    // (0 cards) and confirming the advisory still finds a real answer.
    const g = freshStore();
    g.s.cash = 1e6;
    g.s.draft.n = 999; // more cards than any frame/board combo can carry
    expect(g.canBuild).toBe(false);
    const advice = g.idleCashAdvice;
    expect(advice).not.toBeNull();
    expect(advice!.cost).toBeGreaterThan(0);
  });

  it('fires once cash sits at least 2x what a real build costs, with room to build it', () => {
    const g = freshStore();
    g.s.cash = 1e6; // learn the real, cash-independent cost first
    const cost = g.idleCashAdvice!.cost;
    g.s.cash = cost * 2; // exactly at the line — inclusive
    const advice = g.idleCashAdvice;
    expect(advice).not.toBeNull();
    expect(advice!.cost).toBe(cost); // stable — unaffected by the cash change
    expect(advice!.open).toBe(g.siteSlots(g.active)); // nothing built yet
    expect(advice!.site.id).toBe(g.active.id);
  });

  it('falls just short of the line at 2x minus a cent', () => {
    const g = freshStore();
    g.s.cash = 1e6;
    const cost = g.idleCashAdvice!.cost;
    g.s.cash = cost * 2 - 0.01;
    expect(g.idleCashAdvice).toBeNull();
  });
});
