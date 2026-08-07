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
    done: G => G.s.sites.length>1 || G.s.pools.some(p=>p.owner==='you'),
    text: 'Cash flowing? Add a second site on Sites, or found your own pool on Chains — either grows past what one rig on one chain can earn.' },
];

export function installOnboarding(G){
  const onboardingStep = computed(()=>{
    if(G.s.onboardingDismissed) return null;
    return STEPS.find(s=>!s.done(G)) || null;
  });
  const dismissOnboarding = () => { G.s.onboardingDismissed = true; };

  Object.assign(G, {onboardingStep, dismissOnboarding});
}
