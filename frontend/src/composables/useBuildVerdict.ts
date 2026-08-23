import { computed, ref, watch, type Ref } from 'vue';
import { fmt } from '../utils/format.js';
import type { DraftCheck } from '../game/types.js';
import type { Store } from './gameStore.js';

// The Build view's verdict panel: the checks gating canBuild, plus the two
// advisory notes and the aria-live build-status line. Rationale for the
// snapshotting and note design:
// docs/implementation-notes.md#build-view-verdict-panel-srcviewsbuildviewvue
export function useBuildVerdict(g: Store, mode: Ref<string>, qty: Ref<number>, maxQty: Ref<number>,
  effShown: Ref<number>, drawShown: Ref<number>) {
  // Verdict panel ranking: design-spec.md §6i. ceilingNote is thread 32's
  // signal, deliberately kept out of canBuild's gate.
  const ceilingNote=computed(()=>{
    const gr=g.draftGroup(), c=g.chain(gr.chain);
    const ceil=g.chainCeiling(c, g.dp.mh);
    if(!ceil || !c) return null;
    const already=g.chainHash(c)>c.floor;   // "is at" only when true today, not just projected — issue #25
    return { tone:'warn',
      label: already
        ? c.name+' is at its ceiling — '+fmt.pct(ceil.share,0)+' of it would be yours'
        : 'This rig would put '+c.name+' at its ceiling — '+fmt.pct(ceil.share,0)+' of it would be yours',
      fix:'Above its floor a chain pays its emission, not your hashrate: '
          +c.name+' hands out about '+fmt.usd(ceil.grossCap)
          +'/day once it is at or above its floor, so this rig mostly divides '
          +'the same pot. Move the group to another chain and it earns on top.' };
  });
  // Issue #6 — new-miner subsidy context, coexists with ceilingNote by design.
  const subsidyNote=computed(()=>{
    const gr=g.draftGroup(), c=g.chain(gr.chain);
    if(!c || c.obs>c.floor) return null;
    return { tone:'good', label:c.name+' is paying a new-miner premium',
      fix:'Below its floor, '+c.name+' pays every miner the same rate regardless '
          +'of how little hash they bring — the fast payback is a deliberate '
          +'welcome gift, not a glitch. It fades as the chain fills toward its floor.' };
  });

  // aria-live announcement snapshotting (why draftKey AND gateKey, not a naive computed).
  const draftKey=computed(()=> JSON.stringify(g.s.draft));
  const gateKey=computed(()=> g.checks.map((c:DraftCheck)=>c.ok?1:0).join('')+':'+(g.canBuild?1:0));
  const buildStatus=ref('');
  watch(()=> draftKey.value+'|'+gateKey.value+'|'+qty.value, ()=>{
    const n=Math.min(qty.value, Math.max(1,maxQty.value||1));
    buildStatus.value = g.canBuild
      ? (n>1
          ? 'Ready to order '+n+' rigs for '+fmt.usd(g.dp.cost*n)+'.'
          : 'Ready to order for '+fmt.usd(g.dp.cost)+'.')
      : 'Cannot build yet: '+g.checks.filter((c:DraftCheck)=>!c.ok).map((c:DraftCheck)=>c.label).join('; ')+'.';
  }, { immediate:true });

  // Quick pick's condensed-not-silent checks.
  const verdict=computed(()=>{
    const c=g.checks;
    const notes=[ceilingNote.value,subsidyNote.value].filter((x): x is NonNullable<typeof x> => !!x);
    // Cost/hashrate/draw live on the hero; this is what's left — notes in
    // both modes, second-order figures only in Customise.
    if(mode.value==='preset') return [ { t:'', rows:[], checks:c.filter((x:DraftCheck)=>!x.ok), notes } ];
    return [
      { t:'Cost & payback', rows:[], checks:[c[5]], notes },
      { t:'Hashrate & MH/W', rows:[ {k:'MH/W', v:effShown.value.toFixed(3)} ],
        checks:[c[0],c[2],c[1]] },
      { t:'Site impact', rows:[ {k:'Draw', v:fmt.w(drawShown.value)} ],
        checks:[c[4],c[3]] },
    ];
  });

  return { ceilingNote, subsidyNote, buildStatus, verdict };
}
