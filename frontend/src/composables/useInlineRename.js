import { ref } from 'vue';

// The "tap to rename" flow shared by sites, rigs, groups and pools: open an
// inline input seeded with the current name, then commit through whichever
// store setter owns that name. getName is read fresh on open rather than
// once, so it can point at a value that changes across renders (e.g. the
// currently active site).
export function useInlineRename(getName, save) {
  const open = ref(false);
  const draft = ref('');
  const start = () => { draft.value = getName(); open.value = true; };
  const commit = () => { save(draft.value); open.value = false; };
  return { open, draft, start, commit };
}
