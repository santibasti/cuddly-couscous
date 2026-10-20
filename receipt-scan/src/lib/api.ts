import type { AccountKind, Company, CompanyStats, CompanyStatus, ExtractResult, FirmRow, Receipt, Session } from './types';

/** For a firm, `companyName` is the firm's name and no company is created yet. */
export interface SignUpInput { email: string; password: string; companyName: string; tin: string; vatRegistered: boolean; kind: AccountKind }

export interface Api {
  mode: 'demo' | 'cloud';
  getSession(): Promise<Session | null>;
  signUp(input: SignUpInput): Promise<Session>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  /** open another workspace (a firm moving between its clients); null goes back to the client list */
  switchCompany(companyId: string | null): Promise<Session>;
  /** every company this login belongs to, with this month's numbers */
  listClients(): Promise<CompanyStats[]>;
  /** firms only: create a client workspace */
  addClient(input: { name: string; tin: string; vatRegistered: boolean }): Promise<string>;
  /** platform owner only */
  adminListCompanies(): Promise<CompanyStats[]>;
  adminUpdateCompany(id: string, patch: { scanLimit: number; status: CompanyStatus }): Promise<void>;
  adminListFirms(): Promise<FirmRow[]>;
  adminUpdateFirm(userId: string, maxClients: number): Promise<void>;
  getCompany(): Promise<Company>;
  updateCompany(patch: Partial<Omit<Company, 'id'>>): Promise<Company>;
  listReceipts(): Promise<Receipt[]>;
  saveReceipt(r: Receipt): Promise<Receipt>;
  deleteReceipt(id: string): Promise<void>;
  /** store the (already downscaled) photo and return its storage path */
  uploadImage(blob: Blob, hash: string): Promise<string>;
  imageUrl(path: string): Promise<string | null>;
  /** scans used this calendar month */
  scansUsed(): Promise<number>;
  /** read a receipt photo; counts one scan against the company's monthly limit */
  extract(blob: Blob): Promise<ExtractResult>;
}

export const hasCloud = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

let instance: Promise<Api> | null = null;
/** Cloud when Supabase env vars exist, otherwise the in-browser demo. */
export function getApi(): Promise<Api> {
  instance ??= hasCloud ? import('./cloud').then((m) => m.createCloudApi()) : import('./demo').then((m) => m.createDemoApi());
  return instance;
}
