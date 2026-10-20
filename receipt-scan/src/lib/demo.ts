import type { Api, SignUpInput } from './api';
import type { Company, ExtractResult, Receipt, Session } from './types';
import { blobToDataUrl, sha256 } from './image';
import { DEFAULT_SCAN_LIMIT } from './bir';

/**
 * Demo backend: everything lives in this browser's localStorage, one account = one company.
 * Passwords are salted+hashed but this is NOT secure storage — it exists so the product can be tried with no server.
 */
interface DemoUser { id: string; email: string; salt: string; hash: string; companyId: string }
interface DemoDB { users: DemoUser[]; companies: Company[]; receipts: Receipt[]; usage: Record<string, number> }

const DB_KEY = 'rs.demo.db.v1';
const SESSION_KEY = 'rs.demo.session.v1';
const IMG_KEY = (path: string) => `rs.demo.img.${path}`;

const load = (): DemoDB => {
  try { return JSON.parse(localStorage.getItem(DB_KEY) ?? '') as DemoDB; } catch { return { users: [], companies: [], receipts: [], usage: {} }; }
};
const persist = (db: DemoDB) => localStorage.setItem(DB_KEY, JSON.stringify(db));
const monthKey = (companyId: string) => `${companyId}:${new Date().toISOString().slice(0, 7)}`;
const hashPw = (pw: string, salt: string) => sha256(new Blob([salt + pw]));

export function createDemoApi(): Api {
  const session = (): Session => {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    if (!s) throw new Error('Please sign in');
    return s;
  };
  const writable = () => {
    const s = session();
    if (s.role === 'viewer') throw new Error('Your role is read-only');
    return s;
  };

  return {
    mode: 'demo',
    async getSession() {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
      return s && load().users.some((u) => u.id === s.userId) ? s : null;
    },
    async signUp(i: SignUpInput) {
      const db = load();
      const email = i.email.trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) throw new Error('An account with this email already exists');
      if (i.password.length < 8) throw new Error('Password must be at least 8 characters');
      const company: Company = { id: crypto.randomUUID(), name: i.companyName.trim(), tin: i.tin, vatRegistered: i.vatRegistered, address: '', scanLimit: DEFAULT_SCAN_LIMIT };
      const salt = crypto.randomUUID();
      const user: DemoUser = { id: crypto.randomUUID(), email, salt, hash: await hashPw(i.password, salt), companyId: company.id };
      db.companies.push(company); db.users.push(user); persist(db);
      const s: Session = { userId: user.id, email, companyId: company.id, role: 'owner' };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      return s;
    },
    async signIn(email, password) {
      const db = load();
      const user = db.users.find((u) => u.email === email.trim().toLowerCase());
      if (!user || user.hash !== (await hashPw(password, user.salt))) throw new Error('Wrong email or password');
      const s: Session = { userId: user.id, email: user.email, companyId: user.companyId, role: 'owner' };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      return s;
    },
    async signOut() { localStorage.removeItem(SESSION_KEY); },
    async getCompany() {
      const c = load().companies.find((x) => x.id === session().companyId);
      if (!c) throw new Error('Company not found');
      return { ...c, scanLimit: c.scanLimit ?? DEFAULT_SCAN_LIMIT };
    },
    async updateCompany(patch) {
      const s = writable(); const db = load();
      const c = db.companies.find((x) => x.id === s.companyId)!;
      Object.assign(c, patch); persist(db);
      return c;
    },
    async listReceipts() {
      const s = session();
      return load().receipts.filter((r) => r.companyId === s.companyId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    },
    async saveReceipt(r) {
      const s = writable(); const db = load();
      const rec = { ...r, companyId: s.companyId };
      const i = db.receipts.findIndex((x) => x.id === r.id && x.companyId === s.companyId);
      if (i >= 0) db.receipts[i] = rec; else db.receipts.push(rec);
      persist(db);
      return rec;
    },
    async deleteReceipt(id) {
      const s = writable(); const db = load();
      const r = db.receipts.find((x) => x.id === id && x.companyId === s.companyId);
      if (r?.imagePath) localStorage.removeItem(IMG_KEY(r.imagePath));
      db.receipts = db.receipts.filter((x) => !(x.id === id && x.companyId === s.companyId));
      persist(db);
    },
    async uploadImage(blob, hash) {
      const s = writable();
      const path = `${s.companyId}/${hash}.jpg`;
      try { localStorage.setItem(IMG_KEY(path), await blobToDataUrl(blob)); } catch { throw new Error('Browser storage is full — delete old receipts or switch to the cloud version'); }
      return path;
    },
    async imageUrl(path) {
      const s = session();
      return path.startsWith(s.companyId + '/') ? localStorage.getItem(IMG_KEY(path)) : null;
    },
    async scansUsed() { return load().usage[monthKey(session().companyId)] ?? 0; },
    async extract(): Promise<ExtractResult> {
      const s = writable(); const db = load();
      const company = db.companies.find((c) => c.id === s.companyId)!;
      const used = db.usage[monthKey(s.companyId)] ?? 0;
      if (used >= (company.scanLimit ?? DEFAULT_SCAN_LIMIT)) throw new Error('Monthly scan limit reached — contact support to raise it');
      db.usage[monthKey(s.companyId)] = used + 1; persist(db);
      return { fields: {}, confidence: {}, read: false, message: 'Demo mode has no receipt reader — type the fields in. Connect Supabase to turn on automatic reading.' };
    },
  };
}
