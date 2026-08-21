import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useSwipeAction } from '../useSwipeAction.js';

/* The composable takes a document listener out in onMounted and puts it back in
   onBeforeUnmount, so it is exercised through a real (empty) component rather
   than a bare effect scope — that way the listener is genuinely installed and
   `stop()` genuinely tests the teardown. */
function build(opts = {}){
  const fired = [];
  let api;
  const wrapper = mount(defineComponent({
    setup(){
      api = useSwipeAction({
        can: opts.can || (() => true),
        fire: id => fired.push(id),
        within: '.row',
      });
      return () => h('div');
    },
  }));
  return { ...api, fired, stop: () => wrapper.unmount() };
}

/* A pointer event is only ever read for these five fields. */
const ev = (x, y = 0, extra = {}) =>
  ({ clientX:x, clientY:y, pointerId:1, pointerType:'touch', currentTarget:null, ...extra });

/* Drag row `id` left by `dist` px and release. Leftward travel is a DECREASING
   clientX, which is the easiest thing to get backwards when reading the source. */
function swipe(api, id, dist){
  api.onDown(ev(500), id);
  api.onMove(ev(500 - dist), id);
  api.onUp(ev(500 - dist), id);
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useSwipeAction thresholds', () => {
  it('ignores a drag that never beats the arming distance', () => {
    const s = build();
    swipe(s, 7, 8); // 8px < SW_ARM
    expect(s.sw.id).toBe(null);
    expect(s.sw.x).toBe(0);
    expect(s.fired).toEqual([]);
    s.stop();
  });

  it('lets a mostly vertical drag through to the scroller', () => {
    const s = build();
    s.onDown(ev(500, 0), 7);
    s.onMove(ev(495, 60), 7); // 60px down beats 5px across
    expect(s.sw.drag).toBe(false);
    expect(s.sw.id).toBe(null);
    // and the gesture is dead — carrying on horizontally does not revive it
    s.onMove(ev(300, 60), 7);
    expect(s.sw.id).toBe(null);
    s.stop();
  });

  it('parks an opened row at rest, without firing', () => {
    const s = build();
    swipe(s, 7, 60); // past OPEN (34), short of FIRE (134)
    expect(s.sw.id).toBe(7);
    expect(s.sw.x).toBe(108); // SW_REST
    expect(s.isOpen(7)).toBe(true);
    expect(s.fired).toEqual([]);
    s.stop();
  });

  it('closes again when released between arm and open', () => {
    const s = build();
    swipe(s, 7, 20); // past ARM (10), short of OPEN (34)
    expect(s.sw.x).toBe(0);
    expect(s.fired).toEqual([]);
    s.stop();
  });

  /* Travel is the drag distance less the arming distance, so a release at
     `dist` leaves the row at `dist - SW_ARM`. These four pin OPEN and FIRE from
     both sides — bracketing them loosely lets the numbers drift, which is the
     one thing this refactor promised not to do. */
  it('parks at rest from exactly SW_OPEN, and closes one pixel short', () => {
    const under = build();
    swipe(under, 7, 43); // travel 33 — one short of OPEN
    expect(under.sw.x).toBe(0);
    under.stop();

    const on = build();
    swipe(on, 7, 44);    // travel 34 — exactly OPEN
    expect(on.sw.x).toBe(108);
    expect(on.fired).toEqual([]);
    on.stop();
  });

  it('fires from exactly SW_FIRE, and only parks one pixel short', () => {
    const under = build();
    swipe(under, 7, 143); // travel 133 — one short of FIRE
    expect(under.fired).toEqual([]);
    expect(under.sw.x).toBe(108);
    under.stop();

    const on = build();
    swipe(on, 7, 144);    // travel 134 — exactly FIRE
    expect(on.fired).toEqual([7]);
    on.stop();
  });

  it('clamps travel at the maximum', () => {
    const s = build();
    s.onDown(ev(500), 7);
    s.onMove(ev(-4000), 7);
    expect(s.sw.x).toBe(176); // SW_MAX
    s.stop();
  });

  it('will not open a row its owner refuses', () => {
    const s = build({ can: id => id !== 9 });
    swipe(s, 9, 200);
    expect(s.sw.id).toBe(null);
    expect(s.fired).toEqual([]);
    s.stop();
  });

  it('re-checks permission when the revealed button is pressed', () => {
    let allowed = true;
    const s = build({ can: () => allowed });
    swipe(s, 7, 60);
    allowed = false;             // the row became un-swipeable while open
    s.fire(7);
    expect(s.fired).toEqual([]);
    s.stop();
  });
});

describe('useSwipeAction click handling', () => {
  it('swallows exactly the one click a finished drag becomes', () => {
    const s = build();
    swipe(s, 7, 60);
    expect(s.takeClick()).toBe(true);  // the drag's own click
    expect(s.takeClick()).toBe(false); // the next real tap is not eaten
    s.stop();
  });

  it('does not swallow a click after a tap that never armed', () => {
    const s = build();
    swipe(s, 7, 4);
    expect(s.takeClick()).toBe(false);
    s.stop();
  });

  it('does not swallow the click on the revealed button', () => {
    const s = build();
    swipe(s, 7, 60);
    s.takeClick();
    s.fire(7);
    expect(s.takeClick()).toBe(false);
    s.stop();
  });
});

describe('useSwipeAction open-row bookkeeping', () => {
  it('keeps the row mounted while it animates home, then drops it', () => {
    const s = build();
    swipe(s, 7, 60);
    s.close();
    expect(s.sw.x).toBe(0);
    expect(s.sw.id).toBe(7);   // still mounted so CSS can slide it back
    vi.advanceTimersByTime(239);
    expect(s.sw.id).toBe(7);   // must outlast the .22s CSS transition
    vi.advanceTimersByTime(1);
    expect(s.sw.id).toBe(null);
    s.stop();
  });

  it('reset drops the row immediately, for when the list changes underneath', () => {
    const s = build();
    swipe(s, 7, 60);
    s.reset();
    expect(s.sw).toMatchObject({ id:null, x:0, drag:false });
    s.stop();
  });

  it('closes the open row when a different one is grabbed', () => {
    const s = build();
    swipe(s, 7, 60);
    s.onDown(ev(500), 8);
    expect(s.sw.id).toBe(null);
    s.stop();
  });

  it('resumes an already-open row from where it was parked', () => {
    const s = build();
    swipe(s, 7, 60);             // parked at 108
    s.onDown(ev(500), 7);
    s.onMove(ev(470), 7);        // 30px further left, 10 of which arms
    expect(s.sw.x).toBe(128);    // 108 + 30 - SW_ARM
    s.stop();
  });

  it('a cancelled pointer closes the row instead of leaving it stuck', () => {
    const s = build();
    s.onDown(ev(500), 7);
    s.onMove(ev(440), 7);
    expect(s.sw.drag).toBe(true);
    s.onCancel(ev(440), 7);
    expect(s.sw.x).toBe(0);
    expect(s.fired).toEqual([]);
    s.stop();
  });

  /* The document listener has to tell "pressed somewhere else on the page" from
     "pressed the button this swipe just revealed". Dispatching straight on
     `document` cannot tell them apart — document has no .closest, so the guard
     short-circuits before the selector is ever read. Both cases need real
     elements. */
  it('a pointerdown outside the rows closes the open one', () => {
    const s = build();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    swipe(s, 7, 60);

    outside.dispatchEvent(new Event('pointerdown', { bubbles:true }));
    expect(s.sw.x).toBe(0);

    outside.remove();
    s.stop();
  });

  it('leaves the row open when the press lands inside it', () => {
    const s = build();
    const row = document.createElement('div');
    row.className = 'row';                 // the `within` selector
    const button = document.createElement('button');
    row.appendChild(button);
    document.body.appendChild(row);
    swipe(s, 7, 60);

    button.dispatchEvent(new Event('pointerdown', { bubbles:true }));
    expect(s.sw.x).toBe(108);              // still parked, not snapped shut
    expect(s.isOpen(7)).toBe(true);

    row.remove();
    s.stop();
  });

  it('lets go of the document listener when the view unmounts', () => {
    const off = vi.spyOn(document, 'removeEventListener');
    const s = build();
    s.stop();
    expect(off).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    off.mockRestore();
  });

  it('ignores pointer events from a second finger mid-drag', () => {
    const s = build();
    s.onDown(ev(500), 7);
    s.onMove(ev(440), 7);
    const at = s.sw.x;
    s.onMove(ev(100, 0, { pointerId:2 }), 7); // other finger, other row's business
    expect(s.sw.x).toBe(at);
    s.stop();
  });
});
