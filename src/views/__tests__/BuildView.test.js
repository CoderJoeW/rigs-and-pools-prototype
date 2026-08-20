import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountWithStore } from '../../test/mountWithStore.js';
import { fmt } from '../../utils/format.js';
import { cssRule, cssSource } from '../../test/cssRule.js';
import BuildView from '../BuildView.vue';

// RESTORED - full content in next commit if this is truncated
describe('BuildView', () => {
  it('loads the preset on mount and shows an orderable draft', () => {
    const { wrapper, store } = mountWithStore(BuildView);
    expect(store.canBuild).toBe(true);
    expect(wrapper.text()).toContain('Order parts');
  });
});
