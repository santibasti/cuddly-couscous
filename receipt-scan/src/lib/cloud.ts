import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api, SignUpInput } from './api';
import type { Company, ExtractResult, PlanId, Receipt, Session } from './types';
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
const toCompany = (c: Row): Company => ({ id: c.id, name: c.name, tin: c.tin, vatRegistered: c.vat_registered, address: c.address, plan: c.plan });

export function createCloudApi(): Api {
  const sb: SupabaseClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

  async function sessionFor(userId: string, email: string): Promise<Session> {
    const { data, error } = await sb.from('memberships').select('company_id, role').eq('user_id', userId).limit(1).single();
    fail(error);
    return { userId, email, companyId: data!.company_id, role: data!.role };
  }
  let cached: Session | null = null;
  const need = async () => (cached ??= await api.getSession()) ?? (() => { throw new Error('Please sign in'); })();

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
      const { error: e2 } = await sb.rpc('create_company', { p_name: i.companyName, p_tin: i.tin, p_vat_registered: i.vatRegistered });
      fail(e2);
      return (cached = await sessionFor(data.user!.id, i.email));
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      fail(error);
      return (cached = await sessionFor(data.user!.id, email));
    },
    async signOut() { cached = null; await sb.auth.signOut(); },
    async getCompany() {
      const s = await need();
      const { data, error } = await sb.from('companies').select('*').eq('id', s.companyId).single();
      fail(error); return toCompany(data!);
    },
    async updateCompany(p) {
      const s = await need();
      const row: Row = {};
      if (p.name !== undefined) row.name = p.name;
      if (p.tin !== undefined) row.tin = p.tin;
      if (p.vatRegistered !== undefined) row.vat_registered = p.vatRegistered;
      if (p.address !== undefined) row.address = p.address;
      const { data, error } = await sb.from('companies').update(row).eq('id', s.companyId).select().single();
      fail(error); return toCompany(data!);
    },
    async setPlan(plan: PlanId) {
      // Plan changes must go through your payment webhook in production; this RPC is restricted to owners and only lets them move to 'free'.
      const { data, error } = await sb.rpc('request_plan_change', { p_plan: plan });
      fail(error); return toCompany(data as Row);
    },
    async listReceipts() {
      const s = await need();
      const { data, error } = await sb.from('receipts').select('*').eq('company_id', s.companyId).order('doc_date', { ascending: false }).limit(5000);
      fail(error); return (data ?? []).map(toReceipt);
    },
    async saveReceipt(r) {
      const s = await need();
      const { data, error } = await sb.from('receipts').upsert(fromReceipt({ ...r, companyId: s.companyId })).select().single();
      fail(error); return toReceipt(data!);
    },
    async deleteReceipt(id) {
      const { error } = await sb.from('receipts').delete().eq('id', id);
      fail(error);
    },
    async uploadImage(blob, hash) {
      const s = await need();
      const path = `${s.companyId}/${hash}.jpg`;
      const { error } = await sb.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      fail(error); return path;
    },
    async imageUrl(path) {
      const { data } = await sb.storage.from('receipts').createSignedUrl(path, 600);
      return data?.signedUrl ?? null;
    },
    async scansUsed() {
      const s = await need();
      const { data, error } = await sb.rpc('scans_used', { p_company: s.companyId });
      fail(error); return Number(data ?? 0);
    },
    async extract(blob): Promise<ExtractResult> {
      const s = await need();
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
