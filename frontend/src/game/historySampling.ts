import { pushCapped } from '../utils/collections.js';
import type { Game } from './types.js';

export const HIST_SAMPLE_INTERVAL = 86400 * 0.75;
export const POOL_HIST_SAMPLE_INTERVAL = 14400;

export function installHistorySampling(G: Game): void {
  function sampleHistorySeries(dt: number): void {
    G.s.peakHash = Math.max(G.s.peakHash, G.totalHash.value);
    if (!G.crossedInterval(HIST_SAMPLE_INTERVAL, dt)) return;
    pushCapped(G.s.netHist = G.s.netHist || [], G.netDay.value, 110);
    pushCapped(G.s.hashHist = G.s.hashHist || [], G.totalHash.value, 110);
    pushCapped(G.s.cashHist = G.s.cashHist || [], G.s.cash, 110);
    // Why these four don't collapse into fewer series: docs/implementation-notes.md#history-series-samplehistoryseries-in-historysamplingjs.
    pushCapped(G.s.powerHist = G.s.powerHist || [], G.powerDay.value, 110);
    pushCapped(G.s.effHist = G.s.effHist || [], G.effMhw.value, 110);
    pushCapped(G.s.netCumHist = G.s.netCumHist || [], G.lifetimeNet.value, 110);
  }

  function samplePoolHashHistory(dt: number): void {
    if (!G.crossedInterval(POOL_HIST_SAMPLE_INTERVAL, dt)) return;
    for (const pool of G.s.pools) {
      if (!pool.live) continue;
      pushCapped(pool.hist = pool.hist || [], G.poolHash(pool), 42);
    }
  }

  Object.assign(G, { sampleHistorySeries, samplePoolHashHistory });
}
