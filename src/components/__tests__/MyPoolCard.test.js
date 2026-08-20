import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import MyPoolCard from '../MyPoolCard.vue';

/* Lifted out of ChainsView's v-for, where every piece of its state was a map
   keyed by pool id. These cover the parts that keying used to reach — rename,
   the fee draft, the bond steps — none of which the view's own tests touched. */
function card(seed){
  let pool;
  const { wrapper, store } = mountWithStore(MyPoolCard, {
    seed: g => { g.foundPool('tessera', 'PPLNS', 0.02); pool = g.myPools[0]; if(seed) seed(g, pool); },
    props: { get pool(){ return pool; }, open: true },
  });
  return { wrapper, store, pool };
}

describe('MyPoolCard', () => {
  it('names the pool and its scheme', () => {
    const { wrapper, pool } = card();
    expect(wrapper.text()).toContain(pool.name);
    expect(wrapper.text()).toContain('PPLNS');
  });

  it('stays collapsed until asked to open', () => {
    let pool;
    const { wrapper } = mountWithStore(MyPoolCard, {
      seed: g => { g.foundPool('tessera', 'PPLNS', 0.02); pool = g.myPools[0]; },
      props: { get pool(){ return pool; }, open: false },
    });
    expect(wrapper.text()).not.toContain('Blocks found');
  });

  it('asks the parent to toggle rather than owning the open state', async () => {
    const { wrapper } = card();
    await wrapper.find('.rig-hd').trigger('click');
    expect(wrapper.emitted('toggle')).toHaveLength(1);
  });

  it('renames the pool through the store', async () => {
    const { wrapper, pool } = card();
    await wrapper.findAll('button').find(b => b.text() === 'Rename').trigger('click');
    const input = wrapper.find('input[maxlength="24"]');
    await input.setValue('Deep Vein');
    await wrapper.findAll('button').find(b => b.text() === 'Save name').trigger('click');
    expect(pool.name).toBe('Deep Vein');
    expect(wrapper.text()).toContain('Deep Vein');
  });

  it('shows the fee projection only once the slider actually moves', async () => {
    const { wrapper, pool } = card();
    expect(wrapper.text()).not.toContain('would settle at');

    const slider = wrapper.find('input[type="range"]');
    await slider.setValue(0.05);
    expect(wrapper.text()).toContain('would settle at');
    expect(pool.fee).toBe(0.02);          // still a draft, not applied

    await wrapper.findAll('button').find(b => b.text().startsWith('Move to')).trigger('click');
    expect(pool.fee).toBeCloseTo(0.05, 5);
    await nextTick();
    expect(wrapper.text()).not.toContain('would settle at');
  });

  it('drops the fee draft on cancel, leaving the live fee alone', async () => {
    const { wrapper, pool } = card();
    await wrapper.find('input[type="range"]').setValue(0.08);
    await wrapper.findAll('button').find(b => b.text() === 'Cancel').trigger('click');
    expect(pool.fee).toBe(0.02);
    expect(wrapper.text()).not.toContain('would settle at');
  });

  /* The extraction dropped `spark` and nothing noticed, because every seed
     above founds a fresh pool whose hist is empty — so the sparkline branch,
     the one that broke, was never entered. These enter it. */
  it('draws the hashrate sparkline once the pool has history', () => {
    const { wrapper } = card((g, pool) => { pool.hist = [10, 20, 15, 30, 25]; });
    const path = wrapper.find('svg path');
    expect(path.exists()).toBe(true);
    expect(path.attributes('d')).toMatch(/^M/);   // a real path, not empty
  });

  it('holds the sparkline back until there is enough history to mean anything', () => {
    const { wrapper } = card((g, pool) => { pool.hist = [10, 20]; });
    expect(wrapper.find('svg path').exists()).toBe(false);
  });

  it('renders a PPS pool with its capacity and dry-spell risk', () => {
    let pool;
    const { wrapper } = mountWithStore(MyPoolCard, {
      seed: g => {
        // A PPS bond is an order of magnitude past a PPLNS one — $4,000 against
        // the $500 a fresh save opens with — so this has to be funded or
        // foundPool silently declines and the fixture is undefined.
        // headroom past the bond so the top-up buttons render enabled too
        g.s.cash = g.bondReq(g.chain('tessera'), 'PPS') + 1000;
        g.foundPool('tessera', 'PPS', 0.02);
        pool = g.myPools[0];
        pool.hist = [10, 20, 15, 30];
      },
      props: { get pool(){ return pool; }, open: true },
    });
    expect(wrapper.text()).toContain('PPS');
    expect(wrapper.find('svg path').exists()).toBe(true);
    // Assertions that DISCRIMINATE. "Supports" would not: the PPLNS branch
    // renders its own Supports row ("any amount — members carry their own
    // variance"), so asserting it would pass against the wrong branch — the
    // exact fault this test was fixed for.
    //
    // One per PPS-gated element, because they are gated separately. The PPLNS
    // v-else pairs with the Dry-spell v-if, NOT with the Supports one, so
    // deleting the capacity row leaves every other assertion here true and the
    // fallback still absent. "limited by" is what covers that row.
    expect(wrapper.text()).toContain('limited by');      // the capacity row itself
    expect(wrapper.text()).toContain('Dry-spell risk');
    expect(wrapper.text()).toContain('underwritten');
    expect(wrapper.text()).toContain('this is your capacity control');
    expect(wrapper.text()).not.toContain('members carry their own variance');
  });

  it('scales the bond buttons to the size of the bond', () => {
    const { wrapper } = card((g, pool) => { pool.bond = 4000; });
    // magnitude 1000 → 100 / 1000 / 5000
    const labels = wrapper.findAll('button').map(b => b.text());
    expect(labels.some(t => t.includes('100'))).toBe(true);
    expect(labels.some(t => t.includes('5,000') || t.includes('5000'))).toBe(true);
  });
});
