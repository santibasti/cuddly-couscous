import type { Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner / Admin',
  ops: 'Operations Manager',
  finance: 'Finance / Admin Staff',
  leader: 'Team Leader',
  field: 'Field Employee',
  viewer: 'Viewer / Accountant',
};

/** Every permission the system knows. Roles get a default set; the Owner can edit the matrix (stored in settings.access). */
export const PERMISSIONS: { key: string; group: string; label: string }[] = [
  { key: 'dashboard.view', group: 'Dashboard', label: 'View operational dashboard' },
  { key: 'dashboard.finance', group: 'Dashboard', label: 'View financial dashboard widgets' },
  { key: 'clients.view', group: 'Clients', label: 'View clients' },
  { key: 'clients.edit', group: 'Clients', label: 'Create / edit clients' },
  { key: 'clients.tax', group: 'Clients', label: 'View client tax info' },
  { key: 'sales.view', group: 'Sales', label: 'View inquiries & quotations' },
  { key: 'sales.edit', group: 'Sales', label: 'Create / edit quotations' },
  { key: 'sales.approve', group: 'Sales', label: 'Send / approve / reject quotations' },
  { key: 'jobs.all', group: 'Jobs', label: 'View all jobs & calendar' },
  { key: 'jobs.mine', group: 'Jobs', label: 'View assigned jobs only' },
  { key: 'jobs.edit', group: 'Jobs', label: 'Schedule & edit jobs' },
  { key: 'jobs.complete', group: 'Jobs', label: 'Update checklist & submit completion' },
  { key: 'attendance.own', group: 'Attendance', label: 'Clock in/out (own)' },
  { key: 'attendance.view', group: 'Attendance', label: 'View crew attendance' },
  { key: 'attendance.approve', group: 'Attendance', label: 'Approve attendance & corrections' },
  { key: 'employees.view', group: 'Employees', label: 'View employee directory' },
  { key: 'employees.edit', group: 'Employees', label: 'Create / edit employees' },
  { key: 'employees.pay', group: 'Employees', label: 'View pay rates, bank & government IDs' },
  { key: 'performance.view', group: 'Employees', label: 'View scorecards' },
  { key: 'performance.edit', group: 'Employees', label: 'Rate employees' },
  { key: 'payroll.view', group: 'Payroll', label: 'View payroll' },
  { key: 'payroll.edit', group: 'Payroll', label: 'Prepare payroll & adjustments' },
  { key: 'payroll.approve', group: 'Payroll', label: 'Approve & finalize payroll' },
  { key: 'inventory.view', group: 'Inventory', label: 'View inventory' },
  { key: 'inventory.edit', group: 'Inventory', label: 'Receive, issue, transfer, count' },
  { key: 'inventory.approve', group: 'Inventory', label: 'Approve adjustments & material requests' },
  { key: 'inventory.request', group: 'Inventory', label: 'Request materials for a job' },
  { key: 'assets.view', group: 'Assets', label: 'View equipment & vehicles' },
  { key: 'assets.edit', group: 'Assets', label: 'Manage asset register & maintenance' },
  { key: 'assets.request', group: 'Assets', label: 'Request / return equipment' },
  { key: 'assets.approve', group: 'Assets', label: 'Approve equipment release' },
  { key: 'dispatch.view', group: 'Dispatch', label: 'View dispatch checklists & incidents' },
  { key: 'dispatch.run', group: 'Dispatch', label: 'Run departure / arrival / return checklists' },
  { key: 'dispatch.approve', group: 'Dispatch', label: 'Approve dispatch exceptions' },
  { key: 'incidents.manage', group: 'Dispatch', label: 'Investigate & resolve incident reports' },
  { key: 'invoices.view', group: 'Finance', label: 'View invoices & receivables' },
  { key: 'invoices.edit', group: 'Finance', label: 'Create invoices, record payments' },
  { key: 'invoices.approve', group: 'Finance', label: 'Approve / reverse invoices' },
  { key: 'expenses.view', group: 'Finance', label: 'View expenses' },
  { key: 'expenses.edit', group: 'Finance', label: 'Record expenses & petty cash' },
  { key: 'expenses.approve', group: 'Finance', label: 'Approve expenses' },
  { key: 'profit.view', group: 'Finance', label: 'View profitability' },
  { key: 'reports.ops', group: 'Reports', label: 'Operational reports' },
  { key: 'reports.hr', group: 'Reports', label: 'HR / attendance / payroll reports' },
  { key: 'reports.finance', group: 'Reports', label: 'Financial reports' },
  { key: 'admin.users', group: 'Admin', label: 'Manage users & permissions' },
  { key: 'admin.settings', group: 'Admin', label: 'Edit pricing, rates & settings' },
  { key: 'admin.audit', group: 'Admin', label: 'View audit log' },
];

const ALL = PERMISSIONS.map((p) => p.key);

export const DEFAULT_ACCESS: Record<Role, string[]> = {
  owner: ALL,
  ops: [
    'dashboard.view', 'clients.view', 'clients.edit', 'sales.view', 'sales.edit', 'sales.approve',
    'jobs.all', 'jobs.edit', 'jobs.complete', 'attendance.view', 'attendance.approve',
    'employees.view', 'employees.edit', 'performance.view', 'performance.edit',
    'inventory.view', 'inventory.edit', 'inventory.approve', 'inventory.request',
    'assets.view', 'assets.edit', 'assets.request', 'assets.approve', 'reports.ops',
    'dispatch.view', 'dispatch.run', 'dispatch.approve', 'incidents.manage',
  ],
  finance: [
    'dashboard.view', 'dashboard.finance', 'clients.view', 'clients.tax', 'sales.view',
    'jobs.all', 'attendance.view', 'employees.view', 'employees.pay',
    'payroll.view', 'payroll.edit', 'inventory.view', 'assets.view',
    'invoices.view', 'invoices.edit', 'invoices.approve', 'expenses.view', 'expenses.edit', 'expenses.approve',
    'profit.view', 'reports.ops', 'reports.hr', 'reports.finance',
  ],
  leader: [
    'dashboard.view', 'jobs.mine', 'jobs.complete', 'attendance.own', 'attendance.view', 'attendance.approve',
    'inventory.view', 'inventory.request', 'assets.view', 'assets.request', 'clients.view', 'employees.view',
    'dispatch.view', 'dispatch.run',
  ],
  field: ['jobs.mine', 'jobs.complete', 'attendance.own', 'assets.request', 'dispatch.view'],
  viewer: ['reports.finance'],
};

export function permsFor(role: Role, overrides?: Record<Role, string[]>): Set<string> {
  return new Set(overrides?.[role] ?? DEFAULT_ACCESS[role]);
}

/** Routes → the permission (any of) that unlocks them. */
export const ROUTE_ACCESS: Record<string, string[]> = {
  dashboard: ['dashboard.view', 'dashboard.finance'],
  clients: ['clients.view'],
  sales: ['sales.view'],
  jobs: ['jobs.all', 'jobs.mine'],
  dispatch: ['dispatch.view', 'dispatch.run'],
  attendance: ['attendance.own', 'attendance.view'],
  employees: ['employees.view', 'performance.view'],
  payroll: ['payroll.view'],
  inventory: ['inventory.view', 'inventory.request'],
  assets: ['assets.view', 'assets.request'],
  finance: ['invoices.view', 'expenses.view', 'profit.view'],
  reports: ['reports.ops', 'reports.hr', 'reports.finance'],
  admin: ['admin.users', 'admin.settings', 'admin.audit'],
};
