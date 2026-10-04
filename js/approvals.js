// Approval engine + Approval Queue (management only).
import * as S from './store.js';
import * as Auth from './auth.js';
import { ui, esc, val, toast, modal, closeModal, head, table, pill, defineView, defineActions, render, kpi, registry } from './ui.js';
import { icon } from './icons.js';
import { money, price, fmtDT, tabTotal } from './store.js';
import { finishSession } from './domain.js';

export const TYPES = {
  discount: 'Discount', void_item: 'Void / cancelled item', refund: 'Refund / void of paid sale', comp: 'Complimentary item', price_override: 'Price override',
  inventory_adjust: 'Inventory adjustment', cash_variance: 'Cash shortage / overage', tab_close_unpaid: 'Close tab without full payment', edit_paid: 'Edit paid transaction',
};
const NEVER_DIRECT = ['cash_variance']; // an admin can never self-approve their own cash variance

const tabOf = (s, id) => s.tabs.find(t => t.id === id);
function itemOf(t, name) { return t?.items.find(i => i.name === name); }

// Applies an approved request. Returns '' on success or an error string (nothing mutated on error).
function apply(s, ap) {
  const P = ap.payload || {}, ts = S.now();
  switch (ap.type) {
    case 'discount': { const t = tabOf(s, ap.ref); if (!t || t.status !== 'open') return 'The tab is no longer open.'; t.discount = { type: P.type, value: +P.value, reason: ap.reason, approvedBy: ap.decidedBy, approvedByName: ap.decidedByName, at: ap.decidedAt }; return ''; }
    case 'void_item': { const t = tabOf(s, ap.ref), it = itemOf(t, P.itemName); if (!t || t.status !== 'open') return 'The tab is no longer open.'; if (!it) return 'Item is no longer on the tab.'; const q = Math.min(+P.qty || 1, it.qty); t.voids.push({ name: it.name, qty: q, value: S.r2(it.price * q), listValue: S.r2((it.listPrice ?? it.price) * q), at: ts, by: ap.requestedBy, reason: ap.reason, approvedBy: ap.decidedBy }); it.qty -= q; if (it.qty <= 0) t.items.splice(t.items.indexOf(it), 1); S.restock(s, P.itemName, q, t.id, 'void'); return ''; }
    case 'comp': { const t = tabOf(s, ap.ref), it = itemOf(t, P.itemName); if (!t || t.status !== 'open') return 'The tab is no longer open.'; if (!it) return 'Item is no longer on the tab.'; if (!it.comp) { it.listPrice = it.price; it.price = 0; it.comp = true; it.compBy = ap.decidedBy; } return ''; }
    case 'price_override': { const t = tabOf(s, ap.ref), it = itemOf(t, P.itemName); if (!t || t.status !== 'open') return 'The tab is no longer open.'; if (!it) return 'Item is no longer on the tab.'; if (it.listPrice === undefined) it.listPrice = it.price; it.price = +P.newPrice; it.overridden = true; return ''; }
    case 'refund': { const x = s.sales.find(q => q.id === ap.ref); if (!x) return 'Sale not found.'; if (x.refunded) return 'This sale was already refunded/voided.'; x.refunded = { kind: P.kind, at: ts, atISO: S.manilaISO(ts), by: ap.requestedBy, approvedBy: ap.decidedBy, reason: ap.reason, amount: x.total, approvalId: ap.id }; return ''; }
    case 'edit_paid': { const x = s.sales.find(q => q.id === ap.ref); if (!x) return 'Sale not found.'; if (x.refunded) return 'Sale was refunded/voided.'; x.edits.push({ at: ts, atISO: S.manilaISO(ts), by: ap.requestedBy, approvedBy: ap.decidedBy, field: 'tender', from: x.tender, to: P.newTender, reason: ap.reason, approvalId: ap.id }); x.tender = P.newTender; return ''; }
    case 'inventory_adjust': { const inv = s.inventory.find(i => i.id === ap.ref); if (!inv) return 'Item not found.'; const before = inv.qty; inv.qty = Math.max(0, +(inv.qty + (+P.delta)).toFixed(3)); inv.adjustedAt = ts; s.moves.push({ id: 'mv' + (++s.seq), ts, invId: inv.id, delta: +(inv.qty - before).toFixed(3), type: 'adjust', ref: ap.id, by: ap.requestedBy, note: ap.reason }); return ''; }
    case 'cash_variance': { const c = s.closeouts.find(q => q.id === ap.ref); if (!c) return 'Closeout not found.'; c.status = 'approved'; c.finalizedAt = ts; return ''; }
    case 'tab_close_unpaid': { const t = tabOf(s, ap.ref); if (!t || t.status !== 'open') return 'The tab is no longer open.'; t.status = 'closed_unpaid'; t.unpaid = tabTotal(t); t.closedAt = ts; t.closedBy = ap.requestedBy; t.closeReason = ap.reason; s.sessions.filter(q => !q.end && q.tabId === t.id).forEach(q => finishSession(s, q.id, 'tab closed unpaid (approved) — bay returned to Available')); return ''; }
  }
  return 'Unknown request type.';
}

// Create a request. Management applies directly (with reason + audit); everyone else queues for approval.
export function request(type, { ref, refLabel, amount, reason, payload }) {
  reason = String(reason || '').trim();
  if (!reason) return { ok: false, error: 'A reason is required.' };
  const need = type === 'inventory_adjust' ? ['inventory.request', 'inventory.adjust'] : 'requests.create';
  if (!Auth.can(need) && !Auth.can('approvals.manage')) return { ok: false, error: 'Your role cannot raise this request.' };
  const s = S.get();
  if (s.approvals.some(a => a.status === 'pending' && a.type === type && a.ref === ref && JSON.stringify(a.payload?.itemName || '') === JSON.stringify(payload?.itemName || ''))) return { ok: false, error: 'A request for this is already waiting for approval.' };
  const direct = Auth.can('approvals.manage') && !NEVER_DIRECT.includes(type);
  let err = '';
  S.commit(st => {
    const ap = S.mkApprovalRecord(st, type, ref, refLabel, amount, reason, payload);
    if (direct) {
      const me = S.ctx.actor, ts = S.now();
      Object.assign(ap, { status: 'approved', direct: true, decidedBy: me.id, decidedByName: me.name, decidedAt: ts, decidedISO: S.manilaISO(ts), decisionNote: 'Direct management action (self-authorised, reason recorded)' });
      err = apply(st, ap); if (err) return;
      S.log(st, 'mgmt_action', `${TYPES[type]} applied by management — ${ap.refLabel} · ${money(ap.amount)} — ${reason}`);
    } else S.log(st, 'approval_requested', `${TYPES[type]} requested — ${ap.refLabel} · ${money(ap.amount)} — ${reason}`);
    st.approvals.push(ap);
  });
  return err ? { ok: false, error: err } : { ok: true, direct };
}

export function decide(id, approve, note) {
  const me = S.ctx.actor;
  if (!Auth.can('approvals.manage')) return 'Only Management can decide requests.';
  const s = S.get(), ap0 = s.approvals.find(a => a.id === id);
  if (!ap0 || ap0.status !== 'pending') return 'This request has already been decided.';
  if (ap0.requestedBy === me.id) return 'You cannot approve or reject your own request. Another administrator must decide it.';
  if (!approve && !String(note).trim()) return 'Please give a reason for rejecting.';
  let err = '';
  S.commit(st => {
    const ap = st.approvals.find(a => a.id === id), ts = S.now();
    Object.assign(ap, { status: approve ? 'approved' : 'rejected', decidedBy: me.id, decidedByName: me.name, decidedAt: ts, decidedISO: S.manilaISO(ts), decisionNote: String(note || '').trim() || (approve ? 'Approved' : '') });
    if (approve) { err = apply(st, ap); if (err) { Object.assign(ap, { status: 'pending', decidedBy: null, decidedByName: null, decidedAt: null, decidedISO: null, decisionNote: '' }); return; } }
    else if (ap.type === 'cash_variance') { const c = st.closeouts.find(q => q.id === ap.ref); if (c) c.status = 'rejected'; }
    S.log(st, approve ? 'approval_granted' : 'approval_rejected', `${TYPES[ap.type]} ${approve ? 'APPROVED' : 'REJECTED'} — ${ap.refLabel} · ${money(ap.amount)} · requested by ${ap.requestedByName}${ap.decisionNote ? ' — ' + ap.decisionNote : ''}`);
  });
  return err;
}

// ---------- request forms ----------
const reasonField = '<div class="field"><label for="rq_reason">Reason (required)</label><textarea id="rq_reason" rows="2" placeholder="Why is this needed?"></textarea></div>';
export const pendingCount = () => S.get().approvals.filter(a => a.status === 'pending').length;

export function openRequest(type, d = {}) {
  const s = S.get(), me = Auth.isAdmin(), t = d.tab && tabOf(s, d.tab), x = d.sale && s.sales.find(q => q.id === d.sale);
  const note = me ? '<div class="notice green">As Management this is applied immediately; your reason is saved in the audit log.</div>' : '<div class="notice orange">This request needs Management approval before it takes effect.</div>';
  const items = t ? t.items.map(i => `<option value="${esc(i.name)}" ${d.item === i.name ? 'selected' : ''}>${i.qty} × ${esc(i.name)} — ${price(i.price)}</option>`).join('') : '';
  let body = '';
  if (type === 'discount') body = `<div class="field"><label for="rq_dt">Type</label><select id="rq_dt"><option value="pct">Percent (%)</option><option value="amt">Fixed amount (₱)</option></select></div><div class="field"><label for="rq_dv">Value</label><input id="rq_dv" type="number" step="0.01" min="0" inputmode="decimal"></div>`;
  if (type === 'void_item') body = `<div class="field"><label for="rq_item">Item to void / cancel</label><select id="rq_item">${items}</select></div><div class="field"><label for="rq_qty">Quantity</label><input id="rq_qty" type="number" min="1" value="1"></div>`;
  if (type === 'comp') body = `<div class="field"><label for="rq_item">Item to make complimentary</label><select id="rq_item">${items}</select></div>`;
  if (type === 'price_override') body = `<div class="field"><label for="rq_item">Item</label><select id="rq_item">${items}</select></div><div class="field"><label for="rq_np">New unit price (₱)</label><input id="rq_np" type="number" step="0.01" min="0" inputmode="decimal"></div>`;
  if (type === 'refund') body = `<div class="field"><label for="rq_kind">Type</label><select id="rq_kind"><option value="refund">Refund (customer)</option><option value="void">Void (entry error)</option></select></div><p class="muted">Amount affected: <b>${money(x.total)}</b></p>`;
  if (type === 'edit_paid') body = `<div class="field"><label for="rq_tender">Correct payment method</label><select id="rq_tender">${['cash', 'gcash', 'card', 'member'].filter(k => k !== x.tender).map(k => `<option value="${k}">${({ cash: 'Cash', gcash: 'GCash', card: 'Card', member: 'Charge to Member' })[k]}</option>`).join('')}</select></div><p class="muted">Currently recorded as ${esc(x.tender)}. The original value is kept in the edit history.</p>`;
  if (type === 'tab_close_unpaid') body = `<p class="muted">Unpaid balance to be written off: <b class="c-red">${money(tabTotal(t))}</b>. The bay is released.</p>`;
  if (type === 'inventory_adjust') body = `<div class="field"><label for="rq_inv">Stock item</label><select id="rq_inv">${s.inventory.map(i => `<option value="${i.id}" ${d.inv === i.id ? 'selected' : ''}>${esc(i.name)} (on hand ${+i.qty.toFixed(1)} ${i.unit})</option>`).join('')}</select></div><div class="field"><label for="rq_delta">Change in quantity (negative to remove)</label><input id="rq_delta" type="number" step="any"></div>`;
  modal(`<h2>${icon('alert')} ${TYPES[type]}</h2>${t ? `<p class="muted">${esc(t.player)} · tab ${t.id}</p>` : ''}${x ? `<p class="muted">Receipt ${x.id} · ${fmtDT(x.time)}</p>` : ''}${note}${body}${reasonField}<div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn orange" data-a="submitRequest" data-type="${type}" data-tab="${d.tab || ''}" data-sale="${d.sale || ''}">${me ? 'Apply (management)' : 'Send for approval'}</button></div>`);
}
function submitRequest(d) {
  const s = S.get(), type = d.type, t = d.tab && tabOf(s, d.tab), x = d.sale && s.sales.find(q => q.id === d.sale), reason = val('rq_reason');
  let ref, refLabel, amount = 0, payload = {};
  const it = () => itemOf(t, val('rq_item'));
  if (type === 'discount') { const v = parseFloat(val('rq_dv')), ty = val('rq_dt'); if (!(v > 0)) return toast('Enter a discount value', 'err'); if (ty === 'pct' && v > 100) return toast('Percent cannot exceed 100', 'err'); ref = t.id; refLabel = `${t.player}'s tab`; amount = S.discAmount(S.tabGross(t), { type: ty, value: v }); payload = { type: ty, value: v }; }
  else if (type === 'void_item') { const i = it(), q = Math.max(1, parseInt(val('rq_qty')) || 1); if (!i) return; ref = t.id; refLabel = `${t.player}'s tab · ${i.name}`; amount = i.price * Math.min(q, i.qty); payload = { itemName: i.name, qty: q }; }
  else if (type === 'comp') { const i = it(); if (!i) return; if (i.comp) return toast('Already complimentary', 'err'); ref = t.id; refLabel = `${t.player}'s tab · ${i.name}`; amount = i.price * i.qty; payload = { itemName: i.name }; }
  else if (type === 'price_override') { const i = it(), np = parseFloat(val('rq_np')); if (!i || !(np >= 0)) return toast('Enter the new price', 'err'); ref = t.id; refLabel = `${t.player}'s tab · ${i.name}`; amount = Math.abs(i.price - np) * i.qty; payload = { itemName: i.name, newPrice: np }; }
  else if (type === 'refund') { ref = x.id; refLabel = `Receipt ${x.id}`; amount = x.total; payload = { kind: val('rq_kind') }; }
  else if (type === 'edit_paid') { ref = x.id; refLabel = `Receipt ${x.id}`; amount = x.total; payload = { newTender: val('rq_tender') }; }
  else if (type === 'tab_close_unpaid') { ref = t.id; refLabel = `${t.player}'s tab`; amount = tabTotal(t); }
  else if (type === 'inventory_adjust') { const inv = s.inventory.find(i => i.id === val('rq_inv')), dl = parseFloat(val('rq_delta')); if (!inv || !dl) return toast('Enter a quantity change', 'err'); ref = inv.id; refLabel = inv.name; amount = Math.abs(dl) * inv.cost; payload = { delta: dl }; }
  const r = request(type, { ref, refLabel, amount, reason, payload });
  if (!r.ok) return toast(r.error, 'err');
  closeModal(); toast(r.direct ? 'Applied — recorded in the audit log' : 'Sent to Management for approval');
  if (d.tab && tabOf(S.get(), d.tab)) registry.actions.tabOpen?.[1]({ id: d.tab, end: ui.tabEnd });
}

// ---------- queue view ----------
function statusPill(a) { return a.status === 'pending' ? pill('Pending', 'orange') : a.status === 'approved' ? pill(a.direct ? 'Approved · direct' : 'Approved', 'green') : pill('Rejected', 'red'); }
defineView({ route: 'approvals', label: 'Approval Queue', icon: 'check', group: 'Management', perm: 'approvals.manage', badge: () => pendingCount(),
  render() {
    const s = S.get(), f = ui.q || 'pending', list = s.approvals.filter(a => f === 'all' || a.status === f).sort((a, b) => b.requestedAt - a.requestedAt);
    const me = S.ctx.actor.id, sub = t => `<div class="muted" style="font-size:12px">${t}</div>`, rows = list.map(a => ({
      type: TYPES[a.type], ref: `${esc(a.refLabel)}${sub(esc(a.ref))}`, amount: a.amount,
      by: `${esc(a.requestedByName)}${sub(fmtDT(a.requestedAt))}`, byS: a.requestedByName, at: a.requestedAt,
      reason: esc(a.reason) + (a.decisionNote && a.status !== 'pending' ? sub('Decision: ' + esc(a.decisionNote)) : ''),
      status: statusPill(a), approver: a.decidedByName ? `${esc(a.decidedByName)}${sub(fmtDT(a.decidedAt))}` : '—', apS: a.decidedByName || '', decidedAt: a.decidedAt || 0,
      act: a.status === 'pending' ? (a.requestedBy === me ? `<span class="muted" style="font-size:12px">Your own request — another admin must decide</span>` : `<div class="row" style="flex-wrap:nowrap;gap:6px"><button class="btn sm" data-a="decideOpen" data-id="${a.id}" data-yes="1">${icon('check', 16)} Approve</button><button class="btn sm red" data-a="decideOpen" data-id="${a.id}" data-yes="0">${icon('x', 16)} Reject</button></div>`) : '',
    }));
    const cnt = k => s.approvals.filter(a => a.status === k).length;
    return head('Approval Queue', 'Discounts, voids, refunds, complimentary items, price overrides, stock adjustments, cash variances and unpaid-tab closures.') + `
      <div class="tabs-seg" style="margin-bottom:16px">${[['pending', `Pending (${cnt('pending')})`], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-a="apFilter" data-f="${k}">${l}</button>`).join('')}</div>
      ${table('approvals', [{ key: 'type', label: 'Request type' }, { key: 'ref', label: 'Tab / transaction', type: 'html', sortKey: 'type' }, { key: 'amount', label: 'Amount affected', type: 'money' }, { key: 'by', label: 'Requested by / when', type: 'html', sortKey: 'at' }, { key: 'reason', label: 'Reason', type: 'html', sortKey: 'type' }, { key: 'status', label: 'Status', type: 'html', sortKey: 'status' }, { key: 'approver', label: 'Admin approver / when', type: 'html', sortKey: 'decidedAt' }, { key: 'act', label: '', type: 'html' }], rows, { empty: 'Nothing in this view.', sort: { key: 'at', dir: 'desc' } })}`;
  } });
defineActions({
  apFilter: ['approvals.manage', d => { ui.q = d.f; render(); }],
  decideOpen: ['approvals.manage', d => {
    const a = S.get().approvals.find(x => x.id === d.id), yes = d.yes === '1';
    modal(`<h2>${yes ? 'Approve' : 'Reject'} request</h2><p class="muted">${TYPES[a.type]} · ${esc(a.refLabel)} · <b>${money(a.amount)}</b><br>Requested by ${esc(a.requestedByName)} on ${fmtDT(a.requestedAt)}</p><div class="notice orange"><b>Reason given:</b> ${esc(a.reason)}</div><div class="field"><label for="dec_note">${yes ? 'Approval note (optional)' : 'Reason for rejecting (required)'}</label><textarea id="dec_note" rows="2"></textarea></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn ${yes ? '' : 'red'}" data-a="decideDo" data-id="${a.id}" data-yes="${d.yes}">${yes ? 'Approve' : 'Reject'}</button></div>`);
  }],
  decideDo: ['approvals.manage', d => { const err = decide(d.id, d.yes === '1', val('dec_note')); if (err) return toast(err, 'err'); closeModal(); toast(d.yes === '1' ? 'Approved' : 'Rejected'); }],
  requestOpen: ['requests.create|approvals.manage|inventory.request', d => openRequest(d.type, d)],
  submitRequest: ['requests.create|approvals.manage|inventory.request', submitRequest],
});
