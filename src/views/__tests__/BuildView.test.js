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
    it('disables "-" at 1 card rather than silently clamping', async () => {
      const { wrapper, store } = mountWithStore(BuildView);
      await wrapper.findAll('button').find(b => b.text() === 'Customise').trigger('click');
      store.s.draft.n = 1;
      await nextTick();
      const minus = wrapper.find('.stepper button[aria-label="Decrease card count"]');
      expect(minus.attributes('disabled')).toBeDefined();
      // a disabled button never fires its handler in a real browser, but
      // jsdom's .trigger('click') does not enforce that on its own — assert
      // the click is genuinely inert, not just that the attribute is present
      await minus.trigger('click');
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
  });
});
