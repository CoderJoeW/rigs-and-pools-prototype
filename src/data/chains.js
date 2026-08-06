/* No algorithms and no hardware classes. Every chain is mined by graphics
   cards at full rate; chains differ by pay rate, block time, book depth, price
   volatility and floor — four axes without needing a fifth. */
export const CHAINS = [
  { id:'tessera', name:'Tessera', tick:'TSR', target:20, reward:30, price:0.024,
    mult:1.50, floor:500, vol:0.030, depth:4200, recover:0.50, orphan:0.050,
    blurb:'Twenty-second blocks and a tiny floor — constant small wins for one rig, worthless at scale.' },
  { id:'ferro', name:'Ferro', tick:'FRO', target:30, reward:2.124, price:4.12,
    mult:1.00, floor:6.0e3, vol:0.014, depth:15400, recover:0.40, orphan:0.045,
    blurb:'Frequent small blocks, a deep enough book. The workhorse.' },
  { id:'halcyon', name:'Halcyon', tick:'HAL', target:90, reward:99.4, price:3.07,
    mult:1.55, floor:4.5e4, vol:0.060, depth:2130, recover:0.14, orphan:0.015,
    blurb:'Pays 55% more per MH. Thin book and a violent price — small farms only.' },
  { id:'nova', name:'Nova', tick:'NVA', target:60, reward:71.12, price:11.81,
    mult:0.90, floor:3.2e5, vol:0.012, depth:26700, recover:0.55, orphan:0.020,
    blurb:'Deep book, calm price, the lowest pay per MH. Safe at scale.' },
  { id:'obelisk', name:'Obelisk', tick:'OBL', target:600, reward:8144.8, price:9.06,
    mult:1.15, floor:2.2e6, vol:0.020, depth:66700, recover:0.50, orphan:0.002,
    blurb:'Ten-minute blocks, enormous reward. Pays 15% more to carry the wait.' },
];

export const CHAIN_BASE = Object.fromEntries(CHAINS.map(c=>[c.id,c.price]));
