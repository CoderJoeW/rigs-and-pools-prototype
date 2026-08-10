import { describe, it, expect, vi } from 'vitest';
import { freshStore, reopenStore } from '../../test/testStore.js';

// wipeSave() ends with a cosmetic location.reload(), already wrapped in a
// try/catch in app code — jsdom has no real navigation, so stub it quiet.
vi.stubGlobal('location', { ...window.location, reload: () => {} });

describe('saveNow / loadSave round trip', () => {
  it('loadSave on an empty save returns false and leaves a fresh game alone', async () => {
    const g = freshStore();
    const loaded = await g.loadSave();
    expect(loaded).toBe(false);
    expect(g.s.cash).toBe(500);
  });

  it('saveNow persists to localStorage and reports where', async () => {
    const g = freshStore();
    await g.saveNow();
    expect(g.s.saveInfo).toMatch(/saved/);
    expect(localStorage.getItem('rigs-and-pools-save')).toBeTruthy();
  });

  it('a fresh store reopening the app restores the saved state', async () => {
    const g1 = freshStore();
    g1.generatePreset();
    g1.build();
    g1.s.cash = 12345;
    await g1.saveNow();

    const g2 = reopenStore();
    expect(g2.s.cash).toBe(500); // still the boot default until loadSave runs
    const loaded = await g2.loadSave();

    expect(loaded).toBe(true);
    expect(g2.s.cash).toBe(12345);
    expect(g2.s.rigs).toHaveLength(1);
  });

  it('loadSave resets transient UI state even though it was saved', async () => {
    const g1 = freshStore();
    g1.s.picker = 'frame';
    g1.s.speed = 3600;
    await g1.saveNow();

    const g2 = reopenStore();
    await g2.loadSave();

    expect(g2.s.picker).toBe(null);
    expect(g2.s.speed).toBe(1); // always resumes at real time, whatever was saved
  });

  it('a save from before today.blocks existed is migrated, not left broken', async () => {
    const g1 = freshStore();
    await g1.saveNow();
    const raw = JSON.parse(localStorage.getItem('rigs-and-pools-save'));
    delete raw.state.today.blocks; // the pre-fix shape
    localStorage.setItem('rigs-and-pools-save', JSON.stringify(raw));

    const g2 = reopenStore();
    await g2.loadSave();

    expect(g2.s.today.blocks).toBe(0);
    expect(Number.isNaN(g2.s.today.blocks)).toBe(false);

    g2.generatePreset();
    g2.build();
    for (let i = 0; i < 5; i++) g2.stepTick(60);
    g2.stepTick(3600);

    expect(g2.s.today.blocks).toBeGreaterThan(0);
  });

  it('a save with a malformed recentBlockUsd field is repaired, not left broken', async () => {
    // NOT the today.blocks trap: recentBlockUsd is a plain top-level key, so
    // a save that's simply MISSING it (any save from before this field
    // existed) leaves G.s's own fresh {} default untouched — Object.assign
    // only copies keys the source actually has, unlike `today`, a nested
    // object Object.assign replaces wholesale even when incomplete. What
    // this guards against is a save where the field is genuinely PRESENT
    // but malformed — hand-edited localStorage, a corrupted import file —
    // which push()/shift() on a per-chain array would only discover, by
    // throwing, the next time a block lands, well after hydrate()'s own
    // try/catch already returned. recentBlockUsd is per-chain (chain id ->
    // array), not one flat array — see tick.js's derivation comment.
    const g1 = freshStore();
    await g1.saveNow();
    const raw = JSON.parse(localStorage.getItem('rigs-and-pools-save'));
    raw.state.recentBlockUsd = null; // present, but not a plain object
    localStorage.setItem('rigs-and-pools-save', JSON.stringify(raw));

    const g2 = reopenStore();
    await g2.loadSave();

    expect(typeof g2.s.recentBlockUsd).toBe('object');
    expect(g2.s.recentBlockUsd).not.toBeNull();
    expect(Array.isArray(g2.s.recentBlockUsd)).toBe(false);
    expect(Object.keys(g2.s.recentBlockUsd).length).toBe(0);

    g2.generatePreset();
    g2.build();
    for (let i = 0; i < 5; i++) g2.stepTick(60);
    g2.stepTick(300); // does not throw on the first block after repair (long enough that one lands)

    expect(Object.keys(g2.s.recentBlockUsd).length).toBeGreaterThan(0);
    expect(g2.s.recentBlockUsd.tessera.length).toBeGreaterThan(0);
  });
});

describe('save invalidation across the onboarding-system update', () => {
  it('a save written under the previous SAVE_VER is rejected, not migrated', async () => {
    const g1 = freshStore();
    g1.generatePreset();
    g1.build();
    g1.s.cash = 8675309;
    await g1.saveNow();

    // simulate a save left over from before this update: same shape, one
    // version behind current — loadSave must treat it as unreadable rather
    // than hydrating a coach step / nudge flag it never had a chance to set
    const raw = JSON.parse(localStorage.getItem('rigs-and-pools-save'));
    raw.ver = g1.C.SAVE_VER - 1;
    localStorage.setItem('rigs-and-pools-save', JSON.stringify(raw));

    const g2 = reopenStore();
    const loaded = await g2.loadSave();

    expect(loaded).toBe(false);
    expect(g2.s.cash).toBe(500);
    expect(g2.s.rigs).toEqual([]);
  });
});

describe('a corrupted save', () => {
  it('does not brick the app — loadSave falls back to a fresh game instead of throwing', async () => {
    const g1 = freshStore();
    const corrupted = JSON.stringify({
      ver: g1.C.SAVE_VER, savedAt: Date.now(),
      state: { rigs: 'not-an-array' }, // makes the legacy-rig migration's .some() throw
    });
    localStorage.setItem('rigs-and-pools-save', corrupted);

    const g2 = reopenStore();
    const loaded = await g2.loadSave();

    expect(loaded).toBe(false);
    expect(g2.s.cash).toBe(500); // reset to a real fresh state, not left holding the garbage
    expect(g2.s.rigs).toEqual([]);
  });

  it('importSave falls back to a fresh game and does not persist the corrupted state', async () => {
    const g = freshStore();
    g.s.cash = 777;
    const corrupted = JSON.stringify({
      ver: g.C.SAVE_VER, savedAt: Date.now(), state: { rigs: 'nope' },
    });

    const ok = await g.importSave(corrupted);

    expect(ok).toBe(false);
    expect(g.s.cash).toBe(500); // reset, not left at 777 and not left holding the garbage either
    expect(g.s.rigs).toEqual([]);
  });
});

describe('offline catch-up', () => {
  it('credits progress for time away and reports a "Welcome back" toast', async () => {
    const g1 = freshStore();
    g1.generatePreset();
    g1.build();
    for (let i = 0; i < 60; i++) g1.stepTick(60); // finish assembly, start earning
    await g1.saveNow();

    // back-date the save as if the tab had been closed for 2 hours
    const raw = JSON.parse(localStorage.getItem('rigs-and-pools-save'));
    raw.savedAt = Date.now() - 2 * 3600 * 1000;
    localStorage.setItem('rigs-and-pools-save', JSON.stringify(raw));

    const g2 = reopenStore();
    const tBefore = raw.state.t;
    await g2.loadSave();

    // ~2 hours of game time should have been credited in 30-second chunks.
    // (Toasts during the catch-up are real-time rate-limited — by design,
    // so a burst of simulated ticks doesn't strobe — so the "Welcome back"
    // toast can lose that race; the activity feed isn't rate-limited and
    // is the reliable place to see the notice.)
    expect(g2.s.t).toBeGreaterThan(tBefore + 3600);
    expect(g2.s.feed.some(e => e.text.startsWith('Away '))).toBe(true);
  });

  it('caps offline credit at 24 hours', async () => {
    const g1 = freshStore();
    g1.generatePreset();
    g1.build();
    for (let i = 0; i < 60; i++) g1.stepTick(60);
    await g1.saveNow();

    const raw = JSON.parse(localStorage.getItem('rigs-and-pools-save'));
    const tBefore = raw.state.t;
    raw.savedAt = Date.now() - 30 * 24 * 3600 * 1000; // a month ago
    localStorage.setItem('rigs-and-pools-save', JSON.stringify(raw));

    const g2 = reopenStore();
    await g2.loadSave();

    // capped at C.OFFLINE_CAP (86400s), not the full month
    expect(g2.s.t).toBeLessThanOrEqual(tBefore + 86400 + 1);
    expect(g2.s.feed.some(e => e.text.startsWith('Away '))).toBe(true);
  });

  it('does not fast-forward for a short absence', async () => {
    const g1 = freshStore();
    g1.generatePreset();
    g1.build();
    await g1.saveNow();

    const raw = JSON.parse(localStorage.getItem('rigs-and-pools-save'));
    const tBefore = raw.state.t;
    raw.savedAt = Date.now() - 5000; // 5 seconds ago
    localStorage.setItem('rigs-and-pools-save', JSON.stringify(raw));

    const g2 = reopenStore();
    await g2.loadSave();

    expect(g2.s.t).toBeCloseTo(tBefore, 1);
  });
});

describe('exportSave / importSave', () => {
  it('exports a payload that round-trips into a fresh store', async () => {
    const g1 = freshStore();
    g1.generatePreset();
    g1.build();
    g1.s.cash = 4242;

    const backup = g1.exportSave();
    const parsed = JSON.parse(backup);
    expect(parsed.state.cash).toBe(4242);
    expect(parsed.state.rigs).toHaveLength(1);

    const g2 = freshStore();
    expect(g2.s.cash).toBe(500);
    const ok = await g2.importSave(backup);

    expect(ok).toBe(true);
    expect(g2.s.cash).toBe(4242);
    expect(g2.s.rigs).toHaveLength(1);
  });

  it('an imported backup persists — reopening the app keeps it, not the old run', async () => {
    const g1 = freshStore();
    g1.s.cash = 111;
    const backup = g1.exportSave();

    const g2 = freshStore();
    g2.s.cash = 999;
    await g2.saveNow();
    await g2.importSave(backup);
    expect(g2.s.cash).toBe(111);

    const g3 = reopenStore();
    expect(await g3.loadSave()).toBe(true);
    expect(g3.s.cash).toBe(111);
  });

  it('rejects garbage without touching the current run', async () => {
    const g = freshStore();
    g.s.cash = 777;

    expect(await g.importSave('not json')).toBe(false);
    expect(await g.importSave('{}')).toBe(false);
    expect(await g.importSave(JSON.stringify({ ver: -1, state: {} }))).toBe(false);

    expect(g.s.cash).toBe(777);
  });

  it('resets transient UI state on import, same as loadSave', async () => {
    const g1 = freshStore();
    const backup = g1.exportSave();

    const g2 = freshStore();
    g2.s.picker = 'frame';
    g2.s.speed = 3600;
    await g2.importSave(backup);

    expect(g2.s.picker).toBe(null);
    expect(g2.s.speed).toBe(1);
  });
});

describe('wipeSave', () => {
  it('resets to a fresh game and immediately re-saves that fresh state', async () => {
    const g = freshStore();
    g.generatePreset();
    g.build();
    g.s.cash = 999;
    await g.saveNow();

    await g.wipeSave();

    expect(g.s.cash).toBe(500);
    expect(g.s.rigs).toHaveLength(0);
    expect(g.s.saveInfo).toBe('erased');

    // the erase-then-resave persisted: reopening finds the FRESH game, not
    // the old $999 one — wipeSave deliberately leaves a save behind so the
    // new run isn't one accidental reload away from losing itself again
    const g2 = reopenStore();
    expect(await g2.loadSave()).toBe(true);
    expect(g2.s.cash).toBe(500);
    expect(g2.s.rigs).toHaveLength(0);
  });
});
