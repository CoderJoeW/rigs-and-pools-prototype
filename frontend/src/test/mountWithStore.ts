import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from '../stores/game.js';

// Mounts a component (view or shared UI piece) against a real, fresh Pinia
// store — not a mock. These are smoke tests: the goal is to catch a broken
// template binding or a component that throws on mount, the same class of
// bug the original prototype's audit.py linter existed to catch, now that
// real .vue SFCs let a template be malformed independently of the script.
//
// `seed`, if given, runs against the store BEFORE mounting — e.g. building
// a rig so a view's populated-state branches render, not just its empty
// ("nothing installed yet") ones.
export function mountWithStore(
  component: any,
  { seed, ...options }: { seed?: (g: ReturnType<typeof useGameStore>) => void } & ComponentMountingOptions<any> = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const g = useGameStore();
  if (seed) seed(g);
  const { global, ...rest } = options;
  const wrapper = mount(component, {
    ...rest,
    global: { ...global, plugins: [pinia, ...((global && global.plugins) || [])] },
  });
  return { wrapper, store: g };
}
