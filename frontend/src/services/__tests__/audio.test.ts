import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { sfx, cue, play, unlock, cycleVolume, setVolume, volumeLabel, AUDIO_KEY }
  from '../audio.js';

/* audio.js holds ONE AudioContext for the life of the module, created lazily
   inside a gesture and never replaced — which is the behaviour under test, so
   these specs share one stand-in rather than rebuilding it per case. Order
   matters for exactly one describe: the no-Web-Audio block has to run before
   anything has unlocked, so it sits first. */
const nodes = { osc:0, gain:0, filter:0 };
let live: FakeCtx | null = null;                      // the one context the module ends up holding

const param = () => ({ value:0, setValueAtTime(){}, exponentialRampToValueAtTime(){} });
class FakeCtx {
  state = 'running';
  currentTime = 0;
  destination = {};
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- capturing the instance for the test to inspect, not a scoping workaround
  constructor(){ live = this; }
  createGain(){ nodes.gain++; return { gain:param(), connect(){} }; }
  createOscillator(){ nodes.osc++; return { type:'', frequency:param(),
    connect(){}, start(){}, stop(){} }; }
  createBiquadFilter(){ nodes.filter++; return { type:'', frequency:param(), connect(){} }; }
  /* Deliberately does NOT flip state synchronously — the real resume() is a
     promise, and code that assumes otherwise is exactly the bug worth
     catching. Specs put the state back themselves. */
  resume(){ return Promise.resolve(); }
}

function counted(fn: () => void) {
  const before = { ...nodes };
  fn();
  return { osc:nodes.osc-before.osc, gain:nodes.gain-before.gain,
           filter:nodes.filter-before.filter };
}

/* The cooldowns are wall-clock and the module's per-cue timestamps outlive any
   one spec, so the clock is driven by hand: each spec starts a full minute
   after the last, and a spec that wants to prove throttling simply does not
   advance it. */
let clock = 1e6;
vi.spyOn(Date, 'now').mockImplementation(() => clock);
afterAll(() => vi.restoreAllMocks());

beforeEach(() => {
  try{ localStorage.clear(); }catch(e){}
  clock += 60000;
  sfx.busy = false;
  sfx.plays = 0;
  if(live) live.state = 'running';
});

/* ---- must run before anything unlocks ---- */
describe('audio where there is no Web Audio API at all (jsdom, Node, old browsers)', () => {
  it('cue() is a silent no-op rather than a throw, so game-logic tests are unaffected', () => {
    expect(window.AudioContext).toBeUndefined();
    setVolume(0.5);
    expect(() => cue('', 'block')).not.toThrow();
    expect(() => cue('jackpot', 'Jackpot')).not.toThrow();
    expect(() => cue('rankup', 'rankup')).not.toThrow();
    expect(sfx.plays).toBe(0);
    expect(unlock()).toBe(false);
    setVolume(0);
  });
});

describe('the mute/volume preference', () => {
  beforeEach(() => { window.AudioContext = FakeCtx as unknown as typeof AudioContext; setVolume(0); });

  it('defaults to silent — a tab nobody asked to make noise does not', () => {
    expect(sfx.volume).toBe(0);
    expect(volumeLabel()).toBe('muted');
  });

  it('the pill cycles muted -> quiet -> louder -> muted, persisting each step', () => {
    expect(cycleVolume()).toBeCloseTo(0.45);
    expect(volumeLabel()).toBe('sound');
    expect(JSON.parse(localStorage.getItem(AUDIO_KEY)!).volume).toBeCloseTo(0.45);

    expect(cycleVolume()).toBeCloseTo(0.9);
    expect(volumeLabel()).toBe('sound +');

    expect(cycleVolume()).toBe(0);
    expect(volumeLabel()).toBe('muted');
    expect(JSON.parse(localStorage.getItem(AUDIO_KEY)!).volume).toBe(0);
  });

  it('lives under its own key, not the save — an imported save cannot unmute a device', () => {
    cycleVolume();
    expect(AUDIO_KEY).toBe('rigs-and-pools-audio');
    expect(localStorage.getItem('rigs-and-pools-save')).toBeNull();
  });

  it('turning sound on confirms itself audibly, inside the click that enabled it', () => {
    sfx.plays = 0;
    cycleVolume();
    expect(sfx.plays).toBe(1);        // the confirmation blip
    expect(sfx.last).toBe('block');
  });
});

describe('cue routing off pop()’s own cls/kind vocabulary', () => {
  beforeEach(() => { window.AudioContext = FakeCtx as unknown as typeof AudioContext; setVolume(0.5); unlock(); sfx.plays = 0; });

  it('maps exactly the three moments issue #46 names, and nothing else', () => {
    cue('', 'block');                 // G.pop('Block solved', …, '', {kind:'block'})
    expect(sfx.last).toBe('block');
    cue('jackpot', 'Jackpot');        // the jackpot branch in awardBlock
    expect(sfx.last).toBe('jackpot');
    cue('rankup', 'rankup');          // issue #40's dedicated rank-up toast
    expect(sfx.last).toBe('rankup');
    clock += 5000;                    // past the jackpot cooldown
    cue('', 'record');                // a new all-time record reads as a jackpot
    expect(sfx.last).toBe('jackpot');
    expect(sfx.plays).toBe(4);

    const before = sfx.plays;
    cue('dark', 'Out of cash');       // bad news stays wordless
    cue('grn', 'Milestone');          // an ordinary milestone is not a rank-up
    cue('blu', 'Pool opened');
    cue('', 'construction');
    cue(undefined, undefined);
    expect(sfx.plays).toBe(before);
  });

  it('builds real oscillators, and the rarer the event the richer the cue', () => {
    const block = counted(() => play('block'));
    expect(block.osc).toBe(1);        // one falling note
    expect(block.filter).toBe(0);

    const jackpot = counted(() => play('jackpot'));
    expect(jackpot.osc).toBeGreaterThan(block.osc);
    expect(jackpot.filter).toBe(0);

    const rankup = counted(() => play('rankup'));
    expect(rankup.osc).toBeGreaterThan(jackpot.osc);
    expect(rankup.filter).toBe(1);    // only the rank-up sweeps a filter
  });
});

describe('rate limiting and suppression', () => {
  beforeEach(() => { window.AudioContext = FakeCtx as unknown as typeof AudioContext; setVolume(0.5); unlock(); sfx.plays = 0; });

  it('a fast-forward burst of blocks cannot machine-gun — the gate is REAL time', () => {
    // 3600x turns Tessera's 20 s blocks into one every ~5.6 ms of wall clock.
    for(let i = 0; i < 500; i++) play('block');
    expect(sfx.plays).toBe(1);
  });

  it('a rank-up is never throttled — it lands five or six times in an entire run', () => {
    play('rankup'); play('rankup'); play('rankup');
    expect(sfx.plays).toBe(3);
  });

  it('muting suppresses everything, including the cues that bypass the toast cap', () => {
    setVolume(0);
    cue('', 'block'); cue('jackpot', 'Jackpot'); cue('rankup', 'rankup');
    expect(sfx.plays).toBe(0);
  });

  it('offline catch-up replays hours in silence', () => {
    sfx.busy = true;
    cue('rankup', 'rankup');          // not even the unthrottled one
    expect(sfx.plays).toBe(0);
    sfx.busy = false;
    cue('rankup', 'rankup');
    expect(sfx.plays).toBe(1);
  });

  it('a suspended context is never scheduled into, so nothing blasts on resume', () => {
    live!.state = 'suspended';         // e.g. the tab was backgrounded
    const made = counted(() => { play('rankup'); play('jackpot'); });
    expect(sfx.plays).toBe(0);
    expect(made.osc).toBe(0);
    expect(sfx.ready).toBe(false);
    live!.state = 'running';           // the resume() play() fired has landed
    play('rankup');
    expect(sfx.plays).toBe(1);
  });

  it('emits an observable rp-sfx event per real cue — the seam the e2e check reads', () => {
    const seen: string[] = [];
    const h = (e: Event) => seen.push((e as CustomEvent).detail.name);
    window.addEventListener('rp-sfx', h);
    play('rankup');
    setVolume(0);
    play('rankup');                   // muted: no event
    window.removeEventListener('rp-sfx', h);
    expect(seen).toEqual(['rankup']);
  });
});
