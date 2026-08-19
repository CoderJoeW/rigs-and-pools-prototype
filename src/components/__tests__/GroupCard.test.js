import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import GroupCard from '../GroupCard.vue';

/* Lifted out of FarmView's v-for over groupRows. The rename state used to be
   maps keyed by group id; these cover the seam the extraction created. */
function row(seed){
  let gr;
  const { wrapper, store } = mountWithStore(GroupCard, {
    seed: g => { gr = g.s.groups[0]; if(seed) seed(g, gr); },
    props: { get gr(){ return gr; }, advice: null, ceiling: null, totalSlots: 4 },
  });
  return { wrapper, store, gr };
}

describe('GroupCard', () => {
  it('names the group and the chain it points at', () => {
    const { wrapper, gr } = row();
    expect(wrapper.text()).toContain(gr.name);
    expect(wrapper.text()).toContain('Tessera');
  });

  it('says Solo until the group points at a pool', () => {
    const { wrapper } = row();
    expect(wrapper.text()).toContain('Solo');
  });

  it('names the pool once the group points at one', () => {
    let name;
    const { wrapper } = row((g, gr) => {
      g.foundPool('tessera', 'PPLNS', 0.02);
      const p = g.myPools[0];
      gr.pool = p.id; name = p.name;
    });
    // the pool <select> always offers a "Solo" option, so assert on the
    // summary line rather than the whole card
    // two .gsel-v summaries: the chain and the pool
    expect(wrapper.findAll('.gsel-v').some(v => v.text().includes(name))).toBe(true);
  });

  it('renames the group through the store', async () => {
    const { wrapper, gr } = row();
    await wrapper.findAll('button').find(b => b.text() === 'Rename').trigger('click');
    await wrapper.find('input.group-rename-input').setValue('Night Shift');
    await wrapper.findAll('button').find(b => b.text() === 'Save name').trigger('click');
    expect(gr.name).toBe('Night Shift');
    expect(wrapper.text()).toContain('Night Shift');
  });

  it('cancelling a rename leaves the group alone', async () => {
    const { wrapper, gr } = row();
    const before = gr.name;
    await wrapper.findAll('button').find(b => b.text() === 'Rename').trigger('click');
    await wrapper.find('input.group-rename-input').setValue('Discarded');
    await wrapper.findAll('button').find(b => b.text() === 'Cancel').trigger('click');
    expect(gr.name).toBe(before);
    expect(wrapper.find('input.group-rename-input').exists()).toBe(false);
  });

  it('shows the rack share against the farm-wide total it is given', () => {
    const { wrapper } = row();
    expect(wrapper.text()).toContain('/ 4 racks');
  });

  /* advice and ceiling are objects the view computes from the whole farm, not
     strings — the prop types have to say so or Vue warns on every render. */
  it('surfaces a better-paying chain when the parent finds one', () => {
    let gr;
    const { wrapper } = mountWithStore(GroupCard, {
      seed: g => { gr = g.s.groups[0]; },
      props: { get gr(){ return gr; }, advice: { alt: 'Halcyon', mult: 2.5 },
               ceiling: null, totalSlots: 4 },
    });
    expect(wrapper.text()).toContain('Halcyon');
    expect(wrapper.text()).toContain('2.5');
  });

  it('warns when the group is past the chain’s emission ceiling', () => {
    let gr;
    const { wrapper } = mountWithStore(GroupCard, {
      seed: g => { gr = g.s.groups[0]; },
      props: { get gr(){ return gr; }, advice: null,
               ceiling: { share: 0.4, grossCap: 120 }, totalSlots: 4 },
    });
    expect(wrapper.text()).toContain('AT CEILING');
    expect(wrapper.text()).toContain('40%');
  });
});
