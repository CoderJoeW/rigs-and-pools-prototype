// Node 22+ defines its own global `localStorage`/`sessionStorage`
// (--experimental-webstorage, on by default) before vitest's jsdom
// environment ever runs. vitest 4's jsdom setup only copies a fixed list of
// window properties onto the global object, and localStorage/sessionStorage
// aren't on that list — so Node's own version, which returns undefined
// without a --localstorage-file, is what test code sees, permanently
// shadowing jsdom's real one. There's no reaching jsdom's actual Storage
// instance from here (this environment aliases `window` to the same global
// object, so `window.localStorage` reads the exact same shadowed property).
//
// A minimal spec-shaped stand-in, installed over the existing (configurable)
// property, is simpler and more portable than fighting Node's flag — it
// works the same on every Node build regardless of whether that build even
// allows --no-experimental-webstorage via NODE_OPTIONS.
class MemoryStorage implements Storage {
  #data = new Map<string, string>();
  get length() { return this.#data.size; }
  key(index: number) { return Array.from(this.#data.keys())[index] ?? null; }
  getItem(key: string) { return this.#data.has(String(key)) ? this.#data.get(String(key))! : null; }
  setItem(key: string, value: string) { this.#data.set(String(key), String(value)); }
  removeItem(key: string) { this.#data.delete(String(key)); }
  clear() { this.#data.clear(); }
}

for (const name of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    enumerable: true,
    writable: true,
  });
}
