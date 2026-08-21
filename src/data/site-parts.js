import { FAB } from './fab.js';

/* ---- site parts. Nothing is a preset tier: you buy a shell for floor space,
   then install power and cooling yourself. Capacity is whatever you paid for. */
export const SHELLS = [
  { id:'bedroom',   name:'Spare bedroom',          slots:4,   price:0,      hours:0 },
  { id:'shed',      name:'Garden shed',            slots:10,  price:700,    hours:18 },
  { id:'garage',    name:'Garage conversion',      slots:24,  price:9000,   hours:60 },
  { id:'unit',      name:'Light industrial unit',  slots:60,  price:80000,  hours:150 },
  { id:'warehouse', name:'Warehouse bay',          slots:140, price:400000, hours:300 },
];
/* 2026-08-21: grid electricity moved off the per-tier rate ladder onto one
   flat $15/kWh baseline (rate:'grid' entries only). That baseline IS the
   shoulder rate: TOU:{off,shoulder,peak} in constants.js still multiplies it
   exactly as before (shoulder's multiplier is 1.00 by definition), so a
   bigger grid service no longer buys a cheaper rate — the ladder's job now
   is purely peak WATTAGE (1,500 -> 96,000), at a rising upfront price and
   build time. Previously 4.60/4.40/3.95/3.40 (before that, 4.20/4.00/3.60/
   3.10 — see the prior revision of this comment).

   The diesel generator is rebalanced right along with it, to hold the same
   relationship it always had: strictly worse than grid at ANY band,
   including peak — 9.90 was 13% above the old domestic peak rate (4.60 x
   1.90 = 8.74); 32.30 is the same 13% above the new one (15.00 x 1.90 =
   28.50). Its own rate stays flat — off-grid power doesn't see the tariff
   band — so what it buys is flexibility (no service to build, no capacity
   ceiling tied to it), not a price a grid-connected site would ever prefer. */
export const SOURCES = [
  { id:'s-dom',   name:'Domestic outlet',     kind:'grid',  peak:1500,  rate:15.00, price:0,     hours:0 },
  { id:'s-30',    name:'30A service',         kind:'grid',  peak:7000,  rate:15.00, price:120,   hours:10 },
  { id:'s-100',   name:'100A service',        kind:'grid',  peak:24000, rate:15.00, price:900,   hours:30 },
  { id:'s-400',   name:'400A service',        kind:'grid',  peak:96000, rate:15.00, price:6500,  hours:90 },
  { id:'s-gen',   name:'20 kW diesel set',    kind:'gen',   peak:20000, rate:32.30, price:5200,  hours:14 },
  /* Small renewables are cheap to reach and genuinely bad — `yield` is the
     fraction of nameplate the kit actually delivers, which is how real small kit
     behaves: budget panels with no tracking on a poor roof, and especially
     micro-turbines sitting in turbulent air near the ground. The ladder stays
     monotone on EFFECTIVE cost per watt ($1.67 → $1.29 → $0.97 → $0.87 for
     solar), so paying more still always buys better, exactly as elsewhere.

     s-solmini breaks that trend ON PURPOSE, at the bottom: one panel, no
     tracking, cheap enough to buy turn one ($150, against $500 starting
     cash) and small enough to barely matter (150 W nameplate). Its $2.50
     effective cost/watt is the worst of any solar tier — 50% worse than
     s-sol1's $1.67 — so it is a fine impulse buy while every other source is
     still out of reach, and a bad one to keep buying once s-sol1 isn't: ten
     of these cost more than one Rooftop panel set (1,500 vs 1,400) while
     delivering barely 70% of its watts (600 W vs 840 W effective). */
  { id:'s-solmini', name:'Single solar panel', kind:'solar', peak:150,   yield:0.40, rate:0.00, price:150,   hours:2 },
  { id:'s-sol1',  name:'Rooftop panel set',   kind:'solar', peak:1200,  yield:0.70, rate:0.00, price:1400,  hours:8 },
  { id:'s-sol3',  name:'3 kW panel array',    kind:'solar', peak:3000,  yield:0.85, rate:0.00, price:3300,  hours:18 },
  { id:'s-sol8',  name:'8 kW solar array',    kind:'solar', peak:8000,  rate:0.00, price:7800,  hours:40 },
  { id:'s-sol30', name:'30 kW solar farm',    kind:'solar', peak:30000, rate:0.00, price:26000, hours:110 },
  { id:'s-win1',  name:'Rooftop turbine',     kind:'wind',  peak:1000,  yield:0.45, rate:0.00, price:1900,  hours:10 },
  { id:'s-win4',  name:'4 kW turbine',        kind:'wind',  peak:4000,  yield:0.70, rate:0.00, price:5400,  hours:26 },
  { id:'s-win15', name:'15 kW wind turbine',  kind:'wind',  peak:15000, rate:0.00, price:17500, hours:70 },
  { id:'s-win60', name:'60 kW wind turbine',  kind:'wind',  peak:60000, rate:0.00, price:62000, hours:200 },
];
/* Cooling draws a fraction of the heat it removes, so a plant's running cost
   scales with the farm. Cheap plants are cheap to buy and expensive to run — the
   same shape as the card ladder. Heat is dispatched cheapest-PUE-first. */
/* Batteries. Value comes from three places at once: soaking free solar surplus
   that would be wasted, buying off-peak grid to spend at peak, and carrying a
   renewable site through the night instead of shedding. Infrastructure-tier
   paybacks (~100-160 days) before counting brownout protection. */
export const STORAGE = [
  { id:'st-home', name:'Home battery',      kwh:8,   kw:3,  price:700,   hours:6 },
  { id:'st-rack', name:'Rack battery',      kwh:50,  kw:14, price:3900,  hours:24 },
  { id:'st-cont', name:'Container battery', kwh:350, kw:90, price:23000, hours:90 },
];
export const PLANTS = [
  { id:'p-open', name:'Open air',            cap:1200,  pue:0.00, price:0,     hours:0 },
  { id:'p-fans', name:'Extractor fans',      cap:6000,  pue:0.08, price:700,   hours:8 },
  { id:'p-ac',   name:'Air conditioning',    cap:20000, pue:0.42, price:5500,  hours:30 },
  { id:'p-evap', name:'Evaporative cooling', cap:34000, pue:0.20, price:14000, hours:60 },
  { id:'p-imm',  name:'Immersion loop',      cap:90000, pue:0.05, price:22000, hours:140 },
];
export const SITEPART_MAP = new Map([...SHELLS,...SOURCES,...PLANTS,...STORAGE].map(p=>[p.id,p]));
export const SITEPART = id => SITEPART_MAP.get(id);

/* A construction-queue job's `p` is a shell/source/plant/storage id for
   every kind except 'fab' (looks up FABS instead) and 'mfg' — a fab-designed
   custom part (data/customParts.js), which carries its own finished part
   object on the job rather than an id into any catalogue, since it was never
   in one to begin with. `paidCash` on an 'mfg' job is what rush/insolvency
   need `.price` to mean here: what was actually paid to queue it, which is
   NOT the same number as the part's own `.price` (that's the unit price
   Build charges each time the finished design gets used to build a rig).
   Every place that turns a job back into its part (rush, insolvency's
   cancel-a-job branch, ...) needs this discrimination; giving it one shared
   home means a new job kind only has to teach it here. */
export const jobPart = j => j.kind==='mfg' ? { name:j.part.name, price:j.paidCash }
  : j.kind==='fab' ? FAB(j.p) : SITEPART(j.p);
