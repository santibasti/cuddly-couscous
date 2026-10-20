import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api, SignUpInput } from './api';
import type { AccountKind, Company, CompanyStats, CompanyStatus, ExtractResult, FirmRow, Receipt, Session } from './types';
import { blobToDataUrl } from './image';

type Row = Record<string, any>;

const toReceipt = (r: Row): Receipt => ({
  id: r.id, companyId: r.company_id, docType: r.doc_type, supplierName: r.supplier_name, supplierTin: r.supplier_tin,
  supplierAddress: r.supplier_address, supplierVatRegistered: r.supplier_vat_registered, invoiceNo: r.invoice_no, date: r.doc_date,
  vatable: Number(r.vatable), vatAmount: Number(r.vat_amount), vatExempt: Number(r.vat_exempt), zeroRated: Number(r.zero_rated),
  total: Number(r.total), withholdingTax: Number(r.withholding_tax), atc: r.atc, purchaseType: r.purchase_type,
  paymentMethod: r.payment_method, category: r.category, deductible: r.deductible, notes: r.notes, status: r.status,
  imagePath: r.image_path, imageHash: r.image_hash, confidence: r.confidence ?? {}, createdAt: r.created_at,
});
const fromReceipt = (r: Receipt): Row => ({
  id: r.id, company_id: r.companyId, doc_type: r.docType, supplier_name: r.supplierName, supplier_tin: r.supplierTin,
  supplier_address: r.supplierAddress, supplier_vat_registered: r.supplierVatRegistered, invoice_no: r.invoiceNo, doc_date: r.date,
  vatable: r.vatable, vat_amount: r.vatAmount, vat_exempt: r.vatExempt, zero_rated: r.zeroRated, total: r.total,
  withholding_tax: r.withholdingTax, atc: r.atc, purchase_type: r.purchaseType, payment_method: r.paymentMethod,
  category: r.category, deductible: r.deductible, notes: r.notes, status: r.status, image_path: r.imagePath,
  image_hash: r.imageHash, confidence: r.confidence,
});
const toCompany = (c: Row): Company => ({ id: c.id, name: c.name, tin: c.tin, vatRegistered: c.vat_registered, address: c.address, status: c.status, scanLimit: c.scan_limit });
const toStats = (r: Row): CompanyStats => ({
  id: r.id, name: r.name, tin: r.tin, vatRegistered: r.vat_registered, status: r.status, scanLimit: r.scan_limit, scansUsed: r.scans_used,
  receiptsTotal: r.receipts_total, receiptsMonth: r.receipts_month, needsReview: r.needs_review, spendMonth: Number(r.spend_month),
  lastActivity: r.last_activity, createdAt: r.created_at, ownerEmail: r.owner_email ?? null,
});
const ACTIVE_KEY = (userId: string) => `rs.active.${userId}`;
const readActive = (userId: string) => { try { return localStorage.getItem(ACTIVE_KEY(userId)); } catch { return null; } };
const writeActive = (userId: string, id: string | null) => { try { if (id) localStorage.setItem(ACTIVE_KEY(userId), id); else localStorage.removeItem(ACTIVE_KEY(userId)); } catch { /* private mode */ } };

export function createCloudApi(): Api {
  const sb: SupabaseClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

  async function sessionFor(userId: string, email: string): Promise<Session> {
    const [mem, prof, adm] = await Promise.all([
      sb.from('memberships').select('company_id, role').eq('user_id', userId),
      sb.from('profiles').select('kind').eq('user_id', userId).maybeSingle(),
      sb.rpc('is_platform_admin'),
    ]);
    fail(mem.error); fail(prof.error);
    const ms = mem.data ?? [];
    const kind: AccountKind = prof.data?.kind === 'firm' ? 'firm' : 'business';
    const isAdmin = adm.data === true;
    // a single-company business opens straight into its workspace; firms and the platform owner start on their own page
    const saved = readActive(userId);
    const pick = ms.find((m) => m.company_id === saved) ?? (kind === 'business' && !isAdmin ? ms[0] : undefined);
    return { userId, email, companyId: pick?.company_id ?? null, role: pick?.role ?? null, isAdmin, kind, companyCount: ms.length };
  }
  let cached: Session | null = null;
  const need = async () => (cached ??= await api.getSession()) ?? (() => { throw new Error('Please sign in'); })();
  const needCompany = async () => {
    const s = await need();
    if (!s.companyId) throw new Error('Open a client workspace first');
    return { ...s, companyId: s.companyId };
  };

  const api: Api = {
    mode: 'cloud',
    async getSession() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return (cached = null);
      return (cached = await sessionFor(u.id, u.email ?? ''));
    },
    async signUp(i: SignUpInput) {
      const { data, error } = await sb.auth.signUp({ email: i.email, password: i.password });
      fail(error);
      if (!data.session) throw new Error('Check your email to confirm your account, then sign in.');
      const { error: e2 } = await sb.rpc('signup_setup', { p_kind: i.kind, p_name: i.companyName, p_tin: i.tin, p_vat: i.vatRegistered });
      fail(e2);
      return (cached = await sessionFor(data.user!.id, i.email));
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      fail(error);
      return (cached = await sessionFor(data.user!.id, email));
    },
    async signOut() { cached = null; await sb.auth.signOut(); },
    async switchCompany(companyId) {
      const s = await need();
      writeActive(s.userId, companyId);
      return (cached = await sessionFor(s.userId, s.email));
    },
    async listClients() {
      const { data, error } = await sb.rpc('my_company_stats');
      fail(error); return ((data ?? []) as Row[]).map(toStats);
    },
    async addClient(i) {
      const { data, error } = await sb.rpc('add_client', { p_name: i.name, p_tin: i.tin, p_vat: i.vatRegistered });
      fail(error); return data as string;
    },
    async adminListCompanies() {
      const { data, error } = await sb.rpc('admin_company_stats');
      fail(error); return ((data ?? []) as Row[]).map(toStats);
    },
    async adminUpdateCompany(id, patch: { scanLimit: number; status: CompanyStatus }) {
      const { error } = await sb.rpc('admin_update_company', { p_id: id, p_scan_limit: patch.scanLimit, p_status: patch.status });
      fail(error);
    },
    async adminListFirms(): Promise<FirmRow[]> {
      const { data, error } = await sb.rpc('admin_list_firms');
      fail(error);
      return ((data ?? []) as Row[]).map((r) => ({ userId: r.user_id, email: r.email, name: r.display_name, clients: r.clients, maxClients: r.max_clients, createdAt: r.created_at }));
    },
    async adminUpdateFirm(userId, maxClients) {
      const { error } = await sb.rpc('admin_update_firm', { p_user: userId, p_max_clients: maxClients });
      fail(error);
    },
    async getCompany() {
      const s = await needCompany();
      const { data, error } = await sb.from('companies').select('*').eq('id', s.companyId).single();
      fail(error); return toCompany(data!);
    },
    async updateCompany(p) {
      const s = await needCompany();
      const row: Row = {};
      if (p.name !== undefined) row.name = p.name;
      if (p.tin !== undefined) row.tin = p.tin;
      if (p.vatRegistered !== undefined) row.vat_registered = p.vatRegistered;
      if (p.address !== undefined) row.address = p.address;
      const { data, error } = await sb.from('companies').update(row).eq('id', s.companyId).select().single();
      fail(error); return toCompany(data!);
    },
    async listReceipts() {
      const s = await needCompany();
      const { data, error } = await sb.from('receipts').select('*').eq('company_id', s.companyId).order('doc_date', { ascending: false }).limit(5000);
      fail(error); return (data ?? []).map(toReceipt);
    },
    async saveReceipt(r) {
      const s = await needCompany();
      const { data, error } = await sb.from('receipts').upsert(fromReceipt({ ...r, companyId: s.companyId })).select().single();
      fail(error); return toReceipt(data!);
    },
    async deleteReceipt(id) {
      const { error } = await sb.from('receipts').delete().eq('id', id);
      fail(error);
    },
    async uploadImage(blob, hash) {
      const s = await needCompany();
      const path = `${s.companyId}/${hash}.jpg`;
      const { error } = await sb.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      fail(error); return path;
    },
    async imageUrl(path) {
      const { data } = await sb.storage.from('receipts').createSignedUrl(path, 600);
      return data?.signedUrl ?? null;
    },
    async scansUsed() {
      const s = await needCompany();
      const { data, error } = await sb.rpc('scans_used', { p_company: s.companyId });
      fail(error); return Number(data ?? 0);
    },
    async extract(blob): Promise<ExtractResult> {
      const s = await needCompany();
      const image = (await blobToDataUrl(blob)).split(',')[1];
      const { data, error } = await sb.functions.invoke('extract-receipt', { body: { companyId: s.companyId, image, mediaType: 'image/jpeg' } });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as any).context.json()).error ?? msg; } catch { /* keep default */ }
        throw new Error(msg);
      }
      return data as ExtractResult;
    },
  };
  return api;
}
