import { onBeforeUnmount, onMounted, reactive } from 'vue';

// Swipe-a-row-to-reveal-an-action state machine — thresholds in CSS px of
// leftward travel; full rationale: docs/implementation-notes.md#swipe-gesture-composable-srccomposablesuseswipeactionjs.
const SW_ARM = 10;
const SW_OPEN = 34;
const SW_REST = 108;
const SW_FIRE = 134;
const SW_MAX = 176;

type Id = number | string;

interface PointerLike { clientX: number; clientY: number; pointerId: number; pointerType?: string; button?: number;
  currentTarget?: EventTarget | null; }

interface InFlightPointer { id: Id; pid: number; x0: number; y0: number; base: number; claimed: boolean }

export interface UseSwipeActionOptions { can?: (id: Id) => boolean; fire: (id: Id) => void; within: string }

export function useSwipeAction({ can = () => true, fire, within }: UseSwipeActionOptions) {
  if (typeof fire !== 'function') throw new TypeError('useSwipeAction needs a fire callback');

  const sw = reactive<{ id: Id | null; x: number; drag: boolean }>({ id: null, x: 0, drag: false });

  let pt: InFlightPointer | null = null;            // the in-flight pointer, null between gestures
  let swallow = false;      // a drag just ended — eat the click it becomes
  let closeT: ReturnType<typeof setTimeout> | null = null;        // lets the row animate home before it un-mounts

  const clearCloseT = () => { if (closeT != null) { clearTimeout(closeT); closeT = null; } };

  const close = () => {
    clearCloseT();
    if (sw.id == null) return;
    const id = sw.id; sw.drag = false; sw.x = 0;
    closeT = setTimeout(() => { closeT = null; if (sw.id === id && sw.x === 0) sw.id = null; }, 240);
  };
  const reset = () => { clearCloseT(); sw.id = null; sw.x = 0; sw.drag = false; };

  const onDown = (e: PointerLike, id: Id) => {
    swallow = false;
    if (sw.id != null && sw.id !== id) reset();
    pt = null;
    if (!can(id)) return;
    if (e.pointerType === 'mouse' && e.button) return;
    pt = { id, pid: e.pointerId, x0: e.clientX, y0: e.clientY,
        base: (sw.id === id ? sw.x : 0), claimed: false };
  };
  const onMove = (e: PointerLike, id: Id) => {
    if (!pt || pt.id !== id || pt.pid !== e.pointerId) return;
    const dx = pt.x0 - e.clientX, dy = e.clientY - pt.y0;
    if (!pt.claimed) {
      // Vertical wins ties: the list has to stay scrollable.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SW_ARM) { pt = null; return; }
      if (Math.abs(dx) <= SW_ARM) return;
      pt.claimed = true; clearCloseT(); sw.id = id; sw.drag = true;
      const el = e.currentTarget as (EventTarget & { setPointerCapture?: (id: number) => void }) | null;
      if (el && el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    }
    // Subtracting ARM back out means the row starts moving from where the
    // finger is, not with a jump of the arming distance.
    sw.x = Math.max(0, Math.min(SW_MAX, pt.base + dx - (dx > 0 ? SW_ARM : -SW_ARM)));
  };
  const onUp = (e: PointerLike, id: Id) => {
    if (!pt || pt.id !== id) return;
    const claimed = pt.claimed; pt = null;
    if (!claimed) return;
    swallow = true; sw.drag = false;
    if (sw.x >= SW_FIRE) { close(); fire(id); }
    else if (sw.x >= SW_OPEN) sw.x = SW_REST;
    else close();
  };
  const onCancel = (_e: PointerLike, id: Id) => {
    if (pt && pt.id === id) pt = null;
    if (sw.drag && sw.id === id) close();
  };

  const fireNow = (id: Id) => { swallow = false; close(); if (can(id)) fire(id); };
  const takeClick = () => { const s = swallow; swallow = false; return s; };
  const isOpen = (id: Id) => sw.id === id && sw.x > 0;

  const onDocDown = (e: Event) => {
    if (sw.id == null) return;
    const t = e.target as (Element | null);
    if (t && t.closest && t.closest(within)) return;
    close();
  };
  onMounted(() => document.addEventListener('pointerdown', onDocDown, { passive: true }));
  onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDocDown); clearCloseT(); });

  return { sw, onDown, onMove, onUp, onCancel, fire: fireNow, close, reset,
    takeClick, isOpen, SW_ARM, SW_OPEN, SW_REST, SW_FIRE, SW_MAX };
}
