import { C } from '../data/constants.js';
import type { Game } from './types.js';

const SIM_PULSE_INTERVAL = 3600;

export function installTick(G: Game): void {
  // True on the one tick where G.s.t crosses a multiple of `interval` —
  // G.s.t advances by `dt` each call, so a plain `% interval === 0` would
  // almost always miss the exact boundary.
  function crossedInterval(interval: number, dt: number): boolean {
    return G.s.t % interval < dt;
  }

  function stepTick(dtOverride?: number): void {
    G.touchHeat();
    const dt = dtOverride !== undefined ? dtOverride : C.DT * G.s.speed;
    const days = dt / 86400;
    const hrs = dt / 3600;
    G.s.t += dt;
    G.ensureWeather();
    G.ensureGens();

    G.advanceSiteQueues(hrs);
    G.driftSiteWindAndBattery(dt, hrs);
    G.finishRigBuilds(dt);
    G.advanceChains(dt, days);
    G.settleYourPoolBonds(dt);
    G.wearCardsAndWarnOnHeat(days);
    G.billPower(dt, days, hrs);
    G.shedAndRestoreOverCapacityRigs();
    G.applyAutoOffPolicy();
    G.fireDueDrips(dt);
    G.applyAutoFixPolicy();
    if (G.s.cash < 0) G.insolvency();
    G.sampleHistorySeries(dt);

    G.refreshPools();
    G.samplePoolHashHistory(dt);
    if (G.s.shakeAt && G.s.t >= G.s.shakeAt) {
      G.poolShake(G.s.shakeOn);
      G.s.shakeAt = 0;
    }
    if (crossedInterval(SIM_PULSE_INTERVAL, dt) && G.simPulse) G.simPulse();
  }

  Object.assign(G, { crossedInterval, stepTick });
}
