// Shared shape of the game's reactive state (`G.s`) and its assembled
// runtime context (`G`), which stores/game.js's `createGame` builds by
// running every game/*.js installer over one object in sequence.
//
// `G` is intentionally an evolving, partly-loose type: the installers each
// contribute fields/methods to the same object (see stores/game.js's own
// comment on install order), so this file grows a real, named member for
// each piece as its owning installer is converted to TypeScript, while an
// index signature covers whatever the remaining .js installers still add.
// That mirrors the object's own assembly — nothing here claims a precision
// the untyped half of the codebase can't back up yet.

import type { Chain } from '../data/chains.js';
import type { DayWeather } from '../services/weatherService.js';

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
  storage: SiteStorage[];
  batt: number;
  gridCharge: boolean;
  disAny: boolean;
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

export interface ToastState { n: number; text: string; amount: string; cls: string }

export interface FeedItem {
  id: number; t: string; kind: string; text: string; amount: string;
  num?: number; usd?: number; n: number;
}

export interface MilestoneState { done: Record<string, number>; rank: number }

export interface DesignInProgress { fid: number; kind: import('../data/customParts.js').DesignKind; picks: Record<string, number> }

export interface RebuildDraft { frame: string; mobo: string; cool: string; psu: string; unit: string; n: number }
export interface RebuildInProgress { rig: number; picker: string | null; draft: RebuildDraft }

// Rigs and pools are assembled across several not-fully-typed installers
// (buildDraft.js, pools.js, poolMarket.js); their shapes stay loose until
// those call sites are worth tightening together.
export type Rig = any;
export type Pool = any;

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
  yday: DayTotals | null;
  unlocked: Record<string, boolean>;
  picker: string | null;
  sitePicker: unknown;
  rebuild: RebuildInProgress | null;
  focusRig: unknown;
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

// The assembled game context. Every game/*.js installer still contributes
// through the index signature until it converts; a converted installer
// adds its real members here instead.
// The flat, hand-maintained surface persistence.ts publishes to components
// via Pinia (`G.__exports`, returned verbatim as the store's setup-store
// body). Named here — even though every member is still `any` — purely so
// Pinia's defineStore can infer a real object type for the store: an
// index-signature-only type collapses to `any` as a whole and every
// `g.xxx` access in a component would fail to resolve at all. `s` gets the
// one member precise enough to be cheap and worth it; the rest stay `any`
// until it's worth naming their real types too.
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
  chain: any;
  poolOf: any;
  active: any;
  price: any;
  revPerMh: any;
  solarFactor: any;
  ambient: any;
  band: any;
  cards: any;
  battKwh: any;
  battKw: any;
  sitePlan: any;
  srcOut: any;
  siteCapacity: any;
  siteCooling: any;
  sitePlantW: any;
  siteHeat: any;
  throttleOf: any;
  siteSlots: any;
  siteRigs: any;
  siteDemand: any;
  siteTemp: any;
  siteCostPerHour: any;
  rigLive: any;
  rigHash: any;
  rigWallW: any;
  rigNet: any;
  rigState: any;
  rigWear: any;
  totalHash: any;
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
  diffOf: any;
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
  poolTrust: any;
  TRUST_RAMP: any;
  poolCapLimit: any;
  poolHash: any;
  poolProfit: any;
  withdrawProfit: any;
  battFirm: any;
  flowOf: any;
  chainHash: any;
  easeOf: any;
  blockETA: any;
  blockProg: any;
  winChance: any;
  fundOf: any;
  groupAdvice: any;
  chainCeiling: any;
  idleCashAdvice: any;
  draftGroup: any;
  battAdvice: any;
  myPools: any;
  foundPool: any;
  setPoolFee: any;
  renamePool: any;
  simsOn: any;
  poolRep: any;
  repParts: any;
  rivalPools: any;
  poolDemand: any;
  poolProj: any;
  nextTierBond: any;
  poolPnl: any;
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
  groupOf: any;
  groupHash: any;
  groupRigs: any;
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
  [key: string]: any;
}
