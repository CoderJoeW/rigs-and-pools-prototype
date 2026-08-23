import { C, TX_FEES, CONN_Q, BLOCK_K, RETARGET } from '../data/constants.js';
import { dayIndexOf } from '../utils/calendar.js';
import { SITEPART } from '../data/site-parts.js';
import { FAB } from '../data/fab.js';
import { PART, PART_MAP } from '../data/hardware.js';
import { MILESTONES, RANKS } from '../data/milestones.js';
import { ANCHOR_DECAY } from '../data/chains.js';
import { fmt } from '../utils/format.js';
import { gauss } from '../utils/random.js';
import { trimName } from './state.js';

const SIM_PULSE_INTERVAL = 3600;
const HIST_SAMPLE_INTERVAL = 86400 * 0.75;
const POOL_HIST_SAMPLE_INTERVAL = 14400;

export function installTick(G) {
  // True on the one tick where G.s.t crosses a multiple of `interval` —
  // G.s.t advances by `dt` each call, so a plain `% interval === 0` would
  // almost always miss the exact boundary.
  function crossedInterval(interval, dt) {
    return G.s.t % interval < dt;
  }

  function stepTick(dtOverride) {
    G.touchHeat();
    const dt = dtOverride !== undefined ? dtOverride : C.DT * G.s.speed;
    const days = dt / 86400;
    const hrs = dt / 3600;
    G.s.t += dt;
    G.ensureWeather();
    G.ensureGens();

    advanceSiteQueues(hrs);
    driftSiteWindAndBattery(dt, hrs);
    finishRigBuilds(dt);
    advanceChains(dt, days);
    settleYourPoolBonds(dt);
    wearCardsAndWarnOnHeat(days);
    billPower(dt, days, hrs);
    shedAndRestoreOverCapacityRigs();
    applyAutoOffPolicy();
    fireDueDrips(dt);
    applyAutoFixPolicy();
    if (G.s.cash < 0) G.insolvency();
    sampleHistorySeries(dt);

    G.refreshPools();
    samplePoolHashHistory(dt);
    if (G.s.shakeAt && G.s.t >= G.s.shakeAt) {
      G.poolShake(G.s.shakeOn);
      G.s.shakeAt = 0;
    }
    if (crossedInterval(SIM_PULSE_INTERVAL, dt) && G.simPulse) G.simPulse();
  }

  // --- construction / site upkeep ---------------------------------------

  function advanceSiteQueues(hrs) {
    for (const site of G.s.sites) {
      for (let i = site.queue.length - 1; i >= 0; i--) {
        const job = site.queue[i];
        job.left -= hrs;
        if (job.left > 0) continue;
        site.queue.splice(i, 1);
        finishSiteJob(site, job);
      }
    }
  }

  function finishSiteJob(site, job) {
    const name = commissionSitePart(site, job);
    G.pop('Construction finished', name, 'blu', { kind: 'construction' });
  }

  // Installs the finished job into the site and returns the part's display
  // name for the finish messages. 'source', 'storage', and the plant default
  // all just add a SITEPART to a bucket and announce it going online — only
  // which bucket differs.
  function commissionSitePart(site, job) {
    switch (job.kind) {
      case 'shell': {
        site.shell = job.p;
        const name = SITEPART(job.p).name;
        G.say('site', site.name + ' expanded to ' + name);
        return name;
      }
      case 'source':
        return commissionSitePartInto(site, site.sources, job.p);
      case 'storage':
        return commissionSitePartInto(site, site.storage = site.storage || [], job.p);
      case 'fab': {
        site.fab = job.p;
        const name = FAB(job.p).name;
        G.say('site', site.name + "'s fab is now " + name);
        return name;
      }
      case 'mfg': {
        G.s.customParts.push(job.part);
        PART_MAP.set(job.part.id, job.part);
        G.say('site', job.part.name + ' finished manufacturing at ' + site.name);
        return job.part.name;
      }
      default:
        return commissionSitePartInto(site, site.plants, job.p);
    }
  }

  function commissionSitePartInto(site, bucket, partId) {
    addTo(bucket, partId);
    const name = SITEPART(partId).name;
    G.say('site', name + ' online at ' + site.name);
    return name;
  }

  function driftSiteWindAndBattery(dt, hrs) {
    for (const site of G.s.sites) {
      const targetWind = G.s.weather ? G.s.weather.now.wind : 0.5;
      site.wind = Math.max(0.05, Math.min(1.6,
        site.wind + (targetWind - site.wind) * 0.15 * hrs + gauss() * 0.05 * Math.sqrt(hrs)));
      if (G.battKwh(site) <= 0) continue;
      const plan = G.sitePlan(site);
      const chargeW = plan.chW * 0.95 + plan.gridChW * 0.90 - plan.disW / 0.95;
      site.batt = Math.min(G.battKwh(site), Math.max(0, (site.batt || 0) + chargeW * dt / 3.6e6));
    }
  }

  function finishRigBuilds(dt) {
    for (const rig of G.s.rigs) {
      if (rig.building <= 0) continue;
      rig.building -= dt;
      if (rig.building > 0) continue;
      rig.building = 0;
      if (rig.rb) {
        rig.rb = 0;
        G.say('sys', rig.name + ' rebuilt and back online');
        G.pop('Rebuild finished', rig.name, 'grn', { kind: 'build' });
      } else {
        G.say('sys', rig.name + ' assembled');
        G.pop('Build finished', rig.name, 'grn', { kind: 'build' });
      }
    }
  }

  // --- chains / milestones ------------------------------------------------

  function advanceChains(dt, days) {
    for (const chain of G.s.chains) {
      const myHashRate = G.myHash(chain);
      runBlockWindow(chain, dt);
      if (myHashRate > 0) flatDrip(chain, dt);
      advanceChainAnchor(chain, days);
      advanceChainMarket(chain, days);
      checkMilestones();
      if (crossedInterval(HIST_SAMPLE_INTERVAL, dt)) pushCapped(chain.hist, G.price(chain), 110);
    }
  }

  function advanceChainAnchor(chain, days) {
    if (!chain.anchor) chain.anchor = Math.max(1, G.chainHash(chain) / chain.floor);
    // anchor0 rationale: docs/implementation-notes.md#chain-anchor-decay-advancechainanchor-in-tickjs.
    if (!chain.anchor0) chain.anchor0 = chain.anchor;
    const decay = ANCHOR_DECAY[chain.id];
    if (!decay) return;
    const floorAnchor = chain.anchor0 * decay.floor;
    chain.anchor = floorAnchor + (chain.anchor - floorAnchor) * Math.exp(-days * Math.LN2 / decay.half);
  }

  function advanceChainMarket(chain, days) {
    chain.ref += (G.fundOf(chain) - chain.ref) * Math.min(1, days / 3);
    chain.ref *= Math.exp((-0.5 * chain.vol * chain.vol) * days + chain.vol * Math.sqrt(days) * gauss());
    chain.ref = Math.max(0.02, chain.ref);
    chain.impact *= Math.pow(1 - chain.recover, days);
  }

  function checkMilestones() {
    if (!G.s.mile) G.s.mile = { done: {}, rank: 0 };
    G.s.peakNetDay = Math.max(G.s.peakNetDay || 0, G.netDay.value);
    for (const milestone of MILESTONES) {
      if (G.s.mile.done[milestone.id]) continue;
      if (checkOneMilestone(milestone)) awardMilestone(milestone);
    }
  }

  function checkOneMilestone(milestone) {
    try {
      return milestone.check(G.__exports);
    } catch (err) {
      if (!milestone._warned) {
        milestone._warned = 1;
        console.warn('milestone check failed:', milestone.id, err.message);
      }
      return false;
    }
  }

  function awardMilestone(milestone) {
    G.s.mile.done[milestone.id] = G.s.t;
    G.say('big', 'Milestone — ' + milestone.name + ': ' + milestone.desc);
    const milestoneCount = Object.keys(G.s.mile.done).length;
    let rankIndex = 0;
    for (const [need] of RANKS) if (milestoneCount >= need) rankIndex++;
    const rankedUp = rankIndex - 1 > G.s.mile.rank;
    if (!rankedUp) {
      G.pop('Milestone', milestone.name, 'grn', { always: true });
      return;
    }
    G.s.mile.rank = rankIndex - 1;
    const rankName = RANKS[G.s.mile.rank][1];
    G.say('big', 'Rank up — you are now ' + (/^[AEIOU]/i.test(rankName) ? 'an ' : 'a ') + rankName);
    G.pop('Rank up · ' + (G.s.mile.rank + 1) + ' of ' + RANKS.length,
      rankName, 'rankup', { always: true, kind: 'rankup' });
  }

  // --- pools / cards / power ----------------------------------------------

  function settleYourPoolBonds(dt) {
    for (const pool of G.s.pools) {
      if (pool.owner !== 'you' || !pool.live) continue;
      const chain = G.chain(pool.chain);
      if (pool.scheme === 'PPS') {
        const owed = (dt * G.poolHash(pool) / G.diffOf(chain)) * chain.reward * G.price(chain) * (1 - pool.fee);
        pool.bond -= owed;
        pool.earned -= owed;
      }
      if (pool.bond > 0) continue;
      pool.bond = 0;
      G.closeSimPool(pool, 'when the pool failed');
      G.say('bad', pool.name + ' could not pay its miners and closed — the bond is gone');
      G.pop('Your pool failed', 'it could not cover payouts', 'dark', { always: true });
    }
  }

  function wearCardsAndWarnOnHeat(days) {
    for (const site of G.s.sites) {
      const temp = G.siteTemp(site);
      const heat = 1 + Math.pow(Math.max(0, (temp - 58) / 12), 2);
      site.temp = temp;
      warnIfSiteHot(site, temp, heat);
      for (const rig of G.siteRigs(site)) {
        if (G.rigLive(rig)) wearRigCards(site, rig, days, heat);
      }
    }
  }

  function warnIfSiteHot(site, temp, heat) {
    const hot = temp >= 70 && G.siteRigs(site).some(rig => G.rigLive(rig));
    if (hot && !site.hotWarn) {
      site.hotWarn = true;
      G.say('bad', site.name + ' is cooking — ' + temp.toFixed(0) + '°C: throttling, and cards wearing '
        + heat.toFixed(0) + '× faster');
      G.pop(site.name + ' is cooking', 'cards wear ' + heat.toFixed(0) + '× faster', 'dark', { always: true });
    } else if (site.hotWarn && temp < 64) {
      site.hotWarn = false;
    }
  }

  function wearRigCards(site, rig, days, heat) {
    const tuneWear = 1 + Math.max(0, (rig.tune || 0)) * 3;
    for (const unit of rig.units) {
      if (unit.w >= 1) continue;
      unit.w = Math.min(1, unit.w + C.BASE_WEAR * (unit.wr || 1) * days * heat * tuneWear);
      G.touchHeat();
      if (unit.w >= 1) G.say('bad', PART(unit.p).name + ' in ' + rig.name + ' has worn out');
    }
    if (!rig.deadNote && rig.units.length && rig.units.every(unit => unit.w >= 1)) {
      rig.deadNote = true;
      G.say('bad', rig.name + ' has no working cards left');
      G.pop(rig.name + ' is dead', 'every card worn out', 'dark', { always: true });
    }
  }

  function billPower(dt, days, hrs) {
    const bill = G.powerRateDay.value * days;
    G.s.cash -= bill;
    G.s.powerPaid += bill;
    G.today().power += bill;
    const dayIdx = dayIndexOf(G.s.t);
    for (const site of G.s.sites) billSitePower(site, dayIdx, hrs);
  }

  function billSitePower(site, dayIdx, hrs) {
    if (!site.bill || site.bill.day !== dayIdx) site.bill = { day: dayIdx, off: 0, sh: 0, peak: 0, cool: 0, saved: 0 };
    const flow = G.flowOf(site);
    const hourCost = G.siteCostPerHour(site) * hrs;
    const band = G.band.value === 'off' ? 'off' : G.band.value === 'peak' ? 'peak' : 'sh';
    site.bill[band] += hourCost;
    if (flow.load > 0) site.bill.cool += hourCost * flow.cool / flow.load;
    const gridRate = site.sources.reduce((minRate, source) => {
      const sourcePart = SITEPART(source.p);
      return sourcePart.rate > 0 ? Math.min(minRate, G.rateAt(sourcePart)) : minRate;
    }, 15.00);
    site.bill.saved += (flow.inRenew + flow.inBatt) / 1000 * hrs * gridRate;
  }

  // --- capacity / autopilot policies ---------------------------------------

  function shedAndRestoreOverCapacityRigs() {
    for (const site of G.s.sites) {
      shedOverCapacityRigs(site);
      restoreShedRigs(site);
    }
  }

  function shedOverCapacityRigs(site) {
    let guard = 0;
    while (G.siteDemand(site) > G.siteCapacity(site) + G.battFirm(site) && guard++ < 40) {
      const liveRigs = G.siteRigs(site).filter(rig => G.rigLive(rig));
      if (!liveRigs.length) break;
      let worst = liveRigs[0];
      for (const rig of liveRigs) if (G.rigNet(rig) < G.rigNet(worst)) worst = rig;
      worst.on = false;
      worst.cut = 'brownout';
      G.s.shed++;
      G.say('bad', worst.name + ' shed — ' + site.name + ' is over capacity');
    }
  }

  function restoreShedRigs(site) {
    const cutRigs = G.siteRigs(site)
      .filter(rig => !rig.on && (rig.cut === 'brownout' || rig.cut === 'broke') && rig.building <= 0)
      .sort((rigA, rigB) => netIfOn(rigB) - netIfOn(rigA));
    for (const rig of cutRigs) {
      if (rig.cut === 'broke' && (G.s.cash < 20 || netIfOn(rig) <= 0)) continue;
      const wasOn = rig.on;
      rig.on = true;
      const wouldDraw = G.siteDemand(site);
      rig.on = wasOn;
      if (wouldDraw > (G.siteCapacity(site) + G.battFirm(site)) * 0.97) break;
      rig.on = true;
      rig.cut = null;
      G.say('sys', rig.name + ' restored — ' + site.name + ' has capacity again');
    }
  }

  function applyAutoOffPolicy() {
    if (!G.s.autoOff) return;
    for (const rig of G.s.rigs) {
      if (rig.building > 0) continue;
      const netUsd = netIfOn(rig);
      if (rig.on && netUsd < G.s.offThreshold) {
        rig.on = false;
        G.say('sys', 'Policy: ' + rig.name + ' powered down');
      } else if (!rig.on && netUsd > G.s.offThreshold * 1.2 + 0.4) {
        const site = G.site(rig.site);
        if (G.siteDemand(site) + G.rigWallW({ ...rig, on: true }) < G.siteCapacity(site)) {
          rig.on = true;
          G.say('sys', 'Policy: ' + rig.name + ' back online');
        }
      }
    }
  }

  function fireDueDrips(dt) {
    if (!G.s.drip || !G.s.drip.on) return;
    const prevTime = G.s.t - dt;
    const intervalSeconds = G.s.drip.hours * 3600;
    if (!G.s.dripAt || G.s.dripAt < prevTime - 30 * 86400 || G.s.dripAt > prevTime + intervalSeconds) {
      G.s.dripAt = prevTime + intervalSeconds;
    }
    let guard = 0;
    while (G.s.t >= G.s.dripAt && guard++ < 60) {
      G.fireDrip();
      G.s.dripAt += intervalSeconds;
    }
  }

  function applyAutoFixPolicy() {
    if (!G.s.autoFix) return;
    for (const rig of G.s.rigs) {
      if (rig.building > 0) continue;
      const { n: wornCount, cost } = G.rigWorn(rig, G.s.fixAt);
      if (!wornCount) continue;
      if (G.s.cash >= cost * 2) G.swapWorn(rig.id, G.s.fixAt);
    }
  }

  // --- history sampling -----------------------------------------------------

  function sampleHistorySeries(dt) {
    G.s.peakHash = Math.max(G.s.peakHash, G.totalHash.value);
    if (!crossedInterval(HIST_SAMPLE_INTERVAL, dt)) return;
    pushCapped(G.s.netHist = G.s.netHist || [], G.netDay.value, 110);
    pushCapped(G.s.hashHist = G.s.hashHist || [], G.totalHash.value, 110);
    pushCapped(G.s.cashHist = G.s.cashHist || [], G.s.cash, 110);
    // Why these four don't collapse into fewer series: docs/implementation-notes.md#history-series-samplehistoryseries-in-tickjs.
    pushCapped(G.s.powerHist = G.s.powerHist || [], G.powerDay.value, 110);
    pushCapped(G.s.effHist = G.s.effHist || [], G.effMhw.value, 110);
    pushCapped(G.s.netCumHist = G.s.netCumHist || [], G.lifetimeNet.value, 110);
  }

  function samplePoolHashHistory(dt) {
    if (!crossedInterval(POOL_HIST_SAMPLE_INTERVAL, dt)) return;
    for (const pool of G.s.pools) {
      if (!pool.live) continue;
      pushCapped(pool.hist = pool.hist || [], G.poolHash(pool), 42);
    }
  }

  function pushCapped(arr, value, max) {
    arr.push(value);
    if (arr.length > max) arr.shift();
  }

  // --- groups -----------------------------------------------------------

  function addTo(bucket, partId) {
    const entry = bucket.find(item => item.p === partId);
    if (entry) entry.n++;
    else bucket.push({ p: partId, n: 1 });
  }

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

  // --- block finding --------------------------------------------------------

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
    addGroup, addTo, armBlock, awardBlock, drawWinner, dropGroup, flatDrip, forfeitGroup,
    netIfOn, renameGroup, runBlockWindow, setGroupChain, setGroupPool, stepTick,
  });
}
