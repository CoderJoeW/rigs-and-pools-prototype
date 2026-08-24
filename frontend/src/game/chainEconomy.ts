import { ANCHOR_DECAY } from '../data/chains.js';
import { gauss } from '../utils/random.js';
import { pushCapped } from '../utils/collections.js';
import { HIST_SAMPLE_INTERVAL, HIST_CAP } from './historySampling.js';
import type { Game, ChainState } from './types.js';

export function installChainEconomy(G: Game): void {
  function advanceChains(dt: number, days: number): void {
    for (const chain of G.s.chains) {
      const myHashRate = G.myHash(chain);
      G.runBlockWindow(chain, dt);
      if (myHashRate > 0) G.flatDrip(chain, dt);
      advanceChainAnchor(chain, days);
      advanceChainMarket(chain, days);
      if (G.crossedInterval(HIST_SAMPLE_INTERVAL, dt)) pushCapped(chain.hist, G.price(chain), HIST_CAP);
    }
    // A whole-game concern, not a per-chain one — checking it once per chain
    // re-evaluated every milestone (including ones with nothing to do with
    // chains) as many times as there are chains, for the same result each time.
    G.checkMilestones();
  }

  function advanceChainAnchor(chain: ChainState, days: number): void {
    if (!chain.anchor) chain.anchor = Math.max(1, G.chainHash(chain) / chain.floor);
    // anchor0 rationale: docs/implementation-notes.md#chain-anchor-decay-advancechainanchor-in-chaineconomyjs.
    if (!chain.anchor0) chain.anchor0 = chain.anchor;
    const decay = ANCHOR_DECAY[chain.id];
    if (!decay) return;
    const floorAnchor = chain.anchor0 * decay.floor;
    chain.anchor = floorAnchor + (chain.anchor - floorAnchor) * Math.exp(-days * Math.LN2 / decay.half);
  }

  function advanceChainMarket(chain: ChainState, days: number): void {
    chain.ref += (G.fundOf(chain) - chain.ref) * Math.min(1, days / 3);
    chain.ref *= Math.exp((-0.5 * chain.vol * chain.vol) * days + chain.vol * Math.sqrt(days) * gauss());
    chain.ref = Math.max(0.02, chain.ref);
    chain.impact *= Math.pow(1 - chain.recover, days);
  }

  Object.assign(G, { advanceChains });
}
