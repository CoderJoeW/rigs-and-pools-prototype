import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import RigsView from '../RigsView.vue';

describe('RigsView', () => {
  it('shows the empty state before anything is built', () => {
    const { wrapper } = mountWithStore(RigsView);
    expect(wrapper.text()).toContain('No rigs at');
  });

  it('lists a built rig with its filter chips and counts', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.find('.rigrow').exists()).toBe(true);
    expect(wrapper.text()).toContain('Rig 1');
    expect(wrapper.text()).toContain('Running'); // it's on, mid-assembly counts as its own state
  });

  it('opening a rig shows its detail sheet, with dialog semantics', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('.rigrow').trigger('click');
    const sheet = wrapper.find('.sheet');
    expect(sheet.exists()).toBe(true);
    expect(sheet.attributes('role')).toBe('dialog');
    expect(sheet.attributes('aria-modal')).toBe('true');
    expect(sheet.attributes('aria-labelledby')).toBeTruthy();
    expect(wrapper.text()).toContain('Retrofit');
    expect(wrapper.text()).toContain('Repair');
    expect(wrapper.text()).toContain('Strip');
  });

  it('Escape closes the rig detail sheet', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
      attachTo: document.body,
    });
    await wrapper.find('.rigrow').trigger('click');
    expect(wrapper.find('.sheet').exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.sheet').exists()).toBe(false);
    wrapper.unmount();
  });

  it('labels the rebuild planner\'s card-model picker and card-count stepper differently, since they used to both say "Cards"', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); for (let i = 0; i < 5; i++) g.stepTick(60); },
    });
    await wrapper.find('.rigrow').trigger('click');
    await wrapper.findAll('button').find(b => b.text().includes('Retrofit')).trigger('click');
    // scoped to the open sheet, and anchored per-row (not just "the set of
    // labels is distinct") so a swap that left the model picker headed
    // Count and the stepper headed Cards would still fail this
    const stepperRow = wrapper.findAll('.sheet .pickrow').find(r => r.find('.stepper').exists());
    const modelRow = wrapper.findAll('.sheet button.pickrow').find(r => r.text().includes('MH/W'));
    expect(stepperRow.find('.lab').text()).toBe('Count');
    expect(modelRow.find('.lab').text()).toBe('Cards');
  });

  it('the rebuild planner\'s card-count stepper disables at its bounds instead of silently clamping', async () => {
    // this stepper used to be a separate, inline-styled copy of Build's own
    // — 32px, no disabled state, so a tap past the limit silently did
    // nothing with no visual sign it hit a wall. Sharing .stepper fixes the
    // size AND the missing disabled state in one move.
    const { wrapper, store } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); for (let i = 0; i < 5; i++) g.stepTick(60); },
    });
    await wrapper.find('.rigrow').trigger('click');
    await wrapper.findAll('button').find(b => b.text().includes('Retrofit')).trigger('click');
    expect(store.s.rebuild).toBeTruthy();

    const minus = () => wrapper.find('.stepper button[aria-label="Decrease card count"]');
    const plus = () => wrapper.find('.stepper button[aria-label="Increase card count"]');
    expect(minus().exists()).toBe(true);

    store.s.rebuild.draft.n = 1;
    await nextTick();
    expect(minus().attributes('disabled')).toBeDefined();
    await minus().trigger('click'); // inert past the floor
    expect(store.s.rebuild.draft.n).toBe(1);

    const { FRAMES, MOBOS } = await import('../../data/hardware.js');
    const smallestFrame = FRAMES.reduce((a, b) => b.slots < a.slots ? b : a);
    const smallestMobo = MOBOS.reduce((a, b) => b.pcie < a.pcie ? b : a);
    store.s.rebuild.draft.frame = smallestFrame.id;
    store.s.rebuild.draft.mobo = smallestMobo.id;
    store.s.rebuild.draft.n = Math.min(smallestFrame.slots, smallestMobo.pcie);
    await nextTick();
    expect(plus().attributes('disabled')).toBeDefined();
    const nAtLimit = store.s.rebuild.draft.n;
    await plus().trigger('click'); // inert past the ceiling
    expect(store.s.rebuild.draft.n).toBe(nAtLimit);
  });

  it('the rebuild planner\'s picker lists a manufactured custom part in its own slot, not just the catalogue', async () => {
    // a rig wearing a custom part otherwise has no way back to the
    // catalogue, or across to another custom part of the same slot — the
    // picker used to read only g.SLOT_OPTS / g.cards(), neither of which
    // ever includes a fab-designed part
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => {
        g.generatePreset(); g.build(); for (let i = 0; i < 5; i++) g.stepTick(60);
        const f = g.active;
        g.s.cash = 1000000;
        g.chooseFab(f.id, 'fab-bench');
        f.queue[0].left = 0.0001; g.stepTick(1);
        g.openDesign(f.id, 'cool');
        g.bumpDesignPick(g.DESIGN_AXES.cool[0].key, 2);
        g.manufacturePart();
        f.queue[0].left = 0.0001; g.stepTick(1);
      },
    });
    await wrapper.find('.rigrow').trigger('click');
    await wrapper.findAll('button').find(b => b.text().includes('Retrofit')).trigger('click');
    const coolRow = wrapper.findAll('.sheet button.pickrow').find(r => r.text().includes('Cooling'));
    await coolRow.trigger('click');
    expect(wrapper.text()).toContain('Custom cooler');
  });

  it('the fleet-actions sheet opens and shows scope-aware previews', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const fleetBtn = wrapper.findAll('button').find(b => b.text().includes('Fleet actions'));
    await fleetBtn.trigger('click');
    expect(wrapper.text()).toContain('Applies to');
    expect(wrapper.text()).toContain('Repair worn cards');
    expect(wrapper.text()).toContain('Move to a group');
  });

  it('renaming a rig from its detail sheet updates the store', async () => {
    const { wrapper, store } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('.rigrow').trigger('click');
    const renameBtn = wrapper.findAll('button').find(b => b.text() === 'Rename');
    await renameBtn.trigger('click');

    const input = wrapper.find('input[placeholder="Rig name"]');
    await input.setValue('Tessera Miner');
    const saveBtn = wrapper.findAll('button').find(b => b.text() === 'Save name');
    await saveBtn.trigger('click');

    expect(store.s.rigs[0].name).toBe('Tessera Miner');
    expect(wrapper.text()).toContain('Tessera Miner');
  });

  it('the compact wear bar exposes wear as an accessible label, not just color', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    const bar = wrapper.find('.wearbar');
    expect(bar.attributes('aria-label')).toBe('Wear 0%');
  });

  /* The Sites floor plan opens the real rig sheet rather than a second,
     lesser copy of it — the handoff is one id parked on the store. */
  it('opens straight into the sheet for a rig handed over from the floor plan', async () => {
    const { wrapper, store } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.focusRig = g.s.rigs[0].id; },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.sheet').exists()).toBe(true);
    expect(wrapper.find('.sheet').text()).toContain(store.s.rigs[0].name);
    expect(store.s.focusRig).toBeNull();   // read once, never a stale ambush
  });

  it('ignores a handoff for a rig that is not at the active site', () => {
    const { wrapper, store } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].site = 999; g.s.focusRig = g.s.rigs[0].id; },
    });
    expect(wrapper.find('.sheet').exists()).toBe(false);
    expect(store.s.focusRig).toBeNull();
  });

  /* Swipe-to-power (issue #49). jsdom has no layout and no real gesture
     recognition, so what these can honestly check is the decision logic —
     which drags claim the gesture, which thresholds fire, and that none of
     it disturbs the tap and multi-select paths. The gesture itself was
     verified in a real headless browser; see the issue. */
  describe('swipe a row to flip its power', () => {
    const built = g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; };
    /* One press, one move, one release. A single move is enough: the handler
       claims on the first sample that clears the slop, exactly as it does
       against a stream of them. 200px clears the commit threshold, 60px
       lands in the band that only reveals the action. */
    const drag = async (row, dx, dy = 0) => {
      await row.trigger('pointerdown', { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
      await row.trigger('pointermove', { pointerId: 1, clientX: 300 - dx, clientY: 100 + dy });
      await row.trigger('pointerup', { pointerId: 1, clientX: 300 - dx, clientY: 100 + dy });
      await row.trigger('click');   // the browser sends one after every release
    };

    it('a long leftward drag toggles the rig and does not open the sheet', async () => {
      const { wrapper, store } = mountWithStore(RigsView, { seed: built });
      expect(store.s.rigs[0].on).toBe(true);
      await drag(wrapper.find('.rigrow'), 200);
      expect(store.s.rigs[0].on).toBe(false);
      expect(wrapper.find('.sheet').exists()).toBe(false);
    });

    it('a short drag reveals the action instead of firing it, and the action fires it', async () => {
      const { wrapper, store } = mountWithStore(RigsView, { seed: built });
      await drag(wrapper.find('.rigrow'), 60);
      expect(store.s.rigs[0].on).toBe(true);           // nothing happened yet
      const act = wrapper.find('.rigswact');
      expect(act.exists()).toBe(true);
      expect(act.text()).toContain('Power off');
      expect(act.attributes('aria-label')).toContain('Power off');
      await act.trigger('click');
      expect(store.s.rigs[0].on).toBe(false);
      expect(wrapper.find('.sheet').exists()).toBe(false);
    });

    it('a mostly-vertical drag is left to the scroller, and the tap still opens the sheet', async () => {
      const { wrapper, store } = mountWithStore(RigsView, { seed: built });
      await drag(wrapper.find('.rigrow'), 6, 50);
      expect(store.s.rigs[0].on).toBe(true);
      expect(wrapper.find('.rigswact').exists()).toBe(false);
      expect(wrapper.find('.sheet').exists()).toBe(true);   // read as an ordinary tap
    });

    it('a plain tap after a swipe still opens the sheet', async () => {
      const { wrapper, store } = mountWithStore(RigsView, { seed: built });
      await drag(wrapper.find('.rigrow'), 200);
      expect(store.s.rigs[0].on).toBe(false);
      await wrapper.find('.rigrow').trigger('click');
      expect(wrapper.find('.sheet').exists()).toBe(true);
    });

    it('a rig that is still being built cannot be swiped', async () => {
      const { wrapper, store } = mountWithStore(RigsView, {
        seed: g => { g.generatePreset(); g.build(); },   // leaves building > 0
      });
      expect(store.s.rigs[0].building).toBeGreaterThan(0);
      await drag(wrapper.find('.rigrow'), 200);
      expect(store.s.rigs[0].on).toBe(true);
      expect(wrapper.find('.rigswact').exists()).toBe(false);
    });

    it('selection mode keeps the row to itself — a drag there selects nothing and toggles nothing', async () => {
      const { wrapper, store } = mountWithStore(RigsView, { seed: built });
      const selectBtn = wrapper.findAll('button').find(b => b.text() === 'Select');
      await selectBtn.trigger('click');
      await drag(wrapper.find('.rigrow'), 200);
      expect(store.s.rigs[0].on).toBe(true);
      expect(wrapper.find('.rigswact').exists()).toBe(false);
      expect(wrapper.text()).toContain('1 selected');   // the tap still chose it
    });
  });

  it('the mining-group select in the rig sheet is a real labeled control', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('.rigrow').trigger('click');
    const select = wrapper.find('#rig-group-select');
    expect(select.exists()).toBe(true);
    expect(wrapper.find('label[for="rig-group-select"]').exists()).toBe(true);
  });
});
