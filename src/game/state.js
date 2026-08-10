import { reactive } from 'vue';
import { CHAINS } from '../data/chains.js';
import { C, SIM_CHAINS, RIVAL_PER_CHAIN, SIM_PLAYERS, SIM_RATIO } from '../data/constants.js';
import { mkRival } from './rivals.js';
import { gauss } from '../utils/random.js';

/* 00-state.js — installed into the shared context G.
   Cross-module references go through G, so the 7 mutually dependent
   module pairs still resolve at call time exactly as the closure did.
   Declarations are untouched: hoisting, evaluation order and
   intra-module references are the same code they always were. */
export function installState(G){
  /* Everything a brand-new run consists of, built fresh on demand — used once
     at boot and again by resetState() when a player erases their save. */
  function freshState(){
  const chains = CHAINS.map(c=>({ ...c, ref:c.price, impact:0, hist:[c.price],
    obs:c.floor, T:0, due:0, elapsed:0, hadHash:false, found:0 }));

  /* No official pools. Every pool on the network is somebody's business —
     rivals run by simulated operators, and whatever you open yourself. */
  const pools=[];

  for(const cid of SIM_CHAINS)
    for(let i=0;i<RIVAL_PER_CHAIN;i++) pools.push(mkRival(cid,0));

  /* A hundred other miners. They pick chains by rate and pools by fee, they
     grow, and — crucially — they are who your pool's members actually are. */
  const sims=[];
  const per=Math.floor(SIM_PLAYERS/SIM_CHAINS.length);
  for(const cid of SIM_CHAINS){
    const cc=CHAINS.find(x=>x.id===cid);
    const target=SIM_RATIO*cc.floor;
    const w=[]; let tot=0;
    for(let i=0;i<per;i++){ const x=Math.exp(gauss()*0.8); w.push(x); tot+=x; }
    for(let i=0;i<per;i++)
      sims.push({ id:sims.length, chain:cid, hash:target*w[i]/tot,
        // the field is generated, so a chain may have no PPLNS pool at all —
        // start solo and let the first reshuffle place them
        pool:(pools.find(p=>p.chain===cid&&p.scheme==='PPLNS')
              ||pools.find(p=>p.chain===cid)||{id:'solo'}).id });
  }

  // difficulty opens honest: observed hashrate starts at what is actually there,
  // so the first hour is not one long artificial easy-run while it converges.
  // The same starting network anchors each coin's FUNDAMENTAL, so prices open
  // exactly at their listed values rather than jumping to fit the sims.
  for(const c of chains){
    const start=sims.reduce((a,m)=>a+(m.chain===c.id?m.hash:0),0);
    c.obs=Math.max(c.floor, start);
    c.anchor=Math.max(1, start/c.floor);
  }

  return {
    t:0, cash:C.START_CASH, speed:1, help:true, theme:'auto',
    chains, pools, sims,
    /* Mining groups: one account, many rigs. A group owns the chain and pool;
       rigs are its workers. The group is drawn as a single participant and
       holds one PPLNS window — so maintenance on a rig never forfeits it. */
    groups:[{ id:1, name:'Main', chain:'tessera', pool:'solo', pending:0 }],
    nextGroup:2,
    sites:[{ id:1, name:'Spare bedroom', shell:'bedroom',
      sources:[{p:'s-dom',n:1}], plants:[{p:'p-open',n:1}], storage:[], batt:0,
      gridCharge:false, disAny:false, queue:[], wind:0.5 }],
    nextSite:2, activeSite:1,
    rigs:[], nextId:1,
    wallet:{ tessera:0, ferro:0, halcyon:0, nova:0, obelisk:0 },
    draft:{ kind:'gpu', frame:'f4', mobo:'m4', psu:'p650', cool:'x1', unit:'c4', n:3, ctrl:'k3' },
    autoOff:false, offThreshold:0, minSell:0, autoFix:false, fixAt:0.45,
    /* The drip is a lever, not a fixed rate: SIZE (how much of a stack goes in
       one order) and CADENCE (how often). Slippage is charged per order and
       heals between them, so four quarter-sells beat one whole-stack exit —
       by a margin that depends entirely on the coin's book depth. */
    drip:{ on:true, frac:0.5, hours:1 }, dripAt:0, hold:{},
    blocksSolved:0, orphaned:0, powerPaid:0, spent:0, earned:0,
    peakHash:0, shed:0, netHist:[], hashHist:[], cashHist:[], bestBlock:0, gen:0, weather:null,
    recentBlockUsd:{},
    mile:{done:{},rank:0}, poolTake:0, repairs:0, rebuilds:0, peakNetDay:0,
    today:{day:0,earned:0,power:0,blocks:0},
    // nothing is gated: every mechanic is available from the first minute
    unlocked:new Proxy({},{get:()=>true}),
    picker:null, sitePicker:null, rebuild:null, focusRig:null, saveInfo:'', wipeArm:false,
    shakeAt:0, shakeOn:null,
    onboardingDismissed:false,
    // issue #30: the Chains-tab rival-pool nudge is dismissed on its own,
    // independent of onboardingDismissed — so the cheaper "second site"
    // exit from the coach's 'grow' step can't silently erase it.
    chainsNudgeDismissed:false,
    // The walkthrough tour (src/game/onboarding.js's showTour) is its own
    // flag rather than reusing onboardingDismissed: skipping the tour
    // shouldn't silently skip the reactive coach too, and building a first
    // rig without ever opening the tour (e.g. an imported save mid-tour)
    // shouldn't leave it dangling — showTour also gates on nextId===1, so
    // it can't linger past a rig actually existing, or resurface later if
    // that rig is ever scrapped back to zero.
    tourDismissed:false,
    feed:[], feedId:1, toast:{n:0,text:'',amount:'',cls:''},
    // A brand-new player lands on Farm — empty, but with its own "Go
    // shopping" prompt — rather than straight into the Build tab's picker,
    // so the walkthrough tour (not the tab itself) is what explains the
    // game before asking for a decision.
    tab:'farm',
  };
  }
  const s = reactive(freshState());


  Object.assign(G, {freshState,s});
}
