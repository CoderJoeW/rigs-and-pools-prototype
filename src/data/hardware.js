/* ---- rig parts. Every ladder is strictly monotonic: a more expensive part is better
   on every axis that matters. Dollars-per-MH still worsens as you climb, so
   cheap cards keep their niche and the cash/power inversion survives. ---- */
export const FRAMES = [
  { id:'f2',  name:'Milk crate, 2 slots',   slots:2,  air:0.95, w:4,  price:12 },
  { id:'f4',  name:'Open frame, 4 slots',   slots:4,  air:1.00, w:8,  price:28 },
  { id:'f6',  name:'Open frame, 6 slots',   slots:6,  air:1.08, w:12, price:55 },
  { id:'f8',  name:'Ducted case, 8 slots',  slots:8,  air:1.18, w:20, price:95 },
  { id:'f10', name:'Ducted case, 10 slots', slots:10, air:1.28, w:28, price:150 },
  { id:'f12', name:'Rack shelf, 12 slots',  slots:12, air:1.38, w:38, price:225 },
  { id:'f16', name:'Rack shelf, 16 slots',  slots:16, air:1.50, w:52, price:340 },
];
export const MOBOS = [
  { id:'m2',  name:'Salvaged board, 2 PCIe', pcie:2,  w:34, price:4 },
  { id:'m4',  name:'Budget mining, 4 PCIe',  pcie:4,  w:44, price:38 },
  { id:'m6',  name:'Mining B250, 6 PCIe',    pcie:6,  w:52, price:68 },
  { id:'m8',  name:'BTC-T37, 8 PCIe',        pcie:8,  w:60, price:105 },
  { id:'m10', name:'TB250 Pro, 10 PCIe',     pcie:10, w:68, price:150 },
  { id:'m12', name:'X99 Miner, 12 PCIe',     pcie:12, w:74, price:200 },
  { id:'m16', name:'Octominer, 16 PCIe',     pcie:16, w:88, price:290 },
];
export const PSUS = [
  { id:'p450',  name:'450W Bronze',    w:450,  conn:2,  eff:0.82, price:32 },
  { id:'p650',  name:'650W Bronze',    w:650,  conn:3,  eff:0.85, price:52 },
  { id:'p850',  name:'850W Gold',      w:850,  conn:4,  eff:0.88, price:78 },
  { id:'p1200', name:'1200W Gold',     w:1200, conn:6,  eff:0.90, price:115 },
  { id:'p1600', name:'1600W Platinum', w:1600, conn:8,  eff:0.92, price:170 },
  { id:'p2200', name:'2200W Platinum', w:2200, conn:12, eff:0.94, price:265 },
  { id:'p3000', name:'3000W Titanium', w:3000, conn:16, eff:0.95, price:390 },
  { id:'p4000', name:'4000W Titanium', w:4000, conn:22, eff:0.96, price:560 },
  /* Above 4 kW real rigs stop using desktop supplies and hang server PSUs off a
     breakout board. That is what these are, and it is what makes a full
     twelve-card rig of top hardware possible: 12 x 3 = 36 PCIe connectors and
     roughly 4.4 kW usable, neither of which the desktop range could reach. */
  { id:'p5600', name:'5.6 kW server shelf', w:5600, conn:40, eff:0.965, price:790 },
  { id:'p7500', name:'7.5 kW server shelf', w:7500, conn:52, eff:0.97,  price:1060 },
];
export const COOLERS = [
  { id:'x0', name:'Open air, no cooler',  fac:1.00, w:0,  price:0 },
  { id:'x1', name:'Two case fans',        fac:1.10, w:10, price:14 },
  { id:'x2', name:'Four case fans',       fac:1.22, w:18, price:30 },
  { id:'x3', name:'Shrouded, six fans',   fac:1.36, w:26, price:58 },
  { id:'x4', name:'AIO liquid loop',      fac:1.55, w:40, price:120 },
  { id:'x5', name:'Custom loop, 360mm',   fac:1.78, w:55, price:230 },
  { id:'x6', name:'Immersion tank kit',   fac:2.20, w:30, price:420 },
];
/* The ladder is priced so that CLIMBING IT IS PAYBACK-NEUTRAL: $/MH runs
   1.08 -> 1.75 rather than 1.08 -> 3.64. Before, a better card paid back
   slower (9.6 days for the cheapest, 22 for the best), so the rational play
   was to buy the worst card forever and capital never compounded. What a
   better card buys now is DENSITY and EFFICIENCY — more hashrate per slot and
   per watt — which are the constraints that actually bind later. */
export const CARDS = [
  { id:'c1', name:'RX-470 4GB (used)',  mh:24,  w:120, conn:1, price:3 },
  { id:'c2', name:'RX-580 8GB (used)',  mh:28,  w:130, conn:1, price:4 },
  { id:'c3', name:'GTX-1070 (used)',    mh:32,  w:138, conn:1, price:6 },
  { id:'c4', name:'GTX-1660 Super',     mh:38,  w:152, conn:1, price:9 },
  { id:'c5', name:'RTX-2060 Super',     mh:45,  w:168, conn:2, price:14 },
  { id:'c6', name:'RX-5700 XT',         mh:52,  w:180, conn:2, price:22 },
  { id:'c7', name:'RTX-3060 Ti',        mh:60,  w:195, conn:2, price:34 },
  { id:'c8', name:'RTX-3070',           mh:70,  w:212, conn:2, price:52 },
  { id:'c9', name:'RX-6800 XT',         mh:82,  w:232, conn:2, price:80 },
  { id:'c10',name:'RTX-3080',           mh:96,  w:254, conn:3, price:124 },
  { id:'c11',name:'RTX A4500',          mh:112, w:276, conn:3, price:190 },
  { id:'c12',name:'RTX A5000',          mh:132, w:302, conn:3, price:290 },
];
export const RISER = { name:'PCIe riser', w:3, price:9 };

/* Hardware generations — the answer to the treadmill. Every GEN_DAYS a new
   pair of cards lands, ~22% more hashrate and ~15% better MH/W than the
   generation before, at a matching price. Deterministic from the clock, so a
   loaded save regrows exactly the same catalogue. Refit never runs out. */
export const GEN_SERIES=['Axion','Vireo','Kestrel','Zephyr','Onyx','Quasar','Helix','Titan',
  'Aurel','Basalt','Cinder','Drift'];
export function genPsuFor(n){                       // keeps pace with card draw
  const top=PSUS[PSUS.length-1];
  return { id:'gp'+n, name:(top.w*Math.pow(1.06,n)/1000).toFixed(1)+' kW server shelf',
    w:Math.round(top.w*Math.pow(1.06,n)), conn:top.conn+4*n,
    eff:Math.min(0.98, top.eff+0.002*n),
    price:Math.round(top.price*Math.pow(1.10,n)), gen:n };
}
export function genCardsFor(n){                       // generation n >= 1
  const top=CARDS[CARDS.length-1];
  const mh=Math.round(top.mh*Math.pow(1.22,n)), w=Math.round(top.w*Math.pow(1.06,n));
  // price tracks HASHRATE (1.22), not a steeper curve. At 1.38 the top card
  // cost 6,000x more after a year while earning only 158x more, so generations
  // quietly became unaffordable — the treadmill's own answer outran the player.
  const price=Math.round(top.price*Math.pow(1.30,n));   // steeper than hashrate: a
  // bigger farm should find money a real constraint again
  const nm=GEN_SERIES[(n-1)%GEN_SERIES.length]+(n>GEN_SERIES.length?' '+Math.ceil(n/GEN_SERIES.length):'');
  return [
    { id:'g'+n+'a', name:nm+' '+mh,               mh, w, conn:3, price, gen:n },
    { id:'g'+n+'b', name:nm+' '+Math.round(mh*0.86), mh:Math.round(mh*0.86),
      w:Math.round(w*0.94), conn:3, price:Math.round(price*0.80), gen:n },
  ];
}

export const PART_MAP = new Map([...FRAMES,...MOBOS,...COOLERS,...PSUS,...CARDS].map(p=>[p.id,p]));
export const PART = id => PART_MAP.get(id);
