import { reactive } from 'vue';

/* audio — three short synthesized cues, no asset files.

   WHY SYNTHESIS. Every sound here is built at play time from oscillators and
   gain envelopes, so the bundle gains nothing but this file: no audio assets
   to license, host, cache-bust or wait on before the first cue can fire.

   WHY A SERVICE, NOT A game/*.js MODULE. The game modules are installed into
   the shared context G because they read and write game state. Sound has no
   game state — it is a pure side effect with exactly one preference behind it,
   and that preference deliberately does NOT live in the save (see below). So
   it is a plain singleton, imported directly by the two places that need it,
   the same way src/services/storage.js is.

   WHY ITS OWN localStorage KEY, NOT g.s. `g.s.help`/`g.s.theme` were the
   obvious precedent, but everything in `g.s` is written into the save blob and
   is therefore also EXPORTED and IMPORTED (persistence.js hydrates with
   Object.assign(G.s, data.state)). Loading someone else's backup, or your own
   from another machine, would then reach across and unmute a device that was
   deliberately muted. Whether this browser tab is allowed to make noise is a
   property of the device and the moment, not of the run — so it gets its own
   key and survives a save wipe, an import, and starting a fresh game. */

const KEY = 'rigs-and-pools-audio';

/* Toast class first, then toast kind — pop()'s existing vocabulary, unchanged.
   Anything not named here stays silent, which is almost every toast: only the
   three moments issue #46 calls out actually earn a sound. */
const CUE = { rankup:'rankup', jackpot:'jackpot', record:'jackpot', block:'block' };

/* Cooldowns in REAL milliseconds, exactly like C.TOAST_GAP — a speed
   multiplier moves game time, not Date.now(), so 3600x cannot beat these.
   Tessera's 20 s blocks arrive every 20 000 real ms at 1x and every ~5.6 ms at
   3600x; the block cue is the one that has to survive that, so it carries the
   longest gap. A rank-up fires five or six times in an entire run and is never
   throttled. */
const COOLDOWN = { block:1200, jackpot:600, rankup:0 };

const VOLUMES = [0, 0.45, 0.9];       // the pill cycles through these

export const sfx = reactive({
  /* DEFAULT: SILENT. The issue floated "probably on, but quiet"; this errs
     the other way on purpose. A tab that starts making noise on its own is
     the one failure here that cannot be undone after the fact, and browser
     autoplay policy makes "on by default" a half-truth anyway — nothing can
     sound until the first gesture, so a default-on build's first cue lands
     unannounced in the middle of whatever the player just clicked. Opt-in,
     one visibly-labelled click away in the top bar, and remembered forever
     after. */
  volume: 0,
  ready: false,        // a running AudioContext exists
  busy: false,         // offline catch-up is replaying hours; stay quiet
  plays: 0,            // observable counters — the e2e check reads these
  last: '',
});

/* ---- preference ---- */
function loadPref(){
  try{
    if(typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(KEY);
    if(!raw) return;
    const v = JSON.parse(raw);
    if(v && typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1) sfx.volume = v.volume;
  }catch(e){ /* private mode, quota, hand-edited junk — stay at the default */ }
}
function savePref(){
  try{
    if(typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify({ volume: sfx.volume }));
  }catch(e){}
}
loadPref();

/* ---- the context, created only inside a gesture ---- */
let ctx = null, master = null;
const lastAt = Object.create(null);

/* Never constructed at import or at page load: browsers start a context made
   outside a gesture in 'suspended' and log about it, and a suspended context
   would silently queue everything the offline catch-up replays. unlock() is
   called from the toggle's own click handler, and from a one-shot document
   gesture listener armed in main.js for players who already turned sound on
   in an earlier session. */
export function unlock(){
  if(typeof window === 'undefined') return false;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if(!Ctor) return false;                       // jsdom, Node, ancient browsers
  try{
    if(!ctx){
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
    }
    if(ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(()=>{});
    sfx.ready = ctx.state === 'running';
    return true;
  }catch(e){
    /* Not fatal — the game is playable in silence — but not silent about it
       either: a swallowed failure here is indistinguishable from "the player
       muted it", and this codebase has been bitten by exactly that before
       (see tick.js's milestone catch). */
    console.warn('audio unavailable:', e && e.message);
    ctx = null; master = null; sfx.ready = false; return false;
  }
}

/* ---- voices ---- */
/* One enveloped oscillator. exponentialRampToValueAtTime never reaches 0, so
   envelopes start and end at 0.0001 rather than 0 — ramping to a true zero
   throws, and starting at a true zero makes the ramp a no-op (and a click). */
function voice(out, at, o){
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, at);
  if(o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + o.dur);
  const peak = Math.max(0.0002, o.peak);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + (o.attack || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  osc.connect(g); g.connect(out);
  osc.start(at); osc.stop(at + o.dur + 0.03);
}

/* Three cues, deliberately unequal in weight — the rarer the event, the more
   there is to hear. A block is one note, a jackpot is a chord that arrives in
   pieces, a rank-up is the only one that resolves upward and rings out. */
const VOICES = {
  // routine income: a soft, short, falling blip. Nothing to notice twice.
  block(out, t){
    voice(out, t, { f:1318, to:988, dur:0.10, type:'sine', peak:0.27 });
  },
  // a payout far above the usual: same family, but a rising major triad with
  // a low sine under it for body, so it reads as bigger without being louder.
  jackpot(out, t){
    voice(out, t,        { f:784,  dur:0.16, type:'triangle', peak:0.22 });
    voice(out, t + 0.07, { f:1046, dur:0.16, type:'triangle', peak:0.22 });
    voice(out, t + 0.14, { f:1318, dur:0.30, type:'triangle', peak:0.24 });
    voice(out, t,        { f:523,  dur:0.45, type:'sine',     peak:0.11, attack:0.02 });
  },
  // five or six times in a whole run: a four-note rise in fifths through a
  // opening lowpass, with the last note held. The only cue with a tail.
  rankup(out, t){
    const lp = ctx.createBiquadFilter();
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
export function play(name){
  if(!VOICES[name]) return false;
  if(sfx.volume <= 0 || sfx.busy) return false;
  const now = Date.now();
  if(now - (lastAt[name] || -1e9) < (COOLDOWN[name] || 0)) return false;
  if(!ctx || !master) return false;                 // no gesture yet, or no Web Audio
  if(ctx.state !== 'running'){                      // suspended/interrupted tab
    if(ctx.resume) ctx.resume().catch(()=>{});
    sfx.ready = false;
    return false;                                   // never queue into a stopped clock
  }
  sfx.ready = true;
  try{
    master.gain.setValueAtTime(sfx.volume, ctx.currentTime);
    VOICES[name](master, ctx.currentTime + 0.005);
  }catch(e){ return false; }
  lastAt[name] = now;
  sfx.plays++; sfx.last = name;
  /* A cheap, dependency-free seam: an end-to-end check can prove a real block
     or rank-up reached the audio path (and that muting suppresses it) without
     a sound card. Nothing in the app listens. */
  try{ window.dispatchEvent(new CustomEvent('rp-sfx', { detail:{ name, plays: sfx.plays } })); }
  catch(e){}
  return true;
}

/* The single entry point pop() uses: hand it a toast's class and kind and it
   works out whether that moment has a sound. */
export function cue(cls, kind){
  const name = CUE[cls] || CUE[kind];
  if(name) play(name);
}

/* ---- the control ---- */
/* One pill, three states: muted -> quiet -> louder -> muted. A separate
   slider would have to fit into a top bar that is already full at 320 px, and
   a game with three cues does not need continuous gain — it needs "off",
   "on", and "on, I am across the room". */
export function cycleVolume(){
  const i = VOLUMES.indexOf(sfx.volume);
  sfx.volume = VOLUMES[(i < 0 ? 0 : i + 1) % VOLUMES.length];
  savePref();
  if(sfx.volume > 0){
    unlock();                 // we are inside the click, which is the whole point
    delete lastAt.block;      // the confirmation is a gesture, not a game event
    play('block');            // and confirm, at the level just chosen
  }
  return sfx.volume;
}

export function setVolume(v){
  sfx.volume = Math.max(0, Math.min(1, Number(v) || 0));
  savePref();
}

/* Label for the pill. Kept here so the component has no state logic. */
export function volumeLabel(){
  if(sfx.volume <= 0) return 'muted';
  return sfx.volume >= VOLUMES[2] ? 'sound +' : 'sound';
}

/* Armed once from main.js: a returning player already has sound on, but the
   context still cannot exist until they touch something. */
export function armUnlock(){
  if(typeof document === 'undefined') return;
  const go = () => {
    document.removeEventListener('pointerdown', go);
    document.removeEventListener('keydown', go);
    if(sfx.volume > 0) unlock();
  };
  document.addEventListener('pointerdown', go, { passive:true });
  document.addEventListener('keydown', go);
}

export const AUDIO_KEY = KEY;
