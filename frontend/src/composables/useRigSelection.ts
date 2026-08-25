import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { useSwipeAction } from './useSwipeAction.js';
import type { Rig, Site } from '../game/types.js';
import type { Store } from './gameStore.js';

// Multi-select ("picking") and swipe-to-power-toggle for RigsView's rig
// list, plus the tap handler that arbitrates between them. The pointer
// mechanics live in useSwipeAction, which knows nothing about rigs; this is
// the domain half — which rows may be swiped, and what a tap or swipe does.
export function useRigSelection(g: Store, shown: ComputedRef<Rig[]>, siteRigs: ComputedRef<Rig[]>, f: ComputedRef<Site>, openRig: Ref<number | null>) {
  const picking = ref(false);
  const chosen = reactive<Record<number, boolean>>({});
  const chosenIds = computed(() => shown.value.filter((r: Rig) => chosen[r.id]).map((r: Rig) => r.id));
  const toggleChoose = (r: Rig) => { chosen[r.id] = !chosen[r.id]; };
  const chooseAll = () => {
    const all = chosenIds.value.length === shown.value.length;
    for (const r of shown.value) chosen[r.id] = !all;
  };
  const stopPicking = () => { picking.value = false; for (const k in chosen) delete chosen[Number(k)]; };
  // Nothing picked falls back to the WHOLE site (f.value.id), not just the
  // filtered/shown rows, so the label must count siteRigs here too — using
  // shown.value.length understated the true scope of a filtered list.
  const scopeId = computed(() => (picking.value && chosenIds.value.length ? chosenIds.value : (f.value ? f.value.id : null)));
  const scopeLabel = computed(() => (picking.value && chosenIds.value.length
    ? chosenIds.value.length + ' selected'
    : (f.value ? 'all ' + siteRigs.value.length + ' at ' + f.value.name : '')));

  const canSwipe = (r: Rig | undefined) => !!r && !picking.value && g.rigState(r).k !== 'build';
  const swipeVerb = (r: Rig) => (r.on ? 'Power off' : 'Power on');
  const rigById = (id: number) => g.s.rigs.find((r: Rig) => r.id === id);

  const { sw, SW_FIRE, onDown: onSwipeDown, onMove: onSwipeMove, onUp: onSwipeUp,
    onCancel: onSwipeCancel, fire: fireSwipe, close: closeSwipe, reset: resetSwipe,
    takeClick, isOpen: swipeOpen } = useSwipeAction({
      can: (id: number | string) => canSwipe(rigById(id as number)),
      fire: (id: number | string) => g.toggleRig(id as number),
      within: '.rigswipe',
    });

  const rowClick = (r: Rig) => {
    if (takeClick()) return;                     // this click is the tail of a drag
    if (swipeOpen(r.id)) { closeSwipe(); return; } // an open row closes before it opens
    if (picking.value) toggleChoose(r); else openRig.value = r.id;
  };

  return { picking, chosen, chosenIds, toggleChoose, chooseAll, stopPicking, scopeId, scopeLabel,
    swipeVerb, sw, SW_FIRE, onSwipeDown, onSwipeMove, onSwipeUp, onSwipeCancel, fireSwipe, resetSwipe,
    rowClick };
}
