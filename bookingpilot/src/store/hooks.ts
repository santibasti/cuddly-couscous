import { useMemo } from 'react';
import { useStore } from './store';
import { can, type Permission } from '@/domain/permissions';
import { paymentStatus } from '@/domain/metrics';
import { todayISO } from '@/domain/dates';
import type { Booking } from '@/types';

/** Everything the current user is allowed to see in the current organization. */
export function useOrg() {
  const db = useStore((s) => s.db);
  const session = useStore((s) => s.session);
  return useMemo(() => {
    if (!session) return null;
    const org = db.organizations.find((o) => o.id === session.orgId);
    const user = db.users.find((u) => u.id === session.userId);
    const member = db.members.find((m) => m.orgId === session.orgId && m.userId === session.userId && m.active);
    if (!org || !user || !member) return null;
    const orgId = org.id;
    const allResources = db.resources.filter((r) => r.orgId === orgId).sort((a, b) => a.sortOrder - b.sortOrder);
    const restricted = member.role === 'staff' && member.resourceIds.length > 0;
    const resources = restricted ? allResources.filter((r) => member.resourceIds.includes(r.id)) : allResources;
    const visible = new Set(resources.map((r) => r.id));
    const bookings = db.bookings.filter((b) => b.orgId === orgId && visible.has(b.resourceId));
    const payments = db.payments.filter((p) => p.orgId === orgId);
    const guests = db.guests.filter((g) => g.orgId === orgId);
    const memberships = db.members.filter((m) => m.userId === user.id && m.active).map((m) => ({ member: m, org: db.organizations.find((o) => o.id === m.orgId)! })).filter((x) => x.org);
    return {
      org, user, member, role: member.role, today: todayISO(org.timezone),
      properties: db.properties.filter((p) => p.orgId === orgId),
      allResources, resources, bookings, payments, guests,
      blocks: db.blocks.filter((b) => b.orgId === orgId && visible.has(b.resourceId)),
      alerts: db.alerts.filter((a) => a.orgId === orgId && bookings.some((b) => b.id === a.bookingId)),
      audit: db.audit.filter((a) => a.orgId === orgId),
      notes: db.notes.filter((n) => n.orgId === orgId),
      attachments: db.attachments.filter((n) => n.orgId === orgId),
      conversations: db.conversations.filter((c) => c.orgId === orgId),
      messages: db.messages.filter((m) => m.orgId === orgId),
      templates: db.templates.filter((t) => t.orgId === orgId),
      channels: db.channels.filter((c) => c.orgId === orgId),
      members: db.members.filter((m) => m.orgId === orgId),
      users: db.users,
      memberships,
      notificationSettings: db.notificationSettings.find((n) => n.orgId === orgId && n.userId === user.id),
      // lookups
      guestById: (id: string) => guests.find((g) => g.id === id),
      resourceById: (id: string) => allResources.find((r) => r.id === id),
      memberName: (id?: string) => {
        if (!id) return '—';
        if (id === 'system') return 'System';
        const m = db.members.find((x) => x.id === id);
        return db.users.find((u) => u.id === m?.userId)?.name ?? '—';
      },
      payStatus: (b: Booking) => paymentStatus(b, payments),
      can: (p: Permission) => can(member.role, p),
    };
  }, [db, session]);
}
export type OrgCtx = NonNullable<ReturnType<typeof useOrg>>;
