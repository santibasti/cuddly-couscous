import { CLUB, APP, LOGIN_SUB, logo, syncLogos } from './brand.js';
import { icon } from './icons.js';
import * as S from './store.js';
import * as Auth from './auth.js';
import { ui, $, esc, val, toast, closeModal, modalOpen, registry, setRender, deny } from './ui.js';
import { longDate, fmtTime } from './store.js';
import './ops.js'; import './approvals.js'; import './attendance.js'; import './mgmt.js'; import './admin.js';
import { kioskView } from './attendance.js';
import { pendingCount } from './approvals.js';

const NAV_ORDER = ['dashboard', 'mgmt', 'approvals', 'reports', 'range', 'bays', 'tabs', 'pos', 'cafe', 'sales', 'fnb', 'inventory', 'closeout', 'members', 'players', 'attendance', 'activity', 'staff', 'audit', 'settings'];
const DEMO_HINTS = true; // set to false before going live: hides the demo-accounts box on the sign-in page
let loginErr = '';
const viewOf = r => registry.views.find(v => v.route === r);
const allowed = v => v && (v.perm === null || Auth.can(v.perm));

// ---------- shell ----------
function drawShell(u) {
  const items = NAV_ORDER.map(viewOf).filter(allowed);
  if (!items.find(v => v.route === ui.route)) ui.route = 'dashboard';
  let lastG = '', nav = '';
  for (const v of items) {
    if (v.group !== lastG) { if (v.group !== 'Home') nav += `<div class="navgrp">${v.group}</div>`; lastG = v.group; }
    const b = v.badge ? v.badge() : 0;
    nav += `<button data-a="nav" data-r="${v.route}" class="${ui.route === v.route ? 'active' : ''}">${icon(v.icon)}<span>${v.label}</span>${b ? `<span class="badge">${b}</span>` : ''}</button>`;
  }
  const cur = viewOf(ui.route);
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar ${ui.navOpen ? 'open' : ''}">
      <div class="brandplate">${logo()}<div class="app">${APP}</div></div>
      <nav class="nav">${nav}</nav>
      <div class="sidefoot">${icon('member')}<div class="who"><b>${esc(u.name)}</b><span>${esc(Auth.roleOf(u).label)}</span></div><button data-a="myAccount" title="My account" aria-label="My account">${icon('key')}</button><button data-a="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div>
    </aside>
    <div style="flex:1;min-width:0">
      <div class="topbar"><button data-a="toggleNav" aria-label="Menu">${icon('menu', 24)}</button><div class="t">${CLUB}</div></div>
      <main class="main">${allowed(cur) ? cur.render() : deny()}</main>
    </div></div>`;
}
function drawLogin() {
  $('#app').innerHTML = `<div class="login"><div class="login-card">
    ${logo('lg')}
    <div class="club">${CLUB}</div>
    <h1>${APP}</h1><div class="sub">${LOGIN_SUB}</div>
    <form id="loginForm" autocomplete="off">
      <div class="field"><label for="u">Username</label><input id="u" autocomplete="username" placeholder="e.g. cashier1" required autocapitalize="none"></div>
      <div class="field"><label for="pw">Password or PIN</label><input id="pw" type="password" autocomplete="current-password" placeholder="••••••••" required></div>
      ${loginErr ? `<div class="notice red">${icon('alert')} ${esc(loginErr)}</div>` : ''}
      <button class="btn block lg" type="submit">Sign In</button>
    </form>
    <button class="btn secondary block" style="margin-top:12px" data-a="kioskOpen">${icon('clock')} Staff Time Clock (clock in / out)</button>
    ${DEMO_HINTS ? `<details class="demo"><summary>Demo accounts</summary><table><tr><th>Username</th><th>Role</th><th>Password</th><th>PIN</th></tr>${[['admin', 'Admin / Management', 'Admin@2026', '9090'], ['cashier1', 'Counter / Cashier', 'Cattle@2026', '1111'], ['cashier2', 'Counter / Cashier', 'Cattle@2026', '2222'], ['attendant1', 'Range Attendant', 'Cattle@2026', '3333'], ['attendant2', 'Range Attendant', 'Cattle@2026', '4444'], ['server1', 'Café / Server', 'Cattle@2026', '5555'], ['server2', 'Café / Server', 'Cattle@2026', '6666']].map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table><p>Demo build only. Turn this box off with <code>DEMO_HINTS</code> in <code>js/app.js</code>.</p></details>` : ''}
  </div></div>`;
}
function render() {
  const u = Auth.user();
  if (u && !u.active) { Auth.logout('deactivated'); }
  if (ui.kioskMode && !Auth.user()) { $('#app').innerHTML = kioskView(); }
  else if (!Auth.user()) drawLogin();
  else drawShell(Auth.user());
  syncLogos();
}
setRender(render);

// ---------- actions & events ----------
registry.actions.overlay = [null, (d, e) => { if (e.target.classList.contains('overlay')) closeModal(); }];
registry.actions.toggleNav = [null, () => { ui.navOpen = !ui.navOpen; render(); }];
registry.actions.logout = [null, () => { Auth.logout(); ui.route = 'dashboard'; ui.cart = []; closeModal(); render(); }];
registry.actions.kioskOpen = ['public', () => { ui.kioskMode = true; render(); }];

function run(name, el, ev) {
  const a = registry.actions[name]; if (!a) return;
  const [perm, fn] = a;
  if (perm !== 'public' && perm !== null && !Auth.can(perm.split('|'))) { if (Auth.user()) { S.commit(s => S.log(s, 'access_denied', `Blocked action "${name}" (not permitted for ${Auth.roleOf(Auth.user()).label})`)); toast('Your role is not allowed to do that', 'err'); } return; }
  if (perm === null && !Auth.user() && !['overlay'].includes(name)) return;
  try { fn(el.dataset, ev, el); } catch (e) { console.error(e); toast('Something went wrong: ' + e.message, 'err'); }
}
document.addEventListener('click', e => {
  touch();
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  if (el.tagName === 'A') e.preventDefault();
  run(el.dataset.a, el, e);
});
document.addEventListener('change', e => { touch(); const el = e.target.closest('[data-change]'); if (el) run(el.dataset.change, el, e); });
document.addEventListener('input', e => {
  touch();
  const el = e.target.closest('[data-input]'); if (el) run(el.dataset.input, el, e);
  if (e.target.dataset.live) { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('[data-s]').forEach(r => { r.style.display = !q || r.dataset.s.includes(q) ? '' : 'none'; }); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'loginForm') { const r = Auth.login(val('u'), val('pw')); if (!r.ok) { loginErr = r.error; render(); return; } loginErr = ''; ui.route = 'dashboard'; resetIdle(); render(); }
  if (e.target.id === 'kioskForm') registry.actions.kioskCheck[1]();
});
document.addEventListener('keydown', e => { touch(); if (e.key === 'Escape') closeModal(); });

// ---------- tooltips (charts) ----------
const tip = document.createElement('div'); tip.id = 'tip'; tip.className = 'hide'; document.body.append(tip);
document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (!t) return; tip.textContent = t.dataset.tip; tip.classList.remove('hide'); });
document.addEventListener('mousemove', e => { if (tip.classList.contains('hide')) return; tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; });
document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) tip.classList.add('hide'); });

// ---------- idle sign-out (shared tablets) ----------
let lastAct = Date.now(), lastTouch = 0;
function touch() { const n = Date.now(); if (n - lastTouch > 1000) { lastAct = n; lastTouch = n; } }
const resetIdle = () => { lastAct = Date.now(); };
setInterval(() => {
  const u = Auth.user(); if (!u) { if (ui.kioskMode && !Auth.user()) { /* kiosk resets itself */ } return; }
  if (!u.active) { Auth.logout('deactivated'); closeModal(); return render(); }
  if (Date.now() - lastAct > S.get().settings.idleMinutes * 60e3) { Auth.logout('timeout'); closeModal(); ui.cart = []; loginErr = 'You were signed out after a period of inactivity.'; render(); }
}, 15e3);

// ---------- live clock ----------
function tickClock() { const t = Date.now(); document.querySelectorAll('.js-date').forEach(e => { e.textContent = longDate(t); }); document.querySelectorAll('.js-time').forEach(e => { e.textContent = fmtTime(t); }); }
(function loop() { setTimeout(() => { tickClock(); if (Auth.user() && !modalOpen() && ['dashboard', 'range', 'mgmt', 'attendance'].includes(ui.route) && !document.activeElement?.matches('input,textarea,select')) render(); loop(); }, 60000 - (Date.now() % 60000) + 50); })();

S.subscribe(render);
Auth.restore();
resetIdle();
render();
