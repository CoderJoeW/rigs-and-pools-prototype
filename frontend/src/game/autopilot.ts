import type { Game, Site } from './types.js';

export function installAutopilot(G: Game): void {
  function shedAndRestoreOverCapacityRigs(): void {
    for (const site of G.s.sites) {
      shedOverCapacityRigs(site);
      restoreShedRigs(site);
    }
  }

  function shedOverCapacityRigs(site: Site): void {
    let guard = 0;
    while (G.siteDemand(site) > G.siteCapacity(site) + G.battFirm(site) && guard++ < 40) {
      const liveRigs = G.siteRigs(site).filter((rig: any) => G.rigLive(rig));
      if (!liveRigs.length) break;
      let worst = liveRigs[0];
      for (const rig of liveRigs) if (G.rigNet(rig) < G.rigNet(worst)) worst = rig;
      worst.on = false;
      worst.cut = 'brownout';
      G.s.shed++;
      G.say('bad', worst.name + ' shed — ' + site.name + ' is over capacity');
    }
  }

  function restoreShedRigs(site: Site): void {
    const cutRigs = G.siteRigs(site)
      .filter((rig: any) => !rig.on && (rig.cut === 'brownout' || rig.cut === 'broke') && rig.building <= 0)
      .sort((rigA: any, rigB: any) => G.netIfOn(rigB) - G.netIfOn(rigA));
    for (const rig of cutRigs) {
      if (rig.cut === 'broke' && (G.s.cash < 20 || G.netIfOn(rig) <= 0)) continue;
      const wasOn = rig.on;
      rig.on = true;
      const wouldDraw = G.siteDemand(site);
      rig.on = wasOn;
      if (wouldDraw > (G.siteCapacity(site) + G.battFirm(site)) * 0.97) break;
      rig.on = true;
      rig.cut = null;
      G.say('sys', rig.name + ' restored — ' + site.name + ' has capacity again');
    }
  }

  function applyAutoOffPolicy(): void {
    if (!G.s.autoOff) return;
    for (const rig of G.s.rigs) {
      if (rig.building > 0) continue;
      const netUsd = G.netIfOn(rig);
      if (rig.on && netUsd < G.s.offThreshold) {
        rig.on = false;
        G.say('sys', 'Policy: ' + rig.name + ' powered down');
      } else if (!rig.on && netUsd > G.s.offThreshold * 1.2 + 0.4) {
        const site = G.site(rig.site);
        if (G.siteDemand(site) + G.rigWallW({ ...rig, on: true }) < G.siteCapacity(site)) {
          rig.on = true;
          G.say('sys', 'Policy: ' + rig.name + ' back online');
        }
      }
    }
  }

  function fireDueDrips(dt: number): void {
    if (!G.s.drip || !G.s.drip.on) return;
    const prevTime = G.s.t - dt;
    const intervalSeconds = G.s.drip.hours * 3600;
    if (!G.s.dripAt || G.s.dripAt < prevTime - 30 * 86400 || G.s.dripAt > prevTime + intervalSeconds) {
      G.s.dripAt = prevTime + intervalSeconds;
    }
    let guard = 0;
    while (G.s.t >= G.s.dripAt && guard++ < 60) {
      G.fireDrip();
      G.s.dripAt += intervalSeconds;
    }
  }

  function applyAutoFixPolicy(): void {
    if (!G.s.autoFix) return;
    for (const rig of G.s.rigs) {
      if (rig.building > 0) continue;
      const { n: wornCount, cost } = G.rigWorn(rig, G.s.fixAt);
      if (!wornCount) continue;
      if (G.s.cash >= cost * 2) G.swapWorn(rig.id, G.s.fixAt);
    }
  }

  Object.assign(G, {
    applyAutoFixPolicy, applyAutoOffPolicy, fireDueDrips, shedAndRestoreOverCapacityRigs,
  });
}
