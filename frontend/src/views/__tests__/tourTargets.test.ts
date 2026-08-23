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
   view it names and confirm the slide's own selector resolves to exactly
   one element. */
const VIEWS: Record<string, any> = {
  farm: FarmView, sites: SitesView, rigs: RigsView, chains: ChainsView,
  market: MarketView, stats: StatsView, build: BuildView,
};

describe('every tour slide targets a real, resolvable element on its own view', () => {
  const { TOUR_SLIDES } = freshStore();

  it('covers exactly the app\'s seven tabs, each mapped to a real view component', () => {
    expect(TOUR_SLIDES.map((s: any) => s.tab).sort()).toEqual(Object.keys(VIEWS).sort());
  });

  describe('under first-session conditions (a fresh store, no rigs) — the tour\'s original, automatic trigger', () => {
    for (const slide of TOUR_SLIDES) {
      it(`"${slide.tab}" (${slide.target})`, () => {
        const { wrapper } = mountWithStore(VIEWS[slide.tab]);
        expect(wrapper.findAll(slide.target)).toHaveLength(1);
      });
    }
  });

  /* The tour can also open for an ESTABLISHED player (TopBar's "tour"
     pill / restartTour()) — the whole point of a replay is a refresher for
     someone who no longer has an empty farm. Farm's and Rigs' targets
     used to live only on their empty-state branch (v-if="!rigs.length"),
     which simply doesn't exist once a player owns rigs — a replay would
     show those two slides with no spotlight and no dimming at all, and
     nothing above would have caught it, since every check there runs
     against a fresh store by construction. Seeding a built rig here is
     what actually exercises the branch a replaying player is in. */
  describe('under replay conditions (an established player with a built rig)', () => {
    const seed = (g: any) => { g.generatePreset(); g.build(); };
    for (const slide of TOUR_SLIDES) {
      it(`"${slide.tab}" (${slide.target})`, () => {
        const { wrapper } = mountWithStore(VIEWS[slide.tab], { seed });
        expect(wrapper.findAll(slide.target)).toHaveLength(1);
      });
    }
  });
});
