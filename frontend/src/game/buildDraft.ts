import { computed } from 'vue';
import { C } from '../data/constants.js';
import { FRAMES, MOBOS, COOLERS, PART, RISER, gpuCoreW } from '../data/hardware.js';
import { fmt } from '../utils/format.js';
import type { Game, Site, DraftPricing, DraftCheck } from './types.js';
import type { Frame, Mobo, Cooler, Card, Psu } from '../data/hardware.js';

// Same duck-typed-union rationale as dispatch.ts's SP/P: draft.kind picks
// between a GPU chassis part and an ASIC controller part with unrelated
// fields, read here without a runtime discriminant check.
const P = (id: string): any => PART(id);

// Installed into the shared context G — docs/implementation-notes.md#shared-context-g-module-pattern.
export function installBuildDraft(G: Game): void {
  const dp = computed<DraftPricing>(() => {
    const draft = G.s.draft, coolPart = P(draft.cool);
    let base: Omit<DraftPricing, 'wall'>;
    if (draft.kind === 'gpu') {
      const framePart = P(draft.frame), moboPart = P(draft.mobo), psuPart = P(draft.psu), unitPart = P(draft.unit);
      base = { maxSlots:Math.min(framePart.slots,moboPart.pcie), coreW:gpuCoreW(framePart,moboPart,coolPart,unitPart,draft.n),
        psu:psuPart, unit:unitPart, conn:draft.n*unitPart.conn, mh:draft.n*unitPart.mh, air:framePart.air*coolPart.fac,
        cost:framePart.price+moboPart.price+psuPart.price+coolPart.price+draft.n*(unitPart.price+RISER.price) };
    } else {
      const ctrlPart = P(draft.ctrl), psuPart = P(draft.psu), unitPart = P(draft.unit);
      base = { maxSlots:ctrlPart.boards, coreW:ctrlPart.w+coolPart.w+draft.n*unitPart.w, psu:psuPart, unit:unitPart, air:1.30*coolPart.fac,
        conn:draft.n*unitPart.conn, mh:draft.n*unitPart.mh, cost:ctrlPart.price+psuPart.price+coolPart.price+draft.n*unitPart.price };
    }
    // wall = core draw grossed up by supply efficiency, same relationship
    // rigWallW applies to a built rig — Build's hero and the Rigs list quote
    // the same figure for the same hardware.
    return { ...base, wall: base.coreW / base.psu.eff };
  });
  const checks = computed(() => {
    const draft = G.s.draft, draftInfo = dp.value, site = G.active.value, results: DraftCheck[] = [];
    const limitedBy = draft.kind === 'gpu'
      ? (P(draft.frame).slots <= P(draft.mobo).pcie ? 'the frame' : 'the motherboard') : 'the controller';
    results.push({ ok:draft.n<=draftInfo.maxSlots, title:'Cards fit the slots',
      label:draft.n+' units into '+draftInfo.maxSlots+' slots',
      fix:'The smaller of the frame and the board sets this — right now it is '+limitedBy+'.' });
    const cap = G.psuUsableW(draftInfo.psu);
    results.push({ ok:draftInfo.coreW<=cap, title:'Supply carries the draw',
      label:fmt.w(draftInfo.coreW)+' draw against '+fmt.w(cap)+' usable',
      fix:G.psuCarrying(draftInfo.coreW)+' would carry it.' });
    results.push({ ok:draftInfo.conn<=draftInfo.psu.conn, title:'Enough PCIe connectors',
      label:draftInfo.conn+' PCIe connectors, supply has '+draftInfo.psu.conn,
      fix:G.psuWithConn(draftInfo.conn)+' would fit.' });
    results.push({ ok:G.siteRigs(site).length<G.siteSlots(site), title:'Free position on the floor',
      label:'Floor space at '+site.name+': '+G.siteRigs(site).length+' of '+G.siteSlots(site),
      fix:'A bigger shell has more positions.' });
    const coolDelta = G.sitePlantW(site, draftInfo.coreW / Math.max(0.01, draftInfo.air)) - G.sitePlantW(site);
    const after = G.siteDemand(site) + draftInfo.coreW / draftInfo.psu.eff + coolDelta;
    results.push({ ok:after<=G.siteCapacity(site)+G.battFirm(site), title:'Power budget within limit',
      label:'Power at '+site.name+': '+fmt.w(after)+' of '
        +fmt.w(G.siteCapacity(site)+G.battFirm(site))+' available'
        +(coolDelta>1?' (incl. '+fmt.w(coolDelta)+' more cooling)':''),
      fix:'Install another source at this site.' });
    results.push({ ok:G.s.cash>=draftInfo.cost, title:'You can pay for it',
      label:'Parts cost '+fmt.usd(draftInfo.cost)+', you hold '+fmt.usd(G.s.cash),
      fix:'Short '+fmt.usd(draftInfo.cost-G.s.cash)+'.' });
    return results;
  });
  const canBuild = computed(() => checks.value.every((check: DraftCheck) => check.ok));
  const draftEff = computed(() => dp.value.coreW > 0 ? dp.value.mh / (dp.value.coreW / dp.value.psu.eff) : 0);
  const buildTime = computed(() => G.s.rigs.length === 0 ? 0 : C.BUILD_BASE * (0.6 + G.s.draft.n * 0.1));
  // Same shape as rigRev/rigPow so the pre-purchase estimate and the
  // running rig's netDay are the same calculation, never a separate
  // "sounds good" guess. Labelled 'expected' since netDay is realised.
  const draftExpected = computed(() => {
    const draftInfo = dp.value, site = G.active.value;
    const rev = draftInfo.mh * G.draftRate();
    const pow = (draftInfo.coreW / draftInfo.psu.eff) / 1000 * 24 * G.margRate(site);
    const net = rev - pow;
    return { rev, pow, net, payback: net > 0 ? draftInfo.cost / net : Infinity };
  });
  // Shared search behind generatePreset/openBuildCost — docs/implementation-notes.md#build-draft-search-srcgamebuilddraftts
  function* candidateBuilds(site: Site): Generator<{ unit: Card; n: number; frame: Frame; mobo: Mobo; cool: Cooler; core: number; psu: Psu }> {
    const flip = G.siteDemand(site) >= G.siteCapacity(site) * C.FLIP_AT;
    const pool = G.cards();
    const order = flip ? [...pool].sort((cardA: Card, cardB: Card) => (cardB.mh / cardB.w) - (cardA.mh / cardA.w)) : pool;
    const maxCards = Math.min(FRAMES[FRAMES.length - 1]!.slots, MOBOS[MOBOS.length - 1]!.pcie);
    for (const unit of order) {
      for (let n = maxCards; n >= 1; n--) {
        const frame = FRAMES.find(candidate => candidate.slots >= n);
        const mobo = MOBOS.find(candidate => candidate.pcie >= n);
        if (!frame || !mobo) continue;
        const cool = COOLERS[0]!;
        const core = gpuCoreW(frame, mobo, cool, unit, n);
        const psu = G.livePsus.find((candidate: Psu) => G.psuUsableW(candidate) >= core && candidate.conn >= n * unit.conn);
        if (!psu) continue;
        yield { unit, n, frame, mobo, cool, core, psu };
      }
    }
  }
  function generatePreset(): boolean {
    const site = G.active.value;
    const before = { ...G.s.draft };                 // restore this if nothing fits
    for (const { unit, n, frame, mobo, cool, psu } of candidateBuilds(site)) {
      G.s.draft.kind = 'gpu'; G.s.draft.frame = frame.id; G.s.draft.mobo = mobo.id;
      G.s.draft.cool = cool.id; G.s.draft.psu = psu.id; G.s.draft.unit = unit.id; G.s.draft.n = n;
      if (canBuild.value) return true;
    }
    Object.assign(G.s.draft, before);   // the search scribbles on the draft; put it back
    return false;
  }
  const unitEcon = (unit: Card) => {
    const site = G.active.value;
    const wall = unit.w / P(G.s.draft.psu).eff;
    const net = unit.mh * G.draftRate() - wall / 1000 * 24 * G.margRate(site);
    return { net, wall, payback: net > 0 ? unit.price / net : Infinity, perKw: net / (wall / 1000), mhw: unit.mh / unit.w };
  };
  // Why this exists separately from generatePreset: docs/implementation-notes.md#build-draft-search-srcgamebuilddraftts
  const siteRigsOpen = (site: Site) => G.siteSlots(site) - G.siteRigs(site).length;
  const openBuildCost = (site: Site): number | null => {
    if (siteRigsOpen(site) <= 0) return null;
    for (const { unit, n, frame, mobo, cool, core, psu } of candidateBuilds(site)) {
      const coolDelta = G.sitePlantW(site, core / Math.max(0.01, frame.air * cool.fac)) - G.sitePlantW(site);
      const after = G.siteDemand(site) + core / psu.eff + coolDelta;
      if (after > G.siteCapacity(site) + G.battFirm(site)) continue;
      return frame.price + mobo.price + cool.price + psu.price + n * (unit.price + RISER.price);
    }
    return null;
  };

  /* How many copies of the current draft fit right now — floor space,
     cash, and power (with cooling delta scaled by count). Used by bulk
     order on Build and by build(qty) itself so the clamp is one function. */
  function maxBuildQty(): number {
    if (!G.canBuild.value) return 0;
    const site = G.active.value, draftInfo = G.dp.value;
    const bySlots = G.siteSlots(site) - G.siteRigs(site).length;
    if (bySlots <= 0) return 0;
    const byCash = Math.floor(G.s.cash / draftInfo.cost);
    if (byCash <= 0) return 0;
    const heatEach = draftInfo.coreW / Math.max(0.01, draftInfo.air);
    const wallEach = draftInfo.coreW / draftInfo.psu.eff;
    const cap = G.siteCapacity(site) + G.battFirm(site);
    const baseDemand = G.siteDemand(site);
    const basePlant = G.sitePlantW(site);
    let maxPow = 0;
    // Walk up rather than binary-search: site shells top out well under a
    // hundred positions, and sitePlantW is cheap enough that the loop is
    // invisible next to a click.
    for (let qty = 1; qty <= Math.min(bySlots, byCash); qty++) {
      const coolDelta = G.sitePlantW(site, heatEach * qty) - basePlant;
      const after = baseDemand + wallEach * qty + coolDelta;
      if (after > cap) break;
      maxPow = qty;
    }
    return maxPow;
  }

  Object.assign(G, { buildTime, canBuild, checks, dp, draftEff, draftExpected, generatePreset, maxBuildQty, openBuildCost, unitEcon });
}
