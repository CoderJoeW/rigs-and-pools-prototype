import { FAB } from './fab.js';

/* Site parts: design-spec.md §4. Nothing is a preset tier: you buy a shell
   for floor space, then install power and cooling yourself.
   Everything past that first tier keeps its original pacing — this is
   about clearing the on-ramp, not compressing the whole game. */
export const SHELLS = [
  { id:'bedroom',   name:'Spare bedroom',          slots:4,   price:0,      hours:0 },
  { id:'shed',      name:'Garden shed',            slots:10,  price:700,    hours:5 },
  { id:'garage',    name:'Garage conversion',      slots:24,  price:9000,   hours:60 },
  { id:'unit',      name:'Light industrial unit',  slots:60,  price:80000,  hours:150 },
  { id:'warehouse', name:'Warehouse bay',          slots:140, price:400000, hours:300 },
];
// Grid rate flattening + diesel rebalance (2026-08-21): docs/economy.md#grid-electricity-flat-rate-baseline-srcdatasite-partsjs-2026-08-21.
export const SOURCES = [
  { id:'s-dom',   name:'Domestic outlet',     kind:'grid',  peak:1500,  rate:15.00, price:0,     hours:0 },
  { id:'s-1kw',   name:'1 kW service',        kind:'grid',  peak:1000,  rate:15.00, price:50,    hours:5/60 },
  { id:'s-30',    name:'30A service',         kind:'grid',  peak:7000,  rate:15.00, price:120,   hours:5 },
  { id:'s-100',   name:'100A service',        kind:'grid',  peak:24000, rate:15.00, price:900,   hours:30 },
  { id:'s-400',   name:'400A service',        kind:'grid',  peak:96000, rate:15.00, price:6500,  hours:90 },
  { id:'s-gen',   name:'20 kW diesel set',    kind:'gen',   peak:20000, rate:32.30, price:5200,  hours:14 },
  // Small renewables ladder: design-spec.md §4. s-solmini's deliberate
  // impulse-buy exception: docs/economy.md.
  { id:'s-solmini', name:'Single solar panel', kind:'solar', peak:75,    yield:0.40, rate:0.00, price:75,    hours:1 },
  { id:'s-sol1',  name:'Rooftop panel set',   kind:'solar', peak:1200,  yield:0.70, rate:0.00, price:1400,  hours:4 },
  { id:'s-sol3',  name:'3 kW panel array',    kind:'solar', peak:3000,  yield:0.85, rate:0.00, price:3300,  hours:18 },
  { id:'s-sol8',  name:'8 kW solar array',    kind:'solar', peak:8000,  rate:0.00, price:7800,  hours:40 },
  { id:'s-sol30', name:'30 kW solar farm',    kind:'solar', peak:30000, rate:0.00, price:26000, hours:110 },
  { id:'s-win1',  name:'Rooftop turbine',     kind:'wind',  peak:1000,  yield:0.45, rate:0.00, price:1900,  hours:5 },
  { id:'s-win4',  name:'4 kW turbine',        kind:'wind',  peak:4000,  yield:0.70, rate:0.00, price:5400,  hours:26 },
  { id:'s-win15', name:'15 kW wind turbine',  kind:'wind',  peak:15000, rate:0.00, price:17500, hours:70 },
  { id:'s-win60', name:'60 kW wind turbine',  kind:'wind',  peak:60000, rate:0.00, price:62000, hours:200 },
];
// Cooling (running cost scales with PUE, dispatched cheapest-first) and
// batteries (solar-soak, off-peak arbitrage, night carry-through):
// design-spec.md §4.
export const STORAGE = [
  { id:'st-home', name:'Home battery',      kwh:8,   kw:3,  price:700,   hours:0.5 },
  { id:'st-rack', name:'Rack battery',      kwh:50,  kw:14, price:3900,  hours:24 },
  { id:'st-cont', name:'Container battery', kwh:350, kw:90, price:23000, hours:90 },
];
export const PLANTS = [
  { id:'p-open', name:'Open air',            cap:1200,  pue:0.00, price:0,     hours:0 },
  { id:'p-fans', name:'Extractor fans',      cap:6000,  pue:0.08, price:700,   hours:4 },
  { id:'p-ac',   name:'Air conditioning',    cap:20000, pue:0.42, price:5500,  hours:30 },
  { id:'p-evap', name:'Evaporative cooling', cap:34000, pue:0.20, price:14000, hours:60 },
  { id:'p-imm',  name:'Immersion loop',      cap:90000, pue:0.05, price:22000, hours:140 },
];
export const SITEPART_MAP = new Map([...SHELLS,...SOURCES,...PLANTS,...STORAGE].map(p=>[p.id,p]));
export const SITEPART = id => SITEPART_MAP.get(id);

// job.p vs job.part vs paidCash discrimination: docs/implementation-notes.md#construction-job-part-lookup-jobpart-in-srcdatasite-partsjs.
export const jobPart = j => j.kind==='mfg' ? { name:j.part.name, price:j.paidCash }
  : j.kind==='fab' ? FAB(j.p) : SITEPART(j.p);
