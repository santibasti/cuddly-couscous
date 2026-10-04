// Shared UI state, helpers, view/action registry, sortable tables, printable documents.
import { CLUB, APP, logo } from './brand.js';
import { icon } from './icons.js';
import * as S from './store.js';
import * as Auth from './auth.js';
import { money, fmtTime, fmtDT, fmtKey, longDate, hrs, durFmt, num } from './store.js';

export const ui = { route: 'dashboard', navOpen: false, tabFilter: 'open', cat: 'All', cart: [], sort: {}, tabEnd: '', q: '', rep: { id: 'top-visitors', preset: 'month', from: '', to: '', staff: 'all', role: 'all', days: 30, bucket: 'day' }, mgmt: { preset: 'week', from: '', to: '' }, attTab: 'me', auditF: { user: 'all', type: 'all' }, staffTab: 'staff', cafe: { target: 'new', name: '' } };
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const val = id => document.getElementById(id)?.value ?? '';

let renderFn = () => {};
export const setRender = f => { renderFn = f; };
export const render = () => renderFn();

export const registry = { views: [], actions: {} };
export const defineView = v => registry.views.push(v);
export const defineActions = m => Object.assign(registry.actions, m);

export function toast(msg, kind = '') { const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; $('#toast-root').append(el); setTimeout(() => el.remove(), 3200); }
export function modal(html, wide) {
  $('#modal-root').innerHTML = `<div class="overlay" data-a="overlay"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  syncLogos($('#modal-root'));
  const f = $('#modal-root input:not([type=checkbox]):not([type=date]),#modal-root select,#modal-root textarea'); if (f) f.focus({ preventScroll: true });
}
import { syncLogos } from './brand.js';
export const closeModal = () => { $('#modal-root').innerHTML = ''; };
export const modalOpen = () => !!$('#modal-root .overlay');

export const clockHtml = () => `<div class="clock" title="Philippine Time (Asia/Manila, UTC+8)">${icon('calendar', 18)}<span class="js-date">${longDate(Date.now())}</span><span class="sep">|</span>${icon('clock', 18)}<span class="js-time time">${fmtTime(Date.now())}</span></div>`;
export const head = (title, sub, actions = '', clock = false) => `<div class="pagehead"><div class="titles"><div class="eyebrow">${CLUB}</div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="headright">${clock ? clockHtml() : ''}<div class="actions">${actions}</div></div></div>`;
export const deny = () => `<div class="card" style="max-width:520px"><h2 class="c-red">${icon('alert')} Access restricted</h2><p class="muted">Your role does not include this screen. Please ask Management if you need access.</p></div>`;
export const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
export const kpi = (v, l, ico, c = '', sub = '') => `<div class="kpi ${c}"><div class="ico">${icon(ico, 24)}</div><div><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div></div>`;

// ---------- sortable table ----------
export function fmtCell(type, v) {
  if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
  switch (type) {
    case 'money': return money(v); case 'int': return String(Math.round(v)); case 'num': return num(v);
    case 'dt': return fmtDT(v); case 'time': return fmtTime(v); case 'date': return fmtKey(v); case 'pct': return (+v).toFixed(1) + '%';
    case 'hrs': return hrs(v); case 'dur': return durFmt(v); case 'html': return v; default: return esc(v);
  }
}
export function plainCell(type, v) { // for exports
  if (v === null || v === undefined) return '';
  switch (type) { case 'dt': return S.manilaISO(v).replace('T', ' ').slice(0, 16); case 'time': return fmtTime(v); case 'date': return v; case 'pct': return +(+v).toFixed(2); case 'hrs': return +(v / 60).toFixed(2); case 'dur': return Math.round(v); case 'html': return String(v).replace(/<[^>]+>/g, ''); default: return v; }
}
export function table(id, cols, rows, o = {}) {
  const st = ui.sort[id] || o.sort || null;
  let data = rows.slice();
  if (st) { const c = cols.find(x => x.key === st.key); const k = c?.sortKey || st.key; data.sort((a, b) => { const x = a[k], y = b[k]; const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }); return st.dir === 'asc' ? r : -r; }); }
  const lim = o.limit ? data.slice(0, o.limit) : data;
  return `<div class="tablewrap"><table class="sortable"><thead><tr>${cols.map(c => `<th class="${c.align === 'right' || ['money', 'int', 'num', 'pct', 'hrs', 'dur'].includes(c.type) ? 'right' : ''}"><button class="thbtn" data-a="sort" data-t="${id}" data-k="${c.key}" aria-label="Sort by ${esc(c.label)}">${esc(c.label)}${st?.key === c.key ? `<span class="arr">${st.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</button></th>`).join('')}</tr></thead><tbody>${lim.map(r => `<tr class="${r._cls || ''}">${cols.map(c => `<td class="${c.align === 'right' || ['money', 'int', 'num', 'pct', 'hrs', 'dur'].includes(c.type) ? 'right' : ''}">${fmtCell(c.type, r[c.key])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">${o.empty || 'No records for this selection.'}</td></tr>`}</tbody></table></div>${o.limit && data.length > o.limit ? `<div class="muted" style="margin-top:6px;font-size:12px">Showing ${o.limit} of ${data.length}. Export for the full list.</div>` : ''}`;
}
defineActions({
  sort: [null, d => { const cur = ui.sort[d.t]; ui.sort[d.t] = { key: d.k, dir: cur && cur.key === d.k && cur.dir === 'desc' ? 'asc' : 'desc' }; render(); }],
});

// ---------- printable documents ----------
export function receiptHtml(sale, label = 'Receipt') {
  const eff = sale.refunded ? `<hr><div class="nm">*** ${sale.refunded.kind === 'void' ? 'VOIDED' : 'REFUNDED'} ***</div><div>${esc(sale.refunded.reason)}</div>` : '';
  return `<div class="doc printable"><div class="receipt">${logo()}<div class="nm">${CLUB}</div><div>${APP}</div><hr>
    <div class="l"><span>${label} #${esc(sale.id)}</span><span>${fmtDT(sale.time)}</span></div><div class="l"><span>Cashier</span><span>${esc(sale.cashierName || '')}</span></div><hr>
    ${sale.lines.map(l => `<div class="l"><span>${l.qty} × ${esc(l.name)}${l.comp ? ' (COMP)' : ''}</span><span>${money(l.price * l.qty)}</span></div>`).join('')}<hr>
    <div class="l"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>${sale.discount ? `<div class="l"><span>Discount${sale.discount.type === 'pct' ? ` (${sale.discount.value}%)` : ''}</span><span>-${money(sale.discount.amount)}</span></div>` : ''}<div class="l"><span>Tax</span><span>${money(sale.tax)}</span></div>
    <div class="l nm"><span>TOTAL</span><span>${money(sale.total)}</span></div><div class="l"><span>Paid by</span><span>${esc(TENDER[sale.tender] || sale.tender)}</span></div>${eff}<hr><div class="l"><span>Currency</span><span>PHP (₱)</span></div><div>Philippine Time (UTC+8)</div><hr><div>Thank you for visiting<br>${CLUB}</div></div></div>`;
}
export const TENDER = { cash: 'Cash', gcash: 'GCash', card: 'Card', member: 'Charge to Member' };
export function reportDoc(title, body, sub = '') {
  const u = Auth.user();
  return `<div class="doc printable"><div class="report-head">${logo()}<div class="t"><b>${CLUB}</b><div>${APP}</div><div class="muted">${esc(title)}${sub ? ' · ' + esc(sub) : ''}</div><div class="muted" style="font-size:12px">Generated ${fmtDT(Date.now())} PHT${u ? ' by ' + esc(u.name) : ''}</div></div></div>${body}</div>`;
}
export const docModal = html => modal(`${html}<div class="foot"><button class="btn secondary" data-a="close">Close</button><button class="btn purple" data-a="print">${icon('print')} Print / Save PDF</button></div>`, true);
defineActions({ close: [null, closeModal], print: [null, () => window.print()] });

// ---------- re-enter own PIN/password (individual accountability on shared tablets) ----------
let pinCb = null;
export function askPin(title, onOk, extra = '') {
  pinCb = onOk;
  modal(`<h2>${icon('member')} ${esc(title)}</h2><p class="muted">Confirm it's you, ${esc(Auth.user().name)}. Enter your personal PIN or password.</p>${extra}<div class="field"><label for="pinc">PIN or password</label><input id="pinc" type="password" autocomplete="off" inputmode="numeric"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="pinOk">Confirm</button></div>`);
}
defineActions({
  pinOk: [null, () => { if (!Auth.verifyPin(Auth.user(), val('pinc'))) return toast('Incorrect PIN or password', 'err'); const cb = pinCb; pinCb = null; closeModal(); cb && cb(); }],
});
