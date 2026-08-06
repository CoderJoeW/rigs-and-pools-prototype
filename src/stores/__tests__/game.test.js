import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from '../game.js';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('game store', () => {
  it('boots with the starting cash and zero hashrate', () => {
    const g = useGameStore();
    expect(g.s.cash).toBe(500);
    expect(g.totalHash).toBe(0);
    expect(g.s.rigs).toHaveLength(0);
    expect(g.s.sites).toHaveLength(1);
  });

  it('advances state on repeated ticks without throwing', () => {
    const g = useGameStore();
    const t0 = g.s.t;
    for (let i = 0; i < 50; i++) g.stepTick();
    expect(g.s.t).toBeGreaterThan(t0);
    expect(Number.isFinite(g.s.cash)).toBe(true);
  });

  it('building a rig spends cash and adds a running rig', () => {
    const g = useGameStore();
    const found = g.generatePreset();
    expect(found).toBe(true);
    expect(g.canBuild).toBe(true);

    const cashBefore = g.s.cash;
    g.build();

    expect(g.s.rigs).toHaveLength(1);
    expect(g.s.cash).toBeLessThan(cashBefore);
    expect(g.s.rigs[0].units.length).toBeGreaterThan(0);

    // run it long enough to finish assembly (the first rig's build time is
    // 60 game-seconds) and confirm it starts mining
    for (let i = 0; i < 5; i++) g.stepTick(60);
    expect(g.totalHash).toBeGreaterThan(0);
  });
});
