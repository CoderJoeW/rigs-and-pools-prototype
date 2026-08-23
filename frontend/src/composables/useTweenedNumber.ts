import { onScopeDispose, ref, watch, type Ref } from 'vue';

// A number that MOVES to its new value instead of swapping to it.
//
// Every figure in the UI is a plain interpolation of a store value, so a
// block landing and paying out $40 renders exactly like a page reload: the
// text is one string on one frame and a different string on the next. This
// eases the DISPLAYED number toward the real one over a short window, so the
// moment a value changed is visible without staring at the pixel (issue #43).
//
// Presentation only — the source of truth is never touched, and only a
// deliberately short list of figures opts in: TopBar's cash and the Farm's
// "Net today" hero (both AMBIENT — they move continuously in the
// background whether or not the player is doing anything), and Build's
// verdict panel (DISCRETE — it only moves because the player just swapped
// a part or tapped the stepper, so the same easing reads as feedback on
// that action rather than a live readout ticking on its own). Formatting
// stays the caller's job: pass the ref this returns through the same
// fmt.* helper the raw value used, so the intermediate frames read in the
// same units and precision as the target.
//
// source: a getter (`() => g.s.cash`) or any ref/computed.
// duration: how long a change takes to land, in ms.
// snapRatio: see DISCONTINUITY below.
//
// Retargeting: the simulation ticks 10x/second (C.TICK_MS 100), so a new
// target usually arrives while the last one is still in flight. Each change
// re-aims from wherever the display currently SITS rather than restarting
// from the old target, which keeps position continuous — the number never
// jumps backwards to replay a leg it already covered, and stale animations
// can't queue up because there is only ever one flight in progress. With
// ease-out, ~100ms into a 320ms window the display has already covered two
// thirds of the gap, so under a continuous stream of ticks it trails the
// true value by a small fraction of a single tick's delta, not by a whole
// animation window. That property holds at every speed multiplier: SPEEDS
// up to 3600 scale the simulated dt, not the real-time tick rate, so the
// retarget cadence — and therefore the lag — is the same at 3600x as at 1x.
// The window is wall-clock, so a bigger per-tick jump is covered faster
// rather than crawling.
//
// DISCONTINUITY: a change larger than snapRatio times the value's own
// magnitude isn't the simulation moving, it's the ground shifting under it
// (a save loading over a fresh store, say). Counting through it would be
// noise, so those snap. The multiple is deliberately generous — spending
// most of your cash on a rig is a change worth watching, and stays tweened.
// snapFloor is the scale below which nothing counts as a discontinuity at
// all, so that a figure sitting near zero — "Net today" just after the day
// rolls over — still animates its first real move instead of snapping it.
//
// EPSILON: a live rig moves cash and the day's net by a tiny fraction of a
// cent on every one of those ten ticks a second — power accruing, mostly.
// Animating a change no formatter could render is a per-frame re-render of
// the component for nothing, and it would keep the loop alive permanently
// while the app is open. Anything under epsilon is therefore applied
// outright: exactly, so nothing drifts, and without starting a flight. The
// default sits just under a cent, the finest thing fmt.usd/usd2 can show.
// It is compared against the DISPLAYED value, so a small tick arriving
// during a real animation doesn't cut that animation short.
//
// Reduced motion snaps too. main.css's blanket rule only flattens CSS
// transition/animation durations; a JS tween is invisible to it, so the
// media query is checked here directly (and re-read on every change, so
// toggling the OS setting takes effect without a reload).

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
