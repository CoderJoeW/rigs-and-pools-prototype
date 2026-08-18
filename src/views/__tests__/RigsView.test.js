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

  it('list row fronts each rig with its hardware shot, carrying the rig state', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    const shot = wrapper.find('.rigshot');
    expect(shot.exists()).toBe(true);
    expect(shot.find('img.rgs-img').exists()).toBe(true);
    expect(shot.classes()).toContain('run');
    expect(shot.attributes('aria-label')).toBe('Running');
    // The chain is named in the row's text, so it is not painted on the shot too.
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
