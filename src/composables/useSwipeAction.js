import { onBeforeUnmount, onMounted, reactive } from 'vue';

/* Swipe-a-row-to-reveal-an-action, the pointer half of it.

   One row at a time is open. Dragging left past ARM claims the gesture from
   the page scroll; past OPEN it rests at REST showing the button; past FIRE
   it fires on release without needing the button at all. Everything is in
   CSS pixels of leftward travel.

   ARM   the drag has to beat this before we claim the pointer, so a mostly
         vertical flick still scrolls the list.
   OPEN  released short of this and the row just closes again.
   REST  where an opened row parks — the width of the revealed button.
   FIRE  released past this and the action fires straight away.
   MAX   hard stop, so a long drag cannot pull the row off its own track. */
const SW_ARM = 10;
const SW_OPEN = 34;
const SW_REST = 108;
const SW_FIRE = 134;
const SW_MAX = 176;

/* Nothing here knows what a rig is. It deals in opaque row ids and calls back
   out for the two decisions that are the caller's: whether a given row may be
   swiped at all, and what firing actually does.

   can(id)    -> boolean, checked on pointerdown and again before firing.
   fire(id)   -> the action itself.
   within     -> selector for the row wrapper; a pointerdown anywhere outside
                 one closes the open row. */
export function useSwipeAction({ can = () => true, fire, within }){
  /* The open row and how far it is pulled. Reactive because the template
     positions the slide from it; `drag` is separate from `x > 0` so CSS can
     drop its transition only while a finger is actually down. */
  const sw = reactive({ id:null, x:0, drag:false });

  let pt = null;            // the in-flight pointer, null between gestures
  let swallow = false;      // a drag just ended — eat the click it becomes
  let closeT = null;        // lets the row animate home before it un-mounts

  const clearCloseT = () => { if(closeT!=null){ clearTimeout(closeT); closeT=null; } };

  /* Animate shut: x goes to 0 now, but the row stays mounted for the length of
     the CSS transition so it slides home instead of vanishing. */
  const close = () => {
    clearCloseT();
    if(sw.id==null) return;
    const id=sw.id; sw.drag=false; sw.x=0;
    closeT=setTimeout(()=>{ closeT=null; if(sw.id===id&&sw.x===0) sw.id=null; },240);
  };
  /* Shut instantly, no animation — for when the list underneath changes and
     the open row may not even exist any more. */
  const reset = () => { clearCloseT(); sw.id=null; sw.x=0; sw.drag=false; };

  const onDown = (e,id) => {
    swallow=false;
    if(sw.id!=null&&sw.id!==id) reset();
    pt=null;
    if(!can(id)) return;
    if(e.pointerType==='mouse'&&e.button) return;
    pt={id, pid:e.pointerId, x0:e.clientX, y0:e.clientY,
        base:(sw.id===id?sw.x:0), claimed:false};
  };
  const onMove = (e,id) => {
    if(!pt||pt.id!==id||pt.pid!==e.pointerId) return;
    const dx=pt.x0-e.clientX, dy=e.clientY-pt.y0;
    if(!pt.claimed){
      // Vertical wins ties: the list has to stay scrollable.
      if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>SW_ARM){ pt=null; return; }
      if(Math.abs(dx)<=SW_ARM) return;
      pt.claimed=true; clearCloseT(); sw.id=id; sw.drag=true;
      const el=e.currentTarget;
      if(el&&el.setPointerCapture){ try{ el.setPointerCapture(e.pointerId); }catch(_){} }
    }
    // Subtracting ARM back out means the row starts moving from where the
    // finger is, not with a jump of the arming distance.
    sw.x=Math.max(0,Math.min(SW_MAX,pt.base+dx-(dx>0?SW_ARM:-SW_ARM)));
  };
  const onUp = (e,id) => {
    if(!pt||pt.id!==id) return;
    const claimed=pt.claimed; pt=null;
    if(!claimed) return;
    swallow=true; sw.drag=false;
    if(sw.x>=SW_FIRE){ close(); fire(id); }
    else if(sw.x>=SW_OPEN) sw.x=SW_REST;
    else close();
  };
  const onCancel = (e,id) => {
    if(pt&&pt.id===id) pt=null;
    if(sw.drag&&sw.id===id) close();
  };

  /* Pressing the revealed button. Not a drag, so there is no click to eat. */
  const fireNow = id => { swallow=false; close(); if(can(id)) fire(id); };

  /* A finished drag lands as a click on the row underneath. The row's own
     click handler asks here first so opening a rig's detail sheet isn't the
     accidental result of swiping it. */
  const takeClick = () => { const s=swallow; swallow=false; return s; };
  const isOpen = id => sw.id===id && sw.x>0;

  const onDocDown = e => {
    if(sw.id==null) return;
    const t=e.target;
    if(t&&t.closest&&t.closest(within)) return;
    close();
  };
  onMounted(()=>document.addEventListener('pointerdown',onDocDown,{passive:true}));
  onBeforeUnmount(()=>{ document.removeEventListener('pointerdown',onDocDown); clearCloseT(); });

  return { sw, onDown, onMove, onUp, onCancel, fire:fireNow, close, reset,
    takeClick, isOpen, SW_ARM, SW_OPEN, SW_REST, SW_FIRE, SW_MAX };
}
