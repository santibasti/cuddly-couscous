// Accounts, roles, permissions, login/logout sessions.
import * as S from './store.js';
import { hashSecret, randomSalt } from './sha.js';

export const PERM_GROUPS = [
  ['Dashboards & reports', [['dash.mgmt', 'Management Dashboard'], ['reports.view', 'View all reports'], ['reports.export', 'Export reports (PDF / Excel)']]],
  ['Sales & payments', [['pos.checkout', 'Point of Sale checkout & walk-in sales'], ['pay.collect', 'Collect payment (cash, GCash, card, member charge)'], ['sales.viewOwn', 'View own sales & receipts'], ['sales.viewAll', 'View all sales & payment records'], ['closeout.own', 'Own cashier shift & closeout'], ['closeout.viewAll', 'View all cashier closeouts']]],
  ['Bays, tabs & orders', [['range.view', 'Range Operations screen'], ['bays.view', 'View 15-bay grid'], ['bays.assign', 'Start session / assign available bay'], ['bays.manage', 'Change bay status (reserve, maintenance)'], ['tabs.view', 'View active player tabs'], ['tabs.viewAll', 'View all tabs (paid, voided, closed)'], ['tabs.open', 'Open a player tab'], ['tabs.addBucket', 'Add buckets to a tab'], ['tabs.addFood', 'Add food & beverages to a tab'], ['orders.create', 'Café orders (walk-in order for cashier payment)']]],
  ['Approvals', [['requests.create', 'Request discounts, voids, refunds, comps, overrides, unpaid-tab closure'], ['approvals.manage', 'Approve / reject requests (Approval Queue)']]],
  ['Products & inventory', [['fnb.view', 'View food & beverage availability'], ['products.manage', 'Edit product prices & menu'], ['inventory.view', 'View inventory'], ['inventory.adjust', 'Adjust inventory (management, reason required)'], ['inventory.request', 'Request an inventory adjustment']]],
  ['People', [['members.view', 'View members'], ['members.manage', 'Add / edit members'], ['players.view', 'Player database & visitor history'], ['staff.manage', 'Create, edit, deactivate staff; reset passwords'], ['roles.manage', 'Manage roles & permissions']]],
  ['Attendance', [['attendance.self', 'Clock in/out, own history, correction requests'], ['attendance.manage', 'All attendance records, corrections & reports']]],
  ['System', [['audit.viewAll', 'View full audit logs'], ['activity.own', 'View own activity history'], ['settings.manage', 'Settings & business configuration']]],
];
export const ALL_PERMS = PERM_GROUPS.flatMap(([, l]) => l.map(([k]) => k));
export const ROLE_LABEL = { admin: 'Admin / Management', cashier: 'Counter / Cashier', attendant: 'Range Attendant', server: 'Café / Server' };
export const DEFAULT_ROLES = () => ({
  admin: { label: ROLE_LABEL.admin, perms: [...ALL_PERMS], locked: true },
  cashier: { label: ROLE_LABEL.cashier, perms: ['bays.view', 'range.view', 'tabs.view', 'tabs.open', 'tabs.addBucket', 'tabs.addFood', 'pos.checkout', 'pay.collect', 'requests.create', 'closeout.own', 'sales.viewOwn', 'members.view', 'fnb.view', 'attendance.self', 'activity.own'] },
  attendant: { label: ROLE_LABEL.attendant, perms: ['bays.view', 'bays.assign', 'range.view', 'tabs.view', 'tabs.addBucket', 'attendance.self', 'activity.own'] },
  server: { label: ROLE_LABEL.server, perms: ['tabs.view', 'tabs.addFood', 'orders.create', 'fnb.view', 'attendance.self', 'activity.own'] },
});
// Permissions that must never be granted to non-management roles (separation of duties).
export const ADMIN_ONLY = ['approvals.manage', 'staff.manage', 'roles.manage', 'settings.manage', 'audit.viewAll', 'products.manage', 'inventory.adjust', 'dash.mgmt', 'reports.view', 'reports.export', 'sales.viewAll', 'closeout.viewAll', 'attendance.manage', 'players.view'];

if (!S.get().roles) { S.get().roles = DEFAULT_ROLES(); S.save(); }

export const SESSION_KEY = 'ccc-session';
export function deviceId() {
  try { let d = localStorage.getItem('ccc-device'); if (!d) { d = 'DEV-' + randomSalt().slice(0, 6).toUpperCase(); localStorage.setItem('ccc-device', d); } return d; } catch { return 'DEV-UNKNOWN'; }
}
function uaLabel() {
  const ua = navigator.userAgent || '';
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'OS';
  return `${deviceId()} · ${b} on ${o}`;
}

let cur = null; // {id, sid}
export function restore() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY); if (!raw) return null;
    const { uid, sid } = JSON.parse(raw), u = S.userById(uid), lg = S.get().logins.find(l => l.id === sid);
    if (!u || !u.active || !lg || lg.logoutAt) { sessionStorage.removeItem(SESSION_KEY); return null; }
    cur = { uid, sid }; bind(u, sid); return u;
  } catch { return null; }
}
function bind(u, sid) { S.ctx.actor = { id: u.id, name: u.name, role: u.role, sessionId: sid, device: uaLabel() }; }
export const user = () => (cur ? S.userById(cur.uid) : null);
export const roleOf = u => S.get().roles[u?.role] || { perms: [] };
export const can = p => { const u = user(); if (!u || !u.active) return false; const perms = roleOf(u).perms; return Array.isArray(p) ? p.some(x => perms.includes(x)) : perms.includes(p); };
export const isAdmin = () => user()?.role === 'admin';

export function checkSecret(u, secret) { return hashSecret(u.pwSalt, secret) === u.pwHash || (/^\d{4,6}$/.test(secret) && hashSecret(u.pinSalt, secret) === u.pinHash); }
export function verifyPin(u, secret) { return hashSecret(u.pinSalt, secret) === u.pinHash || hashSecret(u.pwSalt, secret) === u.pwHash; }

export function login(username, secret) {
  const s = S.get(), u = s.users.find(x => x.username.toLowerCase() === String(username).trim().toLowerCase());
  const fail = (msg, uObj) => { S.commit(st => { if (uObj) { const x = S.userById(uObj.id); x.failed = (x.failed || 0) + 1; if (x.failed >= 5) { x.lockUntil = S.now() + 5 * 60e3; x.failed = 0; } } S.log(st, 'login_failed', `Failed sign-in for "${username}"${uObj ? '' : ' (unknown account)'}`, { id: uObj?.id || 'unknown', name: uObj?.name || String(username), role: uObj?.role || '-', device: uaLabel() }); }); return { ok: false, error: msg }; };
  if (!u) return fail('Incorrect username or password/PIN.');
  if (!u.active) return fail('This account is deactivated. Contact management.', u);
  if (u.lockUntil > S.now()) return fail(`Too many attempts. Try again in ${Math.ceil((u.lockUntil - S.now()) / 60e3)} min.`, u);
  if (!checkSecret(u, String(secret))) return fail('Incorrect username or password/PIN.', u);
  const sid = 'ses' + randomSalt().slice(0, 10), ts = S.now();
  S.commit(st => {
    const x = S.userById(u.id); x.failed = 0; x.lockUntil = 0; x.lastLogin = ts;
    st.logins.push({ id: sid, userId: u.id, userName: u.name, role: u.role, loginAt: ts, loginISO: S.manilaISO(ts), device: uaLabel(), logoutAt: null, logoutISO: null, logoutReason: null });
    bind(u, sid); S.log(st, 'login', `Signed in (${uaLabel()})`);
  });
  cur = { uid: u.id, sid }; sessionStorage.setItem(SESSION_KEY, JSON.stringify({ uid: u.id, sid }));
  return { ok: true, user: u };
}
export function logout(reason = 'logout') {
  if (!cur) return;
  const { sid } = cur, ts = S.now();
  S.commit(st => { const lg = st.logins.find(l => l.id === sid); if (lg) { lg.logoutAt = ts; lg.logoutISO = S.manilaISO(ts); lg.logoutReason = reason; } S.log(st, reason === 'timeout' ? 'logout_timeout' : 'logout', reason === 'timeout' ? 'Signed out automatically after inactivity' : 'Signed out'); });
  cur = null; S.ctx.actor = null; sessionStorage.removeItem(SESSION_KEY);
}

// ---- password / PIN rules ----
export const pwProblem = p => (p.length < 8 ? 'Password must be at least 8 characters.' : !/[A-Za-z]/.test(p) || !/\d/.test(p) ? 'Password needs letters and numbers.' : '');
export const pinProblem = p => (/^\d{4,6}$/.test(p) ? '' : 'PIN must be 4 to 6 digits.');
export function setSecrets(u, { password, pin }) {
  if (password) { u.pwSalt = randomSalt(); u.pwHash = hashSecret(u.pwSalt, password); }
  if (pin) { u.pinSalt = randomSalt(); u.pinHash = hashSecret(u.pinSalt, pin); }
}

// ---- time-clock kiosk: PIN-only identification (no session, clock actions only) ----
export function kioskAuth(username, pin) {
  const s = S.get(), u = s.users.find(x => x.username.toLowerCase() === String(username).trim().toLowerCase());
  const a = { id: u?.id || 'unknown', name: u?.name || String(username), role: u?.role || '-', sessionId: 'kiosk', device: uaLabel() + ' (time clock)' };
  const bad = msg => { S.commit(st => { if (u) { const x = S.userById(u.id); x.failed = (x.failed || 0) + 1; if (x.failed >= 5) { x.lockUntil = S.now() + 5 * 60e3; x.failed = 0; } } S.log(st, 'kiosk_failed', `Failed time-clock PIN for "${username}"`, a); }); return { ok: false, error: msg }; };
  if (!u || !u.active) return bad('Incorrect username or PIN.');
  if (u.lockUntil > S.now()) return bad(`Too many attempts. Try again in ${Math.ceil((u.lockUntil - S.now()) / 60e3)} min.`);
  if (!/^\d{4,6}$/.test(pin) || hashSecret(u.pinSalt, pin) !== u.pinHash) return bad('Incorrect username or PIN.');
  S.commit(() => { S.userById(u.id).failed = 0; });
  return { ok: true, user: u, actor: a };
}
