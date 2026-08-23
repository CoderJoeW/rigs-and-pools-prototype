import { reactive } from 'vue';

// Audio service — synthesized cues, own localStorage key, not a game/*.js
// module. Full rationale: docs/implementation-notes.md#audio-service-srcservicesaudiojs.

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext }
}

const KEY = 'rigs-and-pools-audio';

type VoiceName = 'rankup' | 'jackpot' | 'block';

const CUE: Record<string, VoiceName> = { rankup:'rankup', jackpot:'jackpot', record:'jackpot', block:'block' };

// Real-millisecond cooldowns, immune to the speed multiplier: docs/implementation-notes.md.
const COOLDOWN: Record<VoiceName, number> = { block:1200, jackpot:600, rankup:0 };

const VOLUMES = [0, 0.45, 0.9];       // the pill cycles through these

export const sfx = reactive({
  volume: 0,   // default silent, deliberately — docs/implementation-notes.md
  ready: false,        // a running AudioContext exists
  busy: false,         // offline catch-up is replaying hours; stay quiet
  plays: 0,            // observable counters — the e2e check reads these
  last: '',
});

/* ---- preference ---- */
function loadPref(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (v && typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1) sfx.volume = v.volume;
  } catch { /* private mode, quota, hand-edited junk — stay at the default */ }
}
function savePref(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify({ volume: sfx.volume }));
  } catch { /* ignore */ }
}
loadPref();

/* ---- the context, created only inside a gesture ---- */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const lastAt: Record<string, number> = Object.create(null);

// Never constructed at import/page load — must be inside a user gesture:
// docs/implementation-notes.md#audio-service-srcservicesaudiojs.
export function unlock(): boolean {
  if (typeof window === 'undefined') return false;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return false;                       // jsdom, Node, ancient browsers
  try {
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    sfx.ready = ctx.state === 'running';
    return true;
  } catch (e) {
    // Logged, not silently swallowed — docs/implementation-notes.md.
    console.warn('audio unavailable:', e instanceof Error ? e.message : e);
    ctx = null; master = null; sfx.ready = false; return false;
  }
}

interface VoiceOpts { type?: OscillatorType; f: number; to?: number; dur: number; peak: number; attack?: number }

/* ---- voices ---- */
// Envelopes start/end at 0.0001, not 0 — see docs/implementation-notes.md.
function voice(out: AudioNode, at: number, o: VoiceOpts): void {
  const osc = ctx!.createOscillator(), g = ctx!.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + o.dur);
  const peak = Math.max(0.0002, o.peak);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + (o.attack || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  osc.connect(g); g.connect(out);
  osc.start(at); osc.stop(at + o.dur + 0.03);
}

// Three cues, deliberately unequal in weight: docs/implementation-notes.md.
const VOICES: Record<VoiceName, (out: AudioNode, t: number) => void> = {
  // routine income: a soft, short, falling blip. Nothing to notice twice.
  block(out, t) {
    voice(out, t, { f:1318, to:988, dur:0.10, type:'sine', peak:0.27 });
  },
  // a payout far above the usual: same family, but a rising major triad with
  // a low sine under it for body, so it reads as bigger without being louder.
  jackpot(out, t) {
    voice(out, t,        { f:784,  dur:0.16, type:'triangle', peak:0.22 });
    voice(out, t + 0.07, { f:1046, dur:0.16, type:'triangle', peak:0.22 });
    voice(out, t + 0.14, { f:1318, dur:0.30, type:'triangle', peak:0.24 });
    voice(out, t,        { f:523,  dur:0.45, type:'sine',     peak:0.11, attack:0.02 });
  },
  // five or six times in a whole run: a four-note rise in fifths through a
  // opening lowpass, with the last note held. The only cue with a tail.
  rankup(out, t) {
    const lp = ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.exponentialRampToValueAtTime(6000, t + 0.5);
    lp.connect(out);
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      const at = t + i * 0.105, last = i === notes.length - 1;
      voice(lp, at, { f, dur: last ? 0.95 : 0.22, type:'triangle', peak:0.22,
                      attack: last ? 0.03 : 0.008 });
      voice(lp, at, { f: f * 1.5, dur: last ? 0.95 : 0.22, type:'sine', peak:0.09,
                      attack: last ? 0.03 : 0.008 });
    });
  },
};

/* ---- playing ---- */
export function play(name: string): boolean {
  if (!VOICES[name as VoiceName]) return false;
  if (sfx.volume <= 0 || sfx.busy) return false;
  const now = Date.now();
  if (now - (lastAt[name] ?? -1e9) < (COOLDOWN[name as VoiceName] || 0)) return false;
  if (!ctx || !master) return false;                 // no gesture yet, or no Web Audio
  if (ctx.state !== 'running') {                      // suspended/interrupted tab
    if (ctx.resume) ctx.resume().catch(() => {});
    sfx.ready = false;
    return false;                                   // never queue into a stopped clock
  }
  sfx.ready = true;
  try {
    master.gain.setValueAtTime(sfx.volume, ctx.currentTime);
    VOICES[name as VoiceName](master, ctx.currentTime + 0.005);
  } catch { return false; }
  lastAt[name] = now;
  sfx.plays++; sfx.last = name;
  // Test seam, nothing in-app listens: docs/implementation-notes.md.
  try { window.dispatchEvent(new CustomEvent('rp-sfx', { detail:{ name, plays: sfx.plays } })); }
  catch { /* ignore */ }
  return true;
}

/* The single entry point pop() uses: hand it a toast's class and kind and it
   works out whether that moment has a sound. */
export function cue(cls: string | undefined, kind: string | undefined): void {
  const name = (cls && CUE[cls]) || (kind && CUE[kind]);
  if (name) play(name);
}

/* ---- the control ---- */
// 3-state pill, not a slider: docs/implementation-notes.md.
export function cycleVolume(): number {
  const i = VOLUMES.indexOf(sfx.volume);
  sfx.volume = VOLUMES[(i < 0 ? 0 : i + 1) % VOLUMES.length]!;
  savePref();
  if (sfx.volume > 0) {
    unlock();                 // we are inside the click, which is the whole point
    delete lastAt.block;      // the confirmation is a gesture, not a game event
    play('block');            // and confirm, at the level just chosen
  }
  return sfx.volume;
}

export function setVolume(v: number): void {
  sfx.volume = Math.max(0, Math.min(1, Number(v) || 0));
  savePref();
}

/* Label for the pill. Kept here so the component has no state logic. */
export function volumeLabel(): string {
  if (sfx.volume <= 0) return 'muted';
  return sfx.volume >= VOLUMES[2]! ? 'sound +' : 'sound';
}

/* Armed once from main.ts: a returning player already has sound on, but the
   context still cannot exist until they touch something. */
export function armUnlock(): void {
  if (typeof document === 'undefined') return;
  const go = () => {
    document.removeEventListener('pointerdown', go);
    document.removeEventListener('keydown', go);
    if (sfx.volume > 0) unlock();
  };
  document.addEventListener('pointerdown', go, { passive:true });
  document.addEventListener('keydown', go);
}

export const AUDIO_KEY = KEY;
