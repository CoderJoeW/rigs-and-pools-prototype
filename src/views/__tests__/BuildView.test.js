import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import { fmt } from '../../utils/format.js';
import { cssRule, cssSource } from '../../test/cssRule.js';
import BuildView from '../BuildView.vue';

describe('BuildView', () => {
  it('loads the preset on mount and shows an orderable draft', () => {
    const { wrapper, store } = mountWithStore(BuildView);
    expect(store.canBuild).toBe(true); // generatePreset() ran during setup
    expect(wrapper.text()).toContain('Order parts');
    expect(wrapper.text()).toContain('Build a rig');
  });

  it('switching to Customise shows the individual part pickers', async () => {
    const { wrapper } = mountWithStore(BuildView);
    const customiseBtn = wrapper.findAll('button').find(b => b.text() === 'Customise');
    await customiseBtn.trigger('click');
    expect(wrapper.text()).toContain('Frame');
    expect(wrapper.text()).toContain('Board');
    expect(wrapper.text()).toContain('Supply');
  });

  it('labels the card-model picker and the card-count stepper differently, since they used to both say "Cards"', async () => {
    // one row picks WHICH card, the other picks HOW MANY — identical
    // headers on two adjacent rows made it look like one was a redundant
    // duplicate of the other rather than two different controls. Anchored
    // to each row specifically (not just "the set of labels is distinct")
    // so a future edit that swapped the two labels — leaving the model
    // picker headed "Count" and the stepper headed "Cards" — would fail
    // this the same way it would have failed the original bug report.
    const { wrapper } = mountWithStore(BuildView);
    await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
    const stepperRow = wrapper.findAll('.pickrow').find(r => r.find('.stepper').exists());
    const modelRow = wrapper.findAll('button.pickrow').find(r => r.text().includes('MH/W'));
    expect(stepperRow.find('.lab').text()).toBe('Count');
    expect(modelRow.find('.lab').text()).toBe('Cards');
  });

  it('marks each part-picker row as opening a dialog, for assistive tech that announces it before activation', async () => {
    const { wrapper } = mountWithStore(BuildView);
    await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
    // .pickrow also matches the Count stepper row, a plain (non-button)
    // div that doesn't open anything — scope to the actual picker buttons
    const pickrows = wrapper.findAll('button.pickrow');
    expect(pickrows.length).toBe(5); // frame, mobo, cool, psu, unit
    for (const row of pickrows) expect(row.attributes('aria-haspopup')).toBe('dialog');
    // and the thing it actually opens really is one, so the announcement isn't a lie
    await pickrows[0].trigger('click');
    expect(wrapper.find('.sheet').attributes('role')).toBe('dialog');
  });

  describe('the Quick pick / Customise segmented control', () => {
    it('slides its thumb to the active segment instead of just repainting it', async () => {
      const { wrapper } = mountWithStore(BuildView);
      const seg = wrapper.find('.seg2');
      expect(seg.classes()).not.toContain('custom'); // preset first, always
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      expect(seg.classes()).toContain('custom');
      await wrapper.findAll('button').find(b => b.text() === 'Quick pick').trigger('click');
      expect(seg.classes()).not.toContain('custom');
    });

    it('uses a fixed dark ink for the active label, not white — white only clears WCAG AA in neither theme', () => {
      // white-on-green is ~3.55:1 in the light theme and ~1.62:1 in the dark
      // one (--green flips from a mid-dark tone to a bright one) — both
      // fail the 4.5:1 normal-text minimum. A dark ink held constant across
      // both themes clears it in both (5.21:1 / 11.46:1, measured), since
      // --green never gets dark enough in dark mode to need light text.
      expect(cssRule('.seg2 button.on')).toMatch(/color:\s*var\(--ink-on-accent\)/);
      // asserts the LITERAL value, and that it's defined only ONCE across
      // the whole file — a plain cssRule(':root') check would pass even if
      // a dark-theme block silently redefined it to something else (e.g.
      // white), which would quietly break the "same ink in both themes"
      // premise this whole fix depends on
      const defs = cssSource().match(/--ink-on-accent:\s*#[0-9a-fA-F]{6}/g);
      expect(defs).toEqual(['--ink-on-accent:#0F1510']);
    });

    it('exposes which segment is active to assistive tech, not just sighted users', async () => {
      // The thumb is a purely visual cue (a pseudo-element background) —
      // without aria-pressed a screen reader has no way to tell the two
      // segments apart from a pair of plain buttons.
      const { wrapper } = mountWithStore(BuildView);
      // the pair also needs its own accessible name — without it, a screen
      // reader announces two anonymous toggle buttons with no indication of
      // what they're toggling
      expect(wrapper.find('.seg2').attributes('role')).toBe('group');
      expect(wrapper.find('.seg2').attributes('aria-label')).toBe('Build mode');
      const quick = () => wrapper.findAll('button').find(b => b.text() === 'Quick pick');
      const custom = () => wrapper.findAll('button').find(b => b.text() === 'Customise');
      expect(quick().attributes('aria-pressed')).toBe('true');
      expect(custom().attributes('aria-pressed')).toBe('false');
      await custom().trigger('click');
      expect(quick().attributes('aria-pressed')).toBe('false');
      expect(custom().attributes('aria-pressed')).toBe('true');
    });

    it('pins the thumb’s slide rule so the class toggle above stays load-bearing', () => {
      // jsdom doesn't run layout/transitions, so the class-toggle test can't
      // see the thumb actually move — pin the CSS mechanism directly, the
      // same way TopBar's tests pin its flex-wrap fix. position:relative on
      // .seg2 and position:absolute on ::before are as load-bearing as the
      // width/transform above: drop either and the thumb either becomes a
      // flex item that shoves the buttons aside, or escapes .seg2's
      // overflow:hidden clip entirely — both silent, both untouched by the
      // width/transform assertions alone.
      expect(cssRule('.seg2')).toMatch(/position:\s*relative/);
      expect(cssRule('.seg2::before')).toMatch(/position:\s*absolute/);
      expect(cssRule('.seg2::before')).toMatch(/width:\s*50%/);
      expect(cssRule('.seg2::before')).toMatch(/transition:\s*transform/); // the "slides" part, not just the geometry
      expect(cssRule('.seg2.custom::before')).toMatch(/transform:\s*translateX\(100%\)/);
    });

    it('has its own reduced-motion override, since the blanket rule never reaches a pseudo-element', () => {
      // main.css's blanket `*{...}` reduced-motion rule matches real elements
      // only — a pseudo-element's transition is invisible to it (the same
      // reason .rankflash and .toast each carry their own override). Without
      // this, the thumb would be the one motion this PR ships that a
      // reduced-motion user could not turn off.
      const override = cssSource().match(/prefers-reduced-motion:reduce\)\{\.seg2::before\{([^}]*)\}\}/)?.[1] || '';
      expect(override).toMatch(/transition:\s*none/);
    });
  });

  it('opening a part picker shows the Compare list', async () => {
    const { wrapper } = mountWithStore(BuildView);
    await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
    const frameRow = wrapper.findAll('.pickrow').find(r => r.text().includes('Frame'));
    await frameRow.trigger('click');
    expect(wrapper.find('.sheet').exists()).toBe(true);
    expect(wrapper.find('.cmp').exists()).toBe(true);
  });

  it('ordering parts builds a rig and switches tabs', async () => {
    const { wrapper, store } = mountWithStore(BuildView);
    const orderBtn = wrapper.findAll('button').find(b => b.text().includes('Order parts'));
    await orderBtn.trigger('click');
    expect(store.s.rigs).toHaveLength(1);
    expect(store.s.tab).toBe('rigs');
  });

  it('issue #6: explains the below-floor newcomer premium instead of leaving a huge first-rig payback unexplained', () => {
    // A fresh game's first draft is priced on Tessera, which starts with no
    // simulated miners at all and so sits below its own floor — a same-day
    // payback worth several times the $500 starting cash is real, but reads
    // as broken without this note (issue #6).
    const { wrapper, store } = mountWithStore(BuildView);
    const tessera = store.s.chains.find(c => c.id === 'tessera');
    expect(tessera.obs).toBeLessThanOrEqual(tessera.floor);
    expect(wrapper.text()).toContain('new-miner premium');
  });

  it('the premium note tracks obs vs floor — the actual quantity diffOf gates on — not raw chainHash', async () => {
    // PR review caught this: the flat rate is governed by
    // Math.max(c.floor, c.obs)*c.target (dispatch.js's diffOf), not by
    // chainHash. obs can sit stale-high after a brownout (more likely
    // since #19 raised BASE_WEAR) even while chainHash itself is still
    // under the floor — in that case the chain is NOT actually paying the
    // flat rate the note promises, so gating on chainHash alone would be
    // wrong. Forcing obs above the floor directly, without touching
    // chainHash or floor, isolates that this note tracks the right
    // variable.
    const { wrapper, store } = mountWithStore(BuildView);
    const tessera = store.s.chains.find(c => c.id === 'tessera');
    tessera.obs = tessera.floor * 10;
    await nextTick();
    expect(wrapper.text()).not.toContain('new-miner premium');
  });

  it('shows the premium note together with the ceiling note instead of one masking the other', async () => {
    // PR review caught a real gap: after the first rig lands (~192 MH,
    // still under Tessera's 350 floor), a SECOND rig's draft already
    // trips chainCeiling's forward-looking check (it projects the new
    // rig's hash on top of what's already live: 192+192=384 > 350) even
    // though the currently-quoted rate is still the fully undiluted flat
    // one (obs hasn't caught up past the floor yet). Both statements are
    // true at once — "you're on the welcome rate right now" and "this
    // next rig would end it" — so both notes must render; treating them
    // as mutually exclusive (the original `note:a||b`) silently dropped
    // the premium note exactly when it was still accurate.
    const { wrapper, store } = mountWithStore(BuildView);
    store.build();
    for (let i = 0; i < 5; i++) store.stepTick(60); // finish assembly
    await nextTick();
    const tessera = store.s.chains.find(c => c.id === 'tessera');
    expect(tessera.obs).toBeLessThanOrEqual(tessera.floor); // still the flat rate
    expect(wrapper.text()).toContain('new-miner premium');
    expect(wrapper.text()).toContain('at its ceiling');

    // issue #25: the ceiling note is forward-looking (chainCeiling folds
    // the not-yet-built rig's hash into the gate), and the chain is
    // genuinely still below its floor here — so the note must not claim
    // the chain "is" at its ceiling right now, only that this rig "would
    // put" it there.
    expect(store.chainHash(tessera)).toBeLessThanOrEqual(tessera.floor);
    expect(wrapper.text()).not.toContain('is at its ceiling');
    expect(wrapper.text()).toContain('would put');

    // issue #24: the reassurance note (new-miner premium) and the warning
    // note (at ceiling) must not render in the same visual voice
    const notes = wrapper.findAll('.note-chk');
    expect(notes.some(n => n.classes('note-good'))).toBe(true);
    expect(notes.some(n => n.classes('note-warn'))).toBe(true);
  });

  describe('the card-count stepper', () => {
    it('meets the WCAG AAA 44x44 touch-target minimum — it\'s the one control likely to get tapped repeatedly in a row', () => {
      // jsdom doesn't run layout, so pin the CSS mechanism directly, same
      // pattern as the segmented control's thumb tests.
      const rule = cssRule('.stepper button');
      // (?:^|;) anchors past any future "min-width"/"max-width" prefix so
      // this can't accidentally match the wrong declaration
      const width = Number(rule.match(/(?:^|;)\s*width:\s*(\d+)px/)?.[1]);
      const height = Number(rule.match(/(?:^|;)\s*height:\s*(\d+)px/)?.[1]);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
      // and pinned against flex-shrink, or the 44px declaration above is a
      // promise the layout doesn't actually keep at a narrow viewport
      expect(rule).toMatch(/flex:\s*none/);
    });

    it('disables "-" at 1 card rather than silently clamping', async () => {
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      store.s.draft.n = 1;
      await nextTick();
      const minus = wrapper.find('.stepper button[aria-label="Decrease card count"]');
      expect(minus.attributes('disabled')).toBeDefined();
      await minus.trigger('click'); // inert past the floor — same pin as the "+" test below
      expect(store.s.draft.n).toBe(1);
    });

    it('disables "+" once the card limit (frame vs. board, whichever binds) is reached', async () => {
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      store.s.draft.n = 1;   // start below the limit so the loop below genuinely climbs
      await nextTick();
      const plus = () => wrapper.find('.stepper button[aria-label="Increase card count"]');
      const nBefore = store.s.draft.n;
      await plus().trigger('click');
      expect(store.s.draft.n).toBe(nBefore + 1);   // a click in the enabled range actually acts
      for (let i = 0; i < 24 && plus().attributes('disabled') === undefined; i++) {
        await plus().trigger('click');
      }
      expect(plus().attributes('disabled')).toBeDefined();
      const nAtLimit = store.s.draft.n;
      await plus().trigger('click'); // inert past the limit
      expect(store.s.draft.n).toBe(nAtLimit);
    });

    it('re-enables "+" after switching to a frame/board pair with more room', async () => {
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      const plus = () => wrapper.find('.stepper button[aria-label="Increase card count"]');
      for (let i = 0; i < 24 && plus().attributes('disabled') === undefined; i++) {
        await plus().trigger('click');
      }
      expect(plus().attributes('disabled')).toBeDefined();

      // the limit is min(frame slots, board PCIe) — raise BOTH to the
      // roomiest option in their own catalogues, so whichever one was
      // actually binding before is guaranteed to loosen
      const { FRAMES, MOBOS } = await import('../../data/hardware.js');
      store.s.draft.frame = FRAMES.reduce((a, b) => b.slots > a.slots ? b : a).id;
      store.s.draft.mobo = MOBOS.reduce((a, b) => b.pcie > a.pcie ? b : a).id;
      await nextTick();
      expect(plus().attributes('disabled')).toBeUndefined();
    });
  });

  describe('the verdict panel', () => {
    it('shows the correct numbers immediately on mount, with no animate-in from zero', () => {
      // generatePreset() now runs synchronously during setup, before the
      // tweened refs are created, so the very first paint already reflects
      // the real preset — no flush to wait on. Read the verdict panel's OWN
      // "Parts" row specifically: the Quick-pick summary and the Order-parts
      // button render the same raw g.dp.cost elsewhere on the page, so a
      // plain wrapper.text() match would pass even if the tweened figure
      // itself were still wrong.
      const { wrapper, store } = mountWithStore(BuildView);
      const vrow = label => wrapper.findAll('.vrow').find(r => r.find('.k').text() === label);
      expect(vrow('Parts').find('.v').text()).toBe(fmt.usd(store.dp.cost));
      expect(vrow('Hashrate').find('.v').text()).toBe(fmt.hash(store.dp.mh));
    });

    it('eases toward the new numbers instead of swapping instantly when the draft changes', async () => {
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');

      const costBefore = store.dp.cost;
      // switching to the smallest frame in the catalogue changes the whole
      // draft's cost, independent of whatever the default preset picked
      const { FRAMES } = await import('../../data/hardware.js');
      const smallest = FRAMES.reduce((a, b) => b.slots < a.slots ? b : a);
      store.s.draft.frame = smallest.id;
      await nextTick();

      const costAfter = store.dp.cost;
      expect(costAfter).not.toBe(costBefore); // the real source changed immediately...
      // ...but give the eased display real time to actually reach it, same
      // as any other tweened figure in the app
      await new Promise(r => setTimeout(r, 500));
      await nextTick();
      expect(wrapper.text()).toContain(fmt.usd(costAfter));
    });

    it('in Quick pick, hides the itemized pass/fail checks — generatePreset already guarantees they all pass', () => {
      // showing six green checkmarks confirming what tapping Quick pick
      // already promised is exactly the clutter this split exists to cut;
      // the itemized list earns its place once a player is actually
      // troubleshooting a combination in Customise
      const { wrapper, store } = mountWithStore(BuildView);
      expect(store.canBuild).toBe(true); // the mounted preset always clears the gate
      expect(wrapper.findAll('.chk.ok, .chk.no')).toHaveLength(0);
      expect(wrapper.text()).not.toContain('MH/W');
      expect(wrapper.text()).not.toContain('Site impact');
    });

    it('in Customise, shows every check — the itemized view a player troubleshooting a bad combo actually needs', async () => {
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      expect(wrapper.findAll('.chk.ok, .chk.no')).toHaveLength(store.checks.length);
      expect(wrapper.text()).toContain('MH/W');
      expect(wrapper.text()).toContain('Site impact');
    });

    it('a note (e.g. the new-miner premium) still shows in Quick pick — it\'s context, not a gate diagnostic', () => {
      // a brand-new game's chain has no rigs on it yet, so its observed
      // hashrate sits below its floor (subsidyNote's own gate, BuildView.vue)
      // and the note is live on the default mounted preset with no setup —
      // see BuildView.vue's own comment on issue #6 for why that's real
      const { wrapper } = mountWithStore(BuildView);
      expect(wrapper.text()).toContain('paying a new-miner premium');
    });

    it('switching modes swaps the verdict shape live, without a remount', async () => {
      const { wrapper } = mountWithStore(BuildView);
      expect(wrapper.findAll('.chk.ok, .chk.no')).toHaveLength(0);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      expect(wrapper.findAll('.chk.ok, .chk.no').length).toBeGreaterThan(0);
      await wrapper.findAll('button').find(b => b.text() === 'Quick pick').trigger('click');
      expect(wrapper.findAll('.chk.ok, .chk.no')).toHaveLength(0);
    });

    it('in Quick pick, falls back to the real failing checks if canBuild goes stale after the preset was generated', async () => {
      // presetFound/checks are a SNAPSHOT taken when generatePreset() ran
      // (mount, or switching back into Quick pick) — nothing re-runs it on
      // a tick, so cash draining out from under an already-open Quick pick
      // is a real, reachable way for canBuild to go false while the panel
      // still shows the stale preset. Hiding checks unconditionally here
      // would leave the Order button reading "Fix the crosses above" with
      // no crosses anywhere — worse than the wall of green this split
      // exists to cut
      const { wrapper, store } = mountWithStore(BuildView);
      expect(store.canBuild).toBe(true);
      expect(wrapper.findAll('.chk.ok, .chk.no')).toHaveLength(0);

      store.s.cash = 0; // the world moving under the still-open Quick pick
      await nextTick();

      expect(store.canBuild).toBe(false);
      const shown = wrapper.findAll('.chk.no');
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.some(c => c.text().includes('you hold'))).toBe(true); // the cash check specifically
      expect(wrapper.text()).toContain('Fix the crosses above');
    });
  });

  describe('the Order-parts button', () => {
    it('uses a fixed dark ink when buildable, not white — same WCAG AA failure already fixed on this tab\'s other green fills', () => {
      // .btn-pri's #fff fails 4.5:1 in both themes (~3.55:1 light,
      // ~1.62:1 dark) — this is the same failure already fixed on .seg2's
      // thumb and the slot grid, just on .btn-pri's shared style instead
      // of a Build-only one. Scoped to .btn-order (a class only this
      // button carries) rather than changing .btn-pri itself, which is
      // the primary-action style used everywhere else in the app.
      expect(cssRule('.btn-order.btn-pri')).toMatch(/color:\s*var\(--ink-on-accent\)/);
      const { wrapper } = mountWithStore(BuildView);
      const orderBtn = wrapper.findAll('button').find(b => b.text().includes('Order parts'));
      expect(orderBtn.classes()).toContain('btn-order');
      expect(orderBtn.classes()).toContain('btn-pri'); // the mounted preset is always buildable
    });

    it('keeps the resting green through :active, instead of inheriting .btn-pri\'s darkened press background', () => {
      // .btn-pri:active swaps to a hardcoded #0F6446 — dark enough that
      // --ink-on-accent on it drops to 2.58:1, WORSE than the #fff this
      // whole fix exists to replace (7.16:1 there). Every other green-fill
      // ink fix on this tab (.seg2, .slotcell) happened to have no
      // background-swapping :active rule to collide with; .btn-pri does,
      // so it needs its own override rather than reusing that pattern
      // blindly — press feedback still comes through separately, via
      // button.btn:active's scale transform. Asserting this rule merely
      // EXISTS would pass on a version that darkens the background back to
      // the failing state, so this checks the actual value.
      expect(cssRule('.btn-order.btn-pri:active')).toMatch(/background:\s*var\(--green\)/);
    });
  });

  describe('the build-status announcement', () => {
    it('tells assistive tech the draft is ready to order', () => {
      const { wrapper, store } = mountWithStore(BuildView);
      expect(store.canBuild).toBe(true); // the mounted preset always clears the gate
      const live = wrapper.find('[aria-live="polite"].sr-only');
      expect(live.exists()).toBe(true);
      expect(live.text()).toBe('Ready to order for ' + fmt.usd(store.dp.cost) + '.');
    });

    it('names the actual blocking reasons instead of pointing at on-screen icons', async () => {
      // the visible button says "Fix the crosses above" — fine for a sighted
      // user scanning the panel, meaningless read out of context. The live
      // region carries the real check labels instead.
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      store.s.cash = 0;   // fails the "you hold $X" cash check unconditionally
      await nextTick();
      expect(store.canBuild).toBe(false);
      const live = wrapper.find('[aria-live="polite"].sr-only');
      const failingLabel = store.checks.find(c => !c.ok).label;
      expect(live.text()).toBe('Cannot build yet: ' + failingLabel + '.');
    });

    it('joins multiple simultaneous failures into one announcement', async () => {
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      store.s.cash = 0;                 // fails the cash check
      store.s.draft.frame = 'f2';       // and, with the mounted preset's n, the slot check too
      await nextTick();
      const failing = store.checks.filter(c => !c.ok);
      expect(failing.length).toBeGreaterThan(1); // otherwise this isn't exercising the join at all
      const live = wrapper.find('[aria-live="polite"].sr-only');
      expect(live.text()).toBe('Cannot build yet: ' + failing.map(c => c.label).join('; ') + '.');
    });

    it('settles on the final outcome immediately, instead of trailing the tweened numbers', async () => {
      // costShown eases toward its new value over ~320ms of animation
      // frames; buildStatus reads dp.cost/checks directly from the
      // untweened store, so it must already report the FINAL outcome the
      // instant the draft changes, not an intermediate value, and must not
      // move again later just because the visible "Parts" figure catches up.
      // n=1 on the smallest frame keeps every check clear throughout, so
      // this lands on the READY branch (which actually renders dp.cost)
      // rather than a blocked one — a swap that flips canBuild would pass
      // even with a tweened figure in the wrong place, since neither
      // branch's text would include a cost at all.
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      store.s.draft.n = 1;
      store.s.draft.frame = 'f2';
      await nextTick();
      expect(store.canBuild).toBe(true);

      const before = store.dp.cost;
      store.s.draft.frame = 'f6';   // pricier frame, same n — cost changes, gate stays open
      await nextTick();
      const after = store.dp.cost;
      expect(after).not.toBe(before);
      expect(store.canBuild).toBe(true);

      const live = wrapper.find('[aria-live="polite"].sr-only');
      expect(live.text()).toBe('Ready to order for ' + fmt.usd(after) + '.');

      await new Promise(r => setTimeout(r, 400)); // well past costShown's ~320ms tween window
      await nextTick();
      expect(live.text()).toBe('Ready to order for ' + fmt.usd(after) + '.'); // unchanged — it never was animating
    });

    it('does not re-announce on every simulation tick while an already-failing check merely drifts', async () => {
      // Two of the six check labels embed live figures — cash ("Parts cost
      // X, you hold Y") and site power draw — that move on every tick even
      // while the pass/fail OUTCOME hasn't changed. A naive computed would
      // re-announce a fresh cash figure up to 10x/second at high speed,
      // which aria-live="polite" would queue and read out as an unbroken
      // stream of stale numbers. The gate (which checks pass/fail) is what
      // must drive the announcement, not the labels' own text.
      //
      // A rig has to actually be running for this to exercise anything: with
      // zero rigs built, the site draws no power and cash never moves at
      // all, so a naive per-render computed would ALSO look silent here —
      // not because it's gated correctly, but because nothing is drifting
      // for it to leak. build() first so electricity really is billed
      // against cash on every tick.
      const { wrapper, store } = mountWithStore(BuildView);
      store.build();
      for (let i = 0; i < 5; i++) store.stepTick(60); // finish assembly, so it's actually drawing power

      store.s.cash = 1;   // unaffordable, and ticking only drains it further
      await nextTick();
      expect(store.canBuild).toBe(false);
      const live = () => wrapper.find('[aria-live="polite"].sr-only').text();
      const seen = new Set([live()]);
      for (let i = 0; i < 100; i++) {
        store.stepTick(60);
        await nextTick();
        seen.add(live());
      }
      expect(store.s.cash).not.toBe(1); // sanity: cash genuinely drifted under the failing check...
      expect(seen.size).toBe(1); // ...yet the gate never flipped, so the announcement never should have either
    });

    it('still announces when the world — not the player — flips the gate, like cash finally catching up', async () => {
      // The tick-spam test above proves silence is correct while nothing
      // actually changes; this proves the union key doesn't overcorrect
      // into silence forever. gateKey alone still has to fire when canBuild
      // flips even though the DRAFT never moved — an idle player watching
      // their cash cross the threshold is exactly that case.
      const { wrapper, store } = mountWithStore(BuildView);
      store.s.cash = 0;
      await nextTick();
      expect(store.canBuild).toBe(false);
      const live = () => wrapper.find('[aria-live="polite"].sr-only').text();
      expect(live()).toContain('Cannot build yet');

      store.s.cash = 100000;   // income arriving over time, not a player edit to the draft
      await nextTick();
      expect(store.canBuild).toBe(true);
      expect(live()).toBe('Ready to order for ' + fmt.usd(store.dp.cost) + '.');
    });
  });

  describe('Custom parts', () => {
    // manufactures a custom cooler at the active site's fab, finishing
    // construction instantly (the rush-style shortcut used throughout the
    // fab test suites — real build times are hours too long to loop to)
    const withCustomCooler = g => {
      const f = g.active;
      g.s.cash = 1000000;
      g.chooseFab(f.id, 'fab-bench');
      f.queue[0].left = 0.0001; g.stepTick(1);
      g.openDesign(f.id, 'cool');
      g.bumpDesignPick(g.DESIGN_AXES.cool[0].key, 2);
      g.manufacturePart();
      f.queue[0].left = 0.0001; g.stepTick(1);
    };

    it('a manufactured part appears in its slot\'s Customise picker, past the catalogue', async () => {
      const { wrapper } = mountWithStore(BuildView, { seed: withCustomCooler });
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      const coolRow = wrapper.findAll('button.pickrow').find(r => r.text().includes('Cooling'));
      await coolRow.trigger('click');
      expect(wrapper.text()).toContain('Custom cooler');
    });

    it('picking it sets the draft to it, and its stats and price flow into the verdict', async () => {
      const { wrapper, store } = mountWithStore(BuildView, { seed: withCustomCooler });
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      await wrapper.findAll('button.pickrow').find(r => r.text().includes('Cooling')).trigger('click');
      const row = wrapper.findAll('.cmp-r').find(r => r.text().includes('Custom cooler'));
      await row.trigger('click');

      const part = store.s.customParts[0];
      expect(store.s.draft.cool).toBe(part.id);
      expect(store.dp.air).toBeCloseTo(store.PART(store.s.draft.frame).air * part.fac, 5);
    });

    it('a custom part only ever appears in its OWN slot\'s picker, never a different one', async () => {
      // two different kinds manufactured in the same run — optionsFor must
      // filter by kind, not just concatenate every custom part everywhere
      const { wrapper } = mountWithStore(BuildView, {
        seed: g => {
          withCustomCooler(g);
          const f = g.active;
          g.openDesign(f.id, 'psu');
          g.bumpDesignPick(g.DESIGN_AXES.psu[0].key, 2);
          g.manufacturePart();
          f.queue[0].left = 0.0001; g.stepTick(1);
        },
      });
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');

      await wrapper.findAll('button.pickrow').find(r => r.text().includes('Cooling')).trigger('click');
      expect(wrapper.text()).toContain('Custom cooler');
      expect(wrapper.text()).not.toContain('Custom supply');
      await wrapper.find('.sheet-hd button').trigger('click'); // back

      await wrapper.findAll('button.pickrow').find(r => r.text().includes('Supply')).trigger('click');
      expect(wrapper.text()).toContain('Custom supply');
      expect(wrapper.text()).not.toContain('Custom cooler');
    });
  });
});
