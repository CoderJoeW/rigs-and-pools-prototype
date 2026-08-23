// Every chain is mined by graphics cards at full rate; chains differ by pay
// rate, block time, book depth, price volatility and floor. Derivation of
// these specific numbers: docs/economy.md#chain-ladder-derivation-srcdatachainsts

export interface Chain {
  id: string; name: string; tick: string; target: number; reward: number; price: number;
  mult: number; floor: number; vol: number; depth: number; recover: number; orphan: number;
  hue: number; blurb: string;
}

export const CHAINS: Chain[] = [
  { id:'tessera', name:'Tessera', tick:'TSR', target:20, reward:125, price:0.024,
    mult:8.82, floor:350, vol:0.030, depth:1.2e7, recover:0.50, orphan:0.050, hue:200,
    blurb:'Twenty-second blocks and a $3 prize — constant wins for one rig, worthless at scale.' },
  { id:'ferro', name:'Ferro', tick:'FRO', target:30, reward:2.124, price:4.12,
    mult:1.00, floor:6.0e3, vol:0.014, depth:15400, recover:0.40, orphan:0.045, hue:128,
    blurb:'Frequent small blocks, a deep enough book. The workhorse — and the floor the ladder is priced against.' },
  { id:'halcyon', name:'Halcyon', tick:'HAL', target:90, reward:115.44, price:3.07,
    mult:1.35, floor:6.0e4, vol:0.060, depth:2470, recover:0.14, orphan:0.015, hue:355,
    blurb:'Pays 35% more per MH than Ferro, at 10x its floor. Thin book and a violent price — small farms only.' },
  { id:'nova', name:'Nova', tick:'NVA', target:150, reward:518.66, price:11.81,
    mult:1.75, floor:4.8e5, vol:0.012, depth:77900, recover:0.55, orphan:0.020, hue:285,
    blurb:'Deep book, calm price, pays 75% more per MH than Ferro at 8x Halcyon\'s floor.' },
  { id:'obelisk', name:'Obelisk', tick:'OBL', target:600, reward:27192, price:9.06,
    mult:2.20, floor:3.84e6, vol:0.020, depth:222700, recover:0.50, orphan:0.002, hue:320,
    blurb:'Ten-minute blocks, the biggest prize on the network — more than double Ferro\'s rate per MH, for 8x Nova\'s floor.' },
];

export const CHAIN_BASE: Record<string, number> = Object.fromEntries(CHAINS.map(c => [c.id, c.price]));

// Read hue from this map, not g.chain(id).hue — see docs/economy.md#chain-hue-assignment-chain_hue-in-chainsts
// for why a save's rehydrated state can't be trusted to carry a current hue.
export const CHAIN_HUE: Record<string, number> = Object.fromEntries(CHAINS.map(c => [c.id, c.hue]));

export interface AnchorDecay { half: number; floor: number }

// half: game-days half-life of anchor's relaxation toward `floor` (fraction
// of its start-of-save value). See docs/economy.md#anchor-decay-anchor_decay-in-chainsts
export const ANCHOR_DECAY: Record<string, AnchorDecay> = {
  tessera: { half:10, floor:0.15 },
  halcyon: { half:14, floor:0.25 },
  ferro:   { half:20, floor:0.40 },
  obelisk: { half:30, floor:0.55 },
  nova:    { half:45, floor:0.70 },
};
