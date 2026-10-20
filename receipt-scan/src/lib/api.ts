import type { Company, ExtractResult, PlanId, Receipt, Session } from './types';

export interface SignUpInput { email: string; password: string; companyName: string; tin: string; vatRegistered: boolean }

export interface Api {
  mode: 'demo' | 'cloud';
  getSession(): Promise<Session | null>;
  signUp(input: SignUpInput): Promise<Session>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  getCompany(): Promise<Company>;
  updateCompany(patch: Partial<Omit<Company, 'id'>>): Promise<Company>;
  setPlan(plan: PlanId): Promise<Company>;
  listReceipts(): Promise<Receipt[]>;
  saveReceipt(r: Receipt): Promise<Receipt>;
  deleteReceipt(id: string): Promise<void>;
  /** store the (already downscaled) photo and return its storage path */
  uploadImage(blob: Blob, hash: string): Promise<string>;
  imageUrl(path: string): Promise<string | null>;
  /** scans used this calendar month */
  scansUsed(): Promise<number>;
  /** read a receipt photo; counts one scan against the plan */
  extract(blob: Blob): Promise<ExtractResult>;
}

export const hasCloud = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

let instance: Promise<Api> | null = null;
/** Cloud when Supabase env vars exist, otherwise the in-browser demo. */
export function getApi(): Promise<Api> {
  instance ??= hasCloud ? import('./cloud').then((m) => m.createCloudApi()) : import('./demo').then((m) => m.createDemoApi());
  return instance;
}
