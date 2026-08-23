import { C, TX_FEES, CONN_Q, BLOCK_K, RETARGET } from '../data/constants.js';
import { fmt } from '../utils/format.js';

export function installBlockMining(G) {
  function runBlockWindow(chain, dt) {
    const networkHash = G.chainHash(chain);
    if (networkHash <= 0) {
      chain.elapsed = 0;
      chain.hadHash = false;
      chain.obs += (chain.floor - chain.obs) * Math.min(1, dt / 1800);
      return;
    }
    if (chain.elapsed > 4 * chain.target) {
      chain.obs += (Math.max(chain.floor, networkHash) - chain.obs) * Math.min(1, dt / 1800);
    }
    if (!chain.hadHash) {
      chain.hadHash = true;
      armBlock(chain);
    }
    chain.elapsed += dt;
    let guard = 0;
    while (chain.elapsed >= chain.due && guard++ < 400) {
      const leftover = chain.elapsed - chain.due;
      awardBlock(chain, drawWinner(chain, G.chainHash(chain)));
      chain.found++;
      chain.obs += (G.chainHash(chain) - chain.obs) * RETARGET;
      armBlock(chain);
      chain.elapsed = leftover;
    }
  }

  function armBlock(chain) {
    const networkHash = Math.max(1, G.chainHash(chain));
    chain.T = (G.diffOf(chain) / networkHash) * (BLOCK_K + 1) / BLOCK_K;
    chain.due = chain.T * Math.pow(Math.random(), 1 / BLOCK_K);
    chain.elapsed = 0;
  }

  function drawWinner(chain, networkHash) {
    let remainingHash = Math.random() * networkHash;
    for (const group of G.s.groups) {
      if (group.chain !== chain.id) continue;
      remainingHash -= G.groupHash(group);
      if (remainingHash <= 0) return { pool: group.pool, mine: true, group };
    }
    if (G.drawSimWinner) return G.drawSimWinner(chain, remainingHash);
    return { pool: 'solo', mine: false };
  }

  function baselineKey(chain, pool) {
    return pool ? chain.id + '|' + pool.id : chain.id;
  }

  function blockBaseline(key) {
    const recentValues = G.s.recentBlockUsd[key];
    if (!recentValues || recentValues.length < C.BLOCK_BASELINE_MIN) return null;
    const sorted = [...recentValues].sort((valueA, valueB) => valueA - valueB);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function trackBlockUsd(key, usd) {
    const recentValues = G.s.recentBlockUsd[key] || (G.s.recentBlockUsd[key] = []);
    recentValues.push(usd);
    while (recentValues.length > C.BLOCK_BASELINE_WINDOW) recentValues.shift();
  }

  function awardBlock(chain, winner) {
    const fullReward = chain.reward * (1 + TX_FEES);
    const fullRewardUsd = fullReward * G.price(chain);
    const pool = (!winner.pool || winner.pool === 'solo') ? null : G.poolOf(winner.pool);
    if (pool) pool.found = (pool.found || 0) + 1;
    if (winner.group) winner.group.found = (winner.group.found || 0) + 1;

    if (!pool) {
      awardSoloBlock(chain, winner, fullReward);
      return;
    }
    awardPooledBlock(chain, winner, pool, fullReward, fullRewardUsd);
  }

  function awardSoloBlock(chain, winner, fullReward) {
    if (!winner.mine) {
      if (winner.sim && G.creditSim) G.creditSim(winner.sim, fullReward * G.price(chain));
      return;
    }
    G.s.blocksSolved++;
    if (Math.random() < chain.orphan * (1 - CONN_Q)) {
      G.s.orphaned++;
      G.say('bad', 'Orphaned on ' + chain.name);
      return;
    }
    G.s.wallet[chain.id] += fullReward;
    G.today().earned += fullReward * G.price(chain);
    G.today().blocks++;
    const usd = fullReward * G.price(chain);
    const baseline = blockBaseline(chain.id);
    const record = usd > G.s.bestBlock;
    const jackpot = !record && baseline && usd >= baseline * C.JACKPOT_MULT;
    if (jackpot) {
      G.say('jackpot', 'Jackpot on ' + chain.name + ' — ' + (usd / baseline).toFixed(1) + 'x your usual',
        '+' + fmt.c(fullReward), fullReward, chain.tick);
    } else {
      G.say('block', 'Block solved solo on ' + chain.name, '+' + fmt.c(fullReward), fullReward, chain.tick);
    }
    if (record) {
      G.s.bestBlock = usd;
      G.pop('Biggest block yet', '+' + fmt.usd2(usd), '', { always: true, kind: 'record' });
    } else if (jackpot) {
      G.pop('Jackpot', '+' + fmt.usd2(usd) + ' — ' + (usd / baseline).toFixed(1) + 'x your usual',
        'jackpot', { always: true });
    } else {
      G.pop('Block solved', '+' + fmt.c(fullReward) + ' ' + chain.tick, '', { kind: 'block' });
    }
    trackBlockUsd(chain.id, usd);
  }

  function awardPooledBlock(chain, winner, pool, fullReward, fullRewardUsd) {
    if (winner.mine) G.s.blocksSolved++;
    // pool.found is counted ONCE, at the top of awardBlock. It used to be
    // counted again here — every pooled block twice — which saturated
    // poolRep's luck term at half the blocks it is written for, inflating the
    // trust of every pool on the network and with it poolScore, which is what
    // both the miners and the fee preview decide on.

    if (pool.owner === 'you') {
      const take = pool.scheme === 'PPS' ? fullRewardUsd : fullRewardUsd * pool.fee;
      pool.bond += take;
      pool.earned += take;
    } else if (pool.owner === 'sim' && pool.scheme !== 'PPS') {
      const take = fullRewardUsd * pool.fee;
      pool.bond += take;
      pool.earned += take;
    }
    if (pool.scheme === 'PPLNS' && G.creditSimPoolShare) {
      G.creditSimPoolShare(pool, fullReward, G.price(chain));
    }
    if (pool.scheme === 'PPLNS') {
      awardPplnsShare(chain, winner, pool, fullReward);
    } else if (winner.mine) {
      G.say('pool', (winner.group ? winner.group.name : 'Your group') + ' found a ' + chain.name
        + ' block — flat rate, no bonus');
    }
  }

  function awardPplnsShare(chain, winner, pool, fullReward) {
    const poolHashTotal = G.poolHash(pool);
    const miningGroups = G.s.groups.filter(group => group.pool === pool.id && G.groupHash(group) > 0);
    const miningHash = miningGroups.reduce((sum, group) => sum + G.groupHash(group), 0);
    if (!(poolHashTotal > 0 && miningHash > 0)) return;

    const share = fullReward * (1 - pool.fee) * (miningHash / poolHashTotal) * (1 - 0.02 * (1 - CONN_Q));
    let paidOut = 0;
    for (const group of miningGroups) {
      const rawShare = share * G.groupHash(group) / miningHash;
      group.pending += rawShare;
      const overflow = Math.max(0, group.pending - rawShare);
      group.pending -= overflow;
      paidOut += overflow;
    }
    G.s.wallet[chain.id] += paidOut;
    G.today().earned += paidOut * G.price(chain);
    if (paidOut > 0) G.today().blocks++;

    if (share <= 0.0002) return;
    const usd = share * G.price(chain);
    const key = baselineKey(chain, pool);
    const baseline = blockBaseline(key);
    if (winner.mine) {
      const jackpot = baseline && usd >= baseline * C.JACKPOT_MULT;
      if (jackpot) {
        G.say('jackpot', winner.group.name + ' solved the ' + chain.name + ' pool block — '
          + (usd / baseline).toFixed(1) + 'x your usual', '+' + fmt.c(share), share, chain.tick);
        G.pop('Jackpot', '+' + fmt.usd2(usd) + ' — ' + (usd / baseline).toFixed(1) + 'x your usual',
          'jackpot', { always: true });
      } else {
        G.say('block', winner.group.name + ' solved the ' + chain.name + ' pool block', '+' + fmt.c(share), share, chain.tick);
        G.pop(winner.group.name + ' found it', '+' + fmt.c(share) + ' ' + chain.tick, '', { kind: 'block' });
      }
    } else {
      G.say('pay', pool.name + ' found a block', '+' + fmt.c(share), share, chain.tick);
    }
    trackBlockUsd(key, usd);
  }

  function flatDrip(chain, dt) {
    for (const group of G.s.groups) {
      if (group.chain !== chain.id) continue;
      // `live` as well as the scheme: a closed pool has no bond and no
      // operator, so there is nothing for it to pay out of. Releasing the
      // group is the closing path's job and it does it — this is the backstop
      // that stops a miss there being free money rather than a stale label.
      const pool = G.poolOf(group.pool);
      if (!pool || !pool.live || pool.scheme !== 'PPS') continue;
      const drip = (dt * G.groupHash(group) / G.diffOf(chain)) * chain.reward * (1 - pool.fee) * (1 - 0.02 * (1 - CONN_Q));
      G.s.wallet[chain.id] += drip;
      G.today().earned += drip * G.price(chain);
    }
    if (G.simFlatDrip) G.simFlatDrip(chain, dt);
  }

  Object.assign(G, {
    armBlock, awardBlock, drawWinner, flatDrip, runBlockWindow,
  });
}
