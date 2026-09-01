export const GIFT_STATUS = Object.freeze({ DISCOVERED: 'discovered', SAVED: 'saved', VERIFIED: 'verified' });

export function normalizeGift(input = {}, now = Date.now()) {
  const id = String(input.id ?? input.giftId ?? '').trim();
  const name = String(input.name ?? input.gift ?? input.giftName ?? (id ? `gift-${id}` : '')).trim();
  const rawValue = input.diamondCount ?? input.value ?? 0;
  const diamondCount = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;
  const icon = String(input.icon ?? input.giftIcon ?? input.image ?? input.iconUrl ?? input.imageUrl ?? '').trim();
  const count = Math.max(1, Number(input.count ?? input.seen ?? input.liveVerifiedCount ?? 1) || 1);
  return { id, name, diamondCount, icon, firstSeen: Number(input.firstSeen ?? input.firstLiveVerifiedAt ?? now) || now, lastSeen: Number(input.lastSeen ?? input.lastLiveVerifiedAt ?? now) || now, seen: count, manualValue: Boolean(input.manualValue), source: String(input.source || 'live-discovery') };
}

export function catalogValidation(gift) {
  const g = normalizeGift(gift);
  const missing = [];
  if (!g.id) missing.push('id');
  if (!g.name || /^gift-\d+$/i.test(g.name)) missing.push('name');
  if (!(g.diamondCount > 0)) missing.push('value');
  if (!/^https?:\/\//i.test(g.icon)) missing.push('image');
  return { ok: missing.length === 0, missing };
}

export function mergeDiscovery(previous, incoming, now = Date.now()) {
  const next = normalizeGift(incoming, now);
  if (!previous) return next;
  const old = normalizeGift(previous, now);
  return { ...old, name: next.name && !/^gift-\d+$/i.test(next.name) ? next.name : old.name, diamondCount: old.manualValue ? old.diamondCount : (next.diamondCount || old.diamondCount), icon: next.icon || old.icon, firstSeen: Math.min(old.firstSeen, next.firstSeen), lastSeen: Math.max(now, next.lastSeen, old.lastSeen), seen: old.seen + Math.max(1, Number(incoming.count ?? 1) || 1) };
}
