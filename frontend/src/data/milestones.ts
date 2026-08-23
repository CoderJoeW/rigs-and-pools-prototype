import type { GameExports } from '../game/types.js';

// Career board, not a quest log — no cash, no perks: design-spec.md §8.
export const RANKS: [number, string][] = [[0,'Hobbyist'],[4,'Tinkerer'],[8,'Operator'],[12,'Engineer'],[16,'Mogul'],[20,'Magnate']];

export interface Milestone {
  id: string;
  track: string;
  name: string;
  desc: string;
  check(g: GameExports): boolean;
}

export const MILESTONES: Milestone[] = [
  { id:'h1', track:'Hashpower', name:'First real hashrate', desc:'Reach 100 MH/s',
    check:g=>g.totalHash.value>=100 },
  { id:'h2', track:'Hashpower', name:'Gigahash', desc:'Reach 1 GH/s',
    check:g=>g.totalHash.value>=1000 },
  { id:'h3', track:'Hashpower', name:'Serious iron', desc:'Reach 10 GH/s',
    check:g=>g.totalHash.value>=10000 },
  { id:'h4', track:'Hashpower', name:'Network power', desc:'Reach 250 GH/s',
    check:g=>g.totalHash.value>=250000 },
  { id:'b1', track:'Blocks', name:'First block', desc:'One of your groups finds a block',
    check:g=>g.s.blocksSolved>=1 },
  // b2/b3 threshold derivation: docs/economy.md#block-count-milestone-thresholds-b2b3-in-milestonesjs.
  { id:'b2', track:'Blocks', name:'Block habit', desc:'7,500 blocks found',
    check:g=>g.s.blocksSolved>=7500 },
  { id:'b3', track:'Blocks', name:'Block machine', desc:'50,000 blocks found',
    check:g=>g.s.blocksSolved>=50000 },
  { id:'b4', track:'Blocks', name:'The big one', desc:'A single block worth $25,000+',
    check:g=>g.s.bestBlock>=25000 },
  { id:'i1', track:'Infrastructure', name:'Second site', desc:'Operate two sites',
    check:g=>g.s.sites.length>=2 },
  { id:'i2', track:'Infrastructure', name:'Off the meter', desc:'Install a renewable source',
    check:g=>g.s.sites.some((f:any)=>f.sources.some((x:any)=>{const P=g.SITEPART(x.p);return P&&P.rate<=0;})) },
  { id:'i3', track:'Infrastructure', name:'Stored sunlight', desc:'Install a battery',
    check:g=>g.s.sites.some((f:any)=>(f.storage||[]).length>0) },
  { id:'i4', track:'Infrastructure', name:'Quarter megawatt', desc:'250 kW of total capacity',
    check:g=>g.s.sites.reduce((a:number,f:any)=>a+g.siteCapacity(f),0)>=250000 },
  { id:'p1', track:'Pools', name:'Pool founder', desc:'Open your own pool',
    check:g=>g.s.pools.some((p:any)=>p.owner==='you'&&p.live) },
  { id:'p2', track:'Pools', name:'PPS operator', desc:'Run a PPS pool — their variance, your bond',
    check:g=>g.s.pools.some((p:any)=>p.owner==='you'&&p.live&&p.scheme==='PPS') },
  { id:'p3', track:'Pools', name:'Terahash pool', desc:'A pool of yours reaches 1 TH/s',
    check:g=>g.s.pools.some((p:any)=>p.owner==='you'&&p.live&&g.poolHash(p)>=1e6) },
  { id:'p4', track:'Pools', name:'Pool profits', desc:'Withdraw $250,000 from your pools, lifetime',
    check:g=>(g.s.poolTake||0)>=250000 },
  { id:'e1', track:'Economy', name:'In the black', desc:'Lifetime net past $25,000',
    check:g=>g.lifetimeNet.value>=25000 },
  { id:'e2', track:'Economy', name:'Real money', desc:'Lifetime net past $500,000',
    check:g=>g.lifetimeNet.value>=500000 },
  { id:'e3', track:'Economy', name:'Five million', desc:'Lifetime net past $5,000,000',
    check:g=>g.lifetimeNet.value>=5000000 },
  { id:'e4', track:'Economy', name:'Twenty a day', desc:'Net rate touches $20,000/day',
    check:g=>(g.s.peakNetDay||0)>=20000 },
  { id:'c1', track:'Craft', name:'First rebuild', desc:'Retrofit a rig through the planner',
    check:g=>(g.s.rebuilds||0)>=1 },
  { id:'c2', track:'Craft', name:'Full board', desc:'A rig running 8 cards',
    check:g=>g.s.rigs.some((r:any)=>r.units.length>=8) },
  { id:'c3', track:'Craft', name:'New silicon in service', desc:'A generation card mining',
    check:g=>g.s.rigs.some((r:any)=>r.units.some((u:any)=>{const P=g.PART(u.p);return P&&P.gen;})) },
  { id:'c4', track:'Craft', name:'Fifty repairs', desc:'Replace 50 worn cards, lifetime',
    check:g=>(g.s.repairs||0)>=50 },
];
