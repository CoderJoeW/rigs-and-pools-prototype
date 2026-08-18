import { C, TX_FEES, CONN_Q, BLOCK_K, RETARGET } from '../data/constants.js';
import { SITEPART } from '../data/site-parts.js';
import { FAB } from '../data/fab.js';
import { PART, PART_MAP } from '../data/hardware.js';
import { MILESTONES, RANKS } from '../data/milestones.js';
import { fmt } from '../utils/format.js';
import { gauss } from '../utils/random.js';

export function installTick(G){
  function stepTick(dtOverride){
    G.touchHeat();
    const dt=dtOverride!==undefined?dtOverride:C.DT*G.s.speed, days=dt/86400, hrs=dt/3600;
    G.s.t+=dt;
    G.ensureWeather(); G.ensureGens();

    for(const f of G.s.sites){
      for(let i=f.queue.length-1;i>=0;i--){
        const j=f.queue[i]; j.left-=hrs;
        if(j.left<=0){
          f.queue.splice(i,1);
          let name;
          if(j.kind==='shell'){ f.shell=j.p; name=SITEPART(j.p).name; G.say('site',f.name+' expanded to '+name); }
          else if(j.kind==='source'){ addTo(f.sources,j.p); name=SITEPART(j.p).name; G.say('site',name+' online at '+f.name); }
          else if(j.kind==='storage'){ addTo(f.storage=f.storage||[],j.p);
            name=SITEPART(j.p).name; G.say('site',name+' online at '+f.name); }
          else if(j.kind==='fab'){ f.fab=j.p; name=FAB(j.p).name; G.say('site',f.name+"'s fab is now "+name); }
          else if(j.kind==='mfg'){
            G.s.customParts.push(j.part); PART_MAP.set(j.part.id, j.part);
            name=j.part.name; G.say('site',name+' finished manufacturing at '+f.name);
          }
          else { addTo(f.plants,j.p); name=SITEPART(j.p).name; G.say('site',name+' online at '+f.name); }
          G.pop('Construction finished',name,'blu',{kind:'construction'});
        }
      }
      const tgt=G.s.weather?G.s.weather.now.wind:0.5;
      f.wind = Math.max(0.05, Math.min(1.6,
        f.wind + (tgt-f.wind)*0.15*hrs + gauss()*0.05*Math.sqrt(hrs)));
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

    for(const c of G.s.chains){
      const mine=G.myHash(c);
      runBlockWindow(c, dt);
      if(mine>0) flatDrip(c, dt);
      if(!c.anchor) c.anchor=Math.max(1, G.chainHash(c)/c.floor);
      c.ref += (G.fundOf(c)-c.ref)*Math.min(1, days/3);
      c.ref*=Math.exp((-0.5*c.vol*c.vol)*days + c.vol*Math.sqrt(days)*gauss());
      c.ref=Math.max(0.02,c.ref);
      c.impact*=Math.pow(1-c.recover,days);
    if(!G.s.mile) G.s.mile={done:{},rank:0};
    G.s.peakNetDay=Math.max(G.s.peakNetDay||0, G.netDay.value);
    for(const m of MILESTONES){
      if(G.s.mile.done[m.id]) continue;
      let hit=false;
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
          G.pop('Rank up · '+(G.s.mile.rank+1)+' of '+RANKS.length,
                rank,'rankup',{always:true,kind:'rankup'});
        } else {
          G.pop('Milestone',m.name,'grn',{always:true});
        }
      }
    }
    if(G.s.t%(86400*0.75)<dt){ c.hist.push(G.price(c)); if(c.hist.length>110) c.hist.shift(); }
    }

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
        G.s.sims.filter(m=>m.pool===p.id).forEach(m=>{ if(G.setSimPool) G.setSimPool(m,'solo'); else m.pool='solo'; });
        G.say('bad',p.name+' could not pay its miners and closed — the bond is gone');
        G.pop('Your pool failed','it could not cover payouts','dark',{always:true});
      }
    }

    for(const f of G.s.sites){
      const temp=G.siteTemp(f);
      const heat=1+Math.pow(Math.max(0,(temp-58)/12),2);
      f.temp=temp;
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
          G.touchHeat();
          if(u.w>=1) G.say('bad',PART(u.p).name+' in '+r.name+' has worn out');
        }
        if(!r.deadNote && r.units.length && r.units.every(u=>u.w>=1)){
          r.deadNote=true;
          G.say('bad',r.name+' has no working cards left');
          G.pop(r.name+' is dead','every card worn out','dark',{always:true});
        }
      }
    }

    const bill=G.powerRateDay.value*days;
    G.s.cash-=bill; G.s.powerPaid+=bill; G.today().power+=bill;
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

    for(const f of G.s.sites){
      let guard=0;
      const battAvail=()=>G.battFirm(f);
      while(G.siteDemand(f)>G.siteCapacity(f)+battAvail() && guard++<40){
        const on=G.siteRigs(f).filter(r=>G.rigLive(r));
        if(!on.length) break;
        let worst=on[0];
        for(const r of on) if(G.rigNet(r)<G.rigNet(worst)) worst=r;
        worst.on=false; worst.cut='brownout'; G.s.shed++;
        G.say('bad',worst.name+' shed — '+f.name+' is over capacity');
      }
      const cutRigs=G.siteRigs(f).filter(r=>!r.on&&(r.cut==='brownout'||r.cut==='broke')&&r.building<=0);
      if(cutRigs.length){
        cutRigs.sort((a,b)=>netIfOn(b)-netIfOn(a));
        for(const r of cutRigs){
          if(r.cut==='broke' && (G.s.cash<20 || netIfOn(r)<=0)) continue;
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
      const t0=G.s.t-dt;
      const iv=G.s.drip.hours*3600;
      if(!G.s.dripAt||G.s.dripAt<t0-30*86400||G.s.dripAt>t0+iv) G.s.dripAt=t0+iv;
      let guard=0;
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
      /* Power spend has its own series because Farm's "Cost today" card needs a
         cost trend, and netHist is profit — under a cost heading a rising
         profit line reads as rising spend, exactly backwards. */
      (G.s.powerHist=G.s.powerHist||[]).push(G.powerDay.value);
      if(G.s.powerHist.length>110) G.s.powerHist.shift();
      /* Efficiency has to be its own series rather than hashHist over
         powerHist: powerHist is what the power COST, in dollars, while MH/W
         is hashrate over watts drawn — the two are only proportional while
         the tariff and the band hold still, which is exactly what this game
         moves around. Stored the way effMhw computes it, once per sample. */
      (G.s.effHist=G.s.effHist||[]).push(G.effMhw.value);
      if(G.s.effHist.length>110) G.s.effHist.shift();
    }

    G.refreshPools();
    if(G.s.t%14400<dt) for(const p of G.s.pools){
      if(!p.live) continue;
      (p.hist=p.hist||[]).push(G.poolHash(p));
      if(p.hist.length>42) p.hist.shift();
    }
    if(G.s.shakeAt && G.s.t>=G.s.shakeAt){ G.poolShake(G.s.shakeOn); G.s.shakeAt=0; }
    if(G.s.t%3600<dt){ if(G.simPulse) G.simPulse(); }

  }

  function addTo(arr,pid){ const e=arr.find(x=>x.p===pid); if(e) e.n++; else arr.push({p:pid,n:1}); }
  function netIfOn(r){
    const gr=G.groupOf(r);
    const c=gr&&G.chain(gr.chain), f=G.site(r.site); if(!c||!f) return -999;
    const us=r.units; if(!us.length) return -999;
    const mh=us.reduce((a,u)=>a+PART(u.p).mh*(1-0.4*u.w),0)*(1+(r.tune||0));
    const w=(G.chassisW(r)+us.reduce((a,u)=>a+PART(u.p).w*(1+0.5*u.w),0)*(1+(r.tune||0)*1.9))/PART(r.psu).eff;
    return mh*G.revPerMh(c)*G.evMult(G.poolOf(gr.pool)) - w/1000*24*G.margRate(f);
  }
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

  function runBlockWindow(c, dt){
    const net=G.chainHash(c);
    if(net<=0){
      c.elapsed=0; c.hadHash=false;
      c.obs += (c.floor-c.obs)*Math.min(1, dt/1800);
      return;
    }
    if(c.elapsed > 4*c.target)
      c.obs += (Math.max(c.floor,net)-c.obs)*Math.min(1, dt/1800);
    if(!c.hadHash){ c.hadHash=true; armBlock(c); }
    c.elapsed+=dt;
    let guard=0;
    while(c.elapsed>=c.due && guard++<400){
      const leftover=c.elapsed-c.due;
      awardBlock(c, drawWinner(c, G.chainHash(c)));
      c.found++;
      c.obs += (G.chainHash(c)-c.obs)*RETARGET;
      armBlock(c);
      c.elapsed=leftover;
    }
  }
  function armBlock(c){
    const net=Math.max(1, G.chainHash(c));
    c.T=(G.diffOf(c)/net)*(BLOCK_K+1)/BLOCK_K;
    c.due=c.T*Math.pow(Math.random(),1/BLOCK_K);
    c.elapsed=0;
  }

  function drawWinner(c, net){
    let x=Math.random()*net;
    for(const gr of G.s.groups){
      if(gr.chain!==c.id) continue;
      const h=G.groupHash(gr);
      x-=h; if(x<=0) return { pool:gr.pool, mine:true, group:gr };
    }
    if(G.drawSimWinner) return G.drawSimWinner(c, x);
    return { pool:'solo', mine:false };
  }

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
    while(arr.length>C.BLOCK_BASELINE_WINDOW) arr.shift();
  }
  function awardBlock(c, w){
    const full=c.reward*(1+TX_FEES);
    const bvFull=full*G.price(c);
    const pool = (!w.pool||w.pool==='solo') ? null : G.poolOf(w.pool);
    if(pool) pool.found=(pool.found||0)+1;
    if(w.group) w.group.found=(w.group.found||0)+1;

    if(!pool){
      if(!w.mine){
        if(w.sim && G.creditSim) G.creditSim(w.sim, bvFull);
        return;
      }
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
          G.pop('Biggest block yet','+'+fmt.usd2(usd),'',{always:true,kind:'record'}); }
        else if(jackpot) G.pop('Jackpot','+'+fmt.usd2(usd)+' — '+(usd/baseline).toFixed(1)+'x your usual',
          'jackpot',{always:true});
        else G.pop('Block solved','+'+fmt.c(full)+' '+c.tick,'',{kind:'block'});
        trackBlockUsd(c.id, usd); }
      return;
    }
    if(w.mine) G.s.blocksSolved++;
    pool.found=(pool.found||0)+1;

    if(pool.owner==='you'){
      const take = pool.scheme==='PPS' ? bvFull : bvFull*pool.fee;
      pool.bond += take; pool.earned += take;
    } else if(pool.owner==='sim' && pool.scheme!=='PPS'){
      const take = bvFull*pool.fee;
      pool.bond += take; pool.earned += take;
    }
    if(pool.scheme==='PPLNS' && G.creditSimPoolShare){
      G.creditSimPoolShare(pool, full, G.price(c));
    }
    if(pool.scheme==='PPLNS'){
      const ph=G.poolHash(pool);
      const mine=G.s.groups.filter(gr=>gr.pool===pool.id&&G.groupHash(gr)>0);
      const mh=mine.reduce((a,gr)=>a+G.groupHash(gr),0);
      if(ph>0&&mh>0){
        const share=full*(1-pool.fee)*(mh/ph)*(1-0.02*(1-CONN_Q));
        let out=0;
        for(const gr of mine){
          const part=share*G.groupHash(gr)/mh;
          gr.pending+=part; const o=Math.max(0,gr.pending-part);
          gr.pending-=o; out+=o;
        }
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

  function flatDrip(c, dt){
    for(const gr of G.s.groups){
      if(gr.chain!==c.id) continue;
      const p=G.poolOf(gr.pool); if(!p||p.scheme!=='PPS') continue;
      const drip=(dt*G.groupHash(gr)/G.diffOf(c))*c.reward*(1-p.fee)*(1-0.02*(1-CONN_Q));
      G.s.wallet[c.id]+=drip; G.today().earned+=drip*G.price(c);
    }
    if(G.simFlatDrip) G.simFlatDrip(c, dt);
  }

  Object.assign(G, {addGroup,addTo,armBlock,awardBlock,drawWinner,dropGroup,flatDrip,forfeitGroup,netIfOn,renameGroup,runBlockWindow,setGroupChain,setGroupPool,stepTick});
}
