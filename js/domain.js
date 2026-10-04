// Shared operational logic (used by Range, Tabs, POS, Café, Approvals).
import * as S from './store.js';
import * as Auth from './auth.js';
import { money, elapsed, tabTotal } from './store.js';

export const bayStatusLabel = { available: 'Available', occupied: 'In Use', reserved: 'Reserved', maintenance: 'Maintenance' };
export const openTabs = () => S.get().tabs.filter(t => t.status === 'open');
export const activeSession = (s, bayId) => s.sessions.find(q => !q.end && q.bayId === bayId);

export function findOrCreatePlayer(s, name, memberId) {
  let p = memberId ? s.players.find(x => x.memberId === memberId) : s.players.find(x => !x.memberId && x.name.toLowerCase() === name.toLowerCase());
  if (!p) { p = { id: 'pl' + (++s.seq), name, memberId: memberId || null, createdAt: S.now(), w: 1 }; s.players.push(p); S.log(s, 'player_created', `New player record: ${name}`); }
  return p;
}
export function findOrCreateTab(s, player, memberId, extra = {}) {
  const pl = findOrCreatePlayer(s, player, memberId);
  let t = !extra.walkin && s.tabs.find(x => x.status === 'open' && !x.walkin && x.playerId === pl.id);
  if (!t) {
    const ts = S.now();
    t = { id: 't' + (++s.seq), player: pl.name, playerId: pl.id, memberId: pl.memberId, status: 'open', created: ts, createdISO: S.manilaISO(ts), openedBy: S.ctx.actor?.id, bayId: null, discount: null, voids: [], items: [], ...extra };
    s.tabs.push(t); S.log(s, 'tab_opened', `${extra.walkin ? 'Walk-in order' : 'Player tab'} ${t.id} opened for ${pl.name}`);
  }
  return t;
}
export function addToTab(s, tab, p, qty = 1) {
  const ex = tab.items.find(i => i.name === p.name && !i.comp && i.price === p.price), t = S.now();
  if (ex) { ex.qty += qty; ex.updatedAt = t; } else tab.items.push({ name: p.name, cat: p.cat, price: p.price, qty, addedAt: t, updatedAt: t, by: S.ctx.actor?.id });
  S.deduct(s, p.name, qty, tab.id);
  S.log(s, 'item_added', `${qty} × ${p.name} (${money(p.price * qty)}) added to ${tab.player}'s tab ${tab.id}`);
}
export function finishSession(s, id, why = 'Bay returned to Available') {
  const x = s.sessions.find(q => q.id === id); if (!x || x.end) return;
  x.end = S.now(); x.endISO = S.manilaISO(x.end);
  const b = s.bays.find(q => q.id === x.bayId); if (b && b.status === 'occupied') b.status = 'available';
  S.log(s, 'session_end', `Bay ${x.bayId} session ended for ${x.player} (${elapsed(x.start)}) — ${why}`);
}
export const productAllowed = p => (p.cat === 'Range' ? Auth.can('tabs.addBucket') : p.cat === 'Pro Shop' ? Auth.can('pos.checkout') : Auth.can('tabs.addFood'));
export function stockBlocked(p) { const i = S.get().inventory.find(x => x.id === p.stock); return !p.available || (i && i.qty <= 0); }

// Starts a session: validates against duplicate sessions and conflicting bay assignment.
export function startSessionCommit({ bay, playerName, memberId, tabId, productId }) {
  const s = S.get(), p = s.products.find(x => x.id === productId), b = s.bays.find(x => x.id === bay);
  if (!b || bay < 1 || bay > S.BAY_COUNT) return 'Invalid bay.';
  if (b.status !== 'available' || activeSession(s, bay)) return `Bay ${bay} is not available (${bayStatusLabel[b.status]}). Choose another bay.`;
  if (!p || p.cat !== 'Range') return 'Choose a bucket size.';
  if (stockBlocked(p)) return 'That bucket size is out of stock.';
  let tab = tabId && s.tabs.find(t => t.id === tabId && t.status === 'open');
  const nm = tab ? tab.player : playerName, mid = tab ? tab.memberId : memberId;
  if (!nm) return 'Select an open tab or enter the player name.';
  const pl0 = mid ? s.players.find(x => x.memberId === mid) : s.players.find(x => !x.memberId && x.name.toLowerCase() === nm.toLowerCase());
  if (pl0 && s.sessions.some(q => !q.end && q.playerId === pl0.id)) return `${nm} already has an active session on Bay ${s.sessions.find(q => !q.end && q.playerId === pl0.id).bayId}.`;
  S.commit(st => {
    const t = tab ? st.tabs.find(x => x.id === tab.id) : findOrCreateTab(st, nm, mid), pl = findOrCreatePlayer(st, nm, mid);
    addToTab(st, t, st.products.find(x => x.id === productId));
    t.bayId = bay; st.bays.find(x => x.id === bay).status = 'occupied';
    const ts = S.now(); st.sessions.push({ id: 's' + (++st.seq), bayId: bay, player: pl.name, playerId: pl.id, tabId: t.id, bucket: p.name, start: ts, startISO: S.manilaISO(ts), end: null, startedBy: S.ctx.actor.id });
    S.log(st, 'session_start', `Bay ${bay} assigned to ${pl.name} — ${p.name} (tab ${t.id})`);
  });
  return '';
}

// Settles a tab exactly once (duplicate-payment guard). Returns {sale} or {error}.
export function settleTab(tabId, tender, endSessionId) {
  let out = {};
  S.commit(s => {
    const t = s.tabs.find(x => x.id === tabId);
    if (!t) return void (out.error = 'Tab not found.');
    if (t.status !== 'open') return void (out.error = `This tab was already ${t.status === 'paid' ? 'paid' : 'closed'} — no duplicate payment recorded.`);
    if (!t.items.length) return void (out.error = 'Tab has no charges.');
    if (tender === 'member' && !t.memberId) return void (out.error = 'Charge to Member needs a member account on the tab.');
    if (s.sales.some(x => x.tabId === t.id && !x.refunded)) return void (out.error = 'A payment for this tab already exists.');
    const sale = S.makeSale(s, t.items, tender, t.id, t.discount, { playerId: t.playerId, memberId: t.memberId });
    t.status = 'paid'; t.paid = S.now(); t.paidISO = S.manilaISO(t.paid); t.saleId = sale.id;
    S.log(s, 'tab_settled', `${t.player}'s tab ${t.id} settled (${money(sale.total)})`);
    const ses = endSessionId ? s.sessions.find(q => q.id === endSessionId) : s.sessions.find(q => !q.end && q.tabId === t.id);
    if (ses) finishSession(s, ses.id, 'payment received — bay returned to Available');
    out.sale = sale;
  });
  return out;
}
