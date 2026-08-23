import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RigShot from '../RigShot.vue';
import { rigClass, rigShot } from '../../utils/rigArt.js';
import { FRAMES } from '../../data/hardware.js';

const STATES = ['run', 'warn', 'bad', 'build', 'off'];

describe('RigShot', () => {
  it('shows a different machine for each class of frame', () => {
    const crate = mount(RigShot, { props: { frame: 'f2', state: 'run' } });
    const frame = mount(RigShot, { props: { frame: 'f6', state: 'run' } });
    const rack = mount(RigShot, { props: { frame: 'f16', state: 'run' } });
    const srcs = [crate, frame, rack].map(w => w.find('img')!.attributes('src'));
    // The whole point of the second axis: three frames, three pictures.
    expect(new Set(srcs).size).toBe(3);
    expect(srcs[0]).toMatch(/crate-run/);
    expect(srcs[1]).toMatch(/frame-run/);
    expect(srcs[2]).toMatch(/rack-run/);
  });

  it('keeps the class and changes only the light as state changes', () => {
    const seen = STATES.map(state =>
      mount(RigShot, { props: { frame: 'f16', state } }).find('img')!.attributes('src')!);
    expect(new Set(seen).size).toBe(STATES.length);
    // Every one of them is still the rack chassis, not some other machine.
    expect(seen.every(s => /rack-/.test(s))).toBe(true);
  });

  it('has art for every frame in the catalogue, in every state', () => {
    for (const f of FRAMES) {
      for (const state of STATES) {
        expect(rigShot(f.id, state), `${f.id} ${state}`).toBeTruthy();
      }
    }
  });

  it('falls back to the open frame rather than blanking on an unknown frame', () => {
    // A save from before the fab could mint custom frames, or simply a
    // corrupted one: the row must still draw something.
    expect(rigClass('nonsense')).toBe('frame');
    const w = mount(RigShot, { props: { frame: 'nonsense', state: 'run' } });
    expect(w.find('img')!.attributes('src')).toMatch(/frame-run/);
  });

  it('falls back to off rather than blanking on an unknown state', () => {
    expect(rigShot('f2', 'nonsense')).toBe(rigShot('f2', 'off'));
  });

  it('stays decorative unless it is given a label', () => {
    const bare = mount(RigShot, { props: { frame: 'f4', state: 'run' } });
    expect(bare.attributes('aria-hidden')).toBe('true');
    expect(bare.attributes('role')).toBeUndefined();
    const named = mount(RigShot, { props: { frame: 'f4', state: 'run', label: 'Rig 1 — running' } });
    expect(named.attributes('role')).toBe('img');
    expect(named.attributes('aria-label')).toBe('Rig 1 — running');
  });
});
