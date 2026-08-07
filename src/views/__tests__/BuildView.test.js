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
    expect(store.chainHash(tessera)).toBeLessThan(tessera.floor);
    expect(wrapper.text()).toContain('new-miner premium');
  });

  it("the premium note disappears once the chain the group is on already carries hash above its floor", async () => {
    // Isolated from production tuning, same pattern as dispatch.test.js's
    // chainCeiling tests: build a real rig so the chain actually carries
    // hash, then force the floor below it — chainHash(tessera) is 0 until
    // a live rig exists (Tessera has no simulated network), so this can't
    // be tested pre-build the way the busy-chain case can.
    const { wrapper, store } = mountWithStore(BuildView);
    const tessera = store.s.chains.find(c => c.id === 'tessera');
    store.build();
    for (let i = 0; i < 5; i++) store.stepTick(60); // finish assembly
    tessera.floor = 1;
    await nextTick();
    expect(store.chainHash(tessera)).toBeGreaterThanOrEqual(tessera.floor);
    expect(wrapper.text()).not.toContain('new-miner premium');
  });
});
