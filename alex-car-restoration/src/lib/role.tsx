import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Role = 'executive' | 'advisor' | 'leader';

export const ROLES: Record<Role, { label: string; hint: string; money: boolean; edit: boolean; customers: boolean; pages: string[] }> = {
  executive: { label: 'Executive', hint: 'Everything, including sales graphs', money: true, edit: true, customers: true, pages: ['/', '/today', '/executive', '/insights', '/customers', '/projects', '/schedule', '/timeline', '/mechanics', '/attendance', '/parts'] },
  advisor: { label: 'Service Advisor', hint: 'Everything except sales graphs', money: false, edit: true, customers: true, pages: ['/', '/today', '/insights', '/customers', '/projects', '/schedule', '/timeline', '/mechanics', '/attendance', '/parts'] },
  leader: { label: 'Team Leader', hint: 'Monitoring only', money: false, edit: false, customers: false, pages: ['/', '/today', '/insights', '/projects', '/schedule', '/timeline', '/mechanics', '/attendance', '/parts'] },
};

const KEY = 'acr-role';
const isRole = (v: unknown): v is Role => v === 'executive' || v === 'advisor' || v === 'leader';

/** The role in force right now. The store reads this to refuse changes from a monitoring-only view. */
let current: Role = 'executive';
export const canEdit = () => ROLES[current].edit;

/** True when a page is open to the role. Detail pages follow their list page. */
export function canOpen(role: Role, path: string): boolean {
  const top = '/' + (path.split('/')[1] ?? '');
  return ROLES[role].pages.includes(top);
}

const Ctx = createContext<{ role: Role; setRole: (r: Role) => void }>({ role: 'executive', setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(() => {
    try { const v = localStorage.getItem(KEY); if (isRole(v)) return v; } catch { /* ignore */ }
    return 'executive';
  });
  current = role;
  useEffect(() => {
    current = role;
    try { localStorage.setItem(KEY, role); } catch { /* ignore */ }
  }, [role]);
  return <Ctx.Provider value={{ role, setRole }}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
