import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import Feed from '../Feed.vue';

describe('Feed', () => {
  it('shows the boot message by default', () => {
    const { wrapper } = mountWithStore(Feed);
    expect(wrapper.text()).toContain('spare bedroom');
  });

  it('filters entries by kind', async () => {
    // say() itself is internal-only (never part of the store's public API —
    // components never write to the feed directly, only game actions do),
    // so seed it the same shape it would produce.
    const { wrapper } = mountWithStore(Feed, { seed: (g: any) => g.s.feed.unshift(
      { id: g.s.feedId++, t: '00:00', kind: 'bad', text: 'A test problem message', amount: '', n: 1 }) });

    await wrapper.findAll('button').find(b => b.text() === 'problems')!.trigger('click');
    expect(wrapper.text()).toContain('A test problem message');
    expect(wrapper.text()).not.toContain('spare bedroom'); // that's a 'sys' entry, filtered out

    await wrapper.findAll('button').find(b => b.text() === 'all')!.trigger('click');
    expect(wrapper.text()).toContain('spare bedroom');
  });

  it('shows a placeholder when a filter matches nothing', async () => {
    const { wrapper } = mountWithStore(Feed);
    await wrapper.findAll('button').find(b => b.text() === 'blocks')!.trigger('click');
    expect(wrapper.text()).toContain('Nothing of that kind yet');
  });
});
