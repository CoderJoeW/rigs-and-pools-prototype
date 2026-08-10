import { C } from '../data/constants.js';
import { SHELLS, SITEPART } from '../data/site-parts.js';
import { fmt } from '../utils/format.js';

/* 10-site-management.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installSites(G){
  /* ---- sites ---- */
  function newSite(shellId){
    const sh=SHELLS.find(x=>x.id===shellId);
    if(!sh||G.s.cash<sh.price) return;
    G.s.cash-=sh.price; G.s.spent+=sh.price;
    const f={ id:G.s.nextSite++, name:sh.name+' '+(G.s.sites.length+1), shell:'bedroom',
      sources:[], plants:[{p:'p-open',n:1}], queue:[], wind:0.5 };
    f.queue.push({ p:shellId, kind:'shell', left:sh.hours, total:sh.hours });
    G.s.sites.push(f); G.s.activeSite=f.id;
    G.say('site','Broke ground on '+sh.name+' — '+sh.hours+' h','-'+fmt.usd(sh.price),undefined,undefined,-sh.price);
  }
  function addSitePart(fid,pid,kind){
    const f=G.site(fid), P=SITEPART(pid);
    if(!f||!P||G.s.cash<P.price) return;
    G.s.cash-=P.price; G.s.spent+=P.price;
    if(P.hours<=0){ if(kind==='source') G.addTo(f.sources,pid);
      else if(kind==='storage') G.addTo(f.storage=f.storage||[],pid);
      else G.addTo(f.plants,pid);
      G.say('site',P.name+' installed at '+f.name,'-'+fmt.usd(P.price),undefined,undefined,-P.price); return; }
    f.queue.push({ p:pid, kind, left:P.hours, total:P.hours });
    G.say('site','Started '+P.name+' at '+f.name+' — '+P.hours+' h','-'+fmt.usd(P.price),undefined,undefined,-P.price);
  }
  function rushCost(job){ return Math.ceil(job.left*C.RUSH_PER_HOUR); }
  function rush(fid,idx){
    const f=G.site(fid), j=f.queue[idx]; if(!j) return;
    const c=rushCost(j); if(G.s.cash<c) return;
    G.s.cash-=c; G.s.spent+=c; j.left=0.0001;
    G.say('site','Paid to rush '+SITEPART(j.p).name,'-'+fmt.usd(c),undefined,undefined,-c);
  }
  /* ---- site management: grow, rename, or close a site ----
     Founding (newSite) and growing (upgradeShell) used to be the same
     button — picking any shell always started a brand-new site, so the
     only way to more floor space at the site you already had power and
     cooling on was to abandon it and rebuild elsewhere. Growing reuses the
     exact construction-queue completion path a fresh shell uses (`f.shell=j.p`
     on the 'shell' job finishing) — one mechanic, two doors into it. */
  function upgradeShell(fid,shellId){
    const f=G.site(fid), sh=SITEPART(shellId); if(!f||!sh) return;
    const cur=SITEPART(f.shell);
    if(sh.slots<=cur.slots) return;                    // only ever grows
    if(f.queue.some(j=>j.kind==='shell')) return;       // one shell job at a time
    const credit=Math.round(cur.price*0.5);
    const cost=Math.max(0, sh.price-credit);
    if(G.s.cash<cost) return;
    G.s.cash-=cost; G.s.spent+=cost;
    f.queue.push({ p:shellId, kind:'shell', left:sh.hours, total:sh.hours });
    G.say('site','Expanding '+f.name+' to '+sh.name+' — '+sh.hours+' h','-'+fmt.usd(cost),undefined,undefined,-cost);
  }
  function renameSite(fid,name){
    const f=G.site(fid); if(!f) return;
    const n=(name||'').trim().slice(0,24);
    if(n) f.name=n;
  }
  function decommissionSite(fid){
    const f=G.site(fid);
    if(!f||G.s.sites.length<=1||G.siteRigs(f).length>0||f.queue.length>0) return;
    const back=Math.round(0.5*(SITEPART(f.shell).price
      +f.sources.reduce((a,x)=>a+SITEPART(x.p).price*x.n,0)
      +f.plants.reduce((a,x)=>a+SITEPART(x.p).price*x.n,0)
      +(f.storage||[]).reduce((a,x)=>a+SITEPART(x.p).price*x.n,0)));
    G.s.cash+=back;
    G.s.sites=G.s.sites.filter(x=>x.id!==fid);
    if(G.s.activeSite===fid) G.s.activeSite=G.s.sites[0].id;
    G.say('site','Decommissioned '+f.name,'+'+fmt.usd(back),undefined,undefined,back);
  }

  Object.assign(G, {addSitePart,decommissionSite,newSite,renameSite,rush,rushCost,upgradeShell});
}
