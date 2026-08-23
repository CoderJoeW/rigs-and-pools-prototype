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

export interface MilestoneState { done: Record<string, number>; rank: number }

export interface DesignInProgress { fid: number; kind: import('../data/customParts.js').DesignKind; picks: Record<string, number> }

// Rigs, pools and sims are still assembled by not-yet-converted installers
// (buildDraft.js, pools.js, poolMarket.js, sims.js); their shapes will move
// from `any` to real interfaces as those files convert.
export type Rig = any;
export type Pool = any;
export type Sim = any;

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
  recentBlockUsd: Record<string, number>;
  mile: MilestoneState;
  poolTake: number;
  repairs: number;
  rebuilds: number;
  peakNetDay: number;
  today: DayTotals;
  yday: DayTotals | null;
  unlocked: Record<string, boolean>;
  picker: unknown;
  sitePicker: unknown;
  rebuild: unknown;
  focusRig: unknown;
  saveInfo: string;
  wipeArm: boolean;
  customParts: unknown[];
  design: DesignInProgress | null;
  catchUp: unknown;
  shakeAt: number;
  shakeOn: unknown;
  onboardingDismissed: boolean;
  chainsNudgeDismissed: boolean;
  tourDismissed: boolean;
  tourReplay: boolean;
  feed: unknown[];
  feedId: number;
  toast: ToastState;
  tab: string;
  brokeNote?: number;
}

// The assembled game context. Every game/*.js installer still contributes
// through the index signature until it converts; a converted installer
// adds its real members here instead.
export interface Game {
  s: GameState;
  freshState(): GameState;
  spend(amount: number): void;
  [key: string]: any;
}
