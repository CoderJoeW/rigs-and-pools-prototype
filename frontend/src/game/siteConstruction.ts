import { SITEPART } from '../data/site-parts.js';
import { FAB } from '../data/fab.js';
import { PART_MAP, type Part } from '../data/hardware.js';
import { gauss } from '../utils/random.js';
import { addTo } from '../utils/collections.js';
import type { Game, Site, CustomPart } from './types.js';
import type { Job } from '../data/site-parts.js';

export function installSiteConstruction(G: Game): void {
  function advanceSiteQueues(hrs: number): void {
    for (const site of G.s.sites) {
      for (let i = site.queue.length - 1; i >= 0; i--) {
        const job = site.queue[i]!;
        job.left -= hrs;
        if (job.left > 0) continue;
        site.queue.splice(i, 1);
        finishSiteJob(site, job);
      }
    }
  }

  function finishSiteJob(site: Site, job: Job): void {
    const name = commissionSitePart(site, job);
    G.pop('Construction finished', name, 'blu', { kind: 'construction' });
  }

  // Installs the finished job into the site and returns the part's display
  // name for the finish messages. 'source', 'storage', and the plant default
  // all just add a SITEPART to a bucket and announce it going online — only
  // which bucket differs.
  function commissionSitePart(site: Site, job: Job): string {
    switch (job.kind) {
      case 'shell': {
        site.shell = job.p!;
        const name = SITEPART(job.p!)!.name;
        G.say('site', site.name + ' expanded to ' + name);
        return name;
      }
      case 'source':
        return commissionSitePartInto(site, site.sources, job.p!);
      case 'storage':
        return commissionSitePartInto(site, site.storage = site.storage || [], job.p!);
      case 'fab': {
        site.fab = job.p!;
        const name = FAB(job.p!)!.name;
        G.say('site', site.name + "'s fab is now " + name);
        return name;
      }
      case 'mfg': {
        G.s.customParts.push(job.part as CustomPart);
        PART_MAP.set(job.part!.id, job.part as unknown as Part);
        G.say('site', job.part!.name + ' finished manufacturing at ' + site.name);
        return job.part!.name;
      }
      default:
        return commissionSitePartInto(site, site.plants, job.p!);
    }
  }

  function commissionSitePartInto(site: Site, bucket: { p: string; n: number }[], partId: string): string {
    addTo(bucket, partId);
    const name = SITEPART(partId)!.name;
    G.say('site', name + ' online at ' + site.name);
    return name;
  }

  function driftSiteWindAndBattery(dt: number, hrs: number): void {
    for (const site of G.s.sites) {
      const targetWind = G.s.weather ? G.s.weather.now.wind : 0.5;
      site.wind = Math.max(0.05, Math.min(1.6,
        site.wind + (targetWind - site.wind) * 0.15 * hrs + gauss() * 0.05 * Math.sqrt(hrs)));
      if (G.battKwh(site) <= 0) continue;
      const plan = G.sitePlan(site);
      const chargeW = plan.chW * 0.95 + plan.gridChW * 0.90 - plan.disW / 0.95;
      site.batt = Math.min(G.battKwh(site), Math.max(0, (site.batt || 0) + chargeW * dt / 3.6e6));
    }
  }

  function finishRigBuilds(dt: number): void {
    for (const rig of G.s.rigs) {
      if (rig.building <= 0) continue;
      rig.building -= dt;
      if (rig.building > 0) continue;
      rig.building = 0;
      if (rig.rb) {
        rig.rb = 0;
        G.say('sys', rig.name + ' rebuilt and back online');
        G.pop('Rebuild finished', rig.name, 'grn', { kind: 'build' });
      } else {
        G.say('sys', rig.name + ' assembled');
        G.pop('Build finished', rig.name, 'grn', { kind: 'build' });
      }
    }
  }

  Object.assign(G, {
    addTo, advanceSiteQueues, driftSiteWindAndBattery, finishRigBuilds,
  });
}
