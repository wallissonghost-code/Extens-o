export const KEYS = Object.freeze({ discoveries: 'giftlab.discoveries.v1', saved: 'giftlab.saved.v1', verified: 'giftlab.verified.v1', settings: 'giftlab.settings.v1' });

export class JsonStore {
  constructor(storage) { this.storage = storage; }
  read(key, fallback) { try { return JSON.parse(this.storage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } }
  write(key, value) { this.storage.setItem(key, JSON.stringify(value)); return value; }
  list(kind) { return this.read(KEYS[kind], []); }
  setList(kind, value) { return this.write(KEYS[kind], value); }
  clearDiscoveries() { this.setList('discoveries', []); }
}

export class MemoryStorage {
  #data = new Map();
  getItem(k) { return this.#data.has(k) ? this.#data.get(k) : null; }
  setItem(k,v) { this.#data.set(k,String(v)); }
  removeItem(k) { this.#data.delete(k); }
}
