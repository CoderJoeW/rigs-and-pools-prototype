import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useTweenedNumber } from '../useTweenedNumber.js';

/* The tween is driven by requestAnimationFrame off a wall clock, neither of
   which a test should wait on for real. Both are replaced with one hand-cranked
   clock: advance(ms) moves time forward and runs whatever frames were pending,
   handing them the same timestamp the composable's own now() would read. */
let clock, pending, nextHandle;

function advance(ms){
  clock += ms;
  const due = [...pending.values()];
  pending.clear();
  for(const cb of due) cb(clock);
}

beforeEach(() => {
  clock = 0; pending = new Map(); nextHandle = 0;
  vi.stubGlobal('requestAnimationFrame', cb => { pending.set(++nextHandle, cb); return nextHandle; });
  vi.stubGlobal('cancelAnimationFrame', h => { pending.delete(h); });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* The composable registers an onScopeDispose, so it needs an owning scope
   the same way a component would give it one. */
function run(fn){
  const scope = effectScope();
  const out = scope.run(fn);
  return { ...out, dispose: () => scope.stop() };
}

describe('useTweenedNumber', () => {
  it('starts at the source value without animating in from zero', () => {
    const src = ref(500);
    const { shown } = run(() => ({ shown: useTweenedNumber(src) }));
    expect(shown.value).toBe(500);
    expect(pending.size).toBe(0);
  });

  it('moves through intermediate values instead of snapping to the new one', async () => {
    const src = ref(500);
    const { shown } = run(() => ({ shown: useTweenedNumber(src, { duration: 300 }) }));

    src.value = 540;
    await nextTick();
    expect(shown.value).toBe(500);          // aimed, not yet moved

    advance(100);
    const mid = shown.value;
    expect(mid).toBeGreaterThan(500);
    expect(mid).toBeLessThan(540);

    advance(100);
    expect(shown.value).toBeGreaterThan(mid);
    expect(shown.value).toBeLessThan(540);
  });

  it('lands exactly on the target and then stops running frames', async () => {
    const src = ref(500);
    const { shown } = run(() => ({ shown: useTweenedNumber(src, { duration: 300 }) }));

    src.value = 540;
    await nextTick();
    advance(300);
    expect(shown.value).toBe(540);
    expect(pending.size).toBe(0);           // no loop idling once caught up
  });

  it('re-aims from where it sits mid-flight, keeping one flight in the air', async () => {
    const src = ref(0);
    const { shown } = run(() => ({ shown: useTweenedNumber(src, { duration: 300 }) }));

    src.value = 100;
    await nextTick();
    advance(100);
    const mid = shown.value;
    expect(pending.size).toBe(1);

    src.value = 200;                        // a second tick lands mid-animation
    await nextTick();
    expect(shown.value).toBe(mid);          // no jump back to the old start
    expect(pending.size).toBe(1);           // and no second, stale loop

    advance(50);
    expect(shown.value).toBeGreaterThan(mid);
    expect(shown.value).toBeLessThan(200);

    advance(300);
    expect(shown.value).toBe(200);
    expect(pending.size).toBe(0);
  });

  it('never goes backwards while the source only climbs', async () => {
    const src = ref(1000);
    const { shown } = run(() => ({ shown: useTweenedNumber(src, { duration: 320 }) }));

    let last = shown.value;
    for(let tick = 0; tick < 40; tick++){
      src.value += 250;                     // a fat fast-forward step, 10x/second
      await nextTick();
      for(let f = 0; f < 6; f++){           // ~60fps between 100ms ticks
        advance(17);
        expect(shown.value).toBeGreaterThanOrEqual(last);
        last = shown.value;
      }
    }
    // Under a continuous stream it trails by well under a single tick's delta.
    expect(src.value - shown.value).toBeLessThan(250);
  });

  it('snaps through a discontinuity rather than counting across it', async () => {
    const src = ref(500);
    const { shown } = run(() => ({ shown: useTweenedNumber(src, { duration: 300 }) }));

    src.value = 250000;                     // a save loading over a fresh store
    await nextTick();
    expect(shown.value).toBe(250000);
    expect(pending.size).toBe(0);

    src.value = 249600;                     // ordinary spending still tweens
    await nextTick();
    advance(100);
    expect(shown.value).toBeLessThan(250000);
    expect(shown.value).toBeGreaterThan(249600);
  });

  it('still animates a figure that sits near zero, like Net today after rollover', async () => {
    const src = ref(0);
    const { shown } = run(() => ({ shown: useTweenedNumber(src, { duration: 300 }) }));

    src.value = 40;                         // a block pays out on a fresh day
    await nextTick();
    advance(100);
    expect(shown.value).toBeGreaterThan(0);
    expect(shown.value).toBeLessThan(40);
  });

  it('applies sub-cent drift outright rather than keeping a loop alive for it', async () => {
    const src = ref(1000);
    const { shown } = run(() => ({ shown: useTweenedNumber(src, { duration: 300 }) }));

    for(let tick = 0; tick < 10; tick++){       // a live rig's power accrual
      src.value -= 0.0002;
      await nextTick();
    }
    expect(shown.value).toBe(src.value);        // exact, so nothing drifts
    expect(pending.size).toBe(0);               // and no frames were ever asked for

    src.value -= 40;                            // a change worth seeing still tweens
    await nextTick();
    expect(pending.size).toBe(1);
    advance(100);
    expect(shown.value).toBeGreaterThan(src.value);
  });

  it('a tiny tick mid-flight does not cut the animation short', async () => {
    const src = ref(1000);
    const { shown } = run(() => ({ shown: useTweenedNumber(src, { duration: 300 }) }));

    src.value = 1040;
    await nextTick();
    advance(100);
    const mid = shown.value;
    expect(mid).toBeLessThan(1040);

    src.value -= 0.0002;                        // power accrues mid-count-up
    await nextTick();
    expect(shown.value).toBe(mid);              // still where it was, still flying
    expect(pending.size).toBe(1);
    advance(300);
    expect(shown.value).toBeCloseTo(src.value, 6);
  });

  it('stops its loop when the owning scope goes away', async () => {
    const src = ref(500);
    const { dispose } = run(() => ({ shown: useTweenedNumber(src, { duration: 300 }) }));

    src.value = 540;
    await nextTick();
    expect(pending.size).toBe(1);
    dispose();
    expect(pending.size).toBe(0);
  });

  it('snaps instead of tweening when the reader asked for reduced motion', async () => {
    vi.resetModules();
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener(){}, removeEventListener(){} }));
    const { useTweenedNumber: reduced } = await import('../useTweenedNumber.js');

    const src = ref(500);
    const { shown } = run(() => ({ shown: reduced(src, { duration: 300 }) }));
    src.value = 540;
    await nextTick();
    expect(shown.value).toBe(540);
    expect(pending.size).toBe(0);
  });
});
