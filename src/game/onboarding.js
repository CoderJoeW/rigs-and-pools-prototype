import { computed } from 'vue';

/* Onboarding — a reactive coach, plus one scripted walkthrough.
   The coach below is still what v57's removal note describes: no step
   index, no "next" to drift out of sync — each step is a predicate over
   real game state, and the first one not yet satisfied is what's shown.
   TOUR_SLIDES is deliberately the one click-through exception. A brand-new
   player has zero state for a predicate to read yet — no rig, no site
   choice, nothing to react to — so there is nothing for the reactive coach
   to say until 'build' resolves itself. The tour exists to fill exactly
   that gap: game basics and the loop ahead, once, before the coach has
   anything to work with. It gates on rigs.length itself (see showTour)
   rather than tracking a slide index in a predicate, so it still can't
   drift the way a tracked tour could — building a rig by any route ends
   it outright, tour or no tour. */
const TOUR_SLIDES = [
  { title:'Welcome to Rigs & Pools',
    body:'You’re running a cryptocurrency mining business — real time, no seasons, nothing ever resets. Build rigs from parts, host them at sites you construct, and mine across five chains that each pay differently and carry different risk. Rigs run 24/7, earning whether or not you’re watching.' },
  { title:'Starting small, on purpose',
    body:'$500 in cash, a spare bedroom, and a 1.5 kW wall outlet — nothing more. Every part and every site comes out of what you earn. Tessera, the starter chain, pays every newcomer the same welcoming rate, so your first rig earns from the moment it powers on.' },
  { title:'The loop',
    body:'Build a rig, then watch it earn. Reinvest in a second site or found your own pool once cash allows. Set up automation on Farm so a rig that starts losing money doesn’t cost you while you’re away. The Stats tab tracks every milestone along the way.' },
  { title:'Let’s build your first rig',
    body:'Open Build below — a starter pick is already loaded and priced for your $500. Tap Order parts to lock it in; assembly takes a few minutes, and then it’s earning.' },
];
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
  { id:'automate',
    // Rigs run 24/7 whether or not anyone is watching (§1's "idle floor"),
    // and with no notifications a rig can drift into losing money over
    // hours with nothing announcing it (§2's automated-shutdown section).
    // Nothing had ever pointed a new player at the one lever that makes
    // that safe. Placed last: it only matters once there's a farm worth
    // protecting, and by 'grow' there is.
    done: G => !!(G.s.autoOff || G.s.autoFix),
    text: 'Rigs keep running while you’re away, and nothing will flag a rig that quietly starts losing money. Open Automation on Farm: shut off anything earning under a threshold, or auto-replace cards once they wear past a point you pick.' },
];

export function installOnboarding(G){
  const onboardingStep = computed(()=>{
    if(G.s.onboardingDismissed) return null;
    return STEPS.find(s=>!s.done(G)) || null;
  });
  const dismissOnboarding = () => { G.s.onboardingDismissed = true; };

  /* issue #30: the coach's 'grow' step names the rival-pool ecosystem, but
     it lives in a banner that the CHEAPER of its own two exits (a second
     site) erases before a player who took that path ever opened Chains.
     This nudge lives on the Chains tab itself instead, dismissed on its
     own — so it survives exactly the exit that used to eat it, and only
     goes away by a direct dismissal or by the thing it's pointing at
     actually happening (founding a pool). */
  const showChainsNudge = computed(()=>
    !G.s.chainsNudgeDismissed && !G.s.pools.some(p=>p.owner==='you'));
  const dismissChainsNudge = () => { G.s.chainsNudgeDismissed = true; };

  /* The walkthrough tour. Shown once, before the first rig — and never
     again once one exists, tour-dismissed or not, so it can't reappear
     over a farm that's already running (an imported save, a second
     device). While it's up, the reactive banner stays quiet: both would
     otherwise open on the same 'build your first rig' point at once. */
  const showTour = computed(()=> !G.s.tourDismissed && G.s.rigs.length===0);
  const dismissTour = () => { G.s.tourDismissed = true; };
  const beginFirstBuild = () => { G.s.tab='build'; dismissTour(); };

  Object.assign(G, {onboardingStep, dismissOnboarding, showChainsNudge, dismissChainsNudge,
    TOUR_SLIDES, showTour, dismissTour, beginFirstBuild});
}
