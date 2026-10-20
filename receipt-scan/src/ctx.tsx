import { createContext, useContext } from 'react';
import type { Api } from './lib/api';
import type { Company, Receipt, Session } from './lib/types';

export interface AppCtx {
  api: Api;
  session: Session;
  /** the open workspace; null while a firm is on its client list or the platform owner is on the console */
  company: Company | null;
  receipts: Receipt[];
  scansUsed: number;
  canWrite: boolean;
  reload: () => Promise<void>;
  setCompany: (c: Company) => void;
  setSession: (s: Session) => void;
  signOut: () => Promise<void>;
}
export const Ctx = createContext<AppCtx | null>(null);

/** for pages that do not need a workspace (client list, owner console) */
export const useBase = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('outside provider');
  return c;
};
/** for workspace pages; the router only renders these when a company is open */
export const useApp = (): AppCtx & { company: Company } => {
  const c = useBase();
  if (!c.company) throw new Error('no workspace open');
  return c as AppCtx & { company: Company };
};
