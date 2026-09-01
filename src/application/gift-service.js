import { catalogValidation, mergeDiscovery, normalizeGift } from '../domain/gift.js';

const sameId = id => g => String(g.id) === String(id);
const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export class GiftService {
  constructor(store, clock = () => Date.now()) { this.store = store; this.clock = clock; }
  get discoveries() { return this.store.list('discoveries'); }
  get saved() { return this.store.list('saved'); }
  get verified() { return this.store.list('verified'); }

  seedVerified(payload) {
    if (!payload || payload.schema !== 'liveplus.verified-gifts.v1' || !Array.isArray(payload.gifts)) throw new Error('Catálogo incompatível.');
    const map = new Map(this.verified.map(g => [String(g.id), g]));
    for (const raw of payload.gifts) {
      const id = String(raw.id ?? '').trim();
      if (!id) continue;
      const previous = map.get(id) || {};
      map.set(id, { ...raw, ...previous, id, verifiedAt: previous.verifiedAt || raw.verifiedAt || this.clock() });
    }
    this.store.setList('verified', [...map.values()]);
    return map.size;
  }

  observe(event) {
    if (event?.type && event.type !== 'gift') return null;
    const now = this.clock();
    const incoming = normalizeGift(event, now);
    if (!incoming.id) return null;

    const verified = this.verified;
    let index = verified.findIndex(sameId(incoming.id));
    let matchedBy = 'id';
    if (index < 0 && incoming.name) {
      index = verified.findIndex(g => norm(g.name) === norm(incoming.name));
      matchedBy = 'name';
    }

    if (index >= 0) {
      const current = { ...verified[index] };
      const liveId = String(incoming.id);
      const liveName = incoming.name || current.name || `gift-${liveId}`;
      const liveValue = Number(incoming.diamondCount) || 0;
      const currentValue = Number(current.diamondCount) || 0;
      const idDiff = String(current.id) !== liveId;
      const nameDiff = Boolean(norm(liveName)) && norm(current.name) !== norm(liveName);
      const valueDiff = liveValue > 0 && currentValue > 0 && liveValue !== currentValue;

      current.liveVerified = true;
      current.liveVerifiedCount = (Number(current.liveVerifiedCount) || 0) + Math.max(1, Number(event.count) || 1);
      current.firstLiveVerifiedAt = Number(current.firstLiveVerifiedAt) || now;
      current.lastLiveVerifiedAt = now;
      current.liveVerifiedId = liveId;
      current.liveVerifiedName = liveName;
      current.liveVerifiedValue = liveValue || null;
      if (!current.icon && incoming.icon) current.icon = incoming.icon;

      // Assim como no Caos, divergência apenas de nome não deve prender o presente.
      if (nameDiff && !idDiff && !valueDiff) current.name = liveName;

      const remainingNameDiff = norm(current.name) !== norm(liveName);
      current.liveDivergence = idDiff || remainingNameDiff || valueDiff ? {
        at: now,
        matchedBy,
        id: idDiff ? { catalog: String(current.id), live: liveId } : null,
        name: remainingNameDiff ? { catalog: current.name, live: liveName } : null,
        value: valueDiff ? { catalog: currentValue, live: liveValue } : null
      } : null;

      verified[index] = current;
      this.store.setList('verified', verified);
      this.store.setList('discoveries', this.discoveries.filter(g => String(g.id) !== liveId && String(g.id) !== String(current.id)));
      return { kind: current.liveDivergence ? 'divergent' : 'known', gift: current, divergence: current.liveDivergence };
    }

    const list = this.discoveries;
    const i = list.findIndex(sameId(incoming.id));
    const merged = mergeDiscovery(i >= 0 ? list[i] : null, event, now);
    if (i >= 0) list[i] = merged; else list.unshift(merged);
    this.store.setList('discoveries', list.slice(0, 1000));
    return { kind: 'discovered', gift: merged };
  }

  save(id) {
    const source = this.discoveries.find(sameId(id)) || this.saved.find(sameId(id));
    if (!source) throw new Error('Presente não encontrado.');
    const list = this.saved;
    const i = list.findIndex(sameId(id));
    const item = { ...source, savedAt: this.clock() };
    if (i >= 0) list[i] = item; else list.unshift(item);
    this.store.setList('saved', list);
    return item;
  }

  edit(id, patch) {
    const apply = list => list.map(g => sameId(id)(g) ? { ...g, ...patch, id: String(g.id), manualValue: patch.diamondCount !== undefined ? true : g.manualValue } : g);
    this.store.setList('discoveries', apply(this.discoveries));
    this.store.setList('saved', apply(this.saved));
    return this.discoveries.find(sameId(id)) || this.saved.find(sameId(id));
  }

  verify(id) {
    const candidate = this.discoveries.find(sameId(id)) || this.saved.find(sameId(id));
    if (!candidate) throw new Error('Presente não encontrado.');
    const validation = catalogValidation(candidate);
    if (!validation.ok) throw new Error(`Não pode catalogar: falta ${validation.missing.join(', ')}.`);
    const item = { ...candidate, liveVerified: true, verifiedAt: this.clock(), liveVerifiedCount: candidate.seen || 1, source: 'live-discovery', liveDivergence: null };
    const verified = this.verified.filter(g => !sameId(id)(g));
    verified.push(item);
    this.store.setList('verified', verified);
    this.store.setList('discoveries', this.discoveries.filter(g => !sameId(id)(g)));
    return item;
  }

  correctVerified(id, field) {
    const verified = this.verified;
    const i = verified.findIndex(sameId(id));
    if (i < 0) throw new Error('Presente verificado não encontrado.');
    const g = { ...verified[i] };
    const d = g.liveDivergence;
    if (!d || !d[field]) return g;

    if (field === 'name') g.name = String(d.name.live || g.name);
    if (field === 'value') {
      const n = Number(d.value.live);
      if (!(n > 0)) throw new Error('Valor recebido da Live é inválido.');
      g.diamondCount = n;
      g.manualValue = true;
    }
    if (field === 'id') {
      const nextId = String(d.id.live || '').trim();
      if (!nextId) throw new Error('ID recebido da Live é inválido.');
      if (verified.some((x, pos) => pos !== i && String(x.id) === nextId)) throw new Error('O ID recebido já pertence a outro presente verificado.');
      g.id = nextId;
    }

    const liveId = String(g.liveVerifiedId || g.id);
    const liveName = String(g.liveVerifiedName || g.name);
    const liveValue = Number(g.liveVerifiedValue) || 0;
    const idDiff = liveId && String(g.id) !== liveId;
    const nameDiff = norm(liveName) && norm(g.name) !== norm(liveName);
    const valueDiff = liveValue > 0 && Number(g.diamondCount) > 0 && liveValue !== Number(g.diamondCount);
    g.liveDivergence = idDiff || nameDiff || valueDiff ? {
      at: this.clock(),
      matchedBy: d.matchedBy || 'manual',
      id: idDiff ? { catalog: String(g.id), live: liveId } : null,
      name: nameDiff ? { catalog: g.name, live: liveName } : null,
      value: valueDiff ? { catalog: Number(g.diamondCount), live: liveValue } : null
    } : null;
    g.lastLiveVerifiedAt = this.clock();
    verified[i] = g;
    this.store.setList('verified', verified);
    return g;
  }

  removeSaved(id) { this.store.setList('saved', this.saved.filter(g => !sameId(id)(g))); }
  clearHistory() { this.store.clearDiscoveries(); }
}
