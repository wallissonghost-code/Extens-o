import { catalogValidation, mergeDiscovery, normalizeGift } from '../domain/gift.js';

const sameId = id => g => String(g.id) === String(id);

export class GiftService {
  constructor(store, clock = () => Date.now()) { this.store = store; this.clock = clock; }
  get discoveries() { return this.store.list('discoveries'); }
  get saved() { return this.store.list('saved'); }
  get verified() { return this.store.list('verified'); }
  seedVerified(payload) {
    if (!payload || payload.schema !== 'liveplus.verified-gifts.v1' || !Array.isArray(payload.gifts)) throw new Error('Catálogo incompatível.');
    const map = new Map(this.verified.map(g => [String(g.id), g]));
    for (const raw of payload.gifts) map.set(String(raw.id), { ...raw, id: String(raw.id), verifiedAt: raw.verifiedAt || this.clock() });
    this.store.setList('verified', [...map.values()]); return map.size;
  }
  observe(event) {
    if (event?.type && event.type !== 'gift') return null;
    const incoming = normalizeGift(event, this.clock()); if (!incoming.id) return null;
    if (this.verified.some(sameId(incoming.id))) return { kind: 'known', gift: incoming };
    const list = this.discoveries; const i = list.findIndex(sameId(incoming.id));
    const merged = mergeDiscovery(i >= 0 ? list[i] : null, event, this.clock());
    if (i >= 0) list[i] = merged; else list.unshift(merged);
    this.store.setList('discoveries', list.slice(0, 1000)); return { kind: 'discovered', gift: merged };
  }
  save(id) {
    const source = this.discoveries.find(sameId(id)) || this.saved.find(sameId(id)); if (!source) throw new Error('Presente não encontrado.');
    const list = this.saved; const i = list.findIndex(sameId(id)); const item = { ...source, savedAt: this.clock() };
    if (i >= 0) list[i] = item; else list.unshift(item); this.store.setList('saved', list); return item;
  }
  edit(id, patch) {
    const apply = list => list.map(g => sameId(id)(g) ? { ...g, ...patch, id: String(g.id), manualValue: patch.diamondCount !== undefined ? true : g.manualValue } : g);
    this.store.setList('discoveries', apply(this.discoveries)); this.store.setList('saved', apply(this.saved));
    return this.discoveries.find(sameId(id)) || this.saved.find(sameId(id));
  }
  verify(id) {
    const candidate = this.discoveries.find(sameId(id)) || this.saved.find(sameId(id)); if (!candidate) throw new Error('Presente não encontrado.');
    const validation = catalogValidation(candidate); if (!validation.ok) throw new Error(`Não pode catalogar: falta ${validation.missing.join(', ')}.`);
    const item = { ...candidate, liveVerified: true, verifiedAt: this.clock(), liveVerifiedCount: candidate.seen || 1, source: 'live-discovery' };
    const verified = this.verified.filter(g => !sameId(id)(g)); verified.push(item); this.store.setList('verified', verified);
    this.store.setList('discoveries', this.discoveries.filter(g => !sameId(id)(g))); return item;
  }
  removeSaved(id) { this.store.setList('saved', this.saved.filter(g => !sameId(id)(g))); }
  clearHistory() { this.store.clearDiscoveries(); }
}
