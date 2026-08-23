import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { useGameStore } from '../stores/game.js';
import { useSwipeAction } from './useSwipeAction.js';

type Store = ReturnType<typeof useGameStore>;

// Multi-select ("picking") and swipe-to-power-toggle for RigsView's rig
// list, plus the tap handler that arbitrates between them. The pointer
// mechanics live in useSwipeAction, which knows nothing about rigs; this is
// the domain half — which rows may be swiped, and what a tap or swipe does.
export function useRigSelection(g: Store, shown: ComputedRef<any[]>, f: ComputedRef<any>, openRig: Ref<number | null>) {
  const picking = ref(false);
  const chosen = reactive<Record<number, boolean>>({});
  const chosenIds = computed(() => shown.value.filter((r: any) => chosen[r.id]).map((r: any) => r.id));
  const toggleChoose = (r: any) => { chosen[r.id] = !chosen[r.id]; };
  const chooseAll = () => {
    const all = chosenIds.value.length === shown.value.length;
    for (const r of shown.value) chosen[(r as any).id] = !all;
  };
  const stopPicking = () => { picking.value = false; for (const k in chosen) delete chosen[k as any]; };
  const scopeId = computed(() => (picking.value && chosenIds.value.length ? chosenIds.value : (f.value ? f.value.id : null)));
  const scopeLabel = computed(() => (picking.value && chosenIds.value.length
    ? chosenIds.value.length + ' selected'
    : (f.value ? 'all ' + shown.value.length + ' at ' + f.value.name : '')));

  const canSwipe = (r: any) => !!r && !picking.value && g.rigState(r).k !== 'build';
  const swipeVerb = (r: any) => (r.on ? 'Power off' : 'Power on');
  const rigById = (id: number) => g.s.rigs.find((r: any) => r.id === id);

  const { sw, SW_FIRE, onDown: onSwipeDown, onMove: onSwipeMove, onUp: onSwipeUp,
    onCancel: onSwipeCancel, fire: fireSwipe, close: closeSwipe, reset: resetSwipe,
    takeClick, isOpen: swipeOpen } = useSwipeAction({
      can: (id: any) => canSwipe(rigById(id)),
      fire: (id: any) => g.toggleRig(id),
      within: '.rigswipe',
    });

  const rowClick = (r: any) => {
    if (takeClick()) return;                     // this click is the tail of a drag
    if (swipeOpen(r.id)) { closeSwipe(); return; } // an open row closes before it opens
    if (picking.value) toggleChoose(r); else openRig.value = r.id;
  };

  return { picking, chosen, chosenIds, toggleChoose, chooseAll, stopPicking, scopeId, scopeLabel,
    swipeVerb, sw, SW_FIRE, onSwipeDown, onSwipeMove, onSwipeUp, onSwipeCancel, fireSwipe, resetSwipe,
    rowClick };
}
