import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Role = 'executive' | 'advisor' | 'leader';

export const ROLES: Record<Role, { label: string; hint: string; money: boolean; edit: boolean; customers: boolean; pages: string[] }> = {
  executive: { label: 'Executive', hint: 'Everything, including sales graphs', money: true, edit: true, customers: true, pages: ['/', '/today', '/executive', '/insights', '/customers', '/intake', '/estimate', '/projects', '/schedule', '/timeline', '/mechanics', '/attendance'] },
  advisor: { label: 'Service Advisor', hint: 'Everything except sales graphs', money: false, edit: true, customers: true, pages: ['/', '/today', '/insights', '/customers', '/intake', '/estimate', '/projects', '/schedule', '/timeline', '/mechanics', '/attendance'] },
  leader: { label: 'Team Leader', hint: 'Monitoring only', money: false, edit: false, customers: false, pages: ['/', '/today', '/insights', '/projects', '/schedule', '/timeline', '/mechanics', '/attendance'] },
};

/**
 * Demo accounts. The check runs in the browser, so this is a front door for the demo, not real security.
 * Real logins need a server: see the production notes.
 */
export interface Account { username: string; password: string; role: Role; name: string }
export const ACCOUNTS: Account[] = [
  { username: 'executive', password: 'alex-exec', role: 'executive', name: 'Alex (Executive)' },
  { username: 'advisor', password: 'alex-advisor', role: 'advisor', name: 'Service Advisor' },
  { username: 'leader', password: 'alex-leader', role: 'leader', name: 'Team Leader' },
];

export function authenticate(username: string, password: string): Account | undefined {
  return ACCOUNTS.find((a) => a.username === username.trim().toLowerCase() && a.password === password);
}

const KEY = 'acr-session';

/** The role in force right now. The store reads this to refuse changes from a monitoring-only view. Signed out means nothing may change. */
let current: Role | null = null;
export const canEdit = () => !!current && ROLES[current].edit;

/** True when a page is open to the role. Detail pages follow their list page. */
export function canOpen(role: Role, path: string): boolean {
  const top = '/' + (path.split('/')[1] ?? '');
  return ROLES[role].pages.includes(top);
}

interface Session { account: Account | null; role: Role; login: (username: string, password: string) => boolean; logout: () => void }
const Ctx = createContext<Session>({ account: null, role: 'leader', login: () => false, logout: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(() => {
    try { const v = localStorage.getItem(KEY); return ACCOUNTS.find((a) => a.username === v) ?? null; } catch { return null; }
  });
  current = account?.role ?? null;
  useEffect(() => {
    current = account?.role ?? null;
    try { if (account) localStorage.setItem(KEY, account.username); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, [account]);
  const value: Session = {
    account, role: account?.role ?? 'leader',
    login: (u, p) => { const a = authenticate(u, p); if (a) { current = a.role; setAccount(a); } return !!a; },
    logout: () => { current = null; setAccount(null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
