import { CLUB, APP, LOGIN_SUB, logo, syncLogos } from './brand.js';
import { icon } from './icons.js';
import * as S from './store.js';
import { money, price, fmtTime, fmtDate, fmtDT, longDate, elapsed, tabTotal, tabGross, discAmount, isOverdue, stockLevel, todaySales } from './store.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MANAGER_PIN = '1234';
const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'], ['range', 'Range Operations', 'range'], ['bays', 'Bay Management', 'bay'],
  ['tabs', 'Player Tabs', 'tabs'], ['pos', 'Point of Sale', 'pos'], ['fnb', 'Food & Beverages', 'food'],
  ['inventory', 'Inventory', 'inventory'], ['closeout', 'Cashier Closeout', 'closeout'], ['members', 'Members', 'members'],
  ['reports', 'Reports', 'reports'], ['settings', 'Settings', 'settings'],
];
const ui = { route: 'dashboard', user: sessionStorage.getItem('ccc-user'), cat: 'All', cart: [], navOpen: false, tabFilter: 'all', tabEnd: '', discount: null };
S.ctx.user = ui.user || 'System';
const $ = s => document.querySelector(s);
const catIcon = c => ({ Range: 'bucket', Beverage: 'beverage', Food: 'food', 'Pro Shop': 'ball' }[c] || 'ball');

// ---------- helpers ----------
function toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; $('#toast-root').append(el); setTimeout(() => el.remove(), 2600); }
function modal(html, wide) { $('#modal-root').innerHTML = `<div class="overlay" data-a="overlay"><div class="modal ${wide ? 'wide' : ''}" role="dialog">${html}</div></div>`; syncLogos($('#modal-root')); const f = $('#modal-root input,#modal-root select'); if (f && !f.matches('[type=checkbox]')) f.focus({ preventScroll: true }); }
const closeModal = () => { $('#modal-root').innerHTML = ''; };
const val = id => document.getElementById(id)?.value ?? '';
const clockHtml = () => `<div class="clock" title="Philippine Time (Asia/Manila, UTC+8)">${icon('calendar', 18)}<span class="js-date">${longDate(Date.now())}</span><span class="sep">|</span>${icon('clock', 18)}<span class="js-time time">${fmtTime(Date.now())}</span></div>`;
const head = (title, sub, actions = '', clock = false) => `<div class="pagehead"><div class="titles"><div class="eyebrow">${CLUB}</div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="headright">${clock ? clockHtml() : ''}<div class="actions">${actions}</div></div></div>`;
const bayStatusLabel = { available: 'Available', occupied: 'In use', reserved: 'Reserved', maintenance: 'Maintenance' };
const openTabs = () => S.get().tabs.filter(t => t.status === 'open');
function findOrCreateTab(s, player, memberId) {
  let t = s.tabs.find(x => x.status === 'open' && (memberId ? x.memberId === memberId : x.player === player));
  if (!t) { t = { id: 't' + (++s.seq), player, memberId: memberId || null, status: 'open', created: Date.now(), createdISO: S.manilaISO(Date.now()), discount: null, items: [] }; s.tabs.push(t); S.log(s, 'tab_opened', `Player tab opened for ${player}`); }
  return t;
}
function addToTab(s, tab, p, qty = 1) {
  const ex = tab.items.find(i => i.name === p.name), t = Date.now();
  if (ex) { ex.qty += qty; ex.updatedAt = t; } else tab.items.push({ name: p.name, cat: p.cat, price: p.price, qty, addedAt: t, updatedAt: t });
  S.deduct(s, p.name, qty);
  S.log(s, 'item_added', `${qty} × ${p.name} (${money(p.price * qty)}) added to ${tab.player}'s tab`);
}
function finishSession(s, id) {
  const x = s.sessions.find(q => q.id === id); if (!x || x.end) return;
  x.end = Date.now(); x.endISO = S.manilaISO(x.end);
  const b = s.bays.find(q => q.id === x.bayId); if (b && b.status === 'occupied') b.status = 'available';
  S.log(s, 'session_end', `Bay ${x.bayId} session ended for ${x.player} (${elapsed(x.start)}) — bay returned to Available`);
}
function stockBlocked(p) { const i = S.get().inventory.find(x => x.id === p.stock); return !p.available || (i && i.qty <= 0); }
function alertCounts() {
  const s = S.get();
  return { overdue: s.tabs.filter(isOverdue).length, crit: s.inventory.filter(i => stockLevel(i) === 'critical').length };
}

// ---------- shell ----------
function render() { draw(); syncLogos(); }
function draw() {
  if (!ui.user) return renderLogin();
  const a = alertCounts();
  const badge = r => r === 'tabs' && a.overdue ? `<span class="badge red">${a.overdue}</span>` : r === 'inventory' && a.crit ? `<span class="badge red">${a.crit}</span>` : '';
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar ${ui.navOpen ? 'open' : ''}">
      <div class="brandplate">${logo()}<div class="app">${APP}</div></div>
      <nav class="nav">${NAV.map(([r, l, i]) => `<button data-a="nav" data-r="${r}" class="${ui.route === r ? 'active' : ''}">${icon(i)}<span>${l}</span>${badge(r)}</button>`).join('')}</nav>
      <div class="sidefoot">${icon('member')}<span>${esc(ui.user)}</span><button data-a="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div>
    </aside>
    <div style="flex:1;min-width:0">
      <div class="topbar"><button data-a="toggleNav" aria-label="Menu">${icon('menu', 24)}</button><div class="t">${CLUB}</div></div>
      <main class="main">${views[ui.route]()}</main>
    </div></div>`;
}
function renderLogin() {
  $('#app').innerHTML = `<div class="login"><div class="login-card">
    ${logo('lg')}
    <div class="club">${CLUB}</div>
    <h1>${APP}</h1><div class="sub">${LOGIN_SUB}</div>
    <form id="loginForm">
      <div class="field"><label for="u">Staff name or email</label><input id="u" autocomplete="username" placeholder="e.g. front.counter" required></div>
      <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" placeholder="••••••••" required></div>
      <button class="btn block lg" type="submit">Sign In</button>
    </form>
    <div class="login-foot">Demo build: any name and password will sign in. Manager approval PIN: ${MANAGER_PIN}</div>
  </div></div>`;
}

// ---------- views ----------
const views = {
  dashboard() {
    const s = S.get(), ts = todaySales(), rev = ts.reduce((a, x) => a + x.total, 0);
    const active = s.sessions.filter(x => !x.end), ob = s.bays.filter(b => b.status === 'occupied').length, av = s.bays.filter(b => b.status === 'available').length;
    const over = s.tabs.filter(isOverdue), crit = s.inventory.filter(i => stockLevel(i) !== 'ok');
    const open = openTabs().reduce((a, t) => a + tabTotal(t), 0);
    return `<div class="pagehead"><div class="brandhead row" style="gap:18px;flex:1">${logo('md')}<div><div class="eyebrow">${CLUB}</div><h1>${APP}</h1><div class="sub">Live operations overview · 15 range bays</div></div></div>
      <div class="headright">${clockHtml()}<div class="actions"><button class="btn" data-a="startSession">${icon('bucket')} Start Range Session</button><button class="btn purple" data-a="nav" data-r="pos">${icon('pos')} Point of Sale</button></div></div></div>
    <div class="grid g4" style="margin-bottom:18px">
      <div class="kpi green"><div class="ico">${icon('cash', 24)}</div><div><div class="v">${money(rev)}</div><div class="l">Sales today (${ts.length} transactions)</div></div></div>
      <div class="kpi"><div class="ico">${icon('bay', 24)}</div><div><div class="v">${ob} / ${s.bays.length}</div><div class="l">Bays in use · ${av} available</div></div></div>
      <div class="kpi orange"><div class="ico">${icon('tabs', 24)}</div><div><div class="v">${money(open)}</div><div class="l">${openTabs().length} open player tabs</div></div></div>
      <div class="kpi ${over.length || crit.some(i => stockLevel(i) === 'critical') ? 'red' : 'green'}"><div class="ico">${icon('alert', 24)}</div><div><div class="v">${over.length + crit.length}</div><div class="l">${over.length} overdue tabs · ${crit.length} stock alerts</div></div></div>
    </div>
    <div class="grid g21">
      <div class="card mini"><h2>${icon('bay')} Range Bays</h2>${bayGrid()}<div class="legend" style="margin-top:14px">${legend()}</div></div>
      <div class="card"><h2>${icon('clock')} Active Sessions</h2>${active.length ? active.map(x => `<div class="line"><span class="pill">Bay ${x.bayId}</span><div class="nm">${esc(x.player)}<div class="muted" style="font-size:12px;font-weight:500">${esc(x.bucket)}</div></div><span class="muted">${elapsed(x.start)}</span></div>`).join('') : '<div class="muted">No active sessions.</div>'}</div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="card"><h2 class="c-red">${icon('tabs')} Overdue Tabs</h2>${over.length ? over.map(t => `<div class="line"><div class="nm">${esc(t.player)}<div class="muted" style="font-size:12px;font-weight:500">Open ${elapsed(t.created)}</div></div><b class="c-red">${money(tabTotal(t))}</b><button class="btn sm secondary" data-a="tabOpen" data-id="${t.id}">View</button></div>`).join('') : '<div class="muted">No overdue tabs.</div>'}</div>
      <div class="card"><h2>${icon('inventory')} Stock Alerts</h2>${crit.length ? crit.map(i => `<div class="line"><div class="nm">${esc(i.name)}</div><span class="muted">${+i.qty.toFixed(1)} ${i.unit}</span><span class="pill ${stockLevel(i) === 'critical' ? 'red' : 'orange'}">${stockLevel(i) === 'critical' ? 'Critical' : 'Low'}</span></div>`).join('') : '<div class="muted">All stock levels healthy.</div>'}</div>
    </div>`;
  },

  range() {
    const s = S.get(), active = s.sessions.filter(x => !x.end), done = s.sessions.filter(x => x.end).slice(-5).reverse();
    const buckets = s.products.filter(p => p.cat === 'Range');
    return head('Range Operations', 'Start and finish bucket sessions at the driving range.', `<button class="btn" data-a="startSession">${icon('bucket')} Start Session</button>`) + `
    <div class="grid g3" style="margin-bottom:18px">${buckets.map(b => `<div class="kpi"><div class="ico">${icon('bucket', 24)}</div><div><div class="v">${price(b.price)}</div><div class="l">${esc(b.name)}</div></div></div>`).join('')}</div>
    <div class="card white"><h2>${icon('clock')} Active Sessions</h2>
    <div class="tablewrap"><table><thead><tr><th>Bay</th><th>Player</th><th>Bucket</th><th>Started</th><th>Elapsed</th><th>Billing</th><th></th></tr></thead><tbody>
    ${active.map(x => `<tr><td><span class="pill green">Bay ${x.bayId}</span></td><td><b>${esc(x.player)}</b></td><td>${esc(x.bucket)}</td><td>${fmtTime(x.start)}</td><td>${elapsed(x.start)}</td><td>${x.tabId ? '<span class="pill orange">On tab</span>' : '<span class="pill green">Paid</span>'}</td><td class="right"><button class="btn sm secondary" data-a="endSession" data-id="${x.id}">End session</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No active sessions.</td></tr>'}
    </tbody></table></div></div>
    ${done.length ? `<div class="card" style="margin-top:18px"><h2>Recently Completed</h2>${done.map(x => `<div class="line"><span class="pill">Bay ${x.bayId}</span><div class="nm">${esc(x.player)}</div><span class="muted">${esc(x.bucket)} · ${fmtTime(x.start)}–${fmtTime(x.end)}</span></div>`).join('')}</div>` : ''}`;
  },

  bays() {
    const s = S.get(), c = k => s.bays.filter(b => b.status === k).length;
    return head('Bay Management', 'Bay 1 – Bay 15. Tap a bay to reserve it, mark maintenance, or release it.', '', true) + `
    <div class="grid g4" style="margin-bottom:18px">${['available', 'occupied', 'reserved', 'maintenance'].map(k => `<div class="kpi ${{ available: 'green', reserved: 'orange', occupied: '', maintenance: '' }[k]}"><div class="ico">${icon('bay', 24)}</div><div><div class="v">${c(k)}</div><div class="l">${bayStatusLabel[k]}</div></div></div>`).join('')}</div>
    <div class="card"><div class="legend" style="margin-bottom:16px">${legend()}</div>${bayGrid()}</div>`;
  },

  tabs() {
    const s = S.get(), f = ui.tabFilter;
    const list = s.tabs.filter(t => f === 'all' ? t.status === 'open' : f === 'overdue' ? isOverdue(t) : t.status === 'paid').sort((a, b) => b.created - a.created);
    return head('Player Tabs', 'Track range and café charges for members and guests.', `<button class="btn" data-a="newTab">${icon('plus')} New Tab</button>`, true) + `
    <div class="tabs-seg" style="margin-bottom:16px">${[['all', 'Open'], ['overdue', 'Overdue'], ['paid', 'Settled']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-a="tabFilter" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="tablewrap"><table><thead><tr><th>Player</th><th>Opened</th><th>Items</th><th>Status</th><th class="right">Balance</th><th></th></tr></thead><tbody>
    ${list.map(t => `<tr class="${isOverdue(t) ? 'over' : ''}"><td><b>${esc(t.player)}</b><div class="muted" style="font-size:12px">${t.memberId ? 'Member' : 'Guest'}</div></td><td>${fmtDate(t.created)}<div class="muted" style="font-size:12px">${elapsed(t.created)} ago</div></td><td>${t.items.reduce((a, i) => a + i.qty, 0)}</td><td>${t.status === 'paid' ? '<span class="pill green">Settled</span>' : isOverdue(t) ? '<span class="pill red">Overdue</span>' : '<span class="pill orange">Open</span>'}</td><td class="right"><b>${money(tabTotal(t))}</b></td><td class="right"><button class="btn sm secondary" data-a="tabOpen" data-id="${t.id}">Open</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nothing here.</td></tr>'}
    </tbody></table></div>`;
  },

  pos() {
    const s = S.get(), cats = ['All', ...new Set(s.products.map(p => p.cat))];
    const ps = s.products.filter(p => ui.cat === 'All' || p.cat === ui.cat);
    const sub = ui.cart.reduce((a, l) => a + l.price * l.qty, 0), da = discAmount(sub, ui.discount), tax = +((sub - da) * s.settings.tax).toFixed(2);
    return head('Point of Sale', 'Range buckets, café, beverages, and pro shop.', '', true) + `<div class="pos"><div>
      <div class="tabs-seg" style="margin-bottom:16px">${cats.map(c => `<button class="${ui.cat === c ? 'on' : ''}" data-a="cat" data-c="${c}">${c}</button>`).join('')}</div>
      <div class="prods">${ps.map(p => `<button class="prod" data-a="addCart" data-id="${p.id}" ${stockBlocked(p) ? 'disabled' : ''}><span class="pi">${icon(catIcon(p.cat), 22)}</span><span class="nm">${esc(p.name)}</span><span class="pr">${price(p.price)}</span></button>`).join('')}</div></div>
      <div class="cart"><h2 style="margin-bottom:8px">${icon('pos')} Current Order</h2>
      ${ui.cart.map((l, i) => `<div class="line"><div class="nm">${esc(l.name)}<div class="muted" style="font-size:12px;font-weight:500">${price(l.price)}</div></div><div class="qty"><button data-a="qty" data-i="${i}" data-d="-1" aria-label="Less">${icon('minus', 16)}</button><b>${l.qty}</b><button data-a="qty" data-i="${i}" data-d="1" aria-label="More">${icon('plus', 16)}</button></div></div>`).join('') || '<div class="muted" style="padding:16px 0">Tap items to add them.</div>'}
      <div class="totals" style="margin-top:12px"><div><span>Subtotal</span><span>${money(sub)}</span></div>${da ? `<div class="discount-line"><span>Discount${ui.discount.type === 'pct' ? ` (${ui.discount.value}%)` : ''}</span><span>-${money(da)}</span></div>` : ''}<div><span>Tax (${(s.settings.tax * 100).toFixed(1)}%)</span><span>${money(tax)}</span></div><div class="big"><span>Total</span><span>${money(sub - da + tax)}</span></div></div>
      <div class="grid g2" style="margin-top:14px;gap:10px"><button class="btn lg" data-a="pay" data-t="cash" ${ui.cart.length ? '' : 'disabled'}>${icon('cash')} Cash</button><button class="btn lg" data-a="pay" data-t="card" ${ui.cart.length ? '' : 'disabled'}>${icon('card')} Card</button></div>
      <button class="btn purple block" style="margin-top:10px" data-a="chargeTab" ${ui.cart.length ? '' : 'disabled'}>${icon('tabs')} Charge to Player Tab</button>
      ${ui.discount ? `<button class="btn secondary block sm" style="margin-top:10px" data-a="removeDiscount" data-t="cart">Remove discount</button>` : `<button class="btn orange block sm" style="margin-top:10px" data-a="discount" data-t="cart" ${ui.cart.length ? '' : 'disabled'}>${icon('alert', 16)} Apply discount (manager approval)</button>`}
      <button class="btn secondary block sm" style="margin-top:10px" data-a="clearCart" ${ui.cart.length ? '' : 'disabled'}>Clear order</button></div></div>`;
  },

  fnb() {
    const s = S.get(), ps = s.products.filter(p => p.cat !== 'Range');
    return head('Food & Beverages', 'Café menu, pricing, and availability.', `<button class="btn" data-a="newProduct">${icon('plus')} Add Menu Item</button>`) + `
    <div class="tablewrap"><table><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>
    ${ps.map(p => { const inv = s.inventory.find(i => i.id === p.stock); const lv = inv ? stockLevel(inv) : 'ok'; return `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="c-green">${icon(catIcon(p.cat))}</span><b>${esc(p.name)}</b></div></td><td>${p.cat}</td><td>${price(p.price)}</td><td>${inv ? `<span class="pill ${lv === 'critical' ? 'red' : lv === 'low' ? 'orange' : 'green'}">${+inv.qty.toFixed(1)} ${inv.unit}</span>` : '—'}</td><td>${p.available ? '<span class="pill green">On menu</span>' : '<span class="pill">86\'d</span>'}</td><td class="right"><button class="btn sm secondary" data-a="toggleProduct" data-id="${p.id}">${p.available ? "86 item" : 'Restore'}</button> <button class="btn sm secondary" data-a="editPrice" data-id="${p.id}">Price</button></td></tr>`; }).join('')}
    </tbody></table></div>`;
  },

  inventory() {
    const s = S.get(), cost = s.inventory.reduce((a, i) => a + i.qty * i.cost, 0), retail = s.inventory.reduce((a, i) => a + i.qty * i.retail, 0);
    return head('Inventory', 'Stock levels, cost, and sales value in Philippine Peso.', `<button class="btn" data-a="newStock">${icon('plus')} Add Stock Item</button>`) + `
    <div class="grid g3" style="margin-bottom:18px">
      <div class="kpi"><div class="ico">${icon('inventory', 24)}</div><div><div class="v">${money(cost)}</div><div class="l">Stock cost value</div></div></div>
      <div class="kpi green"><div class="ico">${icon('cash', 24)}</div><div><div class="v">${money(retail)}</div><div class="l">Stock sales value</div></div></div>
      <div class="kpi"><div class="ico">${icon('reports', 24)}</div><div><div class="v">${money(retail - cost)}</div><div class="l">Potential gross margin</div></div></div></div>
    <div class="tablewrap"><table><thead><tr><th>Item</th><th>On hand</th><th style="min-width:130px">Level vs par</th><th class="right">Unit cost</th><th class="right">Sales / unit</th><th class="right">Cost value</th><th class="right">Sales value</th><th>Status</th><th></th></tr></thead><tbody>
    ${s.inventory.map(i => { const lv = stockLevel(i), pc = Math.min(100, i.qty / i.par * 100); const col = lv === 'critical' ? 'var(--red)' : lv === 'low' ? 'var(--orange)' : 'var(--green)'; return `<tr><td><b>${esc(i.name)}</b>${i.adjustedAt ? `<div class="muted" style="font-size:12px">Adjusted ${fmtDT(i.adjustedAt)}</div>` : ''}</td><td>${+i.qty.toFixed(1)} ${i.unit} <span class="muted">/ par ${i.par}</span></td><td><div class="bar"><i style="width:${pc}%;background:${col}"></i></div></td><td class="right">${price(i.cost)}</td><td class="right">${price(i.retail)}</td><td class="right">${money(i.qty * i.cost)}</td><td class="right">${money(i.qty * i.retail)}</td><td><span class="pill ${lv === 'critical' ? 'red' : lv === 'low' ? 'orange' : 'green'}">${lv === 'critical' ? 'Critical' : lv === 'low' ? 'Low' : 'Healthy'}</span></td><td class="right"><button class="btn sm secondary" data-a="receive" data-id="${i.id}">Receive / adjust</button></td></tr>`; }).join('')}
    </tbody></table></div>`;
  },

  closeout() {
    const c = closeoutCalc(), last = S.get().closeouts.slice(-1)[0];
    return head('Cashier Closeout', `Reconcile the drawer for ${esc(S.get().settings.cashier)}. Covers sales since ${last ? fmtDT(last.time) : 'start of day'}.`, '', true) + `
    <div class="grid g2"><div class="card white"><h2>${icon('cash')} Expected Totals</h2>
      <div class="totals"><div><span>Opening float</span><span>${money(c.float)}</span></div><div><span>Cash sales</span><span>${money(c.cash)}</span></div><div class="big"><span>Expected in drawer</span><span>${money(c.expectedCash)}</span></div></div>
      <div class="totals" style="margin-top:16px"><div><span>Card sales</span><span>${money(c.card)}</span></div><div><span>Transactions</span><span>${c.n}</span></div><div><span>Discounts given</span><span>${money(c.disc)}</span></div><div><span>Voided / refunded</span><span>${c.voids}</span></div></div></div>
    <div class="card"><h2>${icon('closeout')} Count Drawer</h2>
      <div class="field"><label for="counted">Counted cash</label><input id="counted" type="number" step="0.01" inputmode="decimal" placeholder="0.00" data-input="variance"></div>
      <div id="variance" class="notice green">Enter counted cash to see variance.</div>
      <button class="btn block lg" data-a="submitCloseout">Submit Closeout</button></div></div>
    ${S.get().closeouts.length ? `<div class="card white" style="margin-top:18px"><h2>Previous Closeouts</h2><div class="tablewrap"><table><thead><tr><th>Time</th><th>Cashier</th><th>Expected</th><th>Counted</th><th>Variance</th><th></th></tr></thead><tbody>${S.get().closeouts.slice().reverse().map(x => `<tr><td>${fmtDate(x.time)} ${fmtTime(x.time)}</td><td>${esc(x.cashier)}</td><td>${money(x.expectedCash)}</td><td>${money(x.counted)}</td><td class="${Math.abs(x.variance) > 0.004 ? 'c-orange' : 'c-green'}"><b>${money(x.variance)}</b></td><td class="right"><button class="btn sm secondary" data-a="viewCloseout" data-id="${x.id}">${icon('print', 16)} Report</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  },

  members() {
    const s = S.get();
    return head('Members', 'Member directory and account balances.', `<button class="btn" data-a="newMember">${icon('plus')} Add Member</button>`) + `
    <div class="tablewrap"><table><thead><tr><th>Member</th><th>Membership</th><th>Contact</th><th>Open tab</th><th></th></tr></thead><tbody>
    ${s.members.map(m => { const t = s.tabs.find(x => x.memberId === m.id && x.status === 'open'); return `<tr><td><b>${esc(m.name)}</b></td><td><span class="pill">${esc(m.tier)}</span></td><td>${esc(m.phone)}<div class="muted" style="font-size:12px">${esc(m.email)}</div></td><td>${t ? `<b class="${isOverdue(t) ? 'c-red' : ''}">${money(tabTotal(t))}</b>` : '<span class="muted">—</span>'}</td><td class="right">${t ? `<button class="btn sm secondary" data-a="tabOpen" data-id="${t.id}">View tab</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  },

  reports() {
    const s = S.get(), ts = todaySales(), r = reportData(ts), mx = Math.max(1, ...Object.values(r.cats));
    return head('Reports', 'Daily sales summary and transaction log.', `<button class="btn" data-a="printReport">${icon('print')} Printable Report</button>`) + `
    <div class="grid g3" style="margin-bottom:18px">
      <div class="kpi green"><div class="ico">${icon('cash', 24)}</div><div><div class="v">${money(r.total)}</div><div class="l">Total sales today</div></div></div>
      <div class="kpi"><div class="ico">${icon('card', 24)}</div><div><div class="v">${money(r.tender.card || 0)}</div><div class="l">Card</div></div></div>
      <div class="kpi"><div class="ico">${icon('cash', 24)}</div><div><div class="v">${money(r.tender.cash || 0)}</div><div class="l">Cash</div></div></div></div>
    <div class="grid g2"><div class="card white"><h2>Sales by Category <span class="muted" style="font-weight:500;font-size:13px">before discounts &amp; tax</span></h2>${Object.entries(r.cats).map(([k, v]) => `<div class="row" style="margin-bottom:12px;flex-wrap:nowrap"><span style="width:90px;font-weight:600">${k}</span><div class="bar p"><i style="width:${v / mx * 100}%"></i></div><b style="width:110px;text-align:right">${money(v)}</b></div>`).join('') || '<div class="muted">No sales yet.</div>'}<div class="row discount-line" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px"><span>Discounts given</span><b>-${money(r.disc)}</b></div></div>
    <div class="card white"><h2>Top Items</h2>${r.top.map(([k, v]) => `<div class="line"><div class="nm">${esc(k)}</div><b>${v}</b></div>`).join('') || '<div class="muted">No sales yet.</div>'}</div></div>
    <div class="card white" style="margin-top:18px"><h2>Transaction Log</h2><div class="tablewrap"><table><thead><tr><th>Time</th><th>Items</th><th>Tender</th><th class="right">Total</th><th></th></tr></thead><tbody>
    ${s.sales.slice().reverse().slice(0, 25).map(x => `<tr style="${x.voided ? 'opacity:.55' : ''}"><td>${fmtDT(x.time)}</td><td>${x.lines.map(l => `${l.qty}× ${esc(l.name)}`).join(', ')}${x.discount ? `<div class="discount-line" style="font-size:12px">Discount -${money(x.discount.amount)} · ${esc(x.discount.reason)}</div>` : ''}${x.voided ? `<div class="c-red" style="font-size:12px">Voided ${fmtDT(x.voidedAt)} by ${esc(x.voidedBy)} — ${esc(x.voidReason)}</div>` : ''}</td><td><span class="pill">${x.tender}</span></td><td class="right"><b ${x.voided ? 'style="text-decoration:line-through"' : ''}>${money(x.total)}</b></td><td class="right"><button class="btn sm secondary" data-a="receipt" data-id="${x.id}">Receipt</button> ${x.voided ? '<span class="pill red">Voided</span>' : `<button class="btn sm orange" data-a="voidSale" data-id="${x.id}">Void / refund</button>`}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="card white" style="margin-top:18px"><h2>${icon('clock')} Audit Trail <span class="muted" style="font-weight:500;font-size:13px">Philippine Time (UTC+8)</span></h2><div class="tablewrap"><table><thead><tr><th>Date &amp; time</th><th>Event</th><th>Details</th><th>User</th></tr></thead><tbody>
    ${s.audit.slice().reverse().slice(0, 40).map(a => `<tr title="${esc(a.iso)}"><td style="white-space:nowrap">${fmtDT(a.ts)}</td><td><span class="pill">${esc(a.type.replace(/_/g, ' '))}</span></td><td>${esc(a.msg)}</td><td>${esc(a.user)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No audit entries yet. Sessions, items, payments, discounts, voids, stock adjustments and closeouts appear here.</td></tr>'}
    </tbody></table></div></div>`;
  },

  settings() {
    const st = S.get().settings;
    return head('Settings', 'Operational preferences for Cattle Creek Range & Café.') + `
    <div class="grid g2"><div class="card white"><h2>${icon('settings')} Operations</h2>
      <div class="field"><label for="s_tax">Sales tax rate (%)</label><input id="s_tax" type="number" step="0.01" value="${(st.tax * 100).toFixed(2)}"></div>
      <div class="field"><label for="s_over">Tab marked overdue after (hours)</label><input id="s_over" type="number" value="${st.overdueHours}"></div>
      <div class="field"><label for="s_cash">Cashier / station name</label><input id="s_cash" value="${esc(st.cashier)}"></div>
      <div class="field"><label for="s_float">Opening drawer float (₱)</label><input id="s_float" type="number" step="0.01" value="${st.floatAmt}"></div>
      <div class="field"><label for="s_var">Drawer variance needing manager approval (₱)</label><input id="s_var" type="number" step="1" min="0" value="${st.varianceLimit}"></div>
      <div class="field"><label for="s_cur">Currency</label><select id="s_cur" disabled><option>PHP – Philippine Peso (₱)</option></select></div>
      <div class="field"><label for="s_tz">Time zone</label><input id="s_tz" value="Asia/Manila (UTC+8)" disabled></div>
      <div class="field"><label for="s_bays">Driving range bays</label><input id="s_bays" value="15 bays — Bay 1 to Bay 15" disabled></div>
      <button class="btn" data-a="saveSettings">Save Settings</button></div>
    <div class="card"><h2>Brand</h2><div class="row" style="gap:18px">${logo('md')}<div><b>${CLUB}</b><div class="muted">${APP}</div></div></div>
      <p class="muted">The official logo is loaded from <code>assets/brand/cattle-creek-logo.png</code> and displayed unaltered.</p>
      <h2 style="margin-top:22px">Demo Data</h2><p class="muted">Reset all bays, tabs, sales, and stock to the sample data set.</p><button class="btn red" data-a="resetDemo">Reset demo data</button></div></div>`;
  },
};

function legend() { return `<span><i class="dot c-green"></i>Available</span><span><i class="dot" style="color:var(--purple)"></i>In use</span><span><i class="dot c-orange"></i>Reserved</span><span><i class="dot c-gray"></i>Maintenance</span>`; }
function bayGrid() {
  const s = S.get();
  return `<div class="bays">${s.bays.map(b => { const x = s.sessions.find(q => !q.end && q.bayId === b.id); return `<button class="bay ${b.status}" data-a="bay" data-id="${b.id}" aria-label="Bay ${b.id} ${bayStatusLabel[b.status]}">${icon('bay', 22)}<span class="n">Bay ${b.id}</span><span class="s"><i class="dot"></i>${bayStatusLabel[b.status]}</span><span class="who">${x ? esc(x.player) : ''}</span></button>`; }).join('')}</div>`;
}
function reportData(ts) {
  const cats = {}, tender = {}, items = {};
  ts.forEach(x => { tender[x.tender] = (tender[x.tender] || 0) + x.total; x.lines.forEach(l => { cats[l.cat] = (cats[l.cat] || 0) + l.price * l.qty; items[l.name] = (items[l.name] || 0) + l.qty; }); });
  const disc = ts.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0);
  return { disc, cats, tender, top: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 6), total: ts.reduce((a, x) => a + x.total, 0) };
}
function closeoutCalc() {
  const s = S.get(), last = s.closeouts.slice(-1)[0], since = Math.max(S.startOfDay(), last ? last.time : 0);
  const all = s.sales.filter(x => x.time >= since), live = all.filter(x => !x.voided);
  const sum = t => live.filter(x => x.tender === t).reduce((a, x) => a + x.total, 0);
  const cash = sum('cash');
  return { float: s.settings.floatAmt, cash, card: sum('card'), expectedCash: s.settings.floatAmt + cash, n: live.length, voids: all.length - live.length, since, disc: live.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0), limit: s.settings.varianceLimit };
}

// ---------- documents ----------
function receiptHtml(sale, label = 'Receipt') {
  return `<div class="doc printable"><div class="receipt">${logo()}<div class="nm">${CLUB}</div><div>${APP}</div><hr>
    <div class="l"><span>${label} #${esc(sale.id)}</span><span>${fmtDT(sale.time)}</span></div><hr>
    ${sale.lines.map(l => `<div class="l"><span>${l.qty} × ${esc(l.name)}</span><span>${money(l.price * l.qty)}</span></div>`).join('')}<hr>
    <div class="l"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>${sale.discount ? `<div class="l"><span>Discount${sale.discount.type === 'pct' ? ` (${sale.discount.value}%)` : ''}</span><span>-${money(sale.discount.amount)}</span></div>` : ''}<div class="l"><span>Tax</span><span>${money(sale.tax)}</span></div>
    <div class="l nm"><span>TOTAL</span><span>${money(sale.total)}</span></div><div class="l"><span>Paid by</span><span>${esc(sale.tender)}</span></div>${sale.voided ? '<hr><div class="nm">*** VOIDED ***</div>' : ''}<hr><div class="l"><span>Currency</span><span>PHP (₱)</span></div><div>Philippine Time (UTC+8)</div><hr><div>Thank you for visiting<br>${CLUB}</div></div></div>`;
}
function reportDoc(title, body) {
  return `<div class="doc printable"><div class="report-head">${logo()}<div class="t"><b>${CLUB}</b><div>${APP}</div><div class="muted">${title} · ${fmtDT(Date.now())} PHT</div></div></div>${body}</div>`;
}
const docModal = html => modal(`${html}<div class="foot"><button class="btn secondary" data-a="close">Close</button><button class="btn purple" data-a="print">${icon('print')} Print</button></div>`, true);

// ---------- actions ----------
const A = {
  overlay(_, e) { if (e.target.classList.contains('overlay')) closeModal(); },
  close: closeModal,
  print: () => window.print(),
  nav(d) { ui.route = d.r; ui.navOpen = false; render(); window.scrollTo(0, 0); },
  toggleNav() { ui.navOpen = !ui.navOpen; render(); },
  logout() { sessionStorage.removeItem('ccc-user'); ui.user = null; render(); },
  tabFilter(d) { ui.tabFilter = d.f; render(); },
  cat(d) { ui.cat = d.c; render(); },

  // POS
  addCart(d) { const p = S.get().products.find(x => x.id === d.id); const l = ui.cart.find(x => x.name === p.name); if (l) l.qty++; else ui.cart.push({ name: p.name, cat: p.cat, price: p.price, qty: 1 }); render(); },
  qty(d) { const l = ui.cart[+d.i]; l.qty += +d.d; if (l.qty <= 0) ui.cart.splice(+d.i, 1); render(); },
  clearCart() { ui.cart = []; ui.discount = null; render(); },
  pay(d) {
    let sale; S.commit(s => { sale = S.makeSale(s, ui.cart, d.t, null, ui.discount); ui.cart.forEach(l => S.deduct(s, l.name, l.qty)); });
    ui.cart = []; ui.discount = null; docModal(receiptHtml(sale)); toast('Payment recorded');
  },
  chargeTab() {
    const opts = openTabs().map(t => `<option value="${t.id}">${esc(t.player)} — ${money(tabTotal(t))}</option>`).join('');
    modal(`<h2>Charge to Player Tab</h2><div class="field"><label for="ct">Existing tab</label><select id="ct"><option value="">Select a tab…</option>${opts}</select></div>
      <div class="muted" style="margin:8px 0">or start one for a member / guest</div>
      <div class="field"><select id="cm"><option value="">Choose member…</option>${S.get().members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
      <div class="field"><input id="cg" placeholder="Guest name"></div>
      <div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn purple" data-a="doChargeTab">Charge tab</button></div>`);
  },
  doChargeTab() {
    let tab; const tid = val('ct'), mid = val('cm'), g = val('cg').trim();
    if (!tid && !mid && !g) return toast('Choose or name a tab');
    S.commit(s => {
      tab = tid ? s.tabs.find(t => t.id === tid) : mid ? findOrCreateTab(s, s.members.find(m => m.id === mid).name, mid) : findOrCreateTab(s, 'Guest – ' + g, null);
      ui.cart.forEach(l => addToTab(s, tab, { name: l.name, cat: l.cat, price: l.price }, l.qty));
      if (ui.discount && !tab.discount) tab.discount = ui.discount;
    });
    ui.cart = []; ui.discount = null; closeModal(); toast(`Charged to ${tab.player}'s tab`);
  },

  // range & bays
  startSession(d) {
    const s = S.get(), free = s.bays.filter(b => b.status === 'available'), preset = d?.bay;
    if (!free.length) return toast('No bays available');
    modal(`<h2>${icon('bucket')} Start Range Session</h2>
      <div class="field"><label for="rb">Bay</label><select id="rb">${free.map(b => `<option value="${b.id}" ${String(b.id) === preset ? 'selected' : ''}>Bay ${b.id}</option>`).join('')}</select></div>
      <div class="field"><label for="rbk">Bucket</label><select id="rbk">${s.products.filter(p => p.cat === 'Range').map(p => `<option value="${p.id}">${esc(p.name)} — ${price(p.price)}</option>`).join('')}</select></div>
      <div class="field"><label for="rm">Member</label><select id="rm"><option value="">Guest / walk-in</option>${s.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="rg">Guest name (optional)</label><input id="rg" placeholder="Walk-in"></div>
      <div class="field"><label for="rbill">Billing</label><select id="rbill"><option value="tab">Add to player tab</option><option value="card">Pay now – card</option><option value="cash">Pay now – cash</option></select></div>
      <div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doStart">Start session</button></div>`);
  },
  doStart() {
    const s0 = S.get(), p = s0.products.find(x => x.id === val('rbk')), mid = val('rm'), bill = val('rbill'), bay = +val('rb');
    const m = s0.members.find(x => x.id === mid), player = m ? m.name : (val('rg').trim() ? 'Guest – ' + val('rg').trim() : 'Walk-in');
    if (bill === 'tab' && !m && !val('rg').trim()) return toast('Name the guest to bill a tab');
    if (stockBlocked(p)) return toast('Out of stock');
    S.commit(s => {
      let tabId = null;
      if (bill === 'tab') { const t = findOrCreateTab(s, player, mid); addToTab(s, t, p); tabId = t.id; }
      else { S.makeSale(s, [{ name: p.name, cat: p.cat, price: p.price, qty: 1 }], bill); S.deduct(s, p.name, 1); }
      s.bays.find(b => b.id === bay).status = 'occupied';
      const st = Date.now();
      s.sessions.push({ id: 's' + (++s.seq), bayId: bay, player, tabId, bucket: p.name, start: st, startISO: S.manilaISO(st), end: null });
      S.log(s, 'session_start', `Bay ${bay} assigned to ${player} — ${p.name}${tabId ? ' (charged to player tab)' : ' (paid now)'}`);
    });
    closeModal(); toast(`Bay ${bay} started`);
  },
  endSession(d) {
    const s = S.get(), x = s.sessions.find(q => q.id === d.id), tab = x.tabId && s.tabs.find(t => t.id === x.tabId);
    if (tab && tab.status === 'open' && tab.items.length) return A.tabOpen({ id: tab.id, end: x.id }); // collect payment first
    S.commit(st => finishSession(st, x.id)); closeModal(); toast(`Bay ${x.bayId} is available again`);
  },
  endKeep() { const id = ui.tabEnd; ui.tabEnd = ''; S.commit(s => finishSession(s, id)); closeModal(); toast('Session ended — tab left open'); },
  endFromBay(d) { A.endSession(d); },
  setBay(d) { S.commit(s => { const b = s.bays.find(x => x.id === +d.id); S.log(s, 'bay_status', `Bay ${b.id}: ${bayStatusLabel[b.status]} → ${bayStatusLabel[d.s]}`); b.status = d.s; }); closeModal(); },

  // tabs
  newTab() {
    modal(`<h2>New Player Tab</h2><div class="field"><label for="nm">Member</label><select id="nm"><option value="">Guest</option>${S.get().members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ng">Guest name</label><input id="ng" placeholder="Required for guests"></div>
      <div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doNewTab">Open tab</button></div>`);
  },
  doNewTab() {
    const mid = val('nm'), g = val('ng').trim(); if (!mid && !g) return toast('Enter a guest name');
    S.commit(s => { findOrCreateTab(s, mid ? s.members.find(m => m.id === mid).name : 'Guest – ' + g, mid); }); closeModal(); toast('Tab opened');
  },
  tabOpen(d) {
    ui.tabEnd = d.end || '';
    const s = S.get(), t = s.tabs.find(x => x.id === d.id), over = isOverdue(t), open = t.status === 'open';
    const gross = tabGross(t), da = discAmount(gross, t.discount), endS = ui.tabEnd && s.sessions.find(q => q.id === ui.tabEnd);
    modal(`<h2>${icon('tabs')} ${esc(t.player)} ${open ? (over ? '<span class="pill red">Overdue</span>' : '<span class="pill orange">Open</span>') : '<span class="pill green">Settled</span>'}</h2>
      ${endS ? `<div class="notice green">${icon('check')} Bay ${endS.bayId} session finished. Collect payment to return the bay to Available.</div>` : ''}
      ${over ? `<div class="notice red">${icon('alert')} Open for ${elapsed(t.created)} — follow up on payment.</div>` : ''}
      ${t.items.map(i => `<div class="line"><div class="nm">${i.qty} × ${esc(i.name)}<div class="muted" style="font-size:12px;font-weight:500">${price(i.price)} each · added ${fmtDT(i.updatedAt || i.addedAt || t.created)}</div></div><b>${money(i.price * i.qty)}</b></div>`).join('') || '<div class="muted">No charges yet.</div>'}
      <div class="totals" style="margin-top:12px">${da ? `<div><span>Subtotal</span><span>${money(gross)}</span></div><div class="discount-line"><span>Discount (${t.discount.type === 'pct' ? t.discount.value + '%' : 'fixed'} · ${esc(t.discount.reason)})</span><span>-${money(da)}</span></div>` : ''}<div class="big"><span>Balance</span><span>${money(gross - da)}</span></div></div>
      ${open ? `<div class="field" style="margin-top:14px"><label for="ti">Add item</label><div class="row" style="flex-wrap:nowrap"><select id="ti">${s.products.filter(p => !stockBlocked(p)).map(p => `<option value="${p.id}">${esc(p.name)} — ${price(p.price)}</option>`).join('')}</select><button class="btn secondary" data-a="tabAdd" data-id="${t.id}">${icon('plus', 16)} Add</button></div></div>` : ''}
      <div class="foot"><button class="btn secondary" data-a="close">Close</button>
        ${open && t.items.length ? (t.discount ? `<button class="btn secondary" data-a="removeDiscount" data-t="${t.id}">Remove discount</button>` : `<button class="btn orange" data-a="discount" data-t="${t.id}">Discount</button>`) : ''}
        ${endS ? `<button class="btn secondary" data-a="endKeep">End session, keep tab open</button>` : ''}
        ${open && t.items.length ? `<button class="btn purple" data-a="settle" data-id="${t.id}" data-t="card">${icon('card')} Settle – Card</button><button class="btn" data-a="settle" data-id="${t.id}" data-t="cash">${icon('cash')} Settle – Cash</button>` : ''}</div>`);
  },
  tabAdd(d) { S.commit(s => addToTab(s, s.tabs.find(t => t.id === d.id), s.products.find(p => p.id === val('ti')))); A.tabOpen({ id: d.id, end: ui.tabEnd }); },
  settle(d) {
    let sale; const endId = ui.tabEnd;
    S.commit(s => {
      const t = s.tabs.find(x => x.id === d.id); sale = S.makeSale(s, t.items, d.t, t.id, t.discount);
      t.status = 'paid'; t.paid = Date.now(); t.paidISO = S.manilaISO(t.paid);
      S.log(s, 'tab_settled', `${t.player}'s tab settled (${money(sale.total)})`);
      if (endId) finishSession(s, endId);
    });
    ui.tabEnd = ''; docModal(receiptHtml(sale, 'Tab Receipt')); toast(endId ? 'Paid — bay is available again' : 'Tab settled');
  },
  discount(d) {
    modal(`<h2>${icon('alert')} Apply Discount</h2><div class="notice orange">${icon('alert')} Discounts need manager approval and are recorded in the audit trail.</div>
      <div class="field"><label for="dt">Type</label><select id="dt"><option value="pct">Percent (%)</option><option value="amt">Fixed amount (₱)</option></select></div>
      <div class="field"><label for="dv">Value</label><input id="dv" type="number" step="0.01" min="0" inputmode="decimal"></div>
      <div class="field"><label for="dr">Reason</label><input id="dr" placeholder="e.g. Member promo, service recovery"></div>
      <div class="field"><label for="pin">Manager PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="off"></div>
      <div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn orange" data-a="doDiscount" data-t="${d.t}">Approve discount</button></div>`);
  },
  doDiscount(d) {
    const v = parseFloat(val('dv')), type = val('dt'), reason = val('dr').trim();
    if (!(v > 0)) return toast('Enter a discount value');
    if (type === 'pct' && v > 100) return toast('Percent cannot exceed 100');
    if (!reason) return toast('A reason is required');
    if (val('pin') !== MANAGER_PIN) return toast('Incorrect PIN');
    const at = Date.now(), disc = { type, value: v, reason, approvedBy: 'Manager', at, atISO: S.manilaISO(at) };
    const what = type === 'pct' ? `${v}%` : money(v);
    if (d.t === 'cart') { ui.discount = disc; S.commit(s => S.log(s, 'discount_approved', `${what} discount approved on POS order — ${reason}`)); closeModal(); return toast('Discount applied'); }
    S.commit(s => { const t = s.tabs.find(x => x.id === d.t); t.discount = disc; S.log(s, 'discount_approved', `${what} discount approved on ${t.player}'s tab — ${reason}`); });
    A.tabOpen({ id: d.t, end: ui.tabEnd });
  },
  removeDiscount(d) {
    if (d.t === 'cart') { ui.discount = null; return render(); }
    S.commit(s => { const t = s.tabs.find(x => x.id === d.t); t.discount = null; S.log(s, 'discount_removed', `Discount removed from ${t.player}'s tab`); });
    A.tabOpen({ id: d.t, end: ui.tabEnd });
  },

  // fnb / inventory
  toggleProduct(d) { S.commit(s => { const p = s.products.find(x => x.id === d.id); p.available = !p.available; }); },
  editPrice(d) { const p = S.get().products.find(x => x.id === d.id); modal(`<h2>${esc(p.name)}</h2><div class="field"><label for="np">Price (₱)</label><input id="np" type="number" step="0.01" value="${p.price}"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="savePrice" data-id="${p.id}">Save</button></div>`); },
  savePrice(d) { const v = parseFloat(val('np')); if (!(v >= 0)) return toast('Enter a valid price'); S.commit(s => { s.products.find(p => p.id === d.id).price = v; }); closeModal(); },
  newProduct() {
    modal(`<h2>Add Menu Item</h2><div class="field"><label for="pn">Name</label><input id="pn"></div>
      <div class="field"><label for="pc">Category</label><select id="pc"><option>Food</option><option>Beverage</option><option>Pro Shop</option></select></div>
      <div class="field"><label for="pp">Price (₱)</label><input id="pp" type="number" step="0.01"></div>
      <div class="field"><label for="ps">Linked stock item (optional)</label><select id="ps"><option value="">None</option>${S.get().inventory.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></div>
      <div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doNewProduct">Add</button></div>`);
  },
  doNewProduct() { const n = val('pn').trim(), p = parseFloat(val('pp')); if (!n || !(p >= 0)) return toast('Name and price required'); S.commit(s => s.products.push({ id: 'p' + (++s.seq), name: n, cat: val('pc'), price: p, stock: val('ps') || null, per: 1, available: true })); closeModal(); },
  receive(d) { const i = S.get().inventory.find(x => x.id === d.id); modal(`<h2>${esc(i.name)}</h2><p class="muted">On hand: ${+i.qty.toFixed(1)} ${i.unit} · cost ${price(i.cost)} per ${i.unit}</p><div class="field"><label for="rq">Quantity received (use negative to remove)</label><input id="rq" type="number" step="any" value="0"></div><div class="field"><label for="rn">Note (e.g. delivery, spoilage, count correction)</label><input id="rn"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doReceive" data-id="${i.id}">Update stock</button></div>`); },
  doReceive(d) {
    const q = parseFloat(val('rq')), note = val('rn').trim(); if (isNaN(q) || q === 0) return toast('Enter a quantity');
    S.commit(s => { const i = s.inventory.find(x => x.id === d.id), before = +i.qty.toFixed(1); i.qty = Math.max(0, +(i.qty + q).toFixed(3)); i.adjustedAt = Date.now(); i.adjustedISO = S.manilaISO(i.adjustedAt); S.log(s, 'inventory_adjust', `${i.name}: ${q > 0 ? '+' : ''}${q} ${i.unit} (${before} → ${+i.qty.toFixed(1)})${note ? ' — ' + note : ''} · value ${money(Math.abs(q) * i.cost)} at cost`); });
    closeModal(); toast('Stock updated');
  },
  newStock() {
    modal(`<h2>Add Stock Item</h2><div class="field"><label for="in">Name</label><input id="in"></div><div class="grid g2" style="gap:12px"><div class="field"><label for="iu">Unit</label><input id="iu" value="ea"></div><div class="field"><label for="iq">On hand</label><input id="iq" type="number" value="0"></div><div class="field"><label for="ip">Par level</label><input id="ip" type="number" value="20"></div><div class="field"><label for="ic">Critical at</label><input id="ic" type="number" value="5"></div><div class="field"><label for="ico">Unit cost (₱)</label><input id="ico" type="number" step="0.01" value="0"></div><div class="field"><label for="irt">Sales value per unit (₱)</label><input id="irt" type="number" step="0.01" value="0"></div></div>
      <div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doNewStock">Add</button></div>`);
  },
  doNewStock() {
    const n = val('in').trim(); if (!n) return toast('Name required');
    S.commit(s => { const at = Date.now(); s.inventory.push({ id: 'i' + (++s.seq), name: n, unit: val('iu') || 'ea', qty: +val('iq') || 0, par: +val('ip') || 1, critical: +val('ic') || 0, cost: +val('ico') || 0, retail: +val('irt') || 0, adjustedAt: at, adjustedISO: S.manilaISO(at) }); S.log(s, 'inventory_adjust', `New stock item ${n}: ${+val('iq') || 0} ${val('iu') || 'ea'} on hand`); });
    closeModal();
  },

  // members
  newMember() {
    modal(`<h2>Add Member</h2><div class="field"><label for="mn">Full name</label><input id="mn"></div><div class="field"><label for="mt">Membership</label><select id="mt"><option>Full Golf</option><option>Social</option><option>Junior</option><option>Corporate</option></select></div><div class="field"><label for="mp">Phone</label><input id="mp" type="tel"></div><div class="field"><label for="me">Email</label><input id="me" type="email"></div>
      <div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="doNewMember">Add member</button></div>`);
  },
  doNewMember() { const n = val('mn').trim(); if (!n) return toast('Name required'); S.commit(s => s.members.push({ id: 'm' + (++s.seq), name: n, tier: val('mt'), phone: val('mp'), email: val('me') })); closeModal(); },

  // reports / voids / closeout
  receipt(d) { docModal(receiptHtml(S.get().sales.find(x => x.id === d.id))); },
  voidSale(d) {
    const x = S.get().sales.find(q => q.id === d.id);
    modal(`<h2 class="c-red">${icon('alert')} Void / refund ${money(x.total)}?</h2><div class="notice orange">${icon('alert')} Manager approval required. The void is recorded with date, time and approver.</div><div class="field"><label for="vr">Reason</label><input id="vr" placeholder="e.g. wrong item, customer refund"></div><div class="field"><label for="pin">Manager PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="off"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn red" data-a="doVoid" data-id="${x.id}">Approve &amp; void</button></div>`);
  },
  doVoid(d) {
    const reason = val('vr').trim(); if (!reason) return toast('A reason is required'); if (val('pin') !== MANAGER_PIN) return toast('Incorrect PIN');
    S.commit(s => { const x = s.sales.find(q => q.id === d.id); x.voided = true; x.voidedAt = Date.now(); x.voidedISO = S.manilaISO(x.voidedAt); x.voidedBy = 'Manager (' + S.ctx.user + ')'; x.voidReason = reason; S.log(s, 'void', `Receipt ${x.id} (${money(x.total)}) voided/refunded — ${reason}`); });
    closeModal(); toast('Sale voided');
  },
  printReport() {
    const ts = todaySales(), r = reportData(ts);
    docModal(reportDoc('Daily Sales Report', `<div class="totals"><div class="big"><span>Total sales</span><span>${money(r.total)}</span></div></div><div class="row" style="justify-content:space-between"><span>Discounts given</span><b>-${money(r.disc)}</b></div><h3 style="margin:16px 0 6px">By category (before discounts &amp; tax)</h3>${Object.entries(r.cats).map(([k, v]) => `<div class="l receipt-l row" style="justify-content:space-between"><span>${k}</span><b>${money(v)}</b></div>`).join('')}<h3 style="margin:16px 0 6px">By tender</h3>${Object.entries(r.tender).map(([k, v]) => `<div class="row" style="justify-content:space-between"><span>${k}</span><b>${money(v)}</b></div>`).join('')}<h3 style="margin:16px 0 6px">Open player tabs</h3><div class="row" style="justify-content:space-between"><span>${openTabs().length} tabs</span><b>${money(openTabs().reduce((a, t) => a + tabTotal(t), 0))}</b></div>`));
  },
  submitCloseout() {
    const c = closeoutCalc(), counted = parseFloat(val('counted'));
    if (isNaN(counted)) return toast('Enter counted cash');
    const variance = +(counted - c.expectedCash).toFixed(2);
    const go = () => {
      let rec; S.commit(s => { const at = Date.now(); rec = { id: 'c' + (++s.seq), time: at, timeISO: S.manilaISO(at), cashier: s.settings.cashier, counted, variance, expectedCash: c.expectedCash, cash: c.cash, card: c.card, n: c.n, voids: c.voids, disc: c.disc, float: c.float, approved: Math.abs(variance) > c.limit }; s.closeouts.push(rec); S.log(s, 'closeout', `Cashier closeout by ${rec.cashier}: expected ${money(rec.expectedCash)}, counted ${money(counted)}, variance ${money(variance)}${rec.approved ? ' (manager approved)' : ''}`); });
      A.viewCloseout({ id: rec.id });
    };
    if (Math.abs(variance) > c.limit) {
      A._pending = go;
      modal(`<h2 class="c-orange">${icon('alert')} Manager approval needed</h2><div class="notice orange">Drawer variance is ${money(variance)}. Variances over ${money(c.limit)} need a manager PIN.</div><div class="field"><label for="pin">Manager PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="off"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn orange" data-a="approveCloseout">Approve</button></div>`);
    } else go();
  },
  approveCloseout() { if (val('pin') !== MANAGER_PIN) return toast('Incorrect PIN'); closeModal(); A._pending(); },
  viewCloseout(d) {
    const x = S.get().closeouts.find(q => q.id === d.id);
    docModal(reportDoc('Cashier Closeout Report', `<div class="row" style="justify-content:space-between"><span>Cashier</span><b>${esc(x.cashier)}</b></div><div class="row" style="justify-content:space-between"><span>Closed at</span><b>${fmtDT(x.time)} PHT</b></div><hr><div class="row" style="justify-content:space-between"><span>Opening float</span><b>${money(x.float)}</b></div><div class="row" style="justify-content:space-between"><span>Cash sales</span><b>${money(x.cash)}</b></div><div class="row" style="justify-content:space-between"><span>Expected in drawer</span><b>${money(x.expectedCash)}</b></div><div class="row" style="justify-content:space-between"><span>Counted</span><b>${money(x.counted)}</b></div><div class="row" style="justify-content:space-between"><span>Variance</span><b class="${Math.abs(x.variance) > 0.004 ? 'c-orange' : 'c-green'}">${money(x.variance)}${x.approved ? ' (manager approved)' : ''}</b></div><hr><div class="row" style="justify-content:space-between"><span>Card sales</span><b>${money(x.card)}</b></div><div class="row" style="justify-content:space-between"><span>Discounts given</span><b>${money(x.disc || 0)}</b></div><div class="row" style="justify-content:space-between"><span>Transactions / voids</span><b>${x.n} / ${x.voids}</b></div>`));
  },
  saveSettings() { S.commit(s => { Object.assign(s.settings, { tax: (parseFloat(val('s_tax')) || 0) / 100, overdueHours: parseFloat(val('s_over')) || 24, cashier: val('s_cash') || 'Front Counter', floatAmt: parseFloat(val('s_float')) || 0, varianceLimit: isNaN(parseFloat(val('s_var'))) ? 100 : Math.max(0, parseFloat(val('s_var'))), currency: 'PHP' }); }); toast('Settings saved'); },
  resetDemo() { if (confirm('Reset all data to the demo set?')) { S.resetDemo(); ui.cart = []; toast('Demo data restored'); } },
};

// ---------- events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (el.disabled) return;
  const fn = A[el.dataset.a]; if (fn) fn(el.dataset, e);
});
document.addEventListener('input', e => {
  if (e.target.dataset.input !== 'variance') return;
  const c = closeoutCalc(), v = parseFloat(e.target.value), box = $('#variance');
  if (isNaN(v)) { box.className = 'notice green'; box.textContent = 'Enter counted cash to see variance.'; return; }
  const d = +(v - c.expectedCash).toFixed(2), big = Math.abs(d) > c.limit;
  box.className = 'notice ' + (big ? 'orange' : Math.abs(d) > 0.004 ? 'orange' : 'green');
  box.textContent = d === 0 ? 'Drawer balances.' : `${d > 0 ? 'Over' : 'Short'} by ${money(Math.abs(d))}${big ? ' — manager approval required' : ''}`;
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'loginForm') return;
  e.preventDefault(); ui.user = val('u').trim().split('@')[0] || 'Staff'; sessionStorage.setItem('ccc-user', ui.user); S.ctx.user = ui.user; render();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
S.subscribe(render);
// Live Philippine date/time: refresh on every minute boundary.
function tickClock() { const t = Date.now(); document.querySelectorAll('.js-date').forEach(e => { e.textContent = longDate(t); }); document.querySelectorAll('.js-time').forEach(e => { e.textContent = fmtTime(t); }); }
(function loop() { setTimeout(() => { tickClock(); loop(); }, 60000 - (Date.now() % 60000) + 50); })();
setInterval(() => { if (ui.user && ['dashboard', 'range'].includes(ui.route) && !$('#modal-root .overlay')) render(); }, 60000);
render();
