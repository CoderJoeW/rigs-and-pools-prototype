import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import { fmt } from '../../utils/format.js';
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
    expect(wrapper.text()).toContain('Running');
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
    expect(wrapper.text()).toContain('Retrofit');
    expect(wrapper.text()).toContain('Repair');
    expect(wrapper.text()).toContain('Strip');
  });

  it('the Repair row tracks the open rig\'s worn cards as they wear', async () => {
    const { wrapper, store: g } = mountWithStore(RigsView, {
      seed: h => { h.generatePreset(); h.build(); h.s.rigs[0].building = 0; },
    });
    await wrapper.find('.rigrow').trigger('click');
    const repair = () => wrapper.findAll('.pickrow').find(b => b.text().includes('Repair'));

    // Nothing worn yet: the row explains the threshold and cannot be pressed.
    expect(repair().text()).toContain('No cards worn past');
    expect(repair().attributes('disabled')).toBeDefined();

    // Wear a card past the repair line — the row must follow, not freeze at
    // whatever it read on mount.
    const rig = g.s.rigs[0];
    g.s.cash = 100000;
    rig.units[0].w = 0.9;
    await nextTick();
    expect(repair().text()).toContain('Replace 1 worn card');
    expect(repair().text()).toContain(fmt.usd(g.PART(rig.units[0].p).price));
    expect(repair().attributes('disabled')).toBeUndefined();

    // Affordability is part of the same guard.
    g.s.cash = 0;
    await nextTick();
    expect(repair().attributes('disabled')).toBeDefined();
  });

  /* The fleet sheet lives in its own component now and takes the list's scope
     as props, so these pin the seam: the sheet has to open, read the scope the
     view computed, and quote a job against exactly that scope. */
  describe('the fleet actions sheet', () => {
    const twoRigs = h => {
      h.generatePreset();
      h.s.cash = 100000;          // the second rig has to be affordable
      h.build(); h.build();
      for (const r of h.s.rigs) r.building = 0;
    };
    const openFleet = async wrapper => {
      const btn = wrapper.findAll('button').find(b => b.text() === 'Fleet');
      await btn.trigger('click');
      return wrapper;
    };

    it('opens with the whole site in scope', async () => {
      const { wrapper, store: g } = mountWithStore(RigsView, { seed: twoRigs });
      await openFleet(wrapper);

      expect(wrapper.text()).toContain('Fleet actions');
      // the scopeLabel the view computed, rendered by the child
      expect(wrapper.text()).toContain('all 2 at ' + g.s.sites[0].name);
    });

    it('quotes a repair against the rigs actually in scope', async () => {
      const { wrapper, store: g } = mountWithStore(RigsView, { seed: twoRigs });
      g.s.rigs[0].units[0].w = 0.9;   // one worn card on one rig
      g.s.cash = 100000;
      await openFleet(wrapper);

      expect(wrapper.text()).toContain('Replace 1 card across 1 rig');
    });

    it('narrows to the ticked rigs rather than the whole site', async () => {
      const { wrapper, store: g } = mountWithStore(RigsView, { seed: twoRigs });
      for (const r of g.s.rigs) r.units[0].w = 0.9;   // both rigs worn
      g.s.cash = 100000;

      // tick one row, then act on the selection
      await wrapper.findAll('button').find(b => b.text().includes('Select')).trigger('click');
      await wrapper.find('.rigrow').trigger('click');
      await wrapper.findAll('button').find(b => b.text() === 'Act on these').trigger('click');

      expect(wrapper.text()).toContain('1 selected');
      // the scope reached the child: one rig's worth of work, not two
      expect(wrapper.text()).toContain('Replace 1 card across 1 rig');
    });

    it('closes back to the list', async () => {
      const { wrapper } = mountWithStore(RigsView, { seed: twoRigs });
      await openFleet(wrapper);
      await wrapper.findAll('button').find(b => b.text().includes('Rigs')).trigger('click');
      expect(wrapper.text()).not.toContain('Fleet actions');
    });
  });

  it('list row fronts each rig with its hardware shot, carrying the rig state', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    const shot = wrapper.find('.rigshot');
    expect(shot.exists()).toBe(true);
    expect(shot.find('img.rgs-img').exists()).toBe(true);
    expect(shot.classes()).toContain('run');
    // Decorative: the row already says "Running" in text beside it, and the
    // chain is named there too rather than painted on the picture.
    expect(shot.attributes('aria-hidden')).toBe('true');
    expect(shot.attributes('role')).toBeUndefined();
    expect(wrapper.find('.rigrow .st').text()).toContain('Running');
    expect(wrapper.find('.rigrow .sb .cmk').exists()).toBe(true);
  });

  it('the hero fronts the site with a photograph, its status and its position count', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    expect(wrapper.find('.rig-hero .rig-hero-shot').exists()).toBe(true);
    expect(wrapper.find('.rig-hero-st .dot.run').exists()).toBe(true);
    expect(wrapper.find('.rig-hero').text()).toContain('Active');
    expect(wrapper.find('.rig-hero').text()).toMatch(/Positions used: 1 of \d+/);
  });

  it('a filter that would empty the list is disabled rather than reachable', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    const pills = wrapper.findAll('.rigfilters .pill');
    expect(pills.length).toBe(5);
    const byLabel = l => pills.find(p => p.text().includes(l));
    expect(byLabel('Running').attributes('disabled')).toBeUndefined();
    expect(byLabel('Off').attributes('disabled')).toBeDefined();
    // The count the chip no longer prints is still readable to a screen reader.
    expect(byLabel('Running').attributes('aria-label')).toBe('Running — 1 rig');
  });

  it('the sort control names its direction and reverses it in place', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.build(); },
    });
    expect(wrapper.find('.rigsort').text()).toContain('Name (A–Z)');
    const names = () => wrapper.findAll('.rigrow .nm').map(n => n.text());
    const asc = names();
    await wrapper.find('.rigsort-flip').trigger('click');
    expect(wrapper.find('.rigsort').text()).toContain('Name (Z–A)');
    expect(names()).toEqual([...asc].reverse());
  });

  it('sorting by name follows the names, not the build order', async () => {
    const { wrapper, store } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.build(); g.build(); },
    });
    // Rename the first-built rig so id order and name order disagree.
    store.renameRig(store.s.rigs[0].id, 'Zeta');
    await nextTick();
    const names = wrapper.findAll('.rigrow .nm').map(n => n.text());
    expect(names[names.length - 1]).toBe('Zeta');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  });

  it('the select bar sits outside the list so it can stay stuck to the bottom', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    await wrapper.find('.rigsel').trigger('click');
    const bar = wrapper.find('.selbar');
    expect(bar.exists()).toBe(true);
    expect(wrapper.find('.riglist .selbar').exists()).toBe(false);
  });

  it('rig detail header shows a larger chassis instead of a bare status dot', async () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    await wrapper.find('button.rigrow').trigger('click');
    const ch = wrapper.find('.sheet .chassis.lg');
    expect(ch.exists()).toBe(true);
    const hasBody = ch.find('.ch-img').exists() || ch.find('.ch-led').exists();
    expect(hasBody).toBe(true);
    expect(wrapper.find('.sheet').text()).toMatch(/Running|Building|Off|Worn|attention/i);
  });
});
