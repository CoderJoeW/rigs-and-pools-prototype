import { computed } from 'vue';
import type { Game, Pool, OnboardingStep } from './types.js';

// Onboarding — a reactive coach plus one scripted walkthrough. Full
// rationale (why predicates not a step index, why TOUR_SLIDES is the
// click-through exception, target/spotlight mechanics): docs/onboarding.md.
const TOUR_SLIDES = [
  { tab:'farm', target:'[data-tour="farm"]', title:'Welcome to Rigs & Pools',
    body:'This is Farm, your dashboard. You’re starting with $500, a spare bedroom, and a 1.5 kW outlet. Rigs run 24/7, earning whether or not you’re watching — let’s walk through every tab so you know what you’re looking at.' },
  { tab:'sites', target:'[data-tour="sites"]', title:'Sites — power and cooling you build',
    body:'A site is floor space, power and cooling installed piece by piece — grid, solar, wind or diesel, then a cooling plant to keep cards fast. You start with one, a spare bedroom on a domestic outlet, and can run as many as you can afford.' },
  { tab:'rigs', target:'[data-tour="rigs"]', title:'Rigs — your fleet, at a glance',
    body:'Every machine you own lives here: live hashrate, wear and state. Group rigs by chain and pool so a whole batch shares one strategy, and tap into any rig for full detail, tuning and repair.' },
  { tab:'chains', target:'[data-tour="chains"]', title:'Chains — five coins, five personalities',
    body:'Each chain pays differently and carries different risk. Below its published floor a chain pays every miner the same flat rate — a newcomer’s welcome gift. The rival pools listed here are real businesses with live reputations; found your own to compete for their members.' },
  { tab:'market', target:'[data-tour="market"]', title:'Market — turn coins into cash',
    body:'Sell whatever you’ve mined, or buy in. Prices move on real order flow, so a big sale needs room to breathe — a few smaller ones beat dumping it all at once.' },
  { tab:'stats', target:'[data-tour="stats"]', title:'Stats — milestones and rank',
    body:'Your progress lives here: hashpower, blocks, infrastructure, pools, economy and craft. No shop, no cash reward — just the record of what you’ve actually built.' },
  { tab:'build', target:'[data-tour="build"]', title:'Let’s build your first rig',
    body:'This is where a rig is born. Quick pick has already loaded a smart, affordable preset — tap Order parts below to lock it in. Customise lets you choose every part yourself once you’re ready.' },
];

const STEPS: OnboardingStep[] = [
  { id:'build',
    done: G => G.s.rigs.length>0,
    text: 'A spare bedroom, a 1.5 kW outlet and $500. Build your first rig on the Build tab.' },
  { id:'earn',
    done: G => G.totalHash.value>=100, // mirrors milestone h1, "First real hashrate"
    text: 'Rig ordered — it starts earning once assembly finishes. Watch it on Farm, or check Chains to see where else it could mine.' },
  { id:'grow',   // issue #8 rationale: docs/onboarding.md
    done: G => G.s.sites.length>1 || G.s.pools.some((p: Pool)=>p.owner==='you'),
    text: 'Cash flowing? Add a second site on Sites — or check Chains: Halcyon, Nova, Ferro and Obelisk each run rival pools with live reputations and fills, and founding your own grows past what one rig on one chain can earn.' },
  { id:'automate',   // placed last deliberately: docs/onboarding.md
    done: G => !!(G.s.autoOff || G.s.autoFix),
    text: 'Rigs keep running while you’re away, and nothing will flag a rig that quietly starts losing money. Open Automation on Farm: shut off anything earning under a threshold, or auto-replace cards once they wear past a point you pick.' },
];

export function installOnboarding(G: Game): void {
  const onboardingStep = computed(() => {
    if (G.s.onboardingDismissed) return null;
    return STEPS.find(s => !s.done(G)) || null;
  });
  const dismissOnboarding = () => { G.s.onboardingDismissed = true; };

  // issue #30 rationale (why this nudge lives on Chains, not the banner): docs/onboarding.md.
  const showChainsNudge = computed(() =>
    !G.s.chainsNudgeDismissed && !G.s.pools.some((p: Pool) => p.owner === 'you'));
  const dismissChainsNudge = () => { G.s.chainsNudgeDismissed = true; };

  // showTour gating (nextId not rigs.length, tourReplay escape hatch): docs/onboarding.md.
  const showTour = computed(() =>
    !G.s.tourDismissed && (G.s.nextId === 1 || G.s.tourReplay));
  const dismissTour = () => { G.s.tourDismissed = true; G.s.tourReplay = false; };
  const restartTour = () => { G.s.tourReplay = true; G.s.tourDismissed = false; };

  Object.assign(G, { onboardingStep, dismissOnboarding, showChainsNudge, dismissChainsNudge,
    TOUR_SLIDES, showTour, dismissTour, restartTour });
}
