import { MILESTONES, RANKS } from '../data/milestones.js';

export function installMilestoneTracker(G) {
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

  Object.assign(G, { checkMilestones });
}
