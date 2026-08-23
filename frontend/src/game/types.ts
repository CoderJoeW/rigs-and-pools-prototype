// Shared shape of the game's reactive state (`G.s`) and its assembled
// runtime context (`G`), built by running every game/*.ts installer over
// one object in sequence (stores/game.ts). Why this type is deliberately
// partly-loose: docs/implementation-notes.md#the-gamegameexports-types-srcgametypests

import type { Chain } from '../data/chains.js';
import type { DayWeather } from '../services/weatherService.js';
import type { ComputedRef } from 'vue';
import type { Card } from '../data/hardware.js';

export interface WeatherState { day: number; now: DayWeather; next: DayWeather }

export interface ChainState extends Chain {
  ref: number;
  impact: number;
  hist: number[];
  obs: number;
  T: number;
  due: number;
  elapsed: number;
  hadHash: boolean;
  found: number;
  anchor?: number;
  anchor0?: number;
}

export interface Group {
  id: number;
  name: string;
  chain: string;
  pool: string;
  pending: number;
}

export interface SiteSource { p: string; n: number }
export interface SitePlant { p: string; n: number }
export interface SiteStorage { p: string; n: number }

export interface Site {
  id: number;
  name: string;
  shell: string;
  fab: string | null;
  sources: SiteSource[];
  plants: SitePlant[];
  // A freshly-built site (sites.ts's newSite) doesn't set these four —
  // they're read with `|| 0`/`|| []`/falsy-undefined fallbacks everywhere
  // (dispatch.ts, siteConstruction.ts) and lazily assigned on first real use.
  storage?: SiteStorage[];
  batt?: number;
  gridCharge?: boolean;
  disAny?: boolean;
  queue: import('../data/site-parts.js').Job[];
  wind: number;
  bill?: { day: number; off: number; sh: number; peak: number; cool: number; saved: number };
  temp?: number;
  hotWarn?: boolean;
}

export interface BuildDraft {
  kind: string;
  frame: string;
  mobo: string;
  psu: string;
  cool: string;
  unit: string;
  n: number;
  ctrl: string;
}

export interface DripSettings { on: boolean; frac: number; hours: number }

export interface DayTotals { day: number; earned: number; power: number; blocks: number }
// The closed-out previous day, stashed by dispatch.ts's today() with the
// hashrate reading it doesn't otherwise carry. The index signature is for
// yday()'s dynamic `yesterday[key]` lookup (key: 'earned' | 'power' | 'hash').
export interface YdayTotals extends DayTotals { hash: number; [key: string]: number }

export interface ToastState { n: number; text: string; amount: string; cls: string }

export interface FeedItem {
  id: number; t: string; kind: string; text: string; amount: string;
  num?: number; usd?: number; n: number;
}

export interface MilestoneState { done: Record<string, number>; rank: number }

export interface DesignInProgress { fid: number; kind: import('../data/customParts.js').DesignKind; picks: Record<string, number> }

export interface RebuildDraft { frame: string; mobo: string; cool: string; psu: string; unit: string; n: number }
export interface RebuildInProgress { rig: number; picker: string | null; draft: RebuildDraft }

export interface RebuildCheck { ok: boolean; label: string; fix: string }
export interface RebuildInfo {
  buy: number; credit: number; net: number; core: number; wall: number; lim: number;
  checks: RebuildCheck[]; time: number; ok: boolean; changed: boolean; hashNew: number;
}

export interface Unit {
  p: string;    // card/part id
  w: number;    // wear fraction, 0-1; 1 = dead
  // wear-rate multiplier from wearRate(); absent on a rebuilt or floor-rescue
  // unit, read defensively as `unit.wr || 1`
  wr?: number;
}

// dispatch.ts's rigState(rig) return shape — one of six literal branches,
// all the same shape.
export interface RigState {
  k: 'build' | 'off' | 'worn' | 'losing' | 'wearing' | 'run';
  dot: 'build' | 'off' | 'bad' | 'warn' | 'run';
  label: string;
  sub: string;
}

// dispatch.ts's groupAdvice(group): a chain paying more per MH than the
// group's current one, worth the switch.
export interface GroupAdvice { share: number; alt: string; mult: number }
// dispatch.ts's chainCeiling(chain, extraMh?): how much of a chain's
// emission the player would own past its floor.
export interface ChainCeiling { share: number; grossCap: number; over: number }

// poolMarket.ts's repParts(pool): the four factors poolRep's trust score
// weights and averages.
export interface RepParts { solvency: number; age: number; luck: number; feeStab: number }
// poolMarket.ts's poolPnl(pool): the operator's-eye view of running a pool.
export interface PoolPnl { income: number; capital: number; roi: number; payback: number }

export interface Rig {
  id: number;
  kind: string;   // 'gpu' for every rig built through the current UI
  frame: string;  // part id
  mobo: string;   // part id
  psu: string;    // part id
  cool: string;   // part id; falsy means "no cooler"
  ctrl: string;   // part id; inert unless kind !== 'gpu'
  units: Unit[];
  risers: number;    // only meaningful for kind === 'gpu'
  refurb: number;    // times refurbished, via swapWorn/applyRebuildTo
  site: number;      // FK into GameState.sites
  group: number;     // FK into GameState.groups
  tune: number;      // overclock fraction, read as `rig.tune || 0`
  on: boolean;
  building: number;  // seconds left to finish assembly/rebuild; 0 = live
  open: boolean;     // UI-only; not read anywhere in game/*.ts
  name: string;
  cut?: 'broke' | 'brownout' | null;  // set by insolvency.ts / autopilot.ts's shed
  deadNote?: boolean;                 // true once cardWear.ts finds every unit worn
  // 1 right after applyRebuildTo; consumed by finishRigBuilds to pick
  // "rebuilt" vs "assembled" in its toast.
  rb?: number;
}

export interface Pool {
  id: string;
  chain: string;
  name: string;
  scheme: 'PPS' | 'PPLNS';
  fee: number;
  owner: 'you' | 'sim' | 'rival';
  ownerSim?: number;  // sim pools only — FK into GameState.sims
  bond: number;
  bond0: number;      // high-water-mark bond, for poolProfit/solvency
  cap: number;        // live capacity/hash cache, recomputed each tick
  capped?: boolean;   // set only by poolMarket.ts's refreshPools
  born: number;
  live: boolean;
  earned: number;
  found?: number;      // block-win counter; player pool omits it at creation
  feeMoved?: number;   // sim/rival pools seed -1e9; player pool sets it lazily
  lapse?: number;      // consecutive-empty-tick counter driving auto-close
  hist?: number[];     // sampled hashrate history, lazily created by samplePoolHashHistory
}

export interface Sim {
  id: number;
  cash: number;
  hash: number;
  chain: string;
  pool: string;
  style: number;
  next: number;
  coins: number;
  _lastDecide?: number;
}

export interface GameState {
  t: number;
  cash: number;
  speed: number;
  help: boolean;
  theme: string;
  chains: ChainState[];
  pools: Pool[];
  sims: Sim[];
  groups: Group[];
  nextGroup: number;
  sites: Site[];
  nextSite: number;
  activeSite: number;
  rigs: Rig[];
  nextId: number;
  wallet: Record<string, number>;
  draft: BuildDraft;
  autoOff: boolean;
  offThreshold: number;
  minSell: number;
  autoFix: boolean;
  fixAt: number;
  drip: DripSettings;
  dripAt: number;
  hold: Record<string, unknown>;
  blocksSolved: number;
  orphaned: number;
  powerPaid: number;
  spent: number;
  earned: number;
  peakHash: number;
  shed: number;
  netHist: number[];
  hashHist: number[];
  cashHist: number[];
  powerHist: number[];
  effHist: number[];
  netCumHist: number[];
  bestBlock: number;
  gen: number;
  weather: WeatherState | null;
  recentBlockUsd: Record<string, number[]>;
  mile: MilestoneState;
  poolTake: number;
  repairs: number;
  rebuilds: number;
  peakNetDay: number;
  today: DayTotals;
  yday: YdayTotals | null;
  unlocked: Record<string, boolean>;
  picker: string | null;
  sitePicker: unknown;
  rebuild: RebuildInProgress | null;
  focusRig: number | null;
  saveInfo: string;
  wipeArm: boolean;
  customParts: unknown[];
  design: DesignInProgress | null;
  catchUp: { credited: number; done: number } | null;
  shakeAt: number;
  shakeOn: unknown;
  onboardingDismissed: boolean;
  chainsNudgeDismissed: boolean;
  tourDismissed: boolean;
  tourReplay: boolean;
  feed: FeedItem[];
  feedId: number;
  toast: ToastState;
  tab: string;
  brokeNote?: number;
}

// The flat surface persistence.ts publishes to components via Pinia. Why
// it's named at all despite every member staying `any`:
// docs/implementation-notes.md#the-gamegameexports-types-srcgametypests
export interface GameExports {
  s: GameState;
  C: any;
  SHELLS: any;
  SOURCES: any;
  PLANTS: any;
  STORAGE: any;
  FABS: any;
  FAB: any;
  PSUS: any;
  DESIGN_AXES: any;
  MAX_AXIS_POINTS: any;
  designTotals: any;
  designStats: any;
  designCost: any;
  openDesign: any;
  closeDesign: any;
  bumpDesignPick: any;
  manufacturePart: any;
  liveTopOf: any;
  RISER: any;
  PART: any;
  SITEPART: any;
  jobPart: any;
  chain(id: string): ChainState | undefined;
  poolOf(id: string): Pool | null;
  active: ComputedRef<Site>;   // GameExports is the setup-store's raw return
                                // shape; defineStore's own typing unwraps
                                // refs/computeds for the store consumer
  price(c: ChainState): number;
  revPerMh(chain: ChainState): number;
  solarFactor: any;
  ambient: any;
  band: any;
  cards(): Card[];
  battKwh: any;
  battKw: any;
  sitePlan: any;
  srcOut: any;
  siteCapacity(site: Site): number;
  siteCooling(site: Site): number;
  sitePlantW(site: Site, extraHeat?: number): number;
  siteHeat(site: Site): number;
  throttleOf(site: Site): number;
  siteSlots(site: Site): number;
  siteRigs(site: Site): Rig[];
  siteDemand(site: Site): number;
  siteTemp(site: Site): number;
  siteCostPerHour(site: Site): number;
  rigLive(rig: Rig): boolean;
  rigHash(rig: Rig): number;
  rigWallW(rig: Rig): number;
  rigNet(rig: Rig): number;
  rigState(rig: Rig): RigState;
  rigWear(rig: Rig): number;
  totalHash: ComputedRef<number>;
  totalCapacity: any;
  headroom: any;
  binding: any;
  effMhw: any;
  revenueDay: any;
  powerDay: any;
  netDay: any;
  dayDelta: any;
  dayPaceDelta: any;
  walletUsd: any;
  runway: any;
  lifetimeNet: any;
  poolEarned: any;
  myHash: any;
  diffOf(chain: ChainState): number;
  mttb: any;
  dp: any;
  checks: any;
  canBuild: any;
  draftEff: any;
  buildTime: any;
  unitEcon: any;
  draftExpected: any;
  generatePreset: any;
  maxBuildQty: any;
  blockValue: any;
  bondReq: any;
  poolTrust(pool: Pool): number;
  TRUST_RAMP: any;
  poolCapLimit(pool: Pool): number;
  poolHash(pool: Pool): number;
  poolProfit(pool: Pool): number;
  withdrawProfit: any;
  battFirm(site: Site): number;
  flowOf: any;
  chainHash(chain: ChainState): number;
  easeOf(chain: ChainState): number;
  blockETA(chain: ChainState): number;
  blockProg(chain: ChainState): number;
  winChance(chain: ChainState): number;
  fundOf(chain: ChainState): number;
  groupAdvice(group: Group): GroupAdvice | null;
  chainCeiling(chain: ChainState | undefined, extraMh?: number): ChainCeiling | null;
  idleCashAdvice: any;
  draftGroup(): Group;
  battAdvice: any;
  myPools: any;
  foundPool: any;
  setPoolFee: any;
  renamePool: any;
  simsOn(chainId: string): number;
  poolRep(pool: Pool): number;
  repParts(pool: Pool): RepParts;
  rivalPools: any;
  poolDemand: any;
  poolProj: any;
  nextTierBond: any;
  poolPnl(pool: Pool): PoolPnl;
  addBond: any;
  releaseBond: any;
  capBinding: any;
  bondFloor: any;
  topUpBond: any;
  closePool: any;
  stepTick: any;
  build: any;
  scrapRig: any;
  swapWorn: any;
  expectedDay: any;
  powerRateDay: any;
  SLOT_OPTS: any;
  rebuildInfo: any;
  startRebuild: any;
  applyRebuild: any;
  toggleRig: any;
  setRigGroup: any;
  groupOf(rig: Rig): Group;
  groupHash(group: Group): number;
  groupRigs(group: Group): Rig[];
  setGroupChain: any;
  setGroupPool: any;
  addGroup: any;
  dropGroup: any;
  renameGroup: any;
  newSite: any;
  addSitePart: any;
  chooseFab: any;
  rush: any;
  rushCost: any;
  rushRig: any;
  rushRigCost: any;
  upgradeShell: any;
  renameSite: any;
  renameRig: any;
  decommissionSite: any;
  sell: any;
  buy: any;
  fleetMove: any;
  fleetMoveInfo: any;
  draftSpec: any;
  fleetSpecInfo: any;
  fleetToSpec: any;
  dripCost: any;
  dripWorst: any;
  setDrip: any;
  toggleHold: any;
  MILESTONES: any;
  RANKS: any;
  fleetWorn: any;
  rigWorn: any;
  fleetRepair: any;
  fleetRefitInfo: any;
  fleetRefit: any;
  onboardingStep: any;
  dismissOnboarding: any;
  showChainsNudge: any;
  dismissChainsNudge: any;
  TOUR_SLIDES: any;
  showTour: any;
  dismissTour: any;
  restartTour: any;
  saveNow: any;
  loadSave: any;
  wipeSave: any;
  exportSave: any;
  importSave: any;
  creditAway: any;
}

export interface Game {
  s: GameState;
  freshState(): GameState;
  spend(amount: number): void;
  __exports: GameExports;
  // Real signatures for the most-used members, typed from their actual
  // definitions (dispatch.ts, timeOfDay.ts) rather than guessed. Computeds
  // here keep .value — this is the internal, pre-Pinia-unwrap surface every
  // game/*.ts installer reads; see GameExports below for the published,
  // auto-unwrapped versions of the same names.
  siteRigs(site: Site): Rig[];
  rigHash(rig: Rig): number;
  rigLive(rig: Rig): boolean;
  rigWear(rig: Rig): number;
  rigNet(rig: Rig): number;
  rigState(rig: Rig): RigState;
  groupOf(rig: Rig): Group;
  groupHash(group: Group): number;
  totalHash: ComputedRef<number>;
  siteSlots(site: Site): number;
  siteCapacity(site: Site): number;
  siteDemand(site: Site): number;
  siteTemp(site: Site): number;
  battFirm(site: Site): number;
  revPerMh(chain: ChainState): number;
  chain(id: string): ChainState | undefined;
  active: ComputedRef<Site>;
  price(c: ChainState): number;
  site(id: number): Site | undefined;
  rig(id: number): Rig | undefined;
  poolOf(id: string): Pool | null;
  evMult(p: { fee: number; scheme: string } | null): number;
  rigWallW(rig: Rig): number;
  siteCostPerHour(site: Site): number;
  groupRigs(group: Group): Rig[];
  chainHash(chain: ChainState): number;
  diffOf(chain: ChainState): number;
  easeOf(chain: ChainState): number;
  blockETA(chain: ChainState): number;
  blockProg(chain: ChainState): number;
  winChance(chain: ChainState): number;
  fundOf(chain: ChainState): number;
  poolHash(pool: Pool): number;
  poolTrust(pool: Pool): number;
  groupAdvice(group: Group): GroupAdvice | null;
  chainCeiling(chain: ChainState | undefined, extraMh?: number): ChainCeiling | null;
  // PART/SITEPART/FAB return discriminated unions (Part = Frame|Mobo|Psu|
  // Cooler|Card, SitePart = Shell|Source|Storage|Plant) accessed duck-typed
  // by every caller, exactly like dispatch.ts's SP/P — narrowing the return
  // type would mean threading a type guard through dozens of call sites for
  // no caught bug, since a field that doesn't exist on the wrong variant
  // already fails loudly at runtime.
  PART: any;
  SITEPART: any;
  FAB: any;
  siteHeat(site: Site): number;
  sitePlantW(site: Site, extraHeat?: number): number;
  siteCooling(site: Site): number;
  throttleOf(site: Site): number;
  draftGroup(): Group;
  poolCapLimit(pool: Pool): number;
  poolPnl(pool: Pool): PoolPnl;
  poolProfit(pool: Pool): number;
  repParts(pool: Pool): RepParts;
  poolRep(pool: Pool): number;
  simsOn(chainId: string): number;
  cards(): Card[];
  [key: string]: any;
}
