import { computed } from 'vue';

/* Onboarding — a reactive coach, plus one scripted walkthrough.
   The coach below is still what v57's removal note describes: no step
   index, no "next" to drift out of sync — each step is a predicate over
   real game state, and the first one not yet satisfied is what's shown.
   TOUR_SLIDES is deliberately the one click-through exception. A brand-new
   player has zero state for a predicate to read yet — no rig, no site
   choice, nothing to react to — so there is nothing for the reactive coach
   to say until 'build' resolves itself. The tour exists to fill exactly
   that gap: game basics and every tab, once, before the coach has
   anything to work with. It gates on nextId itself (see showTour) rather
   than tracking a slide index in a predicate, so it still can't drift the
   way a tracked tour could — building a rig by any route ends it outright,
   tour or no tour.

   Each slide names the real tab it's about, and the tour drives navigation
   there itself (WelcomeTour.vue watches the slide and sets s.tab to
   match) — so a slide is always sitting over the actual live screen it
   describes, not a blank one standing in for it. It's a caption, not a
   modal: nothing here blocks tapping around on your own, and doing the
   thing a slide is pointing at (e.g. actually building on the last one)
   ends the tour exactly the same way skipping it would. */
const TOUR_SLIDES = [
  { tab:'farm', title:'Welcome to Rigs & Pools',
    body:'This is Farm, your dashboard. You’re starting with $500, a spare bedroom, and a 1.5 kW outlet. Rigs run 24/7, earning whether or not you’re watching — let’s walk through every tab so you know what you’re looking at.' },
  { tab:'sites', title:'Sites — power and cooling you build',
    body:'A site is floor space, power and cooling installed piece by piece — grid, solar, wind or diesel, then a cooling plant to keep cards fast. You start with one, a spare bedroom on a domestic outlet, and can run as many as you can afford.' },
  { tab:'rigs', title:'Rigs — your fleet, at a glance',
    body:'Every machine you own lives here: live hashrate, wear and state. Group rigs by chain and pool so a whole batch shares one strategy, and tap into any rig for full detail, tuning and repair.' },
  { tab:'chains', title:'Chains — five coins, five personalities',
    body:'Each chain pays differently and carries different risk. Below its published floor a chain pays every miner the same flat rate — a newcomer’s welcome gift. The rival pools listed here are real businesses with live reputations; found your own to compete for their members.' },
  { tab:'market', title:'Market — turn coins into cash',
    body:'Sell whatever you’ve mined, or buy in. Prices move on real order flow, so a big sale needs room to breathe — a few smaller ones beat dumping it all at once.' },
  { tab:'stats', title:'Stats — milestones and rank',
    body:'Your progress lives here: hashpower, blocks, infrastructure, pools, economy and craft. No shop, no cash reward — just the record of what you’ve actually built.' },
  { tab:'build', title:'Let’s build your first rig',
    body:'This is where a rig is born. Quick pick has already loaded a smart, affordable preset — tap Order parts below to lock it in. Customise lets you choose every part yourself once you’re ready.' },
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
     otherwise open on the same 'build your first rig' point at once.

     Gated on nextId, NOT rigs.length: rigs.length is not monotonic —
     scrapping the last rig, or an insolvency sell-off (insolvency.js)
     taking the farm to zero, both drop it back to 0 on an established
     save that legitimately dismissed the tour long ago. nextId only ever
     increments (every real build, plus insolvency's last-rig grant) and
     only resets via freshState/resetState — a genuine fresh start — so
     nextId===1 means "no rig has EVER existed," which is what "shown
     once, first session only" actually requires. */
  const showTour = computed(()=> !G.s.tourDismissed && G.s.nextId===1);
  const dismissTour = () => { G.s.tourDismissed = true; };

  Object.assign(G, {onboardingStep, dismissOnboarding, showChainsNudge, dismissChainsNudge,
    TOUR_SLIDES, showTour, dismissTour});
}
