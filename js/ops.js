// Operational screens: dashboard, range, bays, tabs, POS, café orders, menu, inventory, closeout, sales, members.
import { CLUB, APP, logo } from './brand.js';
import { icon } from './icons.js';
import * as S from './store.js';
import * as Auth from './auth.js';
import { ui, esc, val, toast, modal, closeModal, head, clockHtml, deny, pill, kpi, table, defineView, defineActions, render, docModal, receiptHtml, TENDER } from './ui.js';
import { money, price, fmtDT, fmtTime, elapsed, tabTotal, tabGross, discAmount, isOverdue, stockLevel, dayStart, dayKey, saleNet } from './store.js';
import { bayStatusLabel, openTabs, activeSession, findOrCreateTab, findOrCreatePlayer, addToTab, finishSession, productAllowed, stockBlocked, startSessionCommit, settleTab } from './domain.js';
import { openRequest, pendingCount, request } from './approvals.js';

const can = Auth.can;
const showMoney = () => can(['pay.collect', 'sales.viewAll', 'pos.checkout']);
const catIcon = c => ({ Range: 'bucket', Beverage: 'beverage', Food: 'food', 'Pro Shop': 'ball' }[c] || 'ball');
const reqOK = () => can(['requests.create', 'approvals.manage']);

// ---------- shared fragments ----------
function legend() { return `<span><i class="dot c-green"></i>Available</span><span><i class="dot" style="color:var(--purple)"></i>In Use</span><span><i class="dot c-orange"></i>Reserved</span><span><i class="dot c-gray"></i>Maintenance</span>`; }
function bayGrid(mini) {
  const s = S.get();
  return `<div class="bays">${s.bays.map(b => { const x = activeSession(s, b.id); return `<button class="bay ${b.status}" data-a="bay" data-id="${b.id}" aria-label="Bay ${b.id} ${bayStatusLabel[b.status]}">${icon('bay', 22)}<span class="n">Bay ${b.id}</span><span class="s"><i class="dot"></i>${bayStatusLabel[b.status]}</span><span class="who">${x ? esc(x.player) : ''}</span></button>`; }).join('')}</div>`;
}
const liveSearch = ph => `<div class="search">${icon('search', 18)}<input data-live="rows" placeholder="${ph}" aria-label="Search"></div>`;

// ---------- dashboard (operations) ----------
defineView({ route: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'Home', perm: null,
  render() {
    const s = S.get(), u = Auth.user(), a = S.ctx.actor;
    const active = s.sessions.filter(x => !x.end), ob = s.bays.filter(b => b.status === 'occupied').length, av = s.bays.filter(b => b.status === 'available').length;
    const todayS = s.sales.filter(x => x.time >= dayStart() && !x.refunded);
    const mine = todayS.filter(x => x.cashier === u.id);
    const k = [];
    if (can('bays.view')) k.push(kpi(`${ob} / ${s.bays.length}`, `Bays in use · ${av} available`, 'bay'));
    if (can('tabs.view')) k.push(kpi(String(openTabs().length), 'Active player tabs', 'tabs', 'orange'));
    if (can('sales.viewAll')) k.push(kpi(money(todayS.reduce((x, y) => x + y.total, 0)), `Sales today (${todayS.length})`, 'cash', 'green'));
    else if (can('sales.viewOwn')) k.push(kpi(money(mine.reduce((x, y) => x + y.total, 0)), `My sales today (${mine.length})`, 'cash', 'green'));
    if (can('tabs.view')) { const o = s.tabs.filter(isOverdue); k.push(kpi(String(o.length), 'Overdue tabs', 'alert', o.length ? 'red' : 'green')); }
    if (can('approvals.manage')) k.push(kpi(String(pendingCount()), 'Approvals waiting', 'check', pendingCount() ? 'orange' : 'green'));
    const over = s.tabs.filter(isOverdue);
    return `<div class="pagehead"><div class="brandhead row" style="gap:18px;flex:1">${logo('md')}<div><div class="eyebrow">${CLUB}</div><h1>${APP}</h1><div class="sub">Welcome, ${esc(u.name)} · ${esc(Auth.roleOf(u).label)}</div></div></div>
      <div class="headright">${clockHtml()}<div class="actions">${can('bays.assign') ? `<button class="btn" data-a="startSession">${icon('bucket')} Start Range Session</button>` : ''}${can('pos.checkout') ? `<button class="btn purple" data-a="nav" data-r="pos">${icon('pos')} Point of Sale</button>` : ''}${can('orders.create') ? `<button class="btn" data-a="nav" data-r="cafe">${icon('food')} Café Orders</button>` : ''}${can('attendance.self') ? `<button class="btn secondary" data-a="nav" data-r="attendance">${icon('clock')} Clock In / Out</button>` : ''}</div></div></div>
    <div class="grid g4" style="margin-bottom:18px">${k.join('')}</div>
    <div class="grid g21">
      ${can('bays.view') ? `<div class="card mini"><h2>${icon('bay')} Range Bays</h2>${bayGrid()}<div class="legend" style="margin-top:14px">${legend()}</div></div>` : `<div class="card"><h2>${icon('tabs')} Active Player Tabs</h2>${openTabs().slice(0, 8).map(t => `<div class="line"><div class="nm">${esc(t.player)}</div><span class="muted">${t.items.reduce((a, i) => a + i.qty, 0)} items</span></div>`).join('') || '<div class="muted">No active tabs.</div>'}</div>`}
      ${can('range.view') ? `<div class="card"><h2>${icon('clock')} Active Sessions</h2>${active.length ? active.map(x => `<div class="line"><span class="pill">Bay ${x.bayId}</span><div class="nm">${esc(x.player)}<div class="muted" style="font-size:12px;font-weight:500">${esc(x.bucket)}</div></div><span class="muted">${elapsed(x.start)}</span></div>`).join('') : '<div class="muted">No active sessions.</div>'}</div>` : ''}
    </div>
    ${can('tabs.view') ? `<div class="card" style="margin-top:18px"><h2 class="c-red">${icon('tabs')} Overdue Tabs</h2>${over.length ? over.map(t => `<div class="line"><div class="nm">${esc(t.player)}<div class="muted" style="font-size:12px;font-weight:500">Open ${elapsed(t.created)}</div></div>${showMoney() ? `<b class="c-red">${money(tabTotal(t))}</b>` : ''}<button class="btn sm secondary" data-a="tabOpen" data-id="${t.id}">View</button></div>`).join('') : '<div class="muted">No overdue tabs.</div>'}</div>` : ''}`;
  } });

// ---------- range ----------
defineView({ route: 'range', label: 'Range Operations', icon: 'range', group: 'Operations', perm: 'range.view',
  render() {
    const s = S.get(), active = s.sessions.filter(x => !x.end), buckets = s.products.filter(p => p.cat === 'Range');
    const m = showMoney();
    return head('Range Operations', 'Assign a bay, open the player tab, issue buckets. Payment is collected when the session ends.', can('bays.assign') ? `<button class="btn" data-a="startSession">${icon('bucket')} Start Session</button>` : '', true) + `
    <div class="grid g3" style="margin-bottom:18px">${buckets.map(b => `<div class="kpi"><div class="ico">${icon('bucket', 24)}</div><div><div class="v">${m ? price(b.price) : esc(b.name.split(' ')[0])}</div><div class="l">${esc(b.name)}${stockBlocked(b) ? ' · <span class="c-red">unavailable</span>' : ''}</div></div></div>`).join('')}</div>
    <div class="card white"><h2>${icon('clock')} Active Sessions</h2>
    <div class="tablewrap"><table><thead><tr><th>Bay</th><th>Player</th><th>Bucket</th><th>Started</th><th>Elapsed</th>${m ? '<th class="right">Tab</th>' : ''}<th></th></tr></thead><tbody>
    ${active.map(x => { const t = s.tabs.find(q => q.id === x.tabId); return `<tr><td><span class="pill green">Bay ${x.bayId}</span></td><td><b>${esc(x.player)}</b></td><td>${esc(x.bucket)}</td><td>${fmtTime(x.start)}</td><td>${elapsed(x.start)}</td>${m ? `<td class="right">${t ? money(tabTotal(t)) : '—'}</td>` : ''}<td class="right">${can('pay.collect') ? `<button class="btn sm" data-a="endSession" data-id="${x.id}">End &amp; collect payment</button>` : t ? `<button class="btn sm secondary" data-a="tabOpen" data-id="${t.id}">View tab</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="7" class="muted">No active sessions.</td></tr>`}
    </tbody></table></div></div>`;
  } });

defineActions({
  startSession: ['bays.assign', d => {
    const s = S.get(), free = s.bays.filter(b => b.status === 'available' && !activeSession(s, b.id));
    if (!free.length) return toast('No bays available', 'err');
    const m = showMoney();
    modal(`<h2>${icon('bucket')} Start Range Session</h2>
      <div class="field"><label for="rb">Available bay</label><select id="rb">${free.map(b => `<option value="${b.id}" ${String(b.id) === d?.bay ? 'selected' : ''}>Bay ${b.id}</option>`).join('')}</select></div>
      <div class="field"><label for="rbk">Bucket size</label><select id="rbk">${s.products.filter(p => p.cat === 'Range').map(p => `<option value="${p.id}" ${stockBlocked(p) ? 'disabled' : ''}>${esc(p.name)}${m ? ' — ' + price(p.price) : ''}</option>`).join('')}</select></div>
      <div class="field"><label for="rt">Existing open player tab</label><select id="rt"><option value="">— New player / new tab —</option>${openTabs().filter(t => !t.walkin).map(t => `<option value="${t.id}">${esc(t.player)}</option>`).join('')}</select></div>
      <div class="field"><label for="rm">Member (if no tab selected)</label><select id="rm"><option value="">Guest / walk-in</option>${s.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="rg">Guest name (if not a member)</label><input id="rg" placeholder="Guest name"></div>
      <div class="notice green">${icon('check')} A player tab is opened automatically. Payment is collected at session end.</div>
      <div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doStart">Start session</button></div>`);
  }],
  doStart: ['bays.assign', () => {
    const s = S.get(), mid = val('rm'), m = s.members.find(x => x.id === mid), g = val('rg').trim();
    const nm = m ? m.name : g ? 'Guest – ' + g : '';
    const err = startSessionCommit({ bay: +val('rb'), playerName: nm, memberId: mid || null, tabId: val('rt'), productId: val('rbk') });
    if (err) return toast(err, 'err');
    closeModal(); toast(`Bay ${val('rb') || ''} started`.trim());
  }],
  endSession: ['pay.collect', d => {
    const s = S.get(), x = s.sessions.find(q => q.id === d.id); if (!x || x.end) return toast('Session already ended', 'err');
    const t = s.tabs.find(q => q.id === x.tabId);
    if (t && t.status === 'open' && t.items.length) return tabModal(t.id, x.id);
    S.commit(st => finishSession(st, x.id)); closeModal(); toast(`Bay ${x.bayId} is available again`);
  }],
  endKeep: ['pay.collect', () => { const id = ui.tabEnd; ui.tabEnd = ''; S.commit(s => finishSession(s, id, 'tab left open — bay returned to Available')); closeModal(); toast('Session ended — tab left open'); }],
});

// ---------- bays ----------
defineView({ route: 'bays', label: 'Bay Management', icon: 'bay', group: 'Operations', perm: 'bays.view',
  render() {
    const s = S.get(), c = k => s.bays.filter(b => b.status === k).length;
    return head('Bay Management', 'Bay 1 – Bay 15. Tap a bay for details.', '', true) + `
    <div class="grid g4" style="margin-bottom:18px">${['available', 'occupied', 'reserved', 'maintenance'].map(k => kpi(c(k), bayStatusLabel[k], 'bay', { available: 'green', reserved: 'orange' }[k] || '')).join('')}</div>
    <div class="card"><div class="legend" style="margin-bottom:16px">${legend()}</div>${bayGrid()}</div>`;
  } });
defineActions({
  nav: [null, d => { ui.route = d.r; ui.navOpen = false; render(); window.scrollTo(0, 0); }],
  bay: ['bays.view', d => {
    const s = S.get(), b = s.bays.find(x => x.id === +d.id), x = activeSession(s, b.id), t = x && s.tabs.find(q => q.id === x.tabId);
    const set = (k, l, c) => b.status === k ? '' : `<button class="btn ${c} block" style="margin-bottom:8px" data-a="setBay" data-id="${b.id}" data-s="${k}">${l}</button>`;
    modal(`<h2>${icon('bay')} Bay ${b.id} <span class="pill ${b.status === 'available' ? 'green' : b.status === 'reserved' ? 'orange' : ''}">${bayStatusLabel[b.status]}</span></h2>
      ${x ? `<div class="notice green">${esc(x.player)} · ${esc(x.bucket)} · ${elapsed(x.start)}</div>${t ? `<button class="btn secondary block" style="margin-bottom:8px" data-a="tabOpen" data-id="${t.id}">View player tab</button>` : ''}${can('pay.collect') ? `<button class="btn purple block" style="margin-bottom:8px" data-a="endSession" data-id="${x.id}">End session &amp; collect payment</button>` : ''}` : ''}
      ${b.status === 'available' && can('bays.assign') ? `<button class="btn block" style="margin-bottom:8px" data-a="startSession" data-bay="${b.id}">${icon('bucket')} Assign bay &amp; start session</button>` : ''}
      ${can('bays.manage') ? `${set('available', 'Mark available', 'secondary')}${b.status !== 'occupied' ? set('reserved', 'Reserve bay', 'orange') + set('maintenance', 'Mark maintenance', 'secondary') : ''}` : ''}
      <div class="foot"><button class="btn secondary" data-a="close">Close</button></div>`);
  }],
  setBay: ['bays.manage', d => { S.commit(s => { const b = s.bays.find(x => x.id === +d.id); if (activeSession(s, b.id) && d.s !== 'occupied') return; S.log(s, 'bay_status', `Bay ${b.id}: ${bayStatusLabel[b.status]} → ${bayStatusLabel[d.s]}`); b.status = d.s; }); closeModal(); }],
});

// ---------- tabs ----------
const tabStatus = t => t.status === 'paid' ? (S.get().sales.find(x => x.id === t.saleId)?.refunded ? pill('Refunded', 'red') : pill('Paid', 'green')) : t.status === 'closed_unpaid' ? pill('Closed unpaid', 'red') : isOverdue(t) ? pill('Overdue', 'red') : pill('Open', 'orange');
defineView({ route: 'tabs', label: 'Player Tabs', icon: 'tabs', group: 'Operations', perm: 'tabs.view',
  render() {
    const s = S.get(), all = can('tabs.viewAll'), f = all ? ui.tabFilter : 'open', m = showMoney();
    const saleOf = t => s.sales.find(x => x.id === t.saleId);
    const filt = { open: t => t.status === 'open', overdue: isOverdue, paid: t => t.status === 'paid' && !saleOf(t)?.refunded, refunded: t => saleOf(t)?.refunded || t.voids?.length, unpaid: t => t.status === 'closed_unpaid', all: () => true }[f] || (() => true);
    const list = s.tabs.filter(filt).sort((a, b) => b.created - a.created).slice(0, 300);
    const tabs = all ? [['open', 'Open'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['refunded', 'Voided / refunded'], ['unpaid', 'Closed unpaid'], ['all', 'All']] : [];
    return head('Player Tabs', all ? 'All open, paid, voided, refunded and unpaid tabs.' : 'Search active player tabs.', can('tabs.open') ? `<button class="btn" data-a="newTab">${icon('plus')} New Tab</button>` : '', true) + `
    <div class="row" style="margin-bottom:16px;justify-content:space-between">${tabs.length ? `<div class="tabs-seg">${tabs.map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-a="tabFilter" data-f="${k}">${l}</button>`).join('')}</div>` : '<span></span>'}${liveSearch('Search player or tab…')}</div>
    <div class="tablewrap"><table><thead><tr><th>Player</th><th>Opened</th><th>Bay</th><th>Items</th><th>Status</th>${m ? '<th class="right">Balance</th>' : ''}<th></th></tr></thead><tbody>
    ${list.map(t => `<tr data-s="${esc((t.player + ' ' + t.id).toLowerCase())}" class="${isOverdue(t) ? 'over' : ''}"><td><b>${esc(t.player)}</b><div class="muted" style="font-size:12px">${t.walkin ? 'Walk-in order' : t.memberId ? 'Member' : 'Guest'} · ${t.id}</div></td><td>${fmtDT(t.created)}<div class="muted" style="font-size:12px">${t.status === 'open' ? elapsed(t.created) + ' ago' : ''}</div></td><td>${t.bayId && t.status === 'open' ? 'Bay ' + t.bayId : '—'}</td><td>${t.items.reduce((a, i) => a + i.qty, 0)}</td><td>${tabStatus(t)}</td>${m ? `<td class="right"><b>${money(t.status === 'closed_unpaid' ? t.unpaid : tabTotal(t))}</b></td>` : ''}<td class="right"><button class="btn sm secondary" data-a="tabOpen" data-id="${t.id}">Open</button></td></tr>`).join('') || `<tr><td colspan="7" class="muted">Nothing here.</td></tr>`}
    </tbody></table></div>`;
  } });

function tabModal(id, endId = '') {
  ui.tabEnd = endId || '';
  const s = S.get(), t = s.tabs.find(x => x.id === id), over = isOverdue(t), open = t.status === 'open', m = showMoney();
  const gross = tabGross(t), da = discAmount(gross, t.discount), endS = ui.tabEnd && s.sessions.find(q => q.id === ui.tabEnd);
  const pending = s.approvals.filter(a => a.status === 'pending' && (a.ref === t.id));
  const canReq = open && reqOK(), canPay = open && can('pay.collect') && t.items.length;
  const prods = s.products.filter(p => !stockBlocked(p) && productAllowed(p));
  const sale = t.saleId && s.sales.find(x => x.id === t.saleId);
  modal(`<h2>${icon('tabs')} ${esc(t.player)} ${tabStatus(t)}</h2><div class="muted" style="margin:-8px 0 12px">Tab ${t.id} · opened ${fmtDT(t.created)}${t.bayId && open ? ' · Bay ' + t.bayId : ''}</div>
    ${endS ? `<div class="notice green">${icon('check')} Bay ${endS.bayId} session finished. Collect payment to return the bay to Available.</div>` : ''}
    ${over ? `<div class="notice red">${icon('alert')} Open for ${elapsed(t.created)} — follow up on payment.</div>` : ''}
    ${pending.length ? `<div class="notice orange">${icon('clock')} Waiting for Management: ${pending.map(a => esc(({ discount: 'discount', void_item: 'void', comp: 'complimentary item', price_override: 'price override', tab_close_unpaid: 'unpaid closure', refund: 'refund', edit_paid: 'payment edit' })[a.type] || a.type)).join(', ')}</div>` : ''}
    ${t.items.map(i => `<div class="line"><div class="nm">${i.qty} × ${esc(i.name)}${i.comp ? ' <span class="pill green">Complimentary</span>' : ''}${i.overridden ? ' <span class="pill orange">Price override</span>' : ''}<div class="muted" style="font-size:12px;font-weight:500">${m ? price(i.price) + ' each · ' : ''}added ${fmtDT(i.updatedAt || i.addedAt)}${i.by ? ' by ' + esc(S.userName(i.by)) : ''}</div></div>${m ? `<b>${money(i.price * i.qty)}</b>` : ''}${canReq ? `<div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm secondary" title="Void item" data-a="requestOpen" data-type="void_item" data-tab="${t.id}" data-item="${esc(i.name)}">Void</button><button class="btn sm secondary" title="Complimentary" data-a="requestOpen" data-type="comp" data-tab="${t.id}" data-item="${esc(i.name)}">Comp</button><button class="btn sm secondary" title="Price override" data-a="requestOpen" data-type="price_override" data-tab="${t.id}" data-item="${esc(i.name)}">Price</button></div>` : ''}</div>`).join('') || '<div class="muted">No charges yet.</div>'}
    ${t.voids?.length ? `<div class="muted" style="margin-top:8px;font-size:12px">Voided items: ${t.voids.map(v => `${v.qty} × ${esc(v.name)}${m ? ' (' + money(v.value) + ')' : ''}`).join(', ')}</div>` : ''}
    ${m ? `<div class="totals" style="margin-top:12px">${da ? `<div><span>Subtotal</span><span>${money(gross)}</span></div><div class="discount-line"><span>Discount (${t.discount.type === 'pct' ? t.discount.value + '%' : 'fixed'} · ${esc(t.discount.reason)})</span><span>-${money(da)}</span></div>` : ''}<div class="big"><span>${t.status === 'paid' ? 'Paid' : t.status === 'closed_unpaid' ? 'Written off' : 'Balance'}</span><span>${money(t.status === 'closed_unpaid' ? t.unpaid : gross - da)}</span></div></div>` : ''}
    ${open && prods.length ? `<div class="field" style="margin-top:14px"><label for="ti">Add item</label><div class="row" style="flex-wrap:nowrap"><select id="ti">${prods.map(p => `<option value="${p.id}">${esc(p.name)}${m ? ' — ' + price(p.price) : ''}</option>`).join('')}</select><button class="btn secondary" data-a="tabAdd" data-id="${t.id}">${icon('plus', 16)} Add</button></div></div>` : ''}
    <div class="foot"><button class="btn secondary" data-a="close">Close</button>
      ${canReq && t.items.length && !t.discount ? `<button class="btn secondary" data-a="requestOpen" data-type="discount" data-tab="${t.id}">Discount</button>` : ''}
      ${canReq ? `<button class="btn secondary" data-a="requestOpen" data-type="tab_close_unpaid" data-tab="${t.id}">Close unpaid</button>` : ''}
      ${endS && can('pay.collect') ? `<button class="btn secondary" data-a="endKeep">End session, keep tab open</button>` : ''}
      ${sale ? `<button class="btn secondary" data-a="receipt" data-id="${sale.id}">Receipt</button>` : ''}
      ${canPay ? `<div class="row" style="gap:8px">${['cash', 'gcash', 'card'].map(k => `<button class="btn ${k === 'cash' ? '' : 'purple'}" data-a="settle" data-id="${t.id}" data-t="${k}">${icon(k === 'cash' ? 'cash' : 'card')} ${TENDER[k]}</button>`).join('')}${t.memberId ? `<button class="btn orange" data-a="settle" data-id="${t.id}" data-t="member">${icon('members')} Charge to Member</button>` : ''}</div>` : ''}</div>`, true);
}
defineActions({
  tabFilter: ['tabs.viewAll', d => { ui.tabFilter = d.f; render(); }],
  tabOpen: ['tabs.view', d => tabModal(d.id, d.end)],
  newTab: ['tabs.open', () => modal(`<h2>New Player Tab</h2><div class="field"><label for="nm">Member</label><select id="nm"><option value="">Guest</option>${S.get().members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div><div class="field"><label for="ng">Guest name</label><input id="ng" placeholder="Required for guests"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doNewTab">Open tab</button></div>`)],
  doNewTab: ['tabs.open', () => {
    const mid = val('nm'), g = val('ng').trim(); if (!mid && !g) return toast('Enter a guest name', 'err');
    const nm = mid ? S.get().members.find(m => m.id === mid).name : 'Guest – ' + g; let dup = false;
    S.commit(s => { const pl = s.players.find(p => mid ? p.memberId === mid : !p.memberId && p.name.toLowerCase() === nm.toLowerCase()); if (pl && s.tabs.some(t => t.status === 'open' && !t.walkin && t.playerId === pl.id)) { dup = true; return; } findOrCreateTab(s, nm, mid || null); });
    if (dup) return toast(`${nm} already has an open tab`, 'err'); closeModal(); toast('Tab opened');
  }],
  tabAdd: ['tabs.addBucket|tabs.addFood', d => {
    const s = S.get(), p = s.products.find(x => x.id === val('ti')); if (!p || !productAllowed(p)) return toast('Your role cannot add this item', 'err');
    let bad = ''; S.commit(st => { const t = st.tabs.find(x => x.id === d.id); if (t.status !== 'open') { bad = 'This tab is no longer open.'; return; } addToTab(st, t, p); });
    if (bad) return toast(bad, 'err'); tabModal(d.id, ui.tabEnd);
  }],
  settle: ['pay.collect', d => {
    const endId = ui.tabEnd, r = settleTab(d.id, d.t, endId);
    if (r.error) { toast(r.error, 'err'); return render(); }
    ui.tabEnd = ''; docModal(receiptHtml(r.sale, 'Tab Receipt')); toast(endId ? 'Paid — bay is available again' : 'Tab settled');
  }],
  receipt: ['sales.viewOwn|sales.viewAll|pay.collect|tabs.viewAll', d => { const x = S.get().sales.find(q => q.id === d.id); if (!x) return; if (!can('sales.viewAll') && x.cashier !== Auth.user().id) return toast('You can only view your own receipts', 'err'); docModal(receiptHtml(x)); }],
});

// ---------- POS ----------
defineView({ route: 'pos', label: 'Point of Sale', icon: 'pos', group: 'Sales', perm: 'pos.checkout',
  render() {
    const s = S.get(), cats = ['All', ...new Set(s.products.map(p => p.cat))], ps = s.products.filter(p => ui.cat === 'All' || p.cat === ui.cat);
    const sub = ui.cart.reduce((a, l) => a + l.price * l.qty, 0), tax = S.r2(sub * s.settings.tax), has = ui.cart.length > 0;
    return head('Point of Sale', 'Walk-in food, beverage, bucket and pro shop sales.', '', true) + `<div class="pos"><div>
      <div class="tabs-seg" style="margin-bottom:16px">${cats.map(c => `<button class="${ui.cat === c ? 'on' : ''}" data-a="cat" data-c="${c}">${c}</button>`).join('')}</div>
      <div class="prods">${ps.map(p => `<button class="prod" data-a="addCart" data-id="${p.id}" ${stockBlocked(p) ? 'disabled' : ''}><span class="pi">${icon(catIcon(p.cat), 22)}</span><span class="nm">${esc(p.name)}</span><span class="pr">${price(p.price)}</span></button>`).join('')}</div></div>
      <div class="cart"><h2 style="margin-bottom:8px">${icon('pos')} Current Order</h2>
      ${ui.cart.map((l, i) => `<div class="line"><div class="nm">${esc(l.name)}<div class="muted" style="font-size:12px;font-weight:500">${price(l.price)}</div></div><div class="qty"><button data-a="qty" data-i="${i}" data-d="-1" aria-label="Less">${icon('minus', 16)}</button><b>${l.qty}</b><button data-a="qty" data-i="${i}" data-d="1" aria-label="More">${icon('plus', 16)}</button></div></div>`).join('') || '<div class="muted" style="padding:16px 0">Tap items to add them.</div>'}
      <div class="totals" style="margin-top:12px"><div><span>Subtotal</span><span>${money(sub)}</span></div><div><span>Tax (${(s.settings.tax * 100).toFixed(1)}%)</span><span>${money(tax)}</span></div><div class="big"><span>Total</span><span>${money(sub + tax)}</span></div></div>
      <div class="grid g2" style="margin-top:14px;gap:10px"><button class="btn lg" data-a="pay" data-t="cash" ${has && can('pay.collect') ? '' : 'disabled'}>${icon('cash')} Cash</button><button class="btn lg purple" data-a="pay" data-t="gcash" ${has && can('pay.collect') ? '' : 'disabled'}>${icon('card')} GCash</button><button class="btn lg purple" data-a="pay" data-t="card" ${has && can('pay.collect') ? '' : 'disabled'}>${icon('card')} Card</button><button class="btn lg orange" data-a="payMember" ${has && can('pay.collect') ? '' : 'disabled'}>${icon('members')} Member</button></div>
      <button class="btn secondary block" style="margin-top:10px" data-a="chargeTab" ${has ? '' : 'disabled'}>${icon('tabs')} Charge to Player Tab</button>
      <button class="btn secondary block" style="margin-top:10px" data-a="holdOrder" ${has ? '' : 'disabled'}>Hold as walk-in order (for discount / approvals)</button>
      <button class="btn secondary block sm" style="margin-top:10px" data-a="clearCart" ${has ? '' : 'disabled'}>Clear order</button></div></div>`;
  } });
function checkout(tender, memberId) {
  if (!ui.cart.length) return;
  const lines = ui.cart.map(l => ({ ...l })); ui.cart = []; let sale;
  S.commit(s => {
    const mb = memberId && s.members.find(m => m.id === memberId), pl = mb ? findOrCreatePlayer(s, mb.name, mb.id) : null;
    sale = S.makeSale(s, lines, tender, null, null, { playerId: pl?.id, memberId: memberId || null });
    lines.forEach(l => S.deduct(s, l.name, l.qty, sale.id));
  });
  docModal(receiptHtml(sale)); toast('Payment recorded');
}
defineActions({
  cat: ['pos.checkout', d => { ui.cat = d.c; render(); }],
  addCart: ['pos.checkout', d => { const p = S.get().products.find(x => x.id === d.id); const l = ui.cart.find(x => x.name === p.name); if (l) l.qty++; else ui.cart.push({ name: p.name, cat: p.cat, price: p.price, qty: 1 }); render(); }],
  qty: ['pos.checkout', d => { const l = ui.cart[+d.i]; l.qty += +d.d; if (l.qty <= 0) ui.cart.splice(+d.i, 1); render(); }],
  clearCart: ['pos.checkout', () => { ui.cart = []; render(); }],
  pay: ['pay.collect', d => checkout(d.t, null)],
  payMember: ['pay.collect', () => modal(`<h2>Charge to Member</h2><div class="field"><label for="pm">Member account</label><select id="pm"><option value="">Select member…</option>${S.get().members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn orange" data-a="doPayMember">Charge account</button></div>`)],
  doPayMember: ['pay.collect', () => { const m = val('pm'); if (!m) return toast('Select a member', 'err'); closeModal(); checkout('member', m); }],
  chargeTab: ['pos.checkout', () => modal(`<h2>Charge to Player Tab</h2><div class="field"><label for="ct">Existing tab</label><select id="ct"><option value="">Select a tab…</option>${openTabs().map(t => `<option value="${t.id}">${esc(t.player)}${t.walkin ? ' (walk-in order)' : ''}</option>`).join('')}</select></div><div class="muted" style="margin:8px 0">or start one for a member / guest</div><div class="field"><select id="cm"><option value="">Choose member…</option>${S.get().members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div><div class="field"><input id="cg" placeholder="Guest name"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn purple" data-a="doChargeTab">Charge tab</button></div>`)],
  doChargeTab: ['pos.checkout', () => {
    const tid = val('ct'), mid = val('cm'), g = val('cg').trim(); if (!tid && !mid && !g) return toast('Choose or name a tab', 'err'); if (!ui.cart.length) return;
    let nm = ''; const lines = ui.cart.slice(); ui.cart = [];
    S.commit(s => { const t = tid ? s.tabs.find(x => x.id === tid && x.status === 'open') : mid ? findOrCreateTab(s, s.members.find(m => m.id === mid).name, mid) : findOrCreateTab(s, 'Guest – ' + g, null); if (!t) return; nm = t.player; lines.forEach(l => addToTab(s, t, { name: l.name, cat: l.cat, price: l.price }, l.qty)); });
    closeModal(); toast(nm ? `Charged to ${nm}'s tab` : 'Tab is no longer open', nm ? '' : 'err');
  }],
  holdOrder: ['pos.checkout', () => modal(`<h2>Hold as Walk-in Order</h2><p class="muted">Creates an open order so a discount, complimentary item or price change can be requested before payment.</p><div class="field"><label for="hn">Customer / label</label><input id="hn" placeholder="e.g. Table 3, Mr. Santos"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doHold">Hold order</button></div>`)],
  doHold: ['pos.checkout', () => {
    const nm = val('hn').trim() || 'Walk-in'; if (!ui.cart.length) return; const lines = ui.cart.slice(); ui.cart = []; let id;
    S.commit(s => { const t = findOrCreateTab(s, `Walk-in – ${nm}`, null, { walkin: true }); id = t.id; lines.forEach(l => addToTab(s, t, { name: l.name, cat: l.cat, price: l.price }, l.qty)); });
    closeModal(); tabModal(id);
  }],
});

// ---------- café orders (server) ----------
defineView({ route: 'cafe', label: 'Café Orders', icon: 'coffee', group: 'Sales', perm: 'orders.create',
  render() {
    const s = S.get(), ps = s.products.filter(p => p.cat === 'Food' || p.cat === 'Beverage'), c = ui.cafe;
    const mine = s.audit.filter(a => a.userId === Auth.user().id && (a.type === 'item_added' || a.type === 'tab_opened')).slice(-8).reverse();
    return head('Café Orders', 'Add food & beverages to an existing player tab, or create a walk-in order for the cashier to collect.', '', true) + `<div class="pos"><div>
      <div class="prods">${ps.map(p => `<button class="prod" data-a="cafeAdd" data-id="${p.id}" ${stockBlocked(p) ? 'disabled' : ''}><span class="pi">${icon(catIcon(p.cat), 22)}</span><span class="nm">${esc(p.name)}</span><span class="pr" style="color:${stockBlocked(p) ? 'var(--red)' : 'var(--green)'}">${stockBlocked(p) ? 'Unavailable' : 'Available'}</span></button>`).join('')}</div></div>
      <div class="cart"><h2 style="margin-bottom:8px">${icon('food')} Order</h2>
      <div class="field"><label for="cf_t">Send to</label><select id="cf_t" data-change="cafeTarget"><option value="new" ${c.target === 'new' ? 'selected' : ''}>New walk-in order (cashier collects payment)</option>${openTabs().map(t => `<option value="${t.id}" ${c.target === t.id ? 'selected' : ''}>${esc(t.player)}${t.bayId ? ' · Bay ' + t.bayId : ''}</option>`).join('')}</select></div>
      <div class="field ${c.target === 'new' ? '' : 'hide'}" id="cf_n"><label for="cf_name">Customer / table</label><input id="cf_name" value="${esc(c.name)}" placeholder="e.g. Table 3"></div>
      ${ui.cart.map((l, i) => `<div class="line"><div class="nm">${esc(l.name)}</div><div class="qty"><button data-a="cafeQty" data-i="${i}" data-d="-1">${icon('minus', 16)}</button><b>${l.qty}</b><button data-a="cafeQty" data-i="${i}" data-d="1">${icon('plus', 16)}</button></div></div>`).join('') || '<div class="muted" style="padding:12px 0">Tap items to add them.</div>'}
      <button class="btn block lg" style="margin-top:14px" data-a="cafeSend" ${ui.cart.length ? '' : 'disabled'}>Send order</button></div></div>
      <div class="card" style="margin-top:18px"><h2>${icon('clock')} My recent orders</h2>${mine.map(a => `<div class="line"><div class="nm">${esc(a.msg)}</div><span class="muted">${fmtDT(a.ts)}</span></div>`).join('') || '<div class="muted">No orders yet.</div>'}</div>`;
  } });
defineActions({
  cafeAdd: ['orders.create', d => { const p = S.get().products.find(x => x.id === d.id); const l = ui.cart.find(x => x.name === p.name); if (l) l.qty++; else ui.cart.push({ name: p.name, cat: p.cat, price: p.price, qty: 1 }); ui.cafe.target = val('cf_t') || ui.cafe.target; ui.cafe.name = val('cf_name') || ui.cafe.name; render(); }],
  cafeQty: ['orders.create', d => { const l = ui.cart[+d.i]; l.qty += +d.d; if (l.qty <= 0) ui.cart.splice(+d.i, 1); render(); }],
  cafeSend: ['orders.create', () => {
    const tgt = val('cf_t'), nm = val('cf_name').trim() || 'Walk-in'; if (!ui.cart.length) return; const lines = ui.cart.slice(); let msg = '';
    S.commit(s => { let t; if (tgt === 'new') t = findOrCreateTab(s, `Walk-in – ${nm}`, null, { walkin: true }); else { t = s.tabs.find(x => x.id === tgt && x.status === 'open'); if (!t) { msg = 'That tab is no longer open.'; return; } } lines.forEach(l => addToTab(s, t, { name: l.name, cat: l.cat, price: l.price }, l.qty)); msg = tgt === 'new' ? `Order sent to the cashier (${t.player})` : `Added to ${t.player}'s tab`; });
    if (msg.startsWith('That')) return toast(msg, 'err'); ui.cart = []; ui.cafe = { target: 'new', name: '' }; toast(msg); render();
  }],
});

// ---------- food & beverages ----------
defineView({ route: 'fnb', label: 'Food & Beverages', icon: 'food', group: 'Sales', perm: 'fnb.view',
  render() {
    const s = S.get(), ps = s.products.filter(p => p.cat !== 'Range' || can('products.manage')), edit = can('products.manage');
    return head('Food & Beverages', edit ? 'Menu, pricing and availability. Price changes are logged.' : 'Product availability.', edit ? `<button class="btn" data-a="newProduct">${icon('plus')} Add Menu Item</button>` : '') + `
    <div class="tablewrap"><table><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Availability</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>
    ${ps.map(p => { const blocked = stockBlocked(p); return `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="c-green">${icon(catIcon(p.cat))}</span><b>${esc(p.name)}</b></div></td><td>${p.cat}</td><td>${price(p.price)}</td><td>${blocked ? pill(p.available ? 'Out of stock' : "86'd", 'red') : pill('Available', 'green')}</td>${edit ? `<td class="right"><button class="btn sm secondary" data-a="toggleProduct" data-id="${p.id}">${p.available ? "86 item" : 'Restore'}</button> <button class="btn sm secondary" data-a="editPrice" data-id="${p.id}">Price</button></td>` : ''}</tr>`; }).join('')}
    </tbody></table></div>`;
  } });
defineActions({
  toggleProduct: ['products.manage', d => S.commit(s => { const p = s.products.find(x => x.id === d.id); p.available = !p.available; S.log(s, 'product_availability', `${p.name} ${p.available ? 'restored to menu' : "86'd (unavailable)"}`); })],
  editPrice: ['products.manage', d => { const p = S.get().products.find(x => x.id === d.id); modal(`<h2>${esc(p.name)}</h2><p class="muted">Current price ${price(p.price)}</p><div class="field"><label for="np">New price (₱)</label><input id="np" type="number" step="0.01" value="${p.price}"></div><div class="field"><label for="npr">Reason (required)</label><input id="npr" placeholder="e.g. Supplier cost increase"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="savePrice" data-id="${p.id}">Save</button></div>`); }],
  savePrice: ['products.manage', d => { const v = parseFloat(val('np')), r = val('npr').trim(); if (!(v >= 0)) return toast('Enter a valid price', 'err'); if (!r) return toast('A reason is required', 'err'); S.commit(s => { const p = s.products.find(x => x.id === d.id); S.log(s, 'price_change', `${p.name}: ${price(p.price)} → ${price(v)} — ${r}`); p.price = v; }); closeModal(); }],
  newProduct: ['products.manage', () => modal(`<h2>Add Menu Item</h2><div class="field"><label for="pn">Name</label><input id="pn"></div><div class="field"><label for="pc">Category</label><select id="pc"><option>Food</option><option>Beverage</option><option>Pro Shop</option></select></div><div class="field"><label for="pp">Price (₱)</label><input id="pp" type="number" step="0.01"></div><div class="field"><label for="ps">Linked stock item (optional)</label><select id="ps"><option value="">None</option>${S.get().inventory.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doNewProduct">Add</button></div>`)],
  doNewProduct: ['products.manage', () => { const n = val('pn').trim(), p = parseFloat(val('pp')); if (!n || !(p >= 0)) return toast('Name and price required', 'err'); S.commit(s => { s.products.push({ id: 'p' + (++s.seq), name: n, cat: val('pc'), price: p, stock: val('ps') || null, per: 1, available: true }); S.log(s, 'product_created', `Menu item added: ${n} at ${price(p)}`); }); closeModal(); }],
});

// ---------- inventory ----------
defineView({ route: 'inventory', label: 'Inventory', icon: 'inventory', group: 'Sales', perm: 'inventory.view',
  render() {
    const s = S.get(), cost = s.inventory.reduce((a, i) => a + i.qty * i.cost, 0), retail = s.inventory.reduce((a, i) => a + i.qty * i.retail, 0), adj = can(['inventory.adjust', 'inventory.request']);
    const lvPill = lv => lv === 'out' ? pill('Out of stock', 'red') : lv === 'critical' ? pill('Critical', 'red') : lv === 'low' ? pill('Low', 'orange') : pill('Healthy', 'green');
    return head('Inventory', 'Stock levels, cost and sales value. Every adjustment needs a reason and is logged.', adj ? `<button class="btn" data-a="requestOpen" data-type="inventory_adjust">${icon('plus')} Adjust stock</button>${can('inventory.adjust') ? `<button class="btn secondary" data-a="newStock">New stock item</button>` : ''}` : '') + `
    <div class="grid g3" style="margin-bottom:18px">${kpi(money(cost), 'Stock cost value', 'inventory')}${kpi(money(retail), 'Stock sales value', 'cash', 'green')}${kpi(money(retail - cost), 'Potential gross margin', 'reports')}</div>
    <div class="tablewrap"><table><thead><tr><th>Item</th><th>On hand</th><th style="min-width:130px">Level vs par</th><th class="right">Unit cost</th><th class="right">Sales / unit</th><th class="right">Cost value</th><th class="right">Sales value</th><th>Status</th></tr></thead><tbody>
    ${s.inventory.map(i => { const lv = stockLevel(i), pc = Math.min(100, i.qty / i.par * 100), col = lv === 'ok' ? 'var(--green)' : lv === 'low' ? 'var(--orange)' : 'var(--red)'; return `<tr><td><b>${esc(i.name)}</b>${i.adjustedAt ? `<div class="muted" style="font-size:12px">Adjusted ${fmtDT(i.adjustedAt)}</div>` : ''}</td><td>${+i.qty.toFixed(1)} ${i.unit} <span class="muted">/ par ${i.par}</span></td><td><div class="bar"><i style="width:${pc}%;background:${col}"></i></div></td><td class="right">${price(i.cost)}</td><td class="right">${price(i.retail)}</td><td class="right">${money(i.qty * i.cost)}</td><td class="right">${money(i.qty * i.retail)}</td><td>${lvPill(lv)}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  } });
defineActions({
  newStock: ['inventory.adjust', () => modal(`<h2>New Stock Item</h2><div class="field"><label for="in">Name</label><input id="in"></div><div class="grid g2" style="gap:12px"><div class="field"><label for="iu">Unit</label><input id="iu" value="ea"></div><div class="field"><label for="iq">On hand</label><input id="iq" type="number" value="0"></div><div class="field"><label for="ip">Par level</label><input id="ip" type="number" value="20"></div><div class="field"><label for="ic">Critical at</label><input id="ic" type="number" value="5"></div><div class="field"><label for="ico">Unit cost (₱)</label><input id="ico" type="number" step="0.01" value="0"></div><div class="field"><label for="irt">Sales value / unit (₱)</label><input id="irt" type="number" step="0.01" value="0"></div></div><div class="field"><label for="inr">Reason (required)</label><input id="inr" placeholder="e.g. New supplier item"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doNewStock">Add</button></div>`)],
  doNewStock: ['inventory.adjust', () => { const n = val('in').trim(), r = val('inr').trim(); if (!n) return toast('Name required', 'err'); if (!r) return toast('A reason is required', 'err'); S.commit(s => { const id = 'i' + (++s.seq); s.inventory.push({ id, name: n, unit: val('iu') || 'ea', qty: +val('iq') || 0, par: +val('ip') || 1, critical: +val('ic') || 0, cost: +val('ico') || 0, retail: +val('irt') || 0, adjustedAt: S.now() }); if (+val('iq')) s.moves.push({ id: 'mv' + (++s.seq), ts: S.now(), invId: id, delta: +val('iq'), type: 'adjust', ref: 'new item', by: S.ctx.actor.id, note: r }); S.log(s, 'inventory_adjust', `New stock item ${n}: ${+val('iq') || 0} ${val('iu') || 'ea'} — ${r}`); }); closeModal(); }],
});

// ---------- cashier closeout ----------
function closeoutCalc(uid) {
  const s = S.get(), mine = s.closeouts.filter(c => c.cashier === uid && c.status !== 'rejected'), last = mine.sort((a, b) => b.time - a.time)[0];
  const since = Math.max(dayStart(), last ? last.time : 0), ss = s.sales.filter(x => x.cashier === uid && x.time > since && !x.refunded);
  const sum = t => S.r2(ss.filter(x => x.tender === t).reduce((a, x) => a + x.total, 0));
  const cash = sum('cash'), pend = mine.find(c => c.status === 'pending_approval');
  return { float: s.settings.floatAmt, cash, gcash: sum('gcash'), card: sum('card'), member: sum('member'), expectedCash: S.r2(s.settings.floatAmt + cash), n: ss.length, disc: ss.reduce((a, x) => a + (x.discount?.amount || 0), 0), since, pend };
}
const stPill = c => ({ ok: pill('Balanced', 'green'), approved: pill('Variance approved', 'green'), pending_approval: pill('Awaiting approval', 'orange'), rejected: pill('Rejected', 'red') })[c.status] || pill(c.status);
defineView({ route: 'closeout', label: 'Cashier Closeout', icon: 'closeout', group: 'Sales', perm: ['closeout.own', 'closeout.viewAll'],
  render() {
    const s = S.get(), u = Auth.user(), all = can('closeout.viewAll'), own = can('closeout.own'), c = closeoutCalc(u.id);
    const list = s.closeouts.filter(x => all || x.cashier === u.id).sort((a, b) => b.time - a.time);
    const rows = list.slice(0, 120).map(x => ({ at: x.time, cashier: x.cashierName, expected: x.expectedCash, counted: x.counted, variance: x.variance, status: stPill(x), act: `<button class="btn sm secondary" data-a="viewCloseout" data-id="${x.id}">${icon('print', 16)} Report</button>`, _cls: x.status === 'pending_approval' ? 'pend' : '' }));
    return head('Cashier Closeout', all ? 'All cashier closeouts and drawer variances.' : 'Your shift summary and closeout.', '', true) + (own ? `
    <div class="grid g2"><div class="card white"><h2>${icon('cash')} Your shift · ${esc(u.name)}</h2><div class="muted" style="margin:-8px 0 10px">Sales since ${fmtDT(c.since)}</div>
      <div class="totals"><div><span>Opening float</span><span>${money(c.float)}</span></div><div><span>Cash sales</span><span>${money(c.cash)}</span></div><div class="big"><span>Expected in drawer</span><span>${money(c.expectedCash)}</span></div></div>
      <div class="totals" style="margin-top:16px"><div><span>GCash</span><span>${money(c.gcash)}</span></div><div><span>Card</span><span>${money(c.card)}</span></div><div><span>Charged to members</span><span>${money(c.member)}</span></div><div><span>Transactions</span><span>${c.n}</span></div><div><span>Discounts given</span><span>${money(c.disc)}</span></div></div></div>
    <div class="card"><h2>${icon('closeout')} Count Drawer</h2>${c.pend ? `<div class="notice orange">${icon('clock')} Your closeout for ${fmtDT(c.pend.time)} is waiting for Management approval (variance ${money(c.pend.variance)}).</div>` : `
      <div class="field"><label for="counted">Counted cash</label><input id="counted" type="number" step="0.01" inputmode="decimal" placeholder="0.00" data-input="variance"></div>
      <div id="variance" class="notice green">Enter counted cash to see variance.</div>
      <div class="field hide" id="varReasonF"><label for="varReason">Reason for the shortage / overage (required)</label><textarea id="varReason" rows="2"></textarea></div>
      <button class="btn block lg" data-a="submitCloseout">Submit Closeout</button><p class="muted" style="font-size:12px">Any shortage or overage needs Management approval. You cannot approve your own variance.</p>`}</div></div>` : '') + `
    <div class="card white" style="margin-top:18px"><h2>${all ? 'All closeouts' : 'My closeouts'}</h2>${table('closeouts', [{ key: 'at', label: 'Closed', type: 'dt' }, { key: 'cashier', label: 'Cashier' }, { key: 'expected', label: 'Expected cash', type: 'money' }, { key: 'counted', label: 'Counted', type: 'money' }, { key: 'variance', label: 'Over / (short)', type: 'money' }, { key: 'status', label: 'Status', type: 'html', sortKey: 'at' }, { key: 'act', label: '', type: 'html' }], rows, { sort: { key: 'at', dir: 'desc' } })}</div>`;
  } });
export function closeoutReportHtml(x) {
  const r = (a, b, cls = '') => `<div class="row" style="justify-content:space-between"><span>${a}</span><b class="${cls}">${b}</b></div>`;
  return r('Cashier', esc(x.cashierName)) + r('Closed at', fmtDT(x.time) + ' PHT') + '<hr>' + r('Opening float', money(x.float)) + r('Cash sales', money(x.cash)) + r('Expected in drawer', money(x.expectedCash)) + r('Counted', money(x.counted)) + r('Over / (short)', money(x.variance), x.variance ? 'c-orange' : 'c-green') + '<hr>' + r('GCash', money(x.gcash || 0)) + r('Card', money(x.card)) + r('Charged to members', money(x.member || 0)) + r('Discounts given', money(x.disc || 0)) + r('Transactions', x.n) + r('Status', ({ ok: 'Balanced', approved: 'Variance approved by Management', pending_approval: 'Awaiting approval', rejected: 'Rejected' })[x.status]) + (x.reason ? r('Cashier reason', esc(x.reason)) : '');
}
defineActions({
  submitCloseout: ['closeout.own', () => {
    const u = Auth.user(), c = closeoutCalc(u.id), counted = parseFloat(val('counted')); if (isNaN(counted)) return toast('Enter counted cash', 'err'); if (c.pend) return toast('A closeout is already waiting for approval', 'err');
    const variance = S.r2(counted - c.expectedCash), reason = val('varReason').trim(); if (variance && !reason) { document.getElementById('varReasonF')?.classList.remove('hide'); return toast('Explain the variance', 'err'); }
    let rec;
    S.commit(s => { const at = S.now(); rec = { id: 'c' + (++s.seq), cashier: u.id, cashierName: u.name, time: at, timeISO: S.manilaISO(at), date: dayKey(at), expectedCash: c.expectedCash, counted, variance, cash: c.cash, gcash: c.gcash, card: c.card, member: c.member, n: c.n, refunds: 0, disc: c.disc, float: c.float, status: variance ? 'pending_approval' : 'ok', reason, since: c.since }; s.closeouts.push(rec); S.log(s, 'closeout', `Closeout by ${u.name}: expected ${money(rec.expectedCash)}, counted ${money(counted)}, variance ${money(variance)}${variance ? ' — awaiting approval' : ''}`); });
    if (variance) { const r = request('cash_variance', { ref: rec.id, refLabel: `Closeout ${rec.date} · ${u.name}`, amount: Math.abs(variance), reason, payload: { variance } }); S.commit(s => { s.closeouts.find(q => q.id === rec.id).approvalId = s.approvals.slice(-1)[0]?.id; }); if (!r.ok) toast(r.error, 'err'); }
    docModal(reportDocFor(rec)); toast(variance ? 'Closeout sent for approval' : 'Closeout recorded');
  }],
  viewCloseout: ['closeout.own|closeout.viewAll', d => { const x = S.get().closeouts.find(q => q.id === d.id); if (!x) return; if (!can('closeout.viewAll') && x.cashier !== Auth.user().id) return toast("You can only view your own closeouts", 'err'); docModal(reportDocFor(x)); }],
});
import { reportDoc } from './ui.js';
const reportDocFor = x => reportDoc('Cashier Closeout Report', closeoutReportHtml(x));

// ---------- sales & payments ----------
defineView({ route: 'sales', label: 'Sales & Payments', icon: 'receipt', group: 'Sales', perm: ['sales.viewOwn', 'sales.viewAll'],
  render() {
    const s = S.get(), u = Auth.user(), all = can('sales.viewAll'), date = ui.salesDate || dayKey(S.now());
    let list = s.sales.filter(x => dayKey(x.time) === date); if (!all) list = list.filter(x => x.cashier === u.id);
    list.sort((a, b) => b.time - a.time);
    const canReq = reqOK();
    const rows = list.map(x => ({ at: x.time, id: x.id, who: (s.tabs.find(t => t.id === x.tabId)?.player) || 'Walk-in sale', items: x.lines.map(l => `${l.qty}× ${esc(l.name)}`).join(', '), tender: TENDER[x.tender] || x.tender, cashier: x.cashierName, total: x.total, status: x.refunded ? pill(x.refunded.kind === 'void' ? 'Voided' : 'Refunded', 'red') : x.edits?.length ? pill('Edited', 'orange') : pill('Paid', 'green'),
      act: `<div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm secondary" data-a="receipt" data-id="${x.id}">Receipt</button>${canReq && !x.refunded ? `<button class="btn sm orange" data-a="requestOpen" data-type="refund" data-sale="${x.id}">Void / refund</button><button class="btn sm secondary" data-a="requestOpen" data-type="edit_paid" data-sale="${x.id}">Edit payment</button>` : ''}</div>` }));
    const tot = list.filter(x => !x.refunded).reduce((a, x) => a + x.total, 0);
    return head('Sales & Payments', all ? 'Every sale and payment record. Completed sales cannot be deleted; changes need approval and are logged.' : 'Your own sales and receipts. Past payments can only be changed through an approved request.', `<input type="date" id="sd" value="${date}" data-change="salesDate" style="width:auto" aria-label="Date">`) + `
    <div class="grid g3" style="margin-bottom:18px">${kpi(String(list.length), 'Transactions', 'receipt')}${kpi(money(tot), 'Net sales (excl. voids/refunds)', 'cash', 'green')}${kpi(String(list.filter(x => x.refunded).length), 'Voided / refunded', 'alert', 'red')}</div>
    ${table('sales', [{ key: 'at', label: 'Time', type: 'dt' }, { key: 'id', label: 'Receipt' }, { key: 'who', label: 'Player / tab' }, { key: 'items', label: 'Items', type: 'html', sortKey: 'items' }, { key: 'tender', label: 'Payment' }, { key: 'cashier', label: 'Cashier' }, { key: 'total', label: 'Total', type: 'money' }, { key: 'status', label: 'Status', type: 'html', sortKey: 'at' }, { key: 'act', label: '', type: 'html' }], rows, { sort: { key: 'at', dir: 'desc' } })}`;
  } });

defineActions({
  salesDate: ['sales.viewOwn|sales.viewAll', (d, e, el) => { ui.salesDate = el.value; render(); }],
  cafeTarget: ['orders.create', (d, e, el) => { ui.cafe.target = el.value; ui.cafe.name = val('cf_name'); render(); }],
  variance: ['closeout.own', (d, e, el) => {
    const c = closeoutCalc(Auth.user().id), v = parseFloat(el.value), box = document.getElementById('variance'), rf = document.getElementById('varReasonF');
    if (isNaN(v)) { box.className = 'notice green'; box.textContent = 'Enter counted cash to see variance.'; rf?.classList.add('hide'); return; }
    const dv = S.r2(v - c.expectedCash); box.className = 'notice ' + (dv ? 'orange' : 'green');
    box.textContent = dv === 0 ? 'Drawer balances.' : `${dv > 0 ? 'Over' : 'Short'} by ${money(Math.abs(dv))} — Management approval required`; rf?.classList.toggle('hide', dv === 0);
  }],
});

// ---------- members ----------
defineView({ route: 'members', label: 'Members', icon: 'members', group: 'People', perm: 'members.view',
  render() {
    const s = S.get(), m = showMoney();
    return head('Members', 'Member directory.', can('members.manage') ? `<button class="btn" data-a="newMember">${icon('plus')} Add Member</button>` : '') + `
    <div class="tablewrap"><table><thead><tr><th>Member</th><th>Membership</th><th>Contact</th>${m ? '<th>Open tab</th>' : ''}<th></th></tr></thead><tbody>
    ${s.members.map(mm => { const t = s.tabs.find(x => x.memberId === mm.id && x.status === 'open'); return `<tr><td><b>${esc(mm.name)}</b></td><td>${pill(mm.tier)}</td><td>${esc(mm.phone)}<div class="muted" style="font-size:12px">${esc(mm.email)}</div></td>${m ? `<td>${t ? `<b class="${isOverdue(t) ? 'c-red' : ''}">${money(tabTotal(t))}</b>` : '<span class="muted">—</span>'}</td>` : ''}<td class="right">${t && can('tabs.view') ? `<button class="btn sm secondary" data-a="tabOpen" data-id="${t.id}">View tab</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  } });
defineActions({
  newMember: ['members.manage', () => modal(`<h2>Add Member</h2><div class="field"><label for="mn">Full name</label><input id="mn"></div><div class="field"><label for="mt">Membership</label><select id="mt"><option>Full Golf</option><option>Social</option><option>Junior</option><option>Corporate</option></select></div><div class="field"><label for="mp">Phone</label><input id="mp" type="tel"></div><div class="field"><label for="me">Email</label><input id="me" type="email"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doNewMember">Add member</button></div>`)],
  doNewMember: ['members.manage', () => { const n = val('mn').trim(); if (!n) return toast('Name required', 'err'); S.commit(s => { s.members.push({ id: 'm' + (++s.seq), name: n, tier: val('mt'), phone: val('mp'), email: val('me') }); S.log(s, 'member_created', `Member added: ${n}`); }); closeModal(); }],
});
