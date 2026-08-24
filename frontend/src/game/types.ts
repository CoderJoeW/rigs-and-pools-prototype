// Shared shape of the game's reactive state (`G.s`) and its assembled
// runtime context (`G`), built by running every game/*.ts installer over
// one object in sequence (stores/game.ts). Why this type is deliberately
// partly-loose: docs/implementation-notes.md#the-gamegameexports-types-srcgametypests

import type { Chain } from '../data/chains.js';
import type { DayWeather } from '../services/weatherService.js';
import type { ComputedRef } from 'vue';
import type { Card, Psu, Frame, Mobo, Cooler } from '../data/hardware.js';
import type { Job, Shell, Source, Storage, Plant, SitePart } from '../data/site-parts.js';
import type { DesignKind, DesignPicks, DesignAxis, DesignBase } from '../data/customParts.js';
import type { Fab } from '../data/fab.js';
import type { Milestone } from '../data/milestones.js';

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

// A manufactured part (game/fab.ts's manufacturePart): stats are whatever
// designStats(kind, picks) produced for that axis set, spread alongside the
// shared fields below — same duck-typed-union rationale as PART/SITEPART,
// so callers index into it dynamically rather than declaring every stat key.
export interface CustomPart {
  id: string; name: string; kind: DesignKind; price: number; custom: true;
  [stat: string]: unknown;
}

// BuildView's FIELDS rows, read by PartPickerSheet. `part`/`sub`'s parameter
// are duck-typed like PART/SITEPART below — g.PART(x.unit) is one of five
// unrelated shapes, read here without a runtime discriminant check.
export interface PickerField { k: DesignKind; label: string; job: string; qty: number; part: DesignBase; sub: (p: DesignBase) => string }
export interface CardLimit { n: number; by: string; frame: number; mobo: number }

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

// dispatch.ts's battAdvice(site): a one-line verdict on whether the
// battery is sized right for the load.
export interface BattAdvice { warn: boolean; text: string }
// pools.ts's dripWorst(): the coin the current drip setting slips worst,
// worth naming in the UI.
export interface DripWorst { c: ChainState; cost: number; at25: number }
// buildDraft.ts's unitEcon(unit): one card's own economics, isolated from
// the rest of the draft.
export interface UnitEcon { net: number; wall: number; payback: number; perKw: number; mhw: number }

// dispatch.ts's sitePlan(site): how this tick's demand is met — renewables,
// battery, grid — before it's turned into a bill or a flow chart.
export interface SitePlan {
  load: number; renew: number; chW: number; disW: number; gridChW: number;
  paidW: number; cost: number; unserved: number; firm: number;
}
// fleetActions.ts's rigWorn(rig, threshold)/pools.ts's fleetWorn: how many
// cards are past a wear threshold, and what replacing them costs.
export interface WornInfo { n: number; cost: number }
// customParts.ts's designTotals(kind, picks): a design's running cost so far.
export interface DesignTotals { budget: number; cash: number; points: number }

// onboarding.ts's TOUR_SLIDES: the scripted walkthrough's script.
export interface TourSlide { tab: string; target: string; title: string; body: string }

// fleetActions.ts: one site (id), the whole farm (null/undefined), or an
// explicit list of rig ids — every fleet action's scope argument.
export type Scope = number | number[] | null | undefined;
export interface FleetWornInfo { rigs: number; n: number; cost: number }
export interface FleetRefitInfo { rigs: number; cost: number }
export interface FleetMoveInfo { rigs: number; hash: number }
export interface FleetSpecInfo { rigs: number; cost: number; already: number; blocked: number; why: string | null }

// buildDraft.ts's dp/checks: the draft's own pricing and the gates canBuild checks.
export interface DraftPricing { maxSlots: number; coreW: number; psu: Psu; unit: Card; conn: number; mh: number; air: number; cost: number; wall: number }
// key lets useBuildVerdict.ts group checks into verdict sections by name
// instead of by array position, so reordering buildDraft.ts's checks.push
// calls can't silently misfile a check under the wrong heading.
export type DraftCheckKey = 'slots' | 'psuDraw' | 'psuConn' | 'floor' | 'power' | 'cash';
export interface DraftCheck { key: DraftCheckKey; ok: boolean; title: string; label: string; fix: string }
// buildDraft.ts's draftExpected: the draft's pre-purchase revenue/cost estimate.
export interface DraftExpected { rev: number; pow: number; net: number; payback: number }

// onboarding.ts's STEPS: the reactive coach's script, one entry per nudge.
export interface OnboardingStep { id: string; done: (G: Game) => boolean; text: string }

// dispatch.ts's flowOf(site): the power-flow bars SitesView draws.
export interface FlowInfo {
  load: number; rigs: number; cool: number; inRenew: number; inBatt: number;
  inPaid: number; charge: number; spare: number; unserved: number; cap: number;
}
// dispatch.ts's idleCashAdvice: "you can afford another rig" nudge, or null.
export interface IdleCashAdvice { site: Site; cost: number; open: number }

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
  picker: DesignKind | null;
  sitePicker: unknown;
  rebuild: RebuildInProgress | null;
  focusRig: number | null;
  saveInfo: string;
  wipeArm: boolean;
  customParts: CustomPart[];
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
  C: typeof import('../data/constants.js').C;
  SHELLS: Shell[];
  SOURCES: Source[];
  PLANTS: Plant[];
  STORAGE: Storage[];
  FABS: Fab[];
  FAB(id: string): Fab | undefined;
  PSUS: Psu[];
  DESIGN_AXES: Record<DesignKind, DesignAxis[]>;
  MAX_AXIS_POINTS: number;
  designTotals(kind: DesignKind, picks: DesignPicks): DesignTotals;
  designStats(kind: DesignKind, picks: DesignPicks, liveTop?: DesignBase): Record<string, unknown>;
  designCost(kind: DesignKind, picks: DesignPicks, liveTop?: DesignBase): { buildCash: number; hours: number; unitPrice: number };
  openDesign(fid: number, kind: DesignKind): void;
  closeDesign(): void;
  bumpDesignPick(axisKey: string, delta: number): void;
  manufacturePart(): void;
  liveTopOf(kind: DesignKind): DesignBase | undefined;
  RISER: { name: string; w: number; price: number };
  PART: any;
  SITEPART: any;
  jobPart(job: Job): { name: string; price: number } | Fab | SitePart | undefined;
  chain(id: string): ChainState | undefined;
  poolOf(id: string): Pool | null;
  active: ComputedRef<Site>;   // GameExports is the setup-store's raw return
                                // shape; defineStore's own typing unwraps
                                // refs/computeds for the store consumer
  price(c: ChainState): number;
  revPerMh(chain: ChainState): number;
  solarFactor: ComputedRef<number>;
  ambient: ComputedRef<number>;
  band: ComputedRef<'off' | 'peak' | 'shoulder'>;
  cards(): Card[];
  battKwh(site: Site): number;
  battKw(site: Site): number;
  sitePlan(site: Site): SitePlan;
  srcOut(site: Site, src: { p: string; n: number }): number;
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
  totalCapacity: ComputedRef<number>;
  headroom: ComputedRef<number>;
  binding: ComputedRef<'power' | 'cash'>;
  effMhw: ComputedRef<number>;
  revenueDay: ComputedRef<number>;
  powerDay: ComputedRef<number>;
  netDay: ComputedRef<number>;
  dayDelta(key: string, now: number): number | null;
  dayPaceDelta(key: string, now: number): number | null;
  walletUsd: ComputedRef<number>;
  runway: ComputedRef<number>;
  lifetimeNet: ComputedRef<number>;
  poolEarned: ComputedRef<number>;
  myHash(chain: ChainState): number;
  diffOf(chain: ChainState): number;
  mttb(chain: ChainState): number;
  dp: ComputedRef<DraftPricing>;
  checks: ComputedRef<DraftCheck[]>;
  canBuild: ComputedRef<boolean>;
  draftEff: ComputedRef<number>;
  buildTime: ComputedRef<number>;
  unitEcon(unit: Card): UnitEcon;
  draftExpected: ComputedRef<DraftExpected>;
  generatePreset(): boolean;
  maxBuildQty(): number;
  blockValue(c: ChainState): number;
  bondReq(c: ChainState, scheme: 'PPS' | 'PPLNS'): number;
  poolTrust(pool: Pool): number;
  TRUST_RAMP: number;
  poolCapLimit(pool: Pool): number;
  poolHash(pool: Pool): number;
  poolProfit(pool: Pool): number;
  withdrawProfit(pool: Pool): void;
  battFirm(site: Site): number;
  flowOf(site: Site): FlowInfo;
  chainHash(chain: ChainState): number;
  easeOf(chain: ChainState): number;
  blockETA(chain: ChainState): number;
  blockProg(chain: ChainState): number;
  winChance(chain: ChainState): number;
  fundOf(chain: ChainState): number;
  groupAdvice(group: Group): GroupAdvice | null;
  chainCeiling(chain: ChainState | undefined, extraMh?: number): ChainCeiling | null;
  idleCashAdvice: ComputedRef<IdleCashAdvice | null>;
  draftGroup(): Group;
  battAdvice(site: Site): BattAdvice | null;
  myPools: ComputedRef<Pool[]>;
  foundPool(chainId: string, scheme: 'PPS' | 'PPLNS', fee: number): void;
  setPoolFee(pool: Pool, fee: number): void;
  renamePool(pool: Pool, name: string): void;
  simsOn(chainId: string): number;
  poolRep(pool: Pool): number;
  repParts(pool: Pool): RepParts;
  rivalPools: ComputedRef<Pool[]>;
  poolDemand(p: Pool, fee?: number): number;
  poolProj(p: Pool, fee?: number): number;
  nextTierBond(p: Pool): number;
  poolPnl(pool: Pool): PoolPnl;
  addBond(pool: Pool, amount: number): void;
  releaseBond(pool: Pool, amount: number): void;
  capBinding(pool: Pool): string;
  bondFloor(pool: Pool): number;
  topUpBond(pool: Pool, amount: number): void;
  closePool(pool: Pool): void;
  stepTick(dtOverride?: number): void;
  build(qty?: number): void;
  scrapRig(id: number): void;
  swapWorn(id: number, th: number): void;
  expectedDay: ComputedRef<number>;
  powerRateDay: ComputedRef<number>;
  SLOT_OPTS: { frame: Frame[]; mobo: Mobo[]; cool: Cooler[]; psu: Psu[] };
  rebuildInfo(rig: Rig, draft: RebuildDraft): RebuildInfo;
  startRebuild(rig: Rig): void;
  applyRebuild(): void;
  toggleRig(id: number): void;
  setRigGroup(rig: Rig, groupId: number): void;
  groupOf(rig: Rig): Group;
  groupHash(group: Group): number;
  groupRigs(group: Group): Rig[];
  setGroupChain(group: Group, chainId: string): void;
  setGroupPool(group: Group, poolId: string): void;
  addGroup(): Group;
  dropGroup(group: Group): void;
  renameGroup(group: Group, name: string): void;
  newSite(shellId: string): void;
  addSitePart(fid: number, pid: string, kind: 'source' | 'storage' | string): void;
  chooseFab(fid: number, fabId: string): void;
  rush(fid: number, idx: number): void;
  rushCost(job: Job): number;
  rushRig(id: number): void;
  rushRigCost(rig: Rig): number;
  upgradeShell(fid: number, shellId: string): void;
  renameSite(fid: number, name: string): void;
  renameRig(id: number, name: string): void;
  decommissionSite(fid: number): void;
  sell(chainId: string, frac: number): void;
  buy(chainId: string, frac: number): void;
  fleetMove(groupId: number, scope: Scope): void;
  fleetMoveInfo(groupId: number, scope: Scope): FleetMoveInfo;
  draftSpec(): RebuildDraft;
  fleetSpecInfo(draft: RebuildDraft, scope: Scope): FleetSpecInfo;
  fleetToSpec(draft: RebuildDraft, scope: Scope): void;
  dripCost(chain: ChainState, frac?: number): number;
  dripWorst(): DripWorst | null;
  setDrip(key: 'on', value: boolean): void;
  setDrip(key: 'frac' | 'hours', value: number): void;
  toggleHold(chainId: string): void;
  MILESTONES: Milestone[];
  RANKS: [number, string][];
  fleetWorn(threshold: number, scope: Scope): FleetWornInfo;
  rigWorn(rig: Rig, threshold: number): WornInfo;
  fleetRepair(threshold: number, scope: Scope): void;
  fleetRefitInfo(unitId: string, scope: Scope): FleetRefitInfo;
  fleetRefit(unitId: string, scope: Scope): void;
  onboardingStep: ComputedRef<OnboardingStep | null>;
  dismissOnboarding(): void;
  showChainsNudge: ComputedRef<boolean>;
  dismissChainsNudge(): void;
  TOUR_SLIDES: TourSlide[];
  showTour: ComputedRef<boolean>;
  dismissTour(): void;
  restartTour(): void;
  saveNow(): Promise<void>;
  loadSave(): Promise<boolean>;
  wipeSave(): Promise<void>;
  exportSave(): string;
  importSave(text: string): Promise<boolean>;
  creditAway(away: number): Promise<number>;
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
  // Duck-typed union rationale: docs/implementation-notes.md#duck-typed-part-lookups-part-sitepart-in-srcgametypests-sp-p-in-srcgamedispatchts.
  PART: any;
  SITEPART: any;
  FAB(id: string): Fab | undefined;
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
  battAdvice(site: Site): BattAdvice | null;
  dripWorst(): DripWorst | null;
  unitEcon(unit: Card): UnitEcon;
  sell(chainId: string, frac: number): void;
  buy(chainId: string, frac: number): void;
  toggleRig(id: number): void;
  startRebuild(rig: Rig): void;
  setGroupPool(group: Group, poolId: string): void;
  addSitePart(fid: number, pid: string, kind: 'source' | 'storage' | string): void;
  addBond(pool: Pool, amount: number): void;
  rushCost(job: Job): number;
  rushRigCost(rig: Rig): number;
  capBinding(pool: Pool): string;
  dayDelta(key: string, now: number): number | null;
  dayPaceDelta(key: string, now: number): number | null;
  draftSpec(): RebuildDraft;
  exportSave(): string;
  closeDesign(): void;
  bumpDesignPick(axisKey: string, delta: number): void;
  dismissTour(): void;
  withdrawProfit(pool: Pool): void;
  wipeSave(): Promise<void>;
  upgradeShell(fid: number, shellId: string): void;
  topUpBond(pool: Pool, amount: number): void;
  toggleHold(chainId: string): void;
  swapWorn(id: number, th: number): void;
  srcOut(site: Site, src: { p: string; n: number }): number;
  sitePlan(site: Site): SitePlan;
  setRigGroup(rig: Rig, groupId: number): void;
  setPoolFee(pool: Pool, fee: number): void;
  setGroupChain(group: Group, chainId: string): void;
  scrapRig(id: number): void;
  rushRig(id: number): void;
  rush(fid: number, idx: number): void;
  rigWorn(rig: Rig, threshold: number): WornInfo;
  restartTour(): void;
  renameSite(fid: number, name: string): void;
  renameRig(id: number, name: string): void;
  renamePool(pool: Pool, name: string): void;
  renameGroup(group: Group, name: string): void;
  releaseBond(pool: Pool, amount: number): void;
  rebuildInfo(rig: Rig, draft: RebuildDraft): RebuildInfo;
  setDrip(key: 'on', value: boolean): void;
  setDrip(key: 'frac' | 'hours', value: number): void;
  designTotals(kind: DesignKind, picks: DesignPicks): DesignTotals;
  SHELLS: Shell[];
  SOURCES: Source[];
  PLANTS: Plant[];
  STORAGE: Storage[];
  FABS: Fab[];
  PSUS: Psu[];
  DESIGN_AXES: Record<DesignKind, DesignAxis[]>;
  MAX_AXIS_POINTS: number;
  RISER: { name: string; w: number; price: number };
  MILESTONES: Milestone[];
  RANKS: [number, string][];
  TOUR_SLIDES: TourSlide[];
  jobPart(job: Job): { name: string; price: number } | Fab | SitePart | undefined;
  designStats(kind: DesignKind, picks: DesignPicks, liveTop?: DesignBase): Record<string, unknown>;
  designCost(kind: DesignKind, picks: DesignPicks, liveTop?: DesignBase): { buildCash: number; hours: number; unitPrice: number };
  openDesign(fid: number, kind: DesignKind): void;
  manufacturePart(): void;
  liveTopOf(kind: DesignKind): DesignBase | undefined;
  revenueDay: ComputedRef<number>;
  powerDay: ComputedRef<number>;
  netDay: ComputedRef<number>;
  expectedDay: ComputedRef<number>;
  powerRateDay: ComputedRef<number>;
  walletUsd: ComputedRef<number>;
  runway: ComputedRef<number>;
  poolEarned: ComputedRef<number>;
  lifetimeNet: ComputedRef<number>;
  myHash(chain: ChainState): number;
  mttb(chain: ChainState): number;
  foundPool(chainId: string, scheme: 'PPS' | 'PPLNS', fee: number): void;
  myPools: ComputedRef<Pool[]>;
  rivalPools: ComputedRef<Pool[]>;
  poolDemand(p: Pool, fee?: number): number;
  poolProj(p: Pool, fee?: number): number;
  nextTierBond(p: Pool): number;
  bondFloor(pool: Pool): number;
  closePool(pool: Pool): void;
  fleetWorn(threshold: number, scope: Scope): FleetWornInfo;
  fleetRepair(threshold: number, scope: Scope): void;
  fleetRefitInfo(unitId: string, scope: Scope): FleetRefitInfo;
  fleetRefit(unitId: string, scope: Scope): void;
  fleetSpecInfo(draft: RebuildDraft, scope: Scope): FleetSpecInfo;
  fleetToSpec(draft: RebuildDraft, scope: Scope): void;
  fleetMoveInfo(groupId: number, scope: Scope): FleetMoveInfo;
  fleetMove(groupId: number, scope: Scope): void;
  C: typeof import('../data/constants.js').C;
  TRUST_RAMP: number;
  SLOT_OPTS: { frame: Frame[]; mobo: Mobo[]; cool: Cooler[]; psu: Psu[] };
  dp: ComputedRef<DraftPricing>;
  checks: ComputedRef<DraftCheck[]>;
  canBuild: ComputedRef<boolean>;
  draftEff: ComputedRef<number>;
  buildTime: ComputedRef<number>;
  draftExpected: ComputedRef<DraftExpected>;
  stepTick(dtOverride?: number): void;
  build(qty?: number): void;
  generatePreset(): boolean;
  maxBuildQty(): number;
  blockValue(c: ChainState): number;
  bondReq(c: ChainState, scheme: 'PPS' | 'PPLNS'): number;
  applyRebuild(): void;
  addGroup(): Group;
  dropGroup(group: Group): void;
  newSite(shellId: string): void;
  chooseFab(fid: number, fabId: string): void;
  decommissionSite(fid: number): void;
  dripCost(chain: ChainState, frac?: number): number;
  onboardingStep: ComputedRef<OnboardingStep | null>;
  dismissOnboarding(): void;
  showChainsNudge: ComputedRef<boolean>;
  dismissChainsNudge(): void;
  showTour: ComputedRef<boolean>;
  saveNow(): Promise<void>;
  loadSave(): Promise<boolean>;
  importSave(text: string): Promise<boolean>;
  creditAway(away: number): Promise<number>;
  band: ComputedRef<'off' | 'peak' | 'shoulder'>;
  solarFactor: ComputedRef<number>;
  ambient: ComputedRef<number>;
  battKwh(site: Site): number;
  battKw(site: Site): number;
  totalCapacity: ComputedRef<number>;
  headroom: ComputedRef<number>;
  binding: ComputedRef<'power' | 'cash'>;
  effMhw: ComputedRef<number>;
  flowOf(site: Site): FlowInfo;
  idleCashAdvice: ComputedRef<IdleCashAdvice | null>;
  [key: string]: any;
}
