import { C, TX_FEES, SIM_GROWTH, CONN_Q, BLOCK_K, RETARGET } from '../data/constants.js';
import { SITEPART } from '../data/site-parts.js';
import { PART } from '../data/hardware.js';
import { MILESTONES, RANKS } from '../data/milestones.js';
import { fmt } from '../utils/format.js';
import { gauss } from '../utils/random.js';

/* 07-tick.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installTick(G){
  /* ==========================================================================
     tick
     ========================================================================== */
  function stepTick(dtOverride){
    G.touchHeat();                                 // state moves every tick
    const dt=dtOverride!==undefined?dtOverride:C.DT*G.s.speed, days=dt/86400, hrs=dt/3600;
    G.s.t+=dt;
    G.ensureWeather(); G.ensureGens();

    // construction
    for(const f of G.s.sites){
      for(let i=f.queue.length-1;i>=0;i--){
        const j=f.queue[i]; j.left-=hrs;
        if(j.left<=0){
          f.queue.splice(i,1);
          if(j.kind==='shell'){ f.shell=j.p; G.say('site',f.name+' expanded to '+SITEPART(j.p).name); }
          else if(j.kind==='source'){ addTo(f.sources,j.p); G.say('site',SITEPART(j.p).name+' online at '+f.name); }
          else if(j.kind==='storage'){ addTo(f.storage=f.storage||[],j.p);
            G.say('site',SITEPART(j.p).name+' online at '+f.name); }
          else { addTo(f.plants,j.p); G.say('site',SITEPART(j.p).name+' online at '+f.name); }
          G.pop('Construction finished',SITEPART(j.p).name,'blu',{kind:'construction'});
        }
      }
      // wind wanders around today's weather level
      const tgt=G.s.weather?G.s.weather.now.wind:0.5;
      f.wind = Math.max(0.05, Math.min(1.6,
        f.wind + (tgt-f.wind)*0.15*hrs + gauss()*0.05*Math.sqrt(hrs)));
      // battery: apply this instant's plan with round-trip losses split
      if(G.battKwh(f)>0){
        const pl=G.sitePlan(f);
        f.batt=Math.min(G.battKwh(f), Math.max(0,
          (f.batt||0) + (pl.chW*0.95 + pl.gridChW*0.90 - pl.disW/0.95)*dt/3.6e6));
      }
    }
    for(const r of G.s.rigs){
      if(r.building>0){ r.building-=dt;
        if(r.building<=0){ r.building=0;
          if(r.rb){ r.rb=0; G.say('sys',r.name+' rebuilt and back online');
            G.pop('Rebuild finished',r.name,'grn',{kind:'build'}); }
          else { G.say('sys',r.name+' assembled'); G.pop('Build finished',r.name,'grn',{kind:'build'}); } } }
    }

    // mining
    for(const c of G.s.chains){
      const mine=G.myHash(c);
      runBlockWindow(c, dt);
      if(mine>0) flatDrip(c, dt);
      /* Price follows the miners. Each coin has a FUNDAMENTAL that tracks its
         chain's hashrate — fund = base × (net/floor ÷ anchor)^0.45, capped at
         100× the anchor ratio — and the reference price relaxes toward it over
         ~3 days. Hashrate flowing in is demand made visible: the sim network's
         0.6%/day growth compounds to ~+0.27%/day of price, and a player who
         moves real hash onto a small chain watches the market notice. The
         exponent keeps the loop damped: difficulty scales revenue by net⁻¹,
         price only by net^0.45, so inflows still net-reduce the rate — held
         coins appreciate, mining them does not get freer. Sells dent price
         below fund through impact, and the dent heals. */
      if(!c.anchor) c.anchor=Math.max(1, G.chainHash(c)/c.floor);   // old saves
      c.ref += (G.fundOf(c)-c.ref)*Math.min(1, days/3);
      c.ref*=Math.exp((-0.5*c.vol*c.vol)*days + c.vol*Math.sqrt(days)*gauss());
      c.ref=Math.max(0.02,c.ref);
      c.impact*=Math.pow(1-c.recover,days);
      // career board: cheap predicates; once done, done forever
    if(!G.s.mile) G.s.mile={done:{},rank:0};
    G.s.peakNetDay=Math.max(G.s.peakNetDay||0, G.netDay.value);
    for(const m of MILESTONES){
      if(G.s.mile.done[m.id]) continue;
      let hit=false;
      /* This catch used to be bare. When the v66 modularisation renamed the
         export object, m.check's reference to it became a ReferenceError that
         was swallowed here, and milestones simply stopped firing with every
         visible number unchanged. Still non-fatal — a milestone predicate must
         never break the tick — but no longer silent. */
      try{ hit=m.check(G.__exports); }
      catch(e){ if(!m._warned){ m._warned=1;
        console.warn('milestone check failed:', m.id, e.message); } }
      if(hit){
        G.s.mile.done[m.id]=G.s.t;
        G.say('big','Milestone — '+m.name+': '+m.desc);
        const n=Object.keys(G.s.mile.done).length;
        let rk=0; for(const [need] of RANKS) if(n>=need) rk++;
        const ranked=rk-1>G.s.mile.rank;
        if(ranked){
          G.s.mile.rank=rk-1;
          const rank=RANKS[G.s.mile.rank][1];
          G.say('big','Rank up — you are now '+(/^[AEIOU]/i.test(rank)?'an ':'a ')+rank);
          /* Issue #40: a rank-up is not another milestone. The board fires 24
             times; the ladder behind it moves 5-6 times in a whole run, is
             permanent, and pays nothing but the title — so it gets its own
             toast class instead of the 'grn' every ordinary milestone uses.
             The rank NAME is passed as the amount because .toast.rankup makes
             the amount the headline and the text a small eyebrow above it: the
             new title is the thing worth reading, not a sentence around it.

             It also has to be the ONLY toast this tick, which is why the
             milestone pop moved into the else. pop() rate-limits even
             always:true calls to one per 900ms of real time, and G.s.toast is
             a single slot — so the milestone toast fired microseconds earlier
             was swallowing the rank-up outright, and the rarest beat in the
             game reached the screen as a plain green "Milestone". The feed
             still records both lines; only the toast defers. */
          G.pop('Rank up · '+(G.s.mile.rank+1)+' of '+RANKS.length,
                rank,'rankup',{always:true,kind:'rankup'});
        } else {
          G.pop('Milestone',m.name,'grn',{always:true});
        }
      }
    }
    if(G.s.t%(86400*0.75)<dt){ c.hist.push(G.price(c)); if(c.hist.length>110) c.hist.shift(); }
    }

    // pools you own: the PPS liability accrues continuously. Income is credited
    // in awardBlock, and only when this pool actually finds something.
    for(const p of G.s.pools){
      if(p.owner!=='you'||!p.live) continue;
      const c=G.chain(p.chain);
      if(p.scheme==='PPS'){
        const owed=(dt*G.poolHash(p)/G.diffOf(c))*c.reward*G.price(c)*(1-p.fee);
        p.bond-=owed; p.earned-=owed;
      }
      if(p.bond<=0){
        p.live=false; p.bond=0;
        G.s.groups.filter(gr=>gr.pool===p.id).forEach(gr=>{ forfeitGroup(gr,'when the pool failed'); gr.pool='solo'; });
        G.s.sims.filter(m=>m.pool===p.id).forEach(m=>{ m.pool=null; });
        G.say('bad',p.name+' could not pay its miners and closed — the bond is gone');
        G.pop('Your pool failed','it could not cover payouts','dark',{always:true});
      }
    }

    // heat and wear, per site
    for(const f of G.s.sites){
      const temp=G.siteTemp(f);
      const heat=1+Math.pow(Math.max(0,(temp-58)/12),2);
      f.temp=temp;
      // a site crossing 70°C with live rigs says so ONCE, loudly — this is
      // where throttling starts and wear doubles, and a farm can otherwise
      // cook to death in silence (the v32 garage did exactly that)
      const hot=temp>=70 && G.siteRigs(f).some(x=>G.rigLive(x));
      if(hot && !f.hotWarn){
        f.hotWarn=true;
        G.say('bad',f.name+' is cooking — '+temp.toFixed(0)+'°C: throttling, and cards wearing '
          +heat.toFixed(0)+'× faster');
        G.pop(f.name+' is cooking','cards wear '+heat.toFixed(0)+'× faster','dark',{always:true});
      } else if(f.hotWarn && temp<64) f.hotWarn=false;
      for(const r of G.siteRigs(f)){
        if(!G.rigLive(r)) continue;
        const tw=1+Math.max(0,(r.tune||0))*3;
        for(const u of r.units){
          if(u.w>=1) continue;
          u.w=Math.min(1,u.w+C.BASE_WEAR*(u.wr||1)*days*heat*tw);
          G.touchHeat();                               // wear changes core watts
          if(u.w>=1) G.say('bad',PART(u.p).name+' in '+r.name+' has worn out');
        }
        // the last working card dying is a farm event, not a footnote
        if(!r.deadNote && r.units.length && r.units.every(u=>u.w>=1)){
          r.deadNote=true;
          G.say('bad',r.name+' has no working cards left');
          G.pop(r.name+' is dead','every card worn out','dark',{always:true});
        }
      }
    }

    // electricity
    const bill=G.powerRateDay.value*days;
    G.s.cash-=bill; G.s.powerPaid+=bill; G.today().power+=bill;
    // attribute the bill as it is charged, rather than reconstructing it later:
    // which tariff band it fell in, how much of it was cooling, and what the
    // free sources saved you at today's rate
    const dayIdx=Math.floor(G.s.t/86400);
    for(const f of G.s.sites){
      if(!f.bill||f.bill.day!==dayIdx) f.bill={day:dayIdx,off:0,sh:0,peak:0,cool:0,saved:0};
      const fl=G.flowOf(f), c=G.siteCostPerHour(f)*hrs;
      f.bill[G.band.value==='off'?'off':G.band.value==='peak'?'peak':'sh']+=c;
      if(fl.load>0) f.bill.cool+=c*fl.cool/fl.load;
      const gridRate=f.sources.reduce((a,x)=>{const P=SITEPART(x.p);
        return P.rate>0?Math.min(a,G.rateAt(P)):a;},0.63);
      f.bill.saved+=(fl.inRenew+fl.inBatt)/1000*hrs*gridRate;
    }

    // brownout: capacity can fall below demand when the sun goes down.
    // Shed rigs are MARKED, and restored automatically when capacity returns —
    // without this, one cloudy night turned a solar farm off forever unless
    // the (optional) shutdown policy happened to be enabled.
    for(const f of G.s.sites){
      let guard=0;
      const battAvail=()=>G.battFirm(f);   // same function the dispatch uses
      while(G.siteDemand(f)>G.siteCapacity(f)+battAvail() && guard++<40){
        const on=G.siteRigs(f).filter(r=>G.rigLive(r));
        if(!on.length) break;
        let worst=on[0];
        for(const r of on) if(G.rigNet(r)<G.rigNet(worst)) worst=r;
        worst.on=false; worst.cut='brownout'; G.s.shed++;   // the group keeps its window
        G.say('bad',worst.name+' shed — '+f.name+' is over capacity');
      }
      // dawn: bring them back, best earner first, with a margin so the edge
      // of sunrise does not flap them on and off
      const cutRigs=G.siteRigs(f).filter(r=>!r.on&&(r.cut==='brownout'||r.cut==='broke')&&r.building<=0);
      if(cutRigs.length){
        cutRigs.sort((a,b)=>netIfOn(b)-netIfOn(a));
        for(const r of cutRigs){
          // a rig shed for lack of cash returns only when there is cash and it
          // would actually earn its keep
          if(r.cut==='broke' && (G.s.cash<20 || netIfOn(r)<=0)) continue;
          // ask the REAL function what this rig would draw. A hand-rolled copy
          // here omitted the tune multiplier, so a tuned-up rig looked ~28%
          // lighter than it is: restored, immediately re-shed, and flapping
          // forever — the site sat permanently over capacity with power served
          // by nothing while every rig showed as running.
          // flip it on, measure with the REAL functions (rigs AND cooling),
          // then decide — no parallel estimate that can drift
          const was=r.on; r.on=true;
          const wouldDraw=G.siteDemand(f);
          r.on=was;
          if(wouldDraw<=(G.siteCapacity(f)+battAvail())*0.97){
            r.on=true; r.cut=null;
            G.say('sys',r.name+' restored — '+f.name+' has capacity again');
          } else break;
        }
      }
    }

    if(G.s.autoOff){
      for(const r of G.s.rigs){
        if(r.building>0) continue;
        const n=netIfOn(r);
        if(r.on && n<G.s.offThreshold){ r.on=false;
          G.say('sys','Policy: '+r.name+' powered down'); }
        else if(!r.on && n>G.s.offThreshold*1.2+0.4){
          const f=G.site(r.site);
          if(G.siteDemand(f)+G.rigWallW({...r,on:true})<G.siteCapacity(f)){
            r.on=true; G.say('sys','Policy: '+r.name+' back online'); }
        }
      }
    }
    if(G.s.drip&&G.s.drip.on){
      const t0=G.s.t-dt;                       // arm from the START of the tick, so a
      const iv=G.s.drip.hours*3600;            // single long tick still fires every
      if(!G.s.dripAt||G.s.dripAt<t0-30*86400||G.s.dripAt>t0+iv) G.s.dripAt=t0+iv;
      let guard=0;                           // interval it spans
      while(G.s.t>=G.s.dripAt && guard++<60){ G.fireDrip(); G.s.dripAt+=iv; }
    }
    if(G.s.autoFix){
      for(const r of G.s.rigs){
        if(r.building>0) continue;
        const worn=r.units.filter(u=>u.w>=G.s.fixAt);
        if(!worn.length) continue;
        const cost=worn.reduce((a,u)=>a+PART(u.p).price,0);
        if(G.s.cash>=cost*2) G.swapWorn(r.id,G.s.fixAt);
      }
    }
    if(G.s.cash<0) G.insolvency();

    G.s.peakHash=Math.max(G.s.peakHash,G.totalHash.value);
    if(G.s.t%(86400*0.75)<dt){
      G.s.netHist.push(G.netDay.value); if(G.s.netHist.length>110) G.s.netHist.shift();
      (G.s.hashHist=G.s.hashHist||[]).push(G.totalHash.value); if(G.s.hashHist.length>110) G.s.hashHist.shift();
      (G.s.cashHist=G.s.cashHist||[]).push(G.s.cash); if(G.s.cashHist.length>110) G.s.cashHist.shift();
    }

    G.refreshPools();
    if(G.s.t%14400<dt) for(const p of G.s.pools){
      if(!p.live) continue;
      (p.hist=p.hist||[]).push(G.poolHash(p));
      if(p.hist.length>42) p.hist.shift();          // seven days at four hours
    }
    if(G.s.shakeAt && G.s.t>=G.s.shakeAt){ G.poolShake(G.s.shakeOn); G.s.shakeAt=0; }
    if(G.s.t%3600<dt){ G.rivalTick(); G.reshuffle(); for(const m of G.s.sims) m.hash*=1+SIM_GROWTH/24; }

  }

  function addTo(arr,pid){ const e=arr.find(x=>x.p===pid); if(e) e.n++; else arr.push({p:pid,n:1}); }
  function netIfOn(r){
    const gr=G.groupOf(r);
    const c=gr&&G.chain(gr.chain), f=G.site(r.site); if(!c||!f) return -999;
    // Mirrors rigHash (dispatch.js): no w<1 filter — a fully-worn card still
    // limps at 60%, not 0, so a rig whose cards are all worn out is a real
    // net-positive-or-negative question, not an automatic -999 (issue #20:
    // this filter used to make the u.w>=1 branch below dead code, and
    // desynced this "mirrored" expression from what rigHash actually pays).
    const us=r.units; if(!us.length) return -999;
    const mh=us.reduce((a,u)=>a+PART(u.p).mh*(1-0.4*u.w),0)*(1+(r.tune||0));
    const w=(G.chassisW(r)+us.reduce((a,u)=>a+PART(u.p).w*(1+0.5*u.w),0)*(1+(r.tune||0)*1.9))/PART(r.psu).eff;
    return mh*G.revPerMh(c)*G.evMult(G.poolOf(gr.pool)) - w/1000*24*G.margRate(f);
  }
  /* The window forfeits only when the GROUP leaves — never for rig maintenance. */
  function forfeitGroup(gr,why){
    const p=G.poolOf(gr.pool);
    if(gr.pending>0 && p && p.scheme==='PPLNS'){
      G.say('bad',gr.name+' forfeited '+fmt.c(gr.pending)+' '+G.chain(gr.chain).tick+' '+why);
      gr.pending=0;
    }
  }
  function setGroupChain(gr,v){
    if(v===gr.chain) return;
    forfeitGroup(gr,'by switching chain');
    gr.chain=v;
    const cur=G.poolOf(gr.pool);
    if(gr.pool!=='solo' && (!cur||cur.chain!==v||!cur.live)) gr.pool='solo';
  }
  function setGroupPool(gr,v){ if(v!==gr.pool){ forfeitGroup(gr,'by switching pool'); gr.pool=v; } }
  function addGroup(){
    const gr={ id:G.s.nextGroup++, name:'Group '+G.s.nextGroup, chain:'tessera',
      pool:'solo', pending:0 };
    G.s.groups.push(gr); return gr;
  }
  function renameGroup(gr,name){
    const n=(name||'').trim().slice(0,24);
    if(n) gr.name=n;
  }
  function dropGroup(gr){
    if(G.s.groups.length<2 || G.groupRigs(gr).length) return;
    forfeitGroup(gr,'when it was disbanded');
    G.s.groups=G.s.groups.filter(x=>x.id!==gr.id);
  }

  /* Advance a chain's block window. The arrival is drawn EXACTLY from the
     window's distribution when the block is armed — inverse CDF, so
     arrival = T·U^(1/K) — rather than sampled as a per-tick hazard. A hazard
     can fire at most once per tick, which at 3600x turned Ferro's 30-second
     blocks into 360-second ones and starved every variance-scheme income
     stream. Drawing the arrival makes any dt exact: if a tick spans several
     windows, several blocks land. The drawn time stays hidden — the interface
     shows only the ceiling, so the countdown never leaks the answer. */
  function runBlockWindow(c, dt){
    const net=G.chainHash(c);
    if(net<=0){
      c.elapsed=0; c.hadHash=false;
      // Nobody is mining it. Difficulty still has to fall back toward the
      // floor, or the chain is unminable forever: no blocks means `obs` never
      // updates, so difficulty never drops, so no one can ever profitably
      // return. A chain that loses its miners must be able to win them back.
      c.obs += (c.floor-c.obs)*Math.min(1, dt/1800);
      return;
    }
    // Severely under-hashed for its difficulty — the same trap, slower. Real
    // networks have emergency retargets for exactly this.
    if(c.elapsed > 4*c.target)
      c.obs += (Math.max(c.floor,net)-c.obs)*Math.min(1, dt/1800);
    if(!c.hadHash){ c.hadHash=true; armBlock(c); }
    c.elapsed+=dt;
    let guard=0;
    while(c.elapsed>=c.due && guard++<400){
      const leftover=c.elapsed-c.due;
      awardBlock(c, drawWinner(c, G.chainHash(c)));
      c.found++;
      c.obs += (G.chainHash(c)-c.obs)*RETARGET;  // retarget per block, from what was seen
      armBlock(c);
      c.elapsed=leftover;
    }
  }
  /* Window sized from the hashrate present when the block starts. */
  function armBlock(c){
    const net=Math.max(1, G.chainHash(c));
    c.T=(G.diffOf(c)/net)*(BLOCK_K+1)/BLOCK_K;                 // mean = diff/net, ceiling = T
    c.due=c.T*Math.pow(Math.random(),1/BLOCK_K);             // exact arrival, hidden
    c.elapsed=0;
  }

  /* Pick the single participant that found this block, weighted by hashrate.
     Your groups are drawn as SINGLE tickets — many rigs, one participant. */
  function drawWinner(c, net){
    let x=Math.random()*net;
    for(const m of G.s.sims){
      if(m.chain!==c.id) continue;
      x-=m.hash; if(x<=0) return { pool:m.pool, mine:false };
    }
    for(const gr of G.s.groups){
      if(gr.chain!==c.id) continue;
      x-=G.groupHash(gr); if(x<=0) return { pool:gr.pool, mine:true, group:gr };
    }
    return { pool:'solo', mine:false };
  }

  /* Issue #9: "Biggest block yet" only ever fires on a genuine all-time
     record — trivially broken almost immediately on the tiny starter
     chain, then rarely challenged again, so most real jackpot moments (a
     block far above what a player's actually been seeing lately — e.g.
     right after graduating to a bigger chain) get the same flat toast as
     routine income. This tracks a rolling window of recent block $ values
     the player actually received (solo full blocks and PPLNS group
     shares — not orphans, which never pay) and flags anything clearing
     JACKPOT_MULT times the median of that window, once there's enough of
     a baseline to compare against (BLOCK_BASELINE_MIN) so the first few
     blocks — with no "usual" yet — never falsely read as a jackpot. A new
     all-time record still takes priority over a jackpot callout for the
     same block; they'd otherwise mean almost the same thing back to back.

     PER CHAIN, not one pooled window — round-1 review caught this the hard
     way: block value differs by 20-90x between chains (Tessera ~$0.45,
     Ferro ~$9, Halcyon ~$300+), so a single shared window mixing them
     mistook "this is just what Ferro pays" for a jackpot almost every
     time a farm ran Tessera and Ferro side by side — simulated at 79 of 80
     Ferro blocks flagged, and 9 consecutive Jackpot toasts on a single
     chain graduation (the exact motivating scenario for this fix, turned
     into exactly the feed-spam issue #4 already fixed once). Keying by
     chain id makes "usual" mean usual for THAT chain, matching what the
     comment always claimed.

     PER POOL too (issue #36): a solo block is the whole reward, a PPLNS
     payout is only your slice of one, and at a 10% pool share those differ
     ~10x — comfortably over JACKPOT_MULT — inside a single chain's window.
     Leaving a pool for solo on the same chain (or running one solo group
     and one pooled group on the same chain at once) mixed the two
     magnitudes and fired false jackpots. baselineKey keeps the solo key
     identical to the chain id (so old save data and existing tests still
     line up) and gives every pool its own sub-window.

     Also tracks every credited PPLNS share, not just the ones your own
     group personally found (issue #32) — `share` doesn't depend on
     w.mine, so a small pool member's real income was mostly invisible to
     its own baseline before this. */
  function baselineKey(c, pool){ return pool ? c.id+'|'+pool.id : c.id; }
  function blockBaseline(key){
    const arr=G.s.recentBlockUsd[key];
    if(!arr || arr.length<C.BLOCK_BASELINE_MIN) return null;
    const s=[...arr].sort((a,b)=>a-b), mid=Math.floor(s.length/2);
    return s.length%2 ? s[mid] : (s[mid-1]+s[mid])/2;
  }
  function trackBlockUsd(key, usd){
    const arr=G.s.recentBlockUsd[key]||(G.s.recentBlockUsd[key]=[]);
    arr.push(usd);
    // while, not if: a single shift only ever prevents further growth from
    // an already-correctly-sized array — it can't recover one that's
    // somehow oversized (e.g. old save data from a smaller/no window, or a
    // future change to BLOCK_BASELINE_WINDOW itself), which would then stay
    // oversized forever instead of settling back down to the real cap.
    while(arr.length>C.BLOCK_BASELINE_WINDOW) arr.shift();
  }
  /* A pool only ever gains funds when that pool finds a block. */
  function awardBlock(c, w){
    const full=c.reward*(1+TX_FEES);
    const bvFull=full*G.price(c);
    const pool = (!w.pool||w.pool==='solo') ? null : G.poolOf(w.pool);
    if(pool) pool.found=(pool.found||0)+1;
    if(w.group) w.group.found=(w.group.found||0)+1;      // reputation is partly luck, visibly

    if(!pool){                                   // solo
      if(!w.mine) return;                        // a stranger found it
      G.s.blocksSolved++;
      if(Math.random()<c.orphan*(1-CONN_Q)){ G.s.orphaned++; G.say('bad','Orphaned on '+c.name); }
      else { G.s.wallet[c.id]+=full; G.today().earned+=full*G.price(c); G.today().blocks++;
        const usd=full*G.price(c);
        const baseline=blockBaseline(c.id);
        const record=usd>G.s.bestBlock;
        const jackpot=!record && baseline && usd>=baseline*C.JACKPOT_MULT;
        if(jackpot) G.say('jackpot','Jackpot on '+c.name+' — '+(usd/baseline).toFixed(1)+'x your usual',
          '+'+fmt.c(full),full,c.tick);
        else G.say('block','Block solved solo on '+c.name,'+'+fmt.c(full),full,c.tick);
        if(record){ G.s.bestBlock=usd;
          /* kind:'record' is a label, not a behaviour change — always:true
             already bypasses the per-kind cap this key feeds, so the only
             thing it alters is which bucket the counter lands in. It exists
             so a new all-time record can be told apart from a routine block
             by cls/kind alone, which is what audio.js keys off (issue #46):
             a record is a jackpot to the ear even when the jackpot branch
             below did not fire. */
          G.pop('Biggest block yet','+'+fmt.usd2(usd),'',{always:true,kind:'record'}); }
        else if(jackpot) G.pop('Jackpot','+'+fmt.usd2(usd)+' — '+(usd/baseline).toFixed(1)+'x your usual',
          'jackpot',{always:true});
        else G.pop('Block solved','+'+fmt.c(full)+' '+c.tick,'',{kind:'block'});
        trackBlockUsd(c.id, usd); }
      return;
    }
    if(w.mine) G.s.blocksSolved++;
    pool.found=(pool.found||0)+1;

    // the operator's cut, credited only now
    if(pool.owner==='you'){
      const take = pool.scheme==='PPS' ? bvFull : bvFull*pool.fee;
      pool.bond += take; pool.earned += take;
    }
    // your rigs in this pool, on variance schemes, share what is distributed
    if(pool.scheme==='PPLNS'){
      const ph=G.poolHash(pool);
      const mine=G.s.groups.filter(gr=>gr.pool===pool.id&&G.groupHash(gr)>0);
      const mh=mine.reduce((a,gr)=>a+G.groupHash(gr),0);
      if(ph>0&&mh>0){
        // the rolling window belongs to the GROUP — a rig going down for a
        // rebuild or a brownout never touches it
        const share=full*(1-pool.fee)*(mh/ph)*(1-0.02*(1-CONN_Q));
        let out=0;
        for(const gr of mine){
          const part=share*G.groupHash(gr)/mh;
          gr.pending+=part; const o=Math.max(0,gr.pending-part);
          gr.pending-=o; out+=o;
        }
        // "blocks today" means a block that actually paid — same as the
        // solo branch above, which only counts a non-orphaned find. The
        // one-block PPLNS lag can make out===0 (nothing paid out yet, the
        // first block after a group joins or forfeits), and that shouldn't
        // count as a block landing (issue #13).
        G.s.wallet[c.id]+=out; G.today().earned+=out*G.price(c); if(out>0) G.today().blocks++;
        if(share>0.0002){
          const usd=share*G.price(c);
          const key=baselineKey(c,pool);
          const baseline=blockBaseline(key);
          if(w.mine){
            const jackpot=baseline && usd>=baseline*C.JACKPOT_MULT;
            if(jackpot){
              G.say('jackpot',w.group.name+' solved the '+c.name+' pool block — '
                +(usd/baseline).toFixed(1)+'x your usual','+'+fmt.c(share),share,c.tick);
              G.pop('Jackpot','+'+fmt.usd2(usd)+' — '+(usd/baseline).toFixed(1)+'x your usual',
                'jackpot',{always:true});
            } else {
              G.say('block',w.group.name+' solved the '+c.name+' pool block','+'+fmt.c(share),share,c.tick);
              G.pop(w.group.name+' found it','+'+fmt.c(share)+' '+c.tick,'',{kind:'block'});
            }
          }
          else G.say('pay',pool.name+' found a block','+'+fmt.c(share),share,c.tick);
          trackBlockUsd(key, usd);
        }
      }
    } else if(w.mine){
      G.say('pool',(w.group?w.group.name:'Your group')+' found a '+c.name+' block — flat rate, no bonus');
    }
  }

  /* Flat-rate schemes pay continuously whether or not anything is found —
     which is exactly the liability a PPS operator is carrying. */
  function flatDrip(c, dt){
    for(const gr of G.s.groups){
      if(gr.chain!==c.id) continue;
      const p=G.poolOf(gr.pool); if(!p||p.scheme!=='PPS') continue;
      const drip=(dt*G.groupHash(gr)/G.diffOf(c))*c.reward*(1-p.fee)*(1-0.02*(1-CONN_Q));
      G.s.wallet[c.id]+=drip; G.today().earned+=drip*G.price(c);
    }
  }


  Object.assign(G, {addGroup,addTo,armBlock,awardBlock,drawWinner,dropGroup,flatDrip,forfeitGroup,netIfOn,renameGroup,runBlockWindow,setGroupChain,setGroupPool,stepTick});
}
