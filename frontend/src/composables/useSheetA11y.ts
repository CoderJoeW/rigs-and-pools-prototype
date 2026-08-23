import { onMounted, onUnmounted, nextTick, watch, type Ref } from 'vue';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
  'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// The ".sheet" full-screen panels (rig/site detail, fleet actions, part
// pickers) are hand-rolled modals with no native <dialog> underneath, so
// nothing gives them dialog keyboard behavior for free. This adds it once:
// Escape closes, Tab/Shift+Tab cycle only within the panel instead of
// leaking to the page behind it, and focus moves onto the panel when it
// opens and back to whatever triggered it when it closes.
// elRef: template ref to the ".sheet" root. isOpen: a ref/computed boolean.
// close: called on Escape — pass the same handler the back/cancel button uses.
export function useSheetA11y(elRef: Ref<HTMLElement | null>, isOpen: Ref<boolean>, close: () => void): void {
  let lastFocused: HTMLElement | null = null;

  function focusables(): HTMLElement[] {
    if (!elRef.value) return [];
    return Array.from(elRef.value.querySelectorAll(FOCUSABLE));
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!isOpen.value) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const list = focusables(); if (!list.length) return;
    const first = list[0]!, last = list[list.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* immediate: every .sheet in the app today starts closed (picker/rebuild/
     etc. are null until a click sets them), so a false->true transition
     has always been there to catch. Kept anyway as a defensive default —
     a .sheet that CAN be open on its very first render (isOpen already
     true before this watcher exists) would otherwise never see that
     initial state as a transition, so focus would never enter an
     aria-modal="true" dialog sitting over the whole page. Cheap enough to
     hold for whichever sheet needs it next; costs nothing for the ones
     that don't (the immediate call's `else` branch is a no-op when
     lastFocused is still its initial null). */
  watch(isOpen, async open => {
    if (open) {
      lastFocused = document.activeElement as HTMLElement | null;
      await nextTick();
      const list = focusables();
      (list[0] || elRef.value)?.focus();
    } else if (lastFocused) {
      lastFocused.focus();
      lastFocused = null;
    }
  }, { immediate: true });

  onMounted(() => document.addEventListener('keydown', onKeydown));
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
}
