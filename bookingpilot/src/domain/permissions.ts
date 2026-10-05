import type { Role } from '@/types';

export type Permission =
  | 'bookings.view' | 'bookings.create' | 'bookings.edit' | 'bookings.confirm' | 'bookings.cancel' | 'bookings.message'
  | 'conflicts.override'
  | 'calendar.block'
  | 'properties.view' | 'properties.manage'
  | 'channels.view' | 'channels.manage'
  | 'guests.view' | 'guests.manage'
  | 'inbox.view'
  | 'reports.view' | 'revenue.view'
  | 'team.view' | 'team.manage'
  | 'settings.view' | 'settings.owner' | 'org.delete';

const all: Permission[] = [
  'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.confirm', 'bookings.cancel', 'bookings.message',
  'conflicts.override', 'calendar.block', 'properties.view', 'properties.manage', 'channels.view', 'channels.manage',
  'guests.view', 'guests.manage', 'inbox.view', 'reports.view', 'revenue.view', 'team.view', 'team.manage',
  'settings.view', 'settings.owner', 'org.delete',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: all,
  manager: all.filter((p) => !['team.manage', 'settings.owner', 'org.delete'].includes(p)),
  staff: [
    'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.confirm', 'bookings.cancel', 'bookings.message',
    'calendar.block', 'properties.view', 'guests.view', 'guests.manage', 'inbox.view',
  ],
  viewer: ['bookings.view', 'properties.view'],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner / Super Admin', manager: 'Manager', staff: 'Reservation Staff', viewer: 'Read-only Viewer',
};
export const ROLE_BLURB: Record<Role, string> = {
  owner: 'Full access to all properties, reports, users, channels, settings and financials.',
  manager: 'Manages bookings, calendar, guests, properties and reports. Cannot change owner settings or delete the organization.',
  staff: 'Creates, edits, confirms, cancels and messages bookings for assigned properties. No revenue reports or user settings.',
  viewer: 'Can view the calendar, bookings and availability. Cannot create, edit, confirm or cancel.',
};

export const can = (role: Role | undefined, p: Permission) => !!role && ROLE_PERMISSIONS[role].includes(p);
