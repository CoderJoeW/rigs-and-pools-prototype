import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from '../stores/game.js';

// A fresh, isolated game store for one test. Pinia is re-created so no
// state leaks between tests, and localStorage (the real thing, via jsdom)
// is cleared so persistence tests don't see a previous test's save.
export function freshStore() {
  try { localStorage.clear(); } catch { /* ignore */ }
  setActivePinia(createPinia());
  return useGameStore();
}

// A new store instance backed by whatever is ALREADY in localStorage —
// simulates reopening the app (a fresh Pinia/component tree) without
// wiping the save a previous step in the same test wrote.
export function reopenStore() {
  setActivePinia(createPinia());
  return useGameStore();
}
