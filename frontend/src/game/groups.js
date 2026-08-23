import { fmt } from '../utils/format.js';
import { PART } from '../data/hardware.js';
import { trimName } from './state.js';

export function installGroups(G) {
  function netIfOn(rig) {
    const group = G.groupOf(rig);
    const chain = group && G.chain(group.chain);
    const site = G.site(rig.site);
    if (!chain || !site) return -999;
    const units = rig.units;
    if (!units.length) return -999;
    const megahash = units.reduce((sum, unit) => sum + PART(unit.p).mh * (1 - 0.4 * unit.w), 0) * (1 + (rig.tune || 0));
    const watts = (G.chassisW(rig) + units.reduce((sum, unit) => sum + PART(unit.p).w * (1 + 0.5 * unit.w), 0)
      * (1 + (rig.tune || 0) * 1.9)) / PART(rig.psu).eff;
    return megahash * G.revPerMh(chain) * G.evMult(G.poolOf(group.pool)) - watts / 1000 * 24 * G.margRate(site);
  }

  function forfeitGroup(group, why) {
    const pool = G.poolOf(group.pool);
    if (group.pending > 0 && pool && pool.scheme === 'PPLNS') {
      G.say('bad', group.name + ' forfeited ' + fmt.c(group.pending) + ' ' + G.chain(group.chain).tick + ' ' + why);
      group.pending = 0;
    }
  }

  function setGroupChain(group, chainId) {
    if (chainId === group.chain) return;
    forfeitGroup(group, 'by switching chain');
    group.chain = chainId;
    const currentPool = G.poolOf(group.pool);
    if (group.pool !== 'solo' && (!currentPool || currentPool.chain !== chainId || !currentPool.live)) {
      group.pool = 'solo';
    }
  }

  function setGroupPool(group, poolId) {
    if (poolId === group.pool) return;
    forfeitGroup(group, 'by switching pool');
    group.pool = poolId;
  }

  function addGroup() {
    const group = { id: G.s.nextGroup++, name: 'Group ' + G.s.nextGroup, chain: 'tessera', pool: 'solo', pending: 0 };
    G.s.groups.push(group);
    return group;
  }

  function renameGroup(group, name) {
    const trimmedName = trimName(name);
    if (trimmedName) group.name = trimmedName;
  }

  function dropGroup(group) {
    if (G.s.groups.length < 2 || G.groupRigs(group).length) return;
    forfeitGroup(group, 'when it was disbanded');
    G.s.groups = G.s.groups.filter(other => other.id !== group.id);
  }

  Object.assign(G, {
    addGroup, dropGroup, forfeitGroup, netIfOn, renameGroup, setGroupChain, setGroupPool,
  });
}
