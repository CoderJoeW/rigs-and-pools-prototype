import { onMounted, onUnmounted, nextTick, watch } from 'vue';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
  'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/* The ".sheet" full-screen panels (rig/site detail, fleet actions, part
   pickers) are hand-rolled modals with no native <dialog> underneath, so
   nothing gives them dialog keyboard behavior for free. This adds it once:
   Escape closes, Tab/Shift+Tab cycle only within the panel instead of
   leaking to the page behind it, and focus moves onto the panel when it
   opens and back to whatever triggered it when it closes.
   elRef: template ref to the ".sheet" root. isOpen: a ref/computed boolean.
   close: called on Escape — pass the same handler the back/cancel button uses. */
export function useSheetA11y(elRef, isOpen, close){
  let lastFocused = null;

  function focusables(){
    if(!elRef.value) return [];
    return Array.from(elRef.value.querySelectorAll(FOCUSABLE));
  }

  function onKeydown(e){
    if(!isOpen.value) return;
    if(e.key==='Escape'){ e.preventDefault(); close(); return; }
    if(e.key!=='Tab') return;
    const list=focusables(); if(!list.length) return;
    const first=list[0], last=list[list.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }

  watch(isOpen, async open=>{
    if(open){
      lastFocused = document.activeElement;
      await nextTick();
      const list=focusables();
      (list[0]||elRef.value)?.focus();
    } else if(lastFocused){
      lastFocused.focus();
      lastFocused=null;
    }
  });

  onMounted(()=>document.addEventListener('keydown',onKeydown));
  onUnmounted(()=>document.removeEventListener('keydown',onKeydown));
}
