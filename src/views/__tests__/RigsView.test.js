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

  it('list row shows a living chassis with status class and chain LED when grouped', () => {
    const { wrapper } = mountWithStore(RigsView, {
      seed: g => { g.generatePreset(); g.build(); g.s.rigs[0].building = 0; },
    });
    const ch = wrapper.find('.chassis');
    expect(ch.exists()).toBe(true);
    // Image mode uses .ch-img; CSS fallback uses .ch-led + .ch-vent
    const hasBody = ch.find('.ch-img').exists() || (ch.find('.ch-led').exists() && ch.find('.ch-vent').exists());
    expect(hasBody).toBe(true);
    expect(ch.classes().some(c => ['run','off','build','warn','bad'].includes(c) || c.startsWith('sz-'))).toBe(true);
    const style = ch.attributes('style') || '';
    expect(style).toMatch(/--chain-h/);
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
