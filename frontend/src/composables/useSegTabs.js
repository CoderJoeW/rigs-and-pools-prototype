import { reactive, ref } from 'vue';

// A real ARIA tablist's roving-focus keyboard behaviour: Left/Right/Home/End
// move both the active segment and DOM focus, wrapping at the ends. Shared
// by every segmented-control view (Chains, Market, Stats) — they render
// their own tab markup, but the arrow-key math and focus handoff were
// copy-pasted identically three times.
export function useSegTabs(segs, initialKey) {
  const seg = ref(initialKey);
  const segEl = reactive({});
  const segKey = e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1
            : e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : 0;
    if (!d) return;
    e.preventDefault();
    const i = segs.findIndex(x => x.k === seg.value);
    const n = d === 'first' ? 0 : d === 'last' ? segs.length - 1
            : (i + d + segs.length) % segs.length;
    seg.value = segs[n].k;
    const el = segEl[seg.value]; if (el && el.focus) el.focus();
  };
  return { seg, segEl, segKey };
}
