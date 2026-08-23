import { reactive } from 'vue';
import { CHAINS } from '../data/chains.js';
import { C } from '../data/constants.js';
import type { Game, GameState, ChainState } from './types.js';

// 00-state.js — installed into the shared context G.
// Every feature flag reads true — the progression gates this prototype once
// had are all open, and the Proxy keeps that true for names nobody has
// thought of yet.
//
// Answering only STRING keys, and never Vue's own `__v_*` probes, is
// load-bearing rather than tidiness: reactive() asks an object for
// `__v_isRef` before handing it out, and a blanket-true Proxy said yes — so
// Vue unwrapped the whole object to the boolean `true`, `unlocked.auto` came
// back undefined, and Farm's Automation panel silently never rendered.
export const allUnlocked = (): Record<string, boolean> => new Proxy({}, {
  get: (_, k) => typeof k === 'string' && !k.startsWith('__v_'),
}) as Record<string, boolean>;

export function installState(G: Game): void {
  function freshState(): GameState {
    const chains: ChainState[] = CHAINS.map(c => ({ ...c, ref:c.price, impact:0, hist:[c.price],
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
      peakHash:0, shed:0, netHist:[], hashHist:[], cashHist:[], powerHist:[], effHist:[], netCumHist:[], bestBlock:0, gen:0, weather:null,
      recentBlockUsd:{},
      mile:{done:{},rank:0}, poolTake:0, repairs:0, rebuilds:0, peakNetDay:0,
      today:{day:0,earned:0,power:0,blocks:0}, yday:null,
      unlocked:allUnlocked(),
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
  const s = reactive(freshState()) as GameState;
  // A purchase that counts toward the lifetime "spent" stat goes through
  // this rather than touching s.cash directly, so the two can't drift out
  // of sync. Not every cash decrease counts as "spent" (e.g. founding a
  // pool's bond isn't), so this is opt-in, not a blanket cash setter.
  function spend(amount: number): void { s.cash -= amount; s.spent += amount; }
  Object.assign(G, { freshState, s, spend });
}

// Trims free-text names (rigs, sites, pools, groups) to one shared length cap.
export function trimName(name: string | undefined | null, max = 24): string {
  return (name || '').trim().slice(0, max);
}
