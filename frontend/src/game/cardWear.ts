import { C } from '../data/constants.js';
import { PART } from '../data/hardware.js';
import type { Game, Site, Rig, Unit } from './types.js';

export function installCardWear(G: Game): void {
  function wearCardsAndWarnOnHeat(days: number): void {
    for (const site of G.s.sites) {
      const temp = G.siteTemp(site);
      const heat = 1 + Math.pow(Math.max(0, (temp - 58) / 12), 2);
      site.temp = temp;
      warnIfSiteHot(site, temp, heat);
      for (const rig of G.siteRigs(site)) {
        if (G.rigLive(rig)) wearRigCards(rig, days, heat);
      }
    }
  }

  function warnIfSiteHot(site: Site, temp: number, heat: number): void {
    const hot = temp >= 70 && G.siteRigs(site).some((rig: Rig) => G.rigLive(rig));
    if (hot && !site.hotWarn) {
      site.hotWarn = true;
      G.say('bad', site.name + ' is cooking — ' + temp.toFixed(0) + '°C: throttling, and cards wearing '
        + heat.toFixed(0) + '× faster');
      G.pop(site.name + ' is cooking', 'cards wear ' + heat.toFixed(0) + '× faster', 'dark', { always: true });
    } else if (site.hotWarn && temp < 64) {
      site.hotWarn = false;
    }
  }

  function wearRigCards(rig: Rig, days: number, heat: number): void {
    const tuneWear = 1 + Math.max(0, (rig.tune || 0)) * 3;
    for (const unit of rig.units) {
      if (unit.w >= 1) continue;
      unit.w = Math.min(1, unit.w + C.BASE_WEAR * (unit.wr || 1) * days * heat * tuneWear);
      G.touchHeat();
      if (unit.w >= 1) G.say('bad', PART(unit.p)!.name + ' in ' + rig.name + ' has worn out');
    }
    if (!rig.deadNote && rig.units.length && rig.units.every((unit: Unit) => unit.w >= 1)) {
      rig.deadNote = true;
      G.say('bad', rig.name + ' has no working cards left');
      G.pop(rig.name + ' is dead', 'every card worn out', 'dark', { always: true });
    }
  }

  Object.assign(G, { wearCardsAndWarnOnHeat });
}
