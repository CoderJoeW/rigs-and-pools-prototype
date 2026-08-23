import { C } from '../data/constants.js';
import { SHELLS, SITEPART, jobPart } from '../data/site-parts.js';
import { FAB } from '../data/fab.js';
import { fmt } from '../utils/format.js';
import { trimName } from './state.js';
import type { Game } from './types.js';
import type { Job } from '../data/site-parts.js';

// 10-site-management.js — installed into the shared context G.
// Cross-module references go through G, so the 7 mutually dependent
// module pairs still resolve at call time exactly as the closure did.
// Declarations are untouched: hoisting, evaluation order and
// intra-module references are the same code they always were.
export function installSites(G: Game): void {
  /* ---- sites ---- */
  function newSite(shellId: string): void {
    const sh = SHELLS.find(x => x.id === shellId);
    if (!sh || G.s.cash < sh.price) return;
    G.spend(sh.price);
    const f = { id:G.s.nextSite++, name:sh.name+' '+(G.s.sites.length+1), shell:'bedroom', fab:null,
      sources:[], plants:[{p:'p-open',n:1}], queue:[] as Job[], wind:0.5 };
    f.queue.push({ p:shellId, kind:'shell', left:sh.hours, total:sh.hours });
    G.s.sites.push(f as any); G.s.activeSite = f.id;
    G.say('site', 'Broke ground on ' + sh.name + ' — ' + sh.hours + ' h', '-' + fmt.usd(sh.price), undefined, undefined, -sh.price);
  }
  function addSitePart(fid: number, pid: string, kind: 'source' | 'storage' | string): void {
    const f = G.site(fid), P = SITEPART(pid);
    if (!f || !P || G.s.cash < P.price) return;
    G.spend(P.price);
    if (P.hours <= 0) {
      if (kind === 'source') G.addTo(f.sources, pid);
      else if (kind === 'storage') G.addTo(f.storage = f.storage || [], pid);
      else G.addTo(f.plants, pid);
      G.say('site', P.name + ' installed at ' + f.name, '-' + fmt.usd(P.price), undefined, undefined, -P.price); return;
    }
    f.queue.push({ p:pid, kind: kind as Job['kind'], left:P.hours, total:P.hours });
    G.say('site', 'Started ' + P.name + ' at ' + f.name + ' — ' + P.hours + ' h', '-' + fmt.usd(P.price), undefined, undefined, -P.price);
  }
  function rushCost(job: Job): number { return Math.ceil(job.left * C.RUSH_PER_HOUR); }
  function rush(fid: number, idx: number): void {
    const f = G.site(fid), j = f?.queue[idx]; if (!j) return;
    const c = rushCost(j); if (G.s.cash < c) return;
    G.spend(c); j.left = 0.0001;
    G.say('site', 'Paid to rush ' + jobPart(j)!.name, '-' + fmt.usd(c), undefined, undefined, -c);
  }
  /* ---- site management: grow, rename, or close a site ----
     Founding (newSite) and growing (upgradeShell) used to be the same
     button — picking any shell always started a brand-new site, so the
     only way to more floor space at the site you already had power and
     cooling on was to abandon it and rebuild elsewhere. Growing reuses the
     exact construction-queue completion path a fresh shell uses (`f.shell=j.p`
     on the 'shell' job finishing) — one mechanic, two doors into it. */
  function upgradeShell(fid: number, shellId: string): void {
    const f = G.site(fid), sh = SITEPART(shellId) as { slots: number; price: number; hours: number; name: string } | undefined;
    if (!f || !sh) return;
    const cur = SITEPART(f.shell) as { slots: number; price: number };
    if (sh.slots <= cur.slots) return;                    // only ever grows
    if (f.queue.some((j: Job) => j.kind === 'shell')) return;       // one shell job at a time
    const credit = Math.round(cur.price * 0.5);
    const cost = Math.max(0, sh.price - credit);
    if (G.s.cash < cost) return;
    G.spend(cost);
    f.queue.push({ p:shellId, kind:'shell', left:sh.hours, total:sh.hours });
    G.say('site', 'Expanding ' + f.name + ' to ' + sh.name + ' — ' + sh.hours + ' h', '-' + fmt.usd(cost), undefined, undefined, -cost);
  }
  /* Fab tiers only ever grow, same rule and same half-price credit as
     upgradeShell — but unlike shells there's no separate "new site" door
     into it (a fab is never how a site is founded), so one function
     handles both installing from nothing (cur===null, credit 0) and
     upgrading an existing one. */
  function chooseFab(fid: number, fabId: string): void {
    const f = G.site(fid), fb = FAB(fabId); if (!f || !fb) return;
    const cur = f.fab ? FAB(f.fab) : null;
    if (cur && fb.tier <= cur.tier) return;                 // only ever grows
    if (f.queue.some((j: Job) => j.kind === 'fab')) return;           // one fab job at a time
    const credit = cur ? Math.round(cur.price * 0.5) : 0;
    const cost = Math.max(0, fb.price - credit);
    if (G.s.cash < cost) return;
    G.spend(cost);
    f.queue.push({ p:fabId, kind:'fab', left:fb.hours, total:fb.hours });
    G.say('site', (cur ? 'Upgrading' : 'Building') + ' ' + f.name + "'s fab to " + fb.name + ' — ' + fb.hours + ' h',
      '-' + fmt.usd(cost), undefined, undefined, -cost);
  }
  function renameSite(fid: number, name: string): void {
    const f = G.site(fid); if (!f) return;
    const n = trimName(name);
    if (n) f.name = n;
  }
  function decommissionSite(fid: number): void {
    const f = G.site(fid);
    if (!f || G.s.sites.length <= 1 || G.siteRigs(f).length > 0 || f.queue.length > 0) return;
    const back = Math.round(0.5 * ((SITEPART(f.shell) as { price: number }).price
      + f.sources.reduce((a: number, x: { p: string; n: number }) => a + (SITEPART(x.p) as { price: number }).price * x.n, 0)
      + f.plants.reduce((a: number, x: { p: string; n: number }) => a + (SITEPART(x.p) as { price: number }).price * x.n, 0)
      + (f.storage || []).reduce((a: number, x: { p: string; n: number }) => a + (SITEPART(x.p) as { price: number }).price * x.n, 0)
      + (f.fab ? FAB(f.fab)!.price : 0)));
    G.s.cash += back;
    G.s.sites = G.s.sites.filter(x => x.id !== fid);
    if (G.s.activeSite === fid) G.s.activeSite = G.s.sites[0]!.id;
    // an open design (game/fab.js) points at the site it was opened on —
    // decommissioning that site out from under it must close the sheet,
    // not leave it rendering a fab that no longer exists
    if (G.s.design && G.s.design.fid === fid) G.s.design = null;
    G.say('site', 'Decommissioned ' + f.name, '+' + fmt.usd(back), undefined, undefined, back);
  }

  Object.assign(G, { addSitePart, chooseFab, decommissionSite, newSite, renameSite, rush, rushCost, upgradeShell });
}
