import { onScopeDispose, ref, watch, type Ref } from 'vue';

// Eases a displayed number toward `source`'s value instead of snapping to
// it. Presentation only — the source of truth is never touched. See
// docs/implementation-notes.md#tweened-display-numbers-usetweenednumberts
// for the retargeting, snap and epsilon rationale.

const reduceMotion = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)') : null;

// Fast off the mark, settling gently — most of the distance is covered
// early, which is what makes a mid-flight retarget read as one motion.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const now = () => (typeof performance === 'object' && performance.now
  ? performance.now() : Date.now());

export interface UseTweenedNumberOptions { duration?: number; snapRatio?: number; snapFloor?: number; epsilon?: number }

export function useTweenedNumber(source: (() => number) | Ref<number>,
  { duration = 320, snapRatio = 8, snapFloor = 100, epsilon = 0.005 }: UseTweenedNumberOptions = {}): Ref<number> {
  const read = typeof source === 'function' ? source : () => source.value;
  const display = ref(read());

  let from = display.value, to = display.value, startedAt = 0, raf = 0;

  function cancel(): void {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function settle(v: number): void {
    cancel();
    from = to = display.value = v;
  }
  function frame(ts: number): void {
    // Clamped low as well as high: a callback can carry the CURRENT frame's
    // timestamp, which may predate the moment the flight was aimed.
    const t = duration > 0 ? Math.min(1, Math.max(0, (ts - startedAt) / duration)) : 1;
    if (t >= 1) { raf = 0; from = display.value = to; return; }
    display.value = from + (to - from) * easeOut(t);
    raf = requestAnimationFrame(frame);
  }

  watch(source, v => {
    if (!Number.isFinite(v) || !Number.isFinite(display.value)) { settle(v); return; }
    if (typeof requestAnimationFrame !== 'function') { settle(v); return; }
    if (reduceMotion && reduceMotion.matches) { settle(v); return; }
    const gap = Math.abs(v - display.value);
    if (gap < epsilon) { settle(v); return; }
    if (gap > snapRatio * (Math.abs(display.value) + snapFloor)) { settle(v); return; }
    from = display.value;
    to = v;
    startedAt = now();
    if (!raf) raf = requestAnimationFrame(frame);   // one flight at a time
  });

  // Nothing runs once the display has caught up; the loop only exists
  // between a change and it landing.
  onScopeDispose(cancel);

  return display;
}
