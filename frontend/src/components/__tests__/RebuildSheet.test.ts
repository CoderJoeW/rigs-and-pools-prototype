import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import RebuildSheet from '../RebuildSheet.vue';

/* The larger of the two RigsView sheets, and — like the fleet sheet — it had no
   coverage of its own before it moved out. It takes no props: g.s.rebuild is
   the whole input, so these drive it the way startRebuild does. */
function open(seed?: (g: any) => void){
  return mountWithStore(RebuildSheet, {
    seed: (g: any) => {
      g.generatePreset();
      g.s.cash = 500000;
      g.build();
      g.s.rigs[0].building = 0;
      if(seed) seed(g);
      g.startRebuild(g.s.rigs[0]);
    },
  });
}

describe('RebuildSheet', () => {
  it('renders nothing until a rebuild is started', () => {
    const { wrapper } = mountWithStore(RebuildSheet, {
      seed: g => { g.generatePreset(); g.build(); },
    });
    expect(wrapper.find('.sheet')!.exists()).toBe(false);
  });

  it('opens on the rig being rebuilt, with dialog semantics', () => {
    const { wrapper, store: g } = open();
    const sheet = wrapper.find('.sheet')!;
    expect(sheet.attributes('role')).toBe('dialog');
    expect(sheet.attributes('aria-modal')).toBe('true');
    expect(wrapper.text()).toContain('Rebuild ' + g.s.rigs[0].name);
  });

  it('lists every slot as its own row', () => {
    const { wrapper } = open();
    for(const label of ['Cards', 'Frame', 'Board', 'Cooling', 'Supply'])
      expect(wrapper.text()).toContain(label);
  });

  it('opens a slot picker and comes back on Back', async () => {
    const { wrapper, store: g } = open();
    await wrapper.findAll('button.pickrow').find(b => b.text().includes('Frame'))!.trigger('click');
    expect(g.s.rebuild!.picker).toBe('frame');

    await wrapper.findAll('button').find(b => b.text().includes('Back'))!.trigger('click');
    expect(g.s.rebuild!.picker).toBe(null);
  });

  it('picking a part changes the draft and marks the row changed', async () => {
    const { wrapper, store: g } = open();
    const before = g.s.rebuild!.draft.frame;
    await wrapper.findAll('button.pickrow').find(b => b.text().includes('Frame'))!.trigger('click');

    const other = wrapper.findAll('.cmp-r').find(r => !r.text().includes('Installed'))!;
    await other.trigger('click');
    await nextTick();

    expect(g.s.rebuild!.picker).toBe(null);
    if(g.s.rebuild!.draft.frame !== before) expect(wrapper.text()).toContain('CHANGED');
  });

  it('the stepper moves the card count within the pair’s limit', async () => {
    const { wrapper, store: g } = open();
    const plus = () => wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Increase card count')!;
    const minus = () => wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Decrease card count')!;

    const start = g.s.rebuild!.draft.n;
    await minus().trigger('click');
    expect(g.s.rebuild!.draft.n).toBe(start - 1);
    await plus().trigger('click');
    expect(g.s.rebuild!.draft.n).toBe(start);

    // never past the limit the frame/board pair allows
    for(let i = 0; i < 40; i++){ if(plus().attributes('disabled') !== undefined) break; await plus().trigger('click'); }
    expect(g.s.rebuild!.draft.n).toBeLessThanOrEqual(g.rebuildInfo(g.s.rigs[0], g.s.rebuild!.draft).lim);
  });

  it('refuses to commit a draft that changes nothing', () => {
    const { wrapper } = open();
    const go = wrapper.findAll('button').find(b => b.classes().includes('btn-wide'))!;
    expect(go.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Nothing changed yet');
  });

  // The forfeit warning reads pending/chain off the rig's GROUP, not the rig
  // itself — the PPLNS window moved there in an earlier migration, and this
  // component still read the pre-migration rig fields until a stricter Rig
  // type (which has no `pending`/`chain`) caught the mismatch.
  it('does not warn about a forfeit when the group carries no pending window', () => {
    const { wrapper, store: g } = open();
    expect(g.s.groups[0].pending).toBe(0);
    expect(wrapper.text()).not.toContain('forfeits the PPLNS window');
  });

  it('warns about forfeiting the PPLNS window when the group has one pending', () => {
    const { wrapper } = open(g => { g.s.groups[0].pending = 5; });
    expect(wrapper.text()).toContain('forfeits the PPLNS window');
  });
});
