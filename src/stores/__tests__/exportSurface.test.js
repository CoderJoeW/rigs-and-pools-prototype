import { describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createGame } from '../game.js';

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
  'freshState',
  // --- generations.js ---
  'builtGen', 'ensureGens', 'liveCards', 'livePsus',
  // --- weather.js ---
  'drawWeather', 'ensureWeather', 'sky',
  // --- timeOfDay.js ---
  'bandOf', 'evMult', 'hourOf', 'rateAt', 'site',
  // --- dispatch.js ---
  'BATT_HORIZON', 'DEFAULT_ELEC', 'blocksDay', 'chassisW', 'draftRate', 'liveUnits',
  'margRate', 'psuCarrying', 'psuUsableW', 'psuWithConn', 'rigAir', 'rigCoreW',
  'rigPow', 'rigRev', 'simHash', 'siteStorage', 'today', 'totalDemand', 'touchHeat',
  // --- sims.js ---
  'SIM_SOFT_CAP', 'SIM_START', 'addHash', 'creditSim', 'creditSimPoolShare',
  'drawSimWinner', 'ensureMembers', 'mkSim', 'rebuildMembers', 'reindexSims',
  'seedSims', 'setSimChain', 'setSimHash', 'setSimPool', 'simFlatDrip', 'simHashOf',
  'simPoolHashOf', 'simPulse', 'simSoloHashOf',
  // --- poolMarket.js ---
  'FEE_BITE', 'FLOAT_DAYS', 'bondFor', 'floatBondFor', 'floatPerHash', 'lastToast',
  'pickPool', 'poolOptsFor', 'poolScore', 'poolShake', 'pop', 'refreshPools', 'repAt',
  'reshuffle', 'rivalTick', 'say', 'scoreAt', 'soften', 'toastSeen', 'varBondFor',
  // --- buildDraft.js ---
  'openBuildCost',
  // --- tick.js ---
  'addTo', 'armBlock', 'awardBlock', 'drawWinner', 'flatDrip', 'forfeitGroup',
  'netIfOn', 'runBlockWindow',
  // --- insolvency.js ---
  'FLOOR_COST', 'insolvency', 'rigSalvage',
  // --- actions.js ---
  'applyRebuildTo', 'rebuildTime',
  // --- pools.js ---
  'doBuy', 'doSell', 'fireDrip',
  // --- fleetActions.js ---
  'fleetDraft', 'fleetRigs',
  // --- persistence.js ---
  'advance', 'resetState', 'wiped',
]);

/* A leading underscore is the existing convention on G for a private cache
   (the sims module's memoised hash and member tables). Honouring the
   convention beats listing each one, and it keeps the rule discoverable from
   the name alone. */
const isPrivateByName = k => k.startsWith('_');

/* Names G.__exports deliberately publishes under a different key. */
const ALIASES = { livePsus: 'PSUS' };

function game(){
  setActivePinia(createPinia());
  return createGame();
}

describe('the public surface of the game store', () => {
  it('publishes or explicitly withholds everything installed on G', () => {
    const G = game();
    const published = new Set(Object.keys(G.__exports));

    const undeclared = Object.keys(G).filter(k =>
      k !== '__exports' &&
      !published.has(k) &&
      !published.has(ALIASES[k]) &&
      !isPrivateByName(k) &&
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
    const gone = [...INTERNAL].filter(k => !(k in G));
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
