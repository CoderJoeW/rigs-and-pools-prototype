import { reactive } from 'vue';
import { CHAINS } from '../data/chains.js';
import { C } from '../data/constants.js';

/* 00-state.js — installed into the shared context G. */
export function installState(G){
  function freshState(){
  const chains = CHAINS.map(c=>({ ...c, ref:c.price, impact:0, hist:[c.price],
    obs:c.floor, T:0, due:0, elapsed:0, hadHash:false, found:0 }));

  return {
    t:0, cash:C.START_CASH, speed:1, help:true, theme:'auto',
    chains,
    pools:[],
    sims:[],
    groups:[{ id:1, name:'Main', chain:'tessera', pool:'solo', pending:0 }],
    nextGroup:2,
    sites:[{ id:1, name:'Spare bedroom', shell:'bedroom', fab:null,
      sources:[{p:'s-dom',n:1}], plants:[{p:'p-open',n:1}], storage:[], batt:0,
      gridCharge:false, disAny:false, queue:[], wind:0.5 }],
    nextSite:2, activeSite:1,
    rigs:[], nextId:1,
    wallet:{ tessera:0, ferro:0, halcyon:0, nova:0, obelisk:0 },
    draft:{ kind:'gpu', frame:'f4', mobo:'m4', psu:'p650', cool:'x1', unit:'c4', n:3, ctrl:'k3' },
    autoOff:false, offThreshold:0, minSell:0, autoFix:false, fixAt:0.45,
    drip:{ on:true, frac:0.5, hours:1 }, dripAt:0, hold:{},
    blocksSolved:0, orphaned:0, powerPaid:0, spent:0, earned:0,
    peakHash:0, shed:0, netHist:[], hashHist:[], cashHist:[], bestBlock:0, gen:0, weather:null,
    recentBlockUsd:{},
    mile:{done:{},rank:0}, poolTake:0, repairs:0, rebuilds:0, peakNetDay:0,
    today:{day:0,earned:0,power:0,blocks:0},
    unlocked:new Proxy({},{get:()=>true}),
    picker:null, sitePicker:null, rebuild:null, focusRig:null, saveInfo:'', wipeArm:false,
    customParts:[], design:null,
    catchUp:null,
    shakeAt:0, shakeOn:null,
    onboardingDismissed:false,
    chainsNudgeDismissed:false,
    tourDismissed:false,
    tourReplay:false,
    feed:[], feedId:1, toast:{n:0,text:'',amount:'',cls:''},
    tab:'farm',
  };
  }
  const s = reactive(freshState());
  Object.assign(G, {freshState,s});
}
