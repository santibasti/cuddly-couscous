import { createContext, useContext } from 'react';
import type { Api } from './lib/api';
import type { Company, Receipt, Session } from './lib/types';

export interface AppCtx {
  api: Api;
  session: Session;
  company: Company;
  receipts: Receipt[];
  scansUsed: number;
  canWrite: boolean;
  reload: () => Promise<void>;
  setCompany: (c: Company) => void;
  signOut: () => Promise<void>;
}
export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('outside provider');
  return c;
};
