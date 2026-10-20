import type { Api, SignUpInput } from './api';
import type { AccountKind, Company, CompanyStats, CompanyStatus, ExtractResult, FirmRow, Receipt, Session } from './types';
import { blobToDataUrl, sha256 } from './image';
import { uuid } from './uuid';
import { DEFAULT_SCAN_LIMIT, round2 } from './bir';

/**
 * Demo backend: everything lives in this browser's localStorage. One login can belong to several companies (a firm and its clients).
 * Passwords are salted+hashed but this is NOT secure storage — it exists so the product can be tried with no server.
 */
interface DemoUser { id: string; email: string; salt: string; hash: string; kind: AccountKind; displayName: string; companyIds: string[]; maxClients: number; createdAt: string; companyId?: string }
interface DemoCompany extends Company { createdAt: string }
interface DemoDB { users: DemoUser[]; companies: DemoCompany[]; receipts: Receipt[]; usage: Record<string, number> }
interface StoredSession { userId: string; active: string | null }

/** Demo-only platform-owner login, so the owner console can be tried without a server. Shown on the sign-in screen in demo mode. */
export const DEMO_ADMIN = { email: 'owner@resiboscan.demo', password: 'admin12345' };

const DB_KEY = 'rs.demo.db.v1';
const SESSION_KEY = 'rs.demo.session.v2';
const IMG_KEY = (path: string) => `rs.demo.img.${path}`;
const hashPw = (pw: string, salt: string) => sha256(new Blob([salt + pw]));
const monthKey = (companyId: string) => `${companyId}:${new Date().toISOString().slice(0, 7)}`;

function load(): DemoDB {
  let db: DemoDB;
  try { db = JSON.parse(localStorage.getItem(DB_KEY) ?? '') as DemoDB; } catch { db = { users: [], companies: [], receipts: [], usage: {} }; }
  // upgrade data saved by earlier versions
  for (const u of db.users) {
    u.kind ??= 'business'; u.maxClients ??= 10; u.createdAt ??= '';
    if (!u.companyIds) u.companyIds = u.companyId ? [u.companyId] : [];
    u.displayName ??= '';
  }
  for (const c of db.companies) { c.status ??= 'active'; c.scanLimit ??= DEFAULT_SCAN_LIMIT; c.createdAt ??= ''; }
  return db;
}
const persist = (db: DemoDB) => localStorage.setItem(DB_KEY, JSON.stringify(db));
const readSession = (): StoredSession | null => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; } };
const writeSession = (s: StoredSession | null) => (s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY));
const isAdminUser = (u: DemoUser) => u.email === DEMO_ADMIN.email;

function buildSession(u: DemoUser, active: string | null): Session {
  const own = active && u.companyIds.includes(active) ? active : null;
  // a single-company business opens straight into its workspace; firms and the owner start on their own page
  const companyId = own ?? (u.kind === 'business' && !isAdminUser(u) ? u.companyIds[0] ?? null : null);
  return { userId: u.id, email: u.email, companyId, role: companyId ? 'owner' : null, isAdmin: isAdminUser(u), kind: u.kind, companyCount: u.companyIds.length };
}

function statsOf(db: DemoDB, c: DemoCompany, ownerEmail: string | null): CompanyStats {
  const month = new Date().toISOString().slice(0, 7);
  const rs = db.receipts.filter((r) => r.companyId === c.id);
  const inMonth = rs.filter((r) => r.date.startsWith(month));
  return {
    id: c.id, name: c.name, tin: c.tin, vatRegistered: c.vatRegistered, status: c.status, scanLimit: c.scanLimit,
    scansUsed: db.usage[monthKey(c.id)] ?? 0, receiptsTotal: rs.length, receiptsMonth: inMonth.length,
    needsReview: rs.filter((r) => r.status === 'needs_review').length, spendMonth: round2(inMonth.reduce((a, r) => a + r.total, 0)),
    lastActivity: rs.reduce<string | null>((m, r) => (!m || r.createdAt > m ? r.createdAt : m), null), createdAt: c.createdAt, ownerEmail,
  };
}

export function createDemoApi(): Api {
  // make sure the demo platform-owner exists (hashing is async, so do it once up front)
  const ready = (async () => {
    const db = load();
    if (!db.users.some((u) => u.email === DEMO_ADMIN.email)) {
      const salt = uuid();
      db.users.push({ id: uuid(), email: DEMO_ADMIN.email, salt, hash: await hashPw(DEMO_ADMIN.password, salt), kind: 'business', displayName: 'Platform owner', companyIds: [], maxClients: 0, createdAt: new Date().toISOString() });
      persist(db);
    }
  })();

  const me = (db = load()) => {
    const s = readSession();
    const u = s && db.users.find((x) => x.id === s.userId);
    if (!s || !u) throw new Error('Please sign in');
    return { db, s, u, session: buildSession(u, s.active) };
  };
  const needCompany = (db = load()) => {
    const { session } = me(db);
    if (!session.companyId) throw new Error('Open a client workspace first');
    return { db, session, companyId: session.companyId, company: db.companies.find((c) => c.id === session.companyId)! };
  };
  const writable = () => {
    const x = needCompany();
    if (x.company.status !== 'active') throw new Error('This account is paused — contact support');
    return x;
  };
  const needAdmin = () => { const x = me(); if (!x.session.isAdmin) throw new Error('Not allowed'); return x; };

  const api: Api = {
    mode: 'demo',
    async getSession() {
      await ready;
      const s = readSession(); const db = load();
      const u = s && db.users.find((x) => x.id === s.userId);
      return s && u ? buildSession(u, s.active) : null;
    },
    async signUp(i: SignUpInput) {
      await ready;
      const db = load();
      const email = i.email.trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) throw new Error('An account with this email already exists');
      if (i.password.length < 8) throw new Error('Password must be at least 8 characters');
      if (!i.companyName.trim()) throw new Error(i.kind === 'firm' ? 'Firm name is required' : 'Business name is required');
      const salt = uuid();
      const user: DemoUser = { id: uuid(), email, salt, hash: await hashPw(i.password, salt), kind: i.kind, displayName: i.companyName.trim(), companyIds: [], maxClients: 10, createdAt: new Date().toISOString() };
      if (i.kind === 'business') {
        const c: DemoCompany = { id: uuid(), name: i.companyName.trim(), tin: i.tin, vatRegistered: i.vatRegistered, address: '', status: 'active', scanLimit: DEFAULT_SCAN_LIMIT, createdAt: new Date().toISOString() };
        db.companies.push(c); user.companyIds.push(c.id);
      }
      db.users.push(user); persist(db);
      writeSession({ userId: user.id, active: null });
      return buildSession(user, null);
    },
    async signIn(email, password) {
      await ready;
      const db = load();
      const user = db.users.find((u) => u.email === email.trim().toLowerCase());
      if (!user || user.hash !== (await hashPw(password, user.salt))) throw new Error('Wrong email or password');
      writeSession({ userId: user.id, active: null });
      return buildSession(user, null);
    },
    async signOut() { writeSession(null); },

    async switchCompany(companyId) {
      const { u } = me();
      if (companyId && !u.companyIds.includes(companyId)) throw new Error('Not allowed');
      writeSession({ userId: u.id, active: companyId });
      return buildSession(u, companyId);
    },
    async listClients() {
      const { db, u } = me();
      return db.companies.filter((c) => u.companyIds.includes(c.id)).map((c) => statsOf(db, c, u.email)).sort((a, b) => a.name.localeCompare(b.name));
    },
    async addClient(input) {
      const { db, u } = me();
      const user = db.users.find((x) => x.id === u.id)!;
      if (user.kind !== 'firm') throw new Error('Only accounting-firm accounts can add clients');
      if (!input.name.trim()) throw new Error('Client name is required');
      if (user.companyIds.length >= user.maxClients) throw new Error(`Client limit reached (${user.maxClients}) — contact support to add more`);
      const c: DemoCompany = { id: uuid(), name: input.name.trim(), tin: input.tin, vatRegistered: input.vatRegistered, address: '', status: 'active', scanLimit: DEFAULT_SCAN_LIMIT, createdAt: new Date().toISOString() };
      db.companies.push(c); user.companyIds.push(c.id); persist(db);
      return c.id;
    },

    async adminListCompanies() {
      needAdmin(); const db = load();
      return db.companies.map((c) => statsOf(db, c, db.users.find((u) => u.companyIds.includes(c.id))?.email ?? null)).sort((a, b) => a.name.localeCompare(b.name));
    },
    async adminUpdateCompany(id, patch: { scanLimit: number; status: CompanyStatus }) {
      needAdmin(); const db = load();
      const c = db.companies.find((x) => x.id === id);
      if (!c) throw new Error('Company not found');
      if (!Number.isFinite(patch.scanLimit) || patch.scanLimit < 0) throw new Error('Scan limit must be 0 or more');
      if (patch.status !== 'active' && patch.status !== 'suspended') throw new Error('Bad status');
      c.scanLimit = Math.floor(patch.scanLimit); c.status = patch.status; persist(db);
    },
    async adminListFirms(): Promise<FirmRow[]> {
      needAdmin(); const db = load();
      return db.users.filter((u) => u.kind === 'firm').map((u) => ({ userId: u.id, email: u.email, name: u.displayName, clients: u.companyIds.length, maxClients: u.maxClients, createdAt: u.createdAt }));
    },
    async adminUpdateFirm(userId, maxClients) {
      needAdmin(); const db = load();
      const u = db.users.find((x) => x.id === userId && x.kind === 'firm');
      if (!u) throw new Error('Firm not found');
      if (!Number.isFinite(maxClients) || maxClients < 0) throw new Error('Client limit must be 0 or more');
      u.maxClients = Math.floor(maxClients); persist(db);
    },

    async getCompany() {
      const { company } = needCompany();
      const { createdAt: _c, ...c } = company; void _c;
      return c;
    },
    async updateCompany(patch) {
      const { db, companyId } = writable();
      const c = db.companies.find((x) => x.id === companyId)!;
      const { name, tin, vatRegistered, address } = patch;
      Object.assign(c, Object.fromEntries(Object.entries({ name, tin, vatRegistered, address }).filter(([, v]) => v !== undefined)));
      persist(db);
      const { createdAt: _c, ...out } = c; void _c;
      return out;
    },
    async listReceipts() {
      const { db, companyId } = needCompany();
      return db.receipts.filter((r) => r.companyId === companyId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    },
    async saveReceipt(r) {
      const { db, companyId } = writable();
      const rec = { ...r, companyId };
      const i = db.receipts.findIndex((x) => x.id === r.id && x.companyId === companyId);
      if (i >= 0) db.receipts[i] = rec; else db.receipts.push(rec);
      persist(db);
      return rec;
    },
    async deleteReceipt(id) {
      const { db, companyId } = writable();
      const r = db.receipts.find((x) => x.id === id && x.companyId === companyId);
      if (r?.imagePath) localStorage.removeItem(IMG_KEY(r.imagePath));
      db.receipts = db.receipts.filter((x) => !(x.id === id && x.companyId === companyId));
      persist(db);
    },
    async uploadImage(blob, hash) {
      const { companyId } = writable();
      const path = `${companyId}/${hash}.jpg`;
      try { localStorage.setItem(IMG_KEY(path), await blobToDataUrl(blob)); } catch { throw new Error('Browser storage is full — delete old receipts or switch to the cloud version'); }
      return path;
    },
    async imageUrl(path) {
      const { session } = me();
      const ok = session.companyId && path.startsWith(session.companyId + '/');
      return ok ? localStorage.getItem(IMG_KEY(path)) : null;
    },
    async scansUsed() {
      const { companyId } = needCompany();
      return load().usage[monthKey(companyId)] ?? 0;
    },
    async extract(): Promise<ExtractResult> {
      const { db, companyId, company } = writable();
      const used = db.usage[monthKey(companyId)] ?? 0;
      if (used >= company.scanLimit) throw new Error('Monthly scan limit reached — contact support to raise it');
      db.usage[monthKey(companyId)] = used + 1; persist(db);
      return { fields: {}, confidence: {}, read: false, message: 'Demo mode has no receipt reader — type the fields in. Connect Supabase to turn on automatic reading.' };
    },
  };
  return api;
}
