import { describe, it, expect } from 'vitest';
import { createGame } from '../game.js';
import type { Game } from '../../game/types.js';

/* G.__exports is a hand-written list. Everything the install* modules put on G
   has to be repeated there or it never reaches components, the Pinia store, or
   most tests — and the failure is a silent `undefined` at runtime, not a build
   or test error. This file makes that failure loud instead.

   Adding a function to G now forces one of two deliberate acts:
     - publish it, by adding it to G.__exports in src/game/persistence.js; or
     - declare it private, by adding it to INTERNAL below.
   Doing neither fails the first test with the name in the message.

   The list is kept grouped by owning module and alphabetical inside a group,
   so a new entry lands somewhere obvious rather than at the end. */
const INTERNAL = new Set([
  // --- state.js ---
  'freshState', 'spend',
  // --- generations.js ---
  'builtGen', 'ensureGens', 'liveCards',
  // --- weather.js ---
  'ensureWeather', 'sky',
  // --- timeOfDay.js ---
  'bandOf', 'evMult', 'hourOf', 'rateAt', 'rig', 'site',
  // --- dispatch.js ---
  'BATT_HORIZON', 'DEFAULT_ELEC', 'blocksDay', 'chassisW', 'draftRate', 'liveUnits',
  'margRate', 'psuCarrying', 'psuUsableW', 'psuWithConn', 'rigAir', 'rigCoreW',
  'rigPow', 'rigRev', 'simHash', 'siteStorage', 'today', 'touchHeat',
  // totalDemand is withheld only because publishing it would widen the
  // surface, which this change is not allowed to do. It is not a design
  // decision: FarmView.vue re-implements it verbatim as a local computed
  // because it never reached the store, while its own consumers (headroom,
  // effMhw) are published. Worth publishing and de-duplicating separately.
  'totalDemand',
  // --- sims.js ---
  'SIM_SOFT_CAP', 'SIM_START', 'addHash', 'creditSim', 'creditSimPoolShare',
  'drawSimWinner', 'ensureMembers', 'mkSim', 'rebuildMembers', 'reindexSims',
  'closeSimPool', 'seatsFor', 'seedSims', 'setSimChain', 'setSimHash', 'setSimPool', 'simFlatDrip',
  'simHashOf', 'simPoolHashOf', 'simPulse', 'simRoomOf', 'simSoloHashOf', 'simTargetOf',
  'overBuilt',
  // --- poolMarket.js ---
  'FEE_BITE', 'FLOAT_DAYS', 'bondFor', 'floatBondFor', 'floatPerHash', 'lastToast',
  'chainPoolTable', 'pickPool', 'poolScore', 'poolScoreBase', 'poolShake', 'pop',
  'refreshPools', 'repAt', 'scoreJitter',
  'reshuffle', 'rivalTick', 'say', 'scoreAt', 'soften', 'toastSeen', 'varBondFor',
  // --- buildDraft.js ---
  'openBuildCost',
  // --- tick.js ---
  'crossedInterval',
  // --- siteConstruction.js ---
  'addTo', 'advanceSiteQueues', 'driftSiteWindAndBattery', 'finishRigBuilds',
  // --- blockMining.js ---
  'armBlock', 'awardBlock', 'drawWinner', 'flatDrip', 'runBlockWindow',
  // --- milestoneTracker.js ---
  'checkMilestones',
  // --- chainEconomy.js ---
  'advanceChains',
  // --- groups.js ---
  'forfeitGroup', 'netIfOn',
  // --- cardWear.js ---
  'wearCardsAndWarnOnHeat',
  // --- powerBilling.js ---
  'billPower',
  // --- autopilot.js ---
  'applyAutoFixPolicy', 'applyAutoOffPolicy', 'fireDueDrips', 'shedAndRestoreOverCapacityRigs',
  // --- historySampling.js ---
  'sampleHistorySeries', 'samplePoolHashHistory',
  // --- poolBonds.js ---
  'settleYourPoolBonds',
  // --- insolvency.js ---
  'FLOOR_COST', 'FLOOR_RIG', 'insolvency', 'rigSalvage',
  // --- actions.js ---
  'applyRebuildTo', 'rebuildTime',
  // --- pools.js ---
  'doBuy', 'doSell', 'fireDrip',
  // --- fleetActions.js ---
  'fleetDraft', 'fleetRigs',
  // --- persistence.js ---
  'advance', 'resetState', 'wiped',
  // sims.js again — the memoised hash and member tables. Listed rather than
  // waved through by their leading underscore: exempting a whole namespace
  // would leave an unbounded hole in the check, and an escape hatch that is
  // easier to reach for than editing this list will get reached for.
  '_membersDirty', '_poolMembers', '_simChainHash', '_simChainN', '_simPoolHash',
  '_simSoloHash', '_soloMembers',
]);

/* Names G.__exports deliberately publishes under a different key. */
const ALIASES = { livePsus: 'PSUS' };

/* Built once and shared: no test here mutates G.

   The tick matters. Snapshotting G the instant createGame() returns would
   only see what the installers assign at install time, and a module that
   memoises onto G from inside a tick-path function (G.chainIndex ||= …)
   would slip past this whole file — the exact silent-undefined failure it
   exists to catch. Running an hour of game first means anything installed on
   the TICK PATH is present to be judged. A key first written by a user action
   nothing here performs is still missed; that is the accepted edge, and
   driving every action from here would make this a second integration suite. */
let built: Game | null = null;
const ownKeys = (o: object) => Reflect.ownKeys(o).filter(k => typeof k === 'string') as string[];

function game(){
  if(!built){
    built = createGame();            // no Pinia needed: createGame is plain Vue
    built.stepTick(3600);
  }
  return built;
}

describe('the public surface of the game store', () => {
  it('publishes or explicitly withholds everything installed on G', () => {
    const G = game();
    const published = new Set(Object.keys(G.__exports));

    // Reflect.ownKeys rather than Object.keys: a non-enumerable property
    // defined with defineProperty is still part of the surface.
    const undeclared = ownKeys(G).filter(k =>
      k !== '__exports' &&
      !published.has(k) &&
      !published.has((ALIASES as any)[k]) &&
      !INTERNAL.has(k));

    expect(undeclared, 'These are installed on G but neither published in ' +
      'G.__exports (src/game/persistence.js) nor listed as INTERNAL in this ' +
      'file. Components and the Pinia store cannot see them, and reading one ' +
      'gives undefined rather than an error. Pick one deliberately.').toEqual([]);
  });

  it('has no stale entries in the private list', () => {
    const G = game();
    // A renamed or deleted internal should drop out of INTERNAL with it,
    // otherwise the list slowly stops describing the code it guards.
    // hasOwnProperty, not `in`: `in` walks the prototype chain, so a name
    // like 'constructor' could never be reported stale. Not `G[k] !==
    // undefined` either — `wiped` is legitimately false.
    const own = (k: string) => Object.prototype.hasOwnProperty.call(G, k);
    const gone = [...INTERNAL].filter(k => !own(k));
    expect(gone, 'Listed as INTERNAL but no longer installed on G — delete ' +
      'these entries.').toEqual([]);
  });

  it('publishes nothing that resolves to undefined', () => {
    const G = game();
    // Catches the other half of the same failure: a typo on the right-hand
    // side (`fleetWorn:G.fleetWron`) publishes the key but binds it to
    // undefined, which reads exactly like a missing export at the call site.
    const dead = Object.entries(G.__exports)
      .filter(([, v]) => v === undefined)
      .map(([k]) => k);

    expect(dead, 'Published in G.__exports but undefined — usually a typo in ' +
      'the G.<name> on the right-hand side, or an installer that no longer ' +
      'provides it.').toEqual([]);
  });

  it('still hands components the flat shape they read', () => {
    const G = game();
    // Guards the reason __exports exists at all: Pinia unwraps top-level
    // refs/computed on the returned object, so a view reads g.totalHash with
    // no .value. That only works while the store returns this flat object.
    expect(G.__exports.s).toBe(G.s);
    expect(typeof G.__exports.build).toBe('function');
    expect(G.__exports.PSUS).toBe(G.livePsus);
  });
});
