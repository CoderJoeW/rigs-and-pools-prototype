import { C } from '../data/constants.js';

// persistence — localStorage, degrading to an in-memory fallback if it's
// unavailable (private browsing, storage quota, etc).
export const storage = {
  mode: 'memory' as 'memory' | 'local',
  _mem: null as unknown,
  async _read(key: string): Promise<unknown> {
    try {
      const v = localStorage.getItem(key);
      this.mode = 'local';
      return v ? JSON.parse(v) : null;
    } catch {
      this.mode = 'memory';
      return this._mem;
    }
  },
  async get(): Promise<unknown> {
    const cur = await this._read(C.SAVE_KEY);
    if (cur) return cur;
    // renamed at v26: adopt a save left under the old name, then let the
    // next autosave rewrite it under the new key
    return await this._read(C.SAVE_KEY_OLD);
  },
  async set(data: unknown): Promise<'local' | 'memory'> {
    const v = JSON.stringify(data);
    try {
      localStorage.setItem(C.SAVE_KEY, v);
      this.mode = 'local';
      return 'local';
    } catch {
      this._mem = data;
      this.mode = 'memory';
      return 'memory';
    }
  },
  async wipe(): Promise<void> {
    try { localStorage.removeItem(C.SAVE_KEY); } catch { /* ignore */ }
    this._mem = null;
  },
};
