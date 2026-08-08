import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import BuildView from '../BuildView.vue';

describe('BuildView', () => {
  it('loads the preset on mount and shows an orderable draft', () => {
    const { wrapper, store } = mountWithStore(BuildView);
    expect(store.canBuild).toBe(true); // onMounted ran generatePreset()
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
  });
});
