import { computed } from 'vue';

/* Onboarding — a reactive coach, not a scripted tour.
   The coach was removed in v57 (per the design spec) and nothing since has
   explained the first hour to a new player. Rather than a step index the
   player advances by clicking "next" (which drifts out of sync the moment
   they do something out of order), each step is a predicate over real game
   state: the first one not yet satisfied is what's shown. Dismissing it is
   the only mutation this owns; everything else just falls out of state
   that already exists for other reasons (milestones, sites, pools). */
const STEPS = [
  { id:'build',
    done: G => G.s.rigs.length>0,
    text: 'A spare bedroom, a 1.5 kW outlet and $500. Build your first rig on the Build tab.' },
  { id:'earn',
    done: G => G.totalHash.value>=100, // mirrors milestone h1, "First real hashrate"
    text: 'Rig ordered — it starts earning once assembly finishes. Watch it on Farm, or check Chains to see where else it could mine.' },
  { id:'grow',
    // issue #8: the rival-pool layer (12 named competitors, live reputation,
    // a PPS/PPLNS mix) is some of the game's best content, but it only
    // exists on the non-Tessera chains — so it goes entirely unseen by a
    // player who never has a concrete reason to leave the newcomer chain.
    // Naming what's actually there (reputation, fills, the PPS/PPLNS
    // choice) gives Chains a specific pull instead of a generic "or found
    // a pool" afterthought; the second-site path stays equally valid.
    done: G => G.s.sites.length>1 || G.s.pools.some(p=>p.owner==='you'),
    text: 'Cash flowing? Add a second site on Sites — or check Chains: Halcyon, Nova, Ferro and Obelisk each run rival pools with live reputations and fills, and founding your own grows past what one rig on one chain can earn.' },
];

export function installOnboarding(G){
  const onboardingStep = computed(()=>{
    if(G.s.onboardingDismissed) return null;
    return STEPS.find(s=>!s.done(G)) || null;
  });
  const dismissOnboarding = () => { G.s.onboardingDismissed = true; };

  Object.assign(G, {onboardingStep, dismissOnboarding});
}
