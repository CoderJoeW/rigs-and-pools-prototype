import { describe, it, expect } from 'vitest';
import { freshStore } from '../../test/testStore.js';
import { mountWithStore } from '../../test/mountWithStore.js';
import FarmView from '../FarmView.vue';
import SitesView from '../SitesView.vue';
import RigsView from '../RigsView.vue';
import ChainsView from '../ChainsView.vue';
import MarketView from '../MarketView.vue';
import StatsView from '../StatsView.vue';
import BuildView from '../BuildView.vue';

/* WelcomeTour.vue's spotlight is only ever tested against a stand-in
   data-tour element (see WelcomeTour.test.js) — quicker, but it means
   nothing fails if a real view's data-tour attribute were ever accidentally
   removed or its markup restructured so the selector stopped matching.
   This is the other half: for every TOUR_SLIDES entry, mount the ACTUAL
   view it names under first-session conditions (a fresh store — no rigs,
   which is exactly when the tour and its spotlight can be showing at all)
   and confirm the slide's own selector resolves to exactly one element. */
const VIEWS = {
  farm: FarmView, sites: SitesView, rigs: RigsView, chains: ChainsView,
  market: MarketView, stats: StatsView, build: BuildView,
};

describe('every tour slide targets a real, resolvable element on its own view', () => {
  const { TOUR_SLIDES } = freshStore();

  it('covers exactly the app\'s seven tabs, each mapped to a real view component', () => {
    expect(TOUR_SLIDES.map(s => s.tab).sort()).toEqual(Object.keys(VIEWS).sort());
  });

  for (const slide of TOUR_SLIDES) {
    it(`"${slide.tab}" slide's target (${slide.target}) resolves to exactly one element on the real ${slide.tab} view`, () => {
      const { wrapper } = mountWithStore(VIEWS[slide.tab]);
      const matches = wrapper.findAll(slide.target);
      expect(matches).toHaveLength(1);
    });
  }
});
