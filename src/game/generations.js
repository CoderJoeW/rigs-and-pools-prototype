import { C } from '../data/constants.js';
import { CARDS, PSUS, PART_MAP, genCardsFor, genPsuFor } from '../data/hardware.js';

/* 01-generations.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installGenerations(G){
  /* ---- generations: regrow the catalogue from the clock ---- */
  const liveCards=[...CARDS];
  const livePsus=[...PSUS];
  let builtGen=0;                       // how far the CATALOGUE is extended — distinct
  function ensureGens(){                // from s.gen, which is saved state.
    const want=Math.floor(G.s.t/(C.GEN_DAYS*86400));
    while(G.s.gen<want){                  // genuinely new: announce
      G.s.gen++;
      const [a]=genCardsFor(G.s.gen);
      G.say('big','New silicon: '+a.name+' — 15% better MH/W than the last generation');
      G.pop('New card generation',a.name,'dark',{always:true});
    }
    while(builtGen<G.s.gen){              // reload path: s.gen arrives from the save and
      builtGen++;                       // the catalogue must regrow, silently
      for(const cd of genCardsFor(builtGen)){ liveCards.push(cd); PART_MAP.set(cd.id,cd); }
      const gp=genPsuFor(builtGen); livePsus.push(gp); PART_MAP.set(gp.id,gp);
    }
    // pickers everywhere assume cheapest-first, and each generation lands as
    // [big, small] — so the catalogue is re-sorted by price on every extension.
    // The interleaved ladder stays strictly monotone (verified in tests), so
    // "more expensive is always better" survives across generations too.
    liveCards.sort((a,b)=>a.price-b.price);
  }
  const cards = () => liveCards;


  Object.assign(G, {builtGen,cards,ensureGens,liveCards,livePsus});
}
