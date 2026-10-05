import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AuditAction, AuditLog, Booking, BookingItem, BookingStatus, Channel, ConflictAlert, Conversation, Database, Guest, Message,
  PaymentMethod, Resource, Role, Source, TeamMember,
} from '@/types';
import { buildSeed } from '@/data/seed';
import { checkBooking, holdsDates, type Candidate, type ConflictReport } from '@/domain/conflicts';
import { addDays, nightsBetween, nowISO, rangesOverlap, todayISO } from '@/domain/dates';
import { can, type Permission } from '@/domain/permissions';
import { buildConfirmation } from '@/domain/confirmation';
import { paidAmount } from '@/domain/metrics';
import { SOURCE_META } from '@/domain/meta';
import type { ExternalBooking } from '@/domain/integrations';
import { retotalItems } from './retotal';

// ----------------------------------------------------------------------------------------------------------------
export type BookingDraft = Omit<Booking, 'id' | 'ref' | 'orgId' | 'createdAt' | 'createdBy' | 'totalAmount' | 'approval'> & {
  id?: string;
  conversationId?: string;
};

export type ConflictContext = 'new' | 'confirm' | 'edit';
export type SaveResult =
  | { kind: 'saved'; booking: Booking; note?: string }
  | { kind: 'conflict'; report: ConflictReport; draft: BookingDraft; context: ConflictContext }
  | { kind: 'error'; message: string };

export type Resolution =
  | { type: 'keep_pending' }
  | { type: 'move_property'; resourceId: string }
  | { type: 'change_dates'; checkIn: string; checkOut: string }
  | { type: 'mark_duplicate'; ofBookingId?: string }
  | { type: 'request_approval'; reason: string }
  | { type: 'override'; reason: string }
  | { type: 'cancel'; reason?: string }
  | { type: 'revert' };

export interface ImportSummary { imported: number; duplicates: number; conflicts: number; errors: string[]; created: string[] }

interface Session { userId: string; orgId: string }
interface State {
  db: Database;
  session: Session | null;
  seededOn: string;
  // auth
  login: (email: string, password: string) => string | null;
  loginAs: (userId: string, orgId?: string) => void;
  logout: () => void;
  switchOrg: (orgId: string) => void;
  resetDemo: () => void;
  // bookings
  saveBooking: (draft: BookingDraft) => SaveResult;
  resolveConflict: (draft: BookingDraft, report: ConflictReport, r: Resolution, context: ConflictContext) => SaveResult;
  confirmBooking: (id: string) => SaveResult;
  approveOverride: (id: string, note: string) => SaveResult;
  rejectApproval: (id: string, note: string) => SaveResult;
  moveBooking: (id: string, resourceId: string, checkIn: string) => SaveResult;
  cancelBooking: (id: string, reason: string) => SaveResult;
  setStatus: (id: string, status: BookingStatus) => SaveResult;
  recordPayment: (bookingId: string, amount: number, kind: 'deposit' | 'balance' | 'refund', method: PaymentMethod, reference: string) => void;
  requestPayment: (bookingId: string) => string | null;
  sendConfirmation: (bookingId: string) => string | null;
  addNote: (bookingId: string, body: string) => void;
  addAttachment: (bookingId: string, file: { name: string; size: number; mime: string; url: string }) => void;
  // blocks
  addBlock: (b: { resourceId: string; startDate: string; endDate: string; reason: Database['blocks'][number]['reason']; note: string }) => { ok: true } | { ok: false; message: string };
  removeBlock: (id: string) => void;
  // guests / resources / team / settings
  upsertGuest: (g: Partial<Guest> & { fullName: string }) => Guest;
  deleteGuest: (id: string) => string | null;
  upsertResource: (r: Partial<Resource> & { name: string }) => Resource;
  deleteResource: (id: string) => string | null;
  upsertProperty: (p: { id?: string; name: string; address: string }) => string;
  // channels
  toggleChannel: (id: string) => void;
  setMapping: (channelId: string, mappingId: string, resourceId: string | null) => void;
  addMapping: (channelId: string, externalId: string, externalName: string, resourceId: string | null) => void;
  updateChannel: (id: string, patch: Partial<Channel>) => void;
  importBatch: (channelId: string, items: ExternalBooking[], nextCursor?: number) => ImportSummary;
  // inbox
  sendMessage: (conversationId: string, body: string, direction?: 'out' | 'note') => void;
  markRead: (conversationId: string) => void;
  linkConversation: (conversationId: string, bookingId: string) => void;
  createConversation: (guestId: string, channel: Conversation['channel'], subject: string, body: string) => string;
  // team & settings
  inviteMember: (name: string, email: string, role: Role, resourceIds: string[]) => string | null;
  updateMember: (id: string, patch: Partial<TeamMember>) => void;
  updateOrg: (patch: Partial<Database['organizations'][number]>) => void;
  updateTemplate: (id: string, body: string) => void;
  setNotification: (key: 'newBooking' | 'conflictAlert' | 'unreadInquiry' | 'dailyDigest', value: boolean) => void;
  deleteOrg: () => string | null;
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
const freshSeed = () => buildSeed(todayISO());

export const SYSTEM_ACTOR = 'system';

export const useStore = create<State>()(
  persist(
    (set, get) => {
      // ---------------------------------------------------------------- helpers
      const cur = () => {
        const { session, db } = get();
        if (!session) return null;
        const org = db.organizations.find((o) => o.id === session.orgId);
        const member = db.members.find((m) => m.orgId === session.orgId && m.userId === session.userId && m.active);
        if (!org || !member) return null;
        return { org, member, orgId: org.id, role: member.role, memberId: member.id };
      };
      const need = (p: Permission): { ok: true; c: NonNullable<ReturnType<typeof cur>> } | { ok: false; message: string } => {
        const c = cur();
        if (!c) return { ok: false, message: 'You are signed out.' };
        if (!can(c.role, p)) return { ok: false, message: 'Your role does not allow this action.' };
        return { ok: true, c };
      };
      const hasResourceAccess = (c: NonNullable<ReturnType<typeof cur>>, resourceId: string) =>
        c.role !== 'staff' || c.member.resourceIds.length === 0 || c.member.resourceIds.includes(resourceId);
      const patch = (fn: (db: Database) => Partial<Database>) => set((s) => ({ db: { ...s.db, ...fn(s.db) } }));
      const audit = (db: Database, e: { bookingId?: string; action: AuditAction; summary: string; meta?: Record<string, unknown>; actor?: string }): AuditLog[] => {
        const c = cur();
        return [...db.audit, { id: uid('al'), orgId: c?.orgId ?? '', bookingId: e.bookingId, actorId: e.actor ?? c?.memberId ?? SYSTEM_ACTOR, action: e.action, summary: e.summary, meta: e.meta, at: nowISO() }];
      };
      const orgCtx = (db: Database, orgId: string) => ({
        resources: db.resources.filter((r) => r.orgId === orgId),
        bookings: db.bookings.filter((b) => b.orgId === orgId),
        blocks: db.blocks.filter((b) => b.orgId === orgId),
      });
      const candidateOf = (d: BookingDraft): Candidate => ({ id: d.id, guestId: d.guestId, resourceId: d.resourceId, checkIn: d.checkIn, checkOut: d.checkOut, adults: d.adults, children: d.children, source: d.source, externalRef: d.externalRef });
      const totalOf = (items: BookingItem[]) => items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const nextRef = (db: Database, orgId: string) => {
        const mine = db.bookings.filter((b) => b.orgId === orgId);
        const prefix = mine[0]?.ref.split('-')[0] ?? 'BP';
        const yymm = todayISO().slice(2, 4) + todayISO().slice(5, 7);
        const max = mine.reduce((m, b) => Math.max(m, Number(b.ref.split('-')[2]) || 0), 0);
        return `${prefix}-${yymm}-${String(max + 1).padStart(4, '0')}`;
      };
      const alertsFor = (db: Database, booking: Booking, report: ConflictReport, resolutionNote?: string): ConflictAlert[] => {
        const existing = db.alerts;
        const fresh: ConflictAlert[] = [];
        for (const k of report.conflicts) {
          if (existing.some((a) => a.bookingId === booking.id && a.status === 'open' && a.kind === k.kind && a.otherBookingId === k.otherBookingId && a.blockId === k.blockId)) continue;
          fresh.push({ id: uid('ca'), orgId: booking.orgId, bookingId: booking.id, otherBookingId: k.otherBookingId, blockId: k.blockId, kind: k.kind, details: resolutionNote ? `${k.message} (${resolutionNote})` : k.message, status: 'open', detectedAt: nowISO() });
        }
        return [...existing, ...fresh];
      };
      /** Close alerts whose problem no longer exists (other booking cancelled, dates moved, block removed…). */
      const reconcile = (db: Database): ConflictAlert[] => {
        return db.alerts.map((a) => {
          if (a.status !== 'open') return a;
          const b = db.bookings.find((x) => x.id === a.bookingId);
          if (!b) return a;
          let gone = b.status === 'cancelled' || b.status === 'no_show';
          if (!gone) {
            const rep = checkBooking(b, orgCtx(db, b.orgId));
            gone = !rep.conflicts.some((k) => k.kind === a.kind && k.otherBookingId === a.otherBookingId && k.blockId === a.blockId);
          }
          return gone ? { ...a, status: 'resolved' as const, resolvedAt: nowISO(), resolvedBy: SYSTEM_ACTOR, resolution: 'Conflict no longer exists' } : a;
        });
      };
      const finish = (db: Database): Database => ({ ...db, alerts: reconcile(db) });

      /** Write a booking (new or existing) with the given final status. Pure persistence — callers decide whether checks passed. */
      const persist_ = (draft: BookingDraft, status: BookingStatus, opts: { approval?: Booking['approval']; cancelReason?: string; duplicateOfId?: string; auditAction?: AuditAction; auditSummary?: string } = {}): Booking => {
        const c = cur()!;
        let saved!: Booking;
        patch((db) => {
          const existing = draft.id ? db.bookings.find((b) => b.id === draft.id) : undefined;
          const items = draft.items;
          const base = {
            guestId: draft.guestId, resourceId: draft.resourceId, checkIn: draft.checkIn, checkOut: draft.checkOut, adults: draft.adults, children: draft.children,
            source: draft.source, externalRef: draft.externalRef, items, totalAmount: totalOf(items), depositAmount: draft.depositAmount, assignedTo: draft.assignedTo,
            notes: draft.notes, status, cancelReason: opts.cancelReason ?? (status === 'cancelled' ? existing?.cancelReason : undefined), duplicateOfId: opts.duplicateOfId,
          };
          const booking: Booking = existing
            ? { ...existing, ...base, approval: opts.approval ?? (status === 'conflict_review' ? existing.approval : existing.approval) }
            : { id: uid('bk'), orgId: c.orgId, ref: nextRef(db, c.orgId), createdAt: nowISO(), createdBy: c.memberId, ...base, approval: opts.approval };
          saved = booking;
          const action: AuditAction = opts.auditAction ?? (existing ? 'edited' : 'created');
          const summary = opts.auditSummary ?? (existing ? 'Booking details updated' : `Booking created (${SOURCE_META[booking.source].label}) as ${status.replace('_', ' ')}`);
          let conversations = db.conversations;
          if (draft.conversationId) conversations = conversations.map((cv) => (cv.id === draft.conversationId ? { ...cv, bookingId: booking.id, status: 'converted' as const } : cv));
          const next: Database = {
            ...db,
            bookings: existing ? db.bookings.map((b) => (b.id === booking.id ? booking : b)) : [booking, ...db.bookings],
            conversations,
            audit: audit(db, { bookingId: booking.id, action, summary }),
          };
          return finish(next);
        });
        return saved;
      };

      const guard = (draft: BookingDraft): string | null => {
        if (!draft.guestId) return 'Choose or create a guest first.';
        if (!draft.resourceId) return 'Choose a property / resource.';
        if (!draft.checkIn || !draft.checkOut) return 'Both dates are required.';
        if (draft.checkOut <= draft.checkIn) return 'Check-out must be after check-in.';
        if (draft.adults < 1) return 'At least one adult is required.';
        return null;
      };
      const ctxOf = (draft: BookingDraft, existing?: Booking): ConflictContext =>
        !draft.id ? 'new' : existing && ['confirmed', 'checked_in'].includes(existing.status) ? 'edit' : 'confirm';

      // ---------------------------------------------------------------- store
      return {
        db: freshSeed(),
        session: null,
        seededOn: todayISO(),

        login: (email, password) => {
          const u = get().db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
          if (!u || u.password !== password) return 'Incorrect email or password.';
          const m = get().db.members.find((x) => x.userId === u.id && x.active);
          if (!m) return 'Your account has no active organization.';
          set({ session: { userId: u.id, orgId: m.orgId } });
          return null;
        },
        loginAs: (userId, orgId) => {
          const m = get().db.members.find((x) => x.userId === userId && x.active && (!orgId || x.orgId === orgId));
          if (m) set({ session: { userId, orgId: m.orgId } });
        },
        logout: () => set({ session: null }),
        switchOrg: (orgId) => {
          const s = get().session;
          if (s && get().db.members.some((m) => m.userId === s.userId && m.orgId === orgId && m.active)) set({ session: { ...s, orgId } });
        },
        resetDemo: () => set((s) => ({ db: freshSeed(), seededOn: todayISO(), session: s.session })),

        // -------------------------------------------------------------- bookings
        saveBooking: (draft) => {
          const existing = draft.id ? get().db.bookings.find((b) => b.id === draft.id) : undefined;
          const g = need(existing ? 'bookings.edit' : 'bookings.create');
          if (!g.ok) return { kind: 'error', message: g.message };
          const c = g.c;
          const bad = guard(draft);
          if (bad) return { kind: 'error', message: bad };
          if (!hasResourceAccess(c, draft.resourceId) || (existing && !hasResourceAccess(c, existing.resourceId))) return { kind: 'error', message: 'You are not assigned to this property.' };
          if (draft.status === 'confirmed' && !can(c.role, 'bookings.confirm')) return { kind: 'error', message: 'You cannot confirm bookings.' };
          if (existing && ['cancelled', 'checked_out', 'no_show'].includes(existing.status)) return { kind: 'error', message: `A ${existing.status.replace('_', ' ')} booking can no longer be edited.` };

          let status = draft.status;
          if (existing && ['checked_in'].includes(existing.status)) status = existing.status;
          if (existing && existing.status === 'confirmed' && draft.status === 'pending') status = 'pending';
          if (holdsDates(status) || status === 'confirmed') {
            const report = checkBooking(candidateOf(draft), orgCtx(get().db, c.orgId));
            if (!report.ok) return { kind: 'conflict', report, draft: { ...draft, status }, context: ctxOf(draft, existing) };
          }
          const wasConfirmed = existing?.status === 'confirmed';
          const moved = existing && (existing.resourceId !== draft.resourceId || existing.checkIn !== draft.checkIn || existing.checkOut !== draft.checkOut);
          const resName = get().db.resources.find((r) => r.id === draft.resourceId)?.name;
          const booking = persist_(draft, status, {
            auditAction: status === 'confirmed' && !wasConfirmed ? 'confirmed' : moved ? 'moved' : undefined,
            auditSummary: status === 'confirmed' && !wasConfirmed
              ? (existing ? 'Booking confirmed — availability check passed' : 'Booking created and confirmed — availability check passed')
              : moved ? `Moved to ${resName}, ${draft.checkIn} → ${draft.checkOut}` : undefined,
          });
          return { kind: 'saved', booking };
        },

        confirmBooking: (id) => {
          const b = get().db.bookings.find((x) => x.id === id);
          if (!b) return { kind: 'error', message: 'Booking not found.' };
          const g = need('bookings.confirm');
          if (!g.ok) return { kind: 'error', message: g.message };
          return get().saveBooking({ ...b, status: 'confirmed' });
        },

        resolveConflict: (draft, report, r, context) => {
          const g = need(draft.id ? 'bookings.edit' : 'bookings.create');
          if (!g.ok) return { kind: 'error', message: g.message };
          const c = g.c;
          const db0 = get().db;
          const existing = draft.id ? db0.bookings.find((b) => b.id === draft.id) : undefined;
          const withAlerts = (bk: Booking, note?: string) => patch((db) => ({ alerts: alertsFor(db, bk, report, note) }));
          const summaryOf = () => report.conflicts.map((k) => k.message).join(' ');

          switch (r.type) {
            case 'revert':
              return existing ? { kind: 'saved', booking: existing, note: 'No changes made.' } : { kind: 'error', message: 'Nothing to revert.' };
            case 'move_property': {
              const to = db0.resources.find((x) => x.id === r.resourceId);
              const out = get().saveBooking({ ...draft, resourceId: r.resourceId });
              if (out.kind === 'saved') patch((db) => ({ audit: audit(db, { bookingId: out.booking.id, action: 'moved', summary: `Conflict avoided: moved to ${to?.name}` }) }));
              return out;
            }
            case 'change_dates': {
              const out = get().saveBooking({ ...draft, checkIn: r.checkIn, checkOut: r.checkOut, items: retotalItems(draft.items, nightsBetween(r.checkIn, r.checkOut)) });
              if (out.kind === 'saved') patch((db) => ({ audit: audit(db, { bookingId: out.booking.id, action: 'edited', summary: `Conflict avoided: dates changed to ${r.checkIn} → ${r.checkOut}` }) }));
              return out;
            }
            case 'keep_pending': {
              if (context === 'edit') return { kind: 'error', message: 'A confirmed booking cannot be downgraded here.' };
              const bk = persist_(draft, 'pending', { auditAction: 'conflict_detected', auditSummary: `Conflict detected — kept as Pending, NOT confirmed. ${summaryOf()}` });
              withAlerts(bk);
              return { kind: 'saved', booking: bk, note: 'Saved as pending. Dates are flagged on the calendar until the conflict is resolved.' };
            }
            case 'mark_duplicate': {
              const other = r.ofBookingId ?? report.conflicts.find((k) => k.otherBookingId)?.otherBookingId;
              const ref = db0.bookings.find((b) => b.id === other)?.ref ?? 'another booking';
              const bk = persist_(draft, 'cancelled', { cancelReason: `Duplicate of ${ref}`, duplicateOfId: other, auditAction: 'marked_duplicate', auditSummary: `Marked as duplicate of ${ref} and cancelled` });
              return { kind: 'saved', booking: bk, note: `Marked as duplicate of ${ref}.` };
            }
            case 'request_approval': {
              if (!r.reason.trim()) return { kind: 'error', message: 'Add a short reason for the manager.' };
              const bk = persist_(draft, 'conflict_review', {
                approval: { requestedBy: c.memberId, requestedAt: nowISO(), reason: r.reason.trim(), status: 'pending' },
                auditAction: 'approval_requested', auditSummary: `Manager approval requested — held in Conflict Review. ${summaryOf()}`,
              });
              withAlerts(bk);
              return { kind: 'saved', booking: bk, note: 'Sent to a manager for review. It is not confirmed.' };
            }
            case 'override': {
              if (!can(c.role, 'conflicts.override')) return { kind: 'error', message: 'Only managers and owners can approve an override.' };
              if (!report.overridable) return { kind: 'error', message: 'This conflict cannot be overridden — resolve the double-booking or blocked dates first.' };
              if (!r.reason.trim()) return { kind: 'error', message: 'An override needs a written reason (it is recorded in the audit trail).' };
              const bk = persist_(draft, draft.status === 'inquiry' ? 'pending' : (draft.status === 'checked_in' ? 'checked_in' : 'confirmed'), {
                auditAction: 'conflict_override', auditSummary: `Conflict OVERRIDDEN by manager: ${r.reason.trim()} — ${summaryOf()}`,
              });
              patch((db) => ({ alerts: alertsFor(db, bk, report).map((a) => (a.bookingId === bk.id && a.status === 'open' ? { ...a, status: 'overridden' as const, resolvedAt: nowISO(), resolvedBy: c.memberId, resolution: r.reason } : a)) }));
              return { kind: 'saved', booking: bk, note: 'Override recorded in the audit trail.' };
            }
            case 'cancel': {
              if (existing) return get().cancelBooking(existing.id, r.reason ?? 'Cancelled at conflict check');
              patch((db) => ({ audit: audit(db, { action: 'draft_discarded', summary: `New booking discarded at conflict check (${summaryOf()})` }) }));
              return { kind: 'error', message: 'Discarded — nothing was saved.' };
            }
          }
        },

        approveOverride: (id, note) => {
          const g = need('conflicts.override');
          if (!g.ok) return { kind: 'error', message: g.message };
          const b = get().db.bookings.find((x) => x.id === id);
          if (!b) return { kind: 'error', message: 'Booking not found.' };
          const report = checkBooking(b, orgCtx(get().db, b.orgId));
          if (report.hasHard) return { kind: 'error', message: 'A hard conflict (double booking, blocked dates or duplicate) cannot be overridden. Move or cancel one of the reservations.' };
          if (!note.trim()) return { kind: 'error', message: 'Add a reason — it is stored in the audit trail.' };
          const bk = persist_({ ...b, status: 'confirmed' }, 'confirmed', { approval: b.approval ? { ...b.approval, status: 'approved', decidedBy: g.c.memberId, decidedAt: nowISO(), decisionNote: note } : undefined, auditAction: 'conflict_override', auditSummary: `Manager approved exception: ${note.trim()}${report.ok ? '' : ' — ' + report.conflicts.map((k) => k.message).join(' ')}` });
          patch((db) => ({ alerts: db.alerts.map((a) => (a.bookingId === id && a.status === 'open' ? { ...a, status: 'overridden' as const, resolvedAt: nowISO(), resolvedBy: g.c.memberId, resolution: note } : a)) }));
          return { kind: 'saved', booking: bk };
        },

        rejectApproval: (id, note) => {
          const g = need('conflicts.override');
          if (!g.ok) return { kind: 'error', message: g.message };
          const b = get().db.bookings.find((x) => x.id === id);
          if (!b) return { kind: 'error', message: 'Booking not found.' };
          const bk = persist_({ ...b }, 'cancelled', { cancelReason: note || 'Declined by manager', approval: b.approval ? { ...b.approval, status: 'rejected', decidedBy: g.c.memberId, decidedAt: nowISO(), decisionNote: note } : undefined, auditAction: 'approval_rejected', auditSummary: `Manager declined: ${note || 'no reason given'} — booking cancelled` });
          return { kind: 'saved', booking: bk };
        },

        moveBooking: (id, resourceId, checkIn) => {
          const b = get().db.bookings.find((x) => x.id === id);
          if (!b) return { kind: 'error', message: 'Booking not found.' };
          if (b.resourceId === resourceId && b.checkIn === checkIn) return { kind: 'saved', booking: b };
          const nights = nightsBetween(b.checkIn, b.checkOut);
          return get().saveBooking({ ...b, resourceId, checkIn, checkOut: addDays(checkIn, nights) });
        },

        cancelBooking: (id, reason) => {
          const g = need('bookings.cancel');
          if (!g.ok) return { kind: 'error', message: g.message };
          const b = get().db.bookings.find((x) => x.id === id);
          if (!b) return { kind: 'error', message: 'Booking not found.' };
          if (!hasResourceAccess(g.c, b.resourceId)) return { kind: 'error', message: 'You are not assigned to this property.' };
          const bk = persist_({ ...b }, 'cancelled', { cancelReason: reason, auditAction: 'cancelled', auditSummary: `Cancelled: ${reason}` });
          return { kind: 'saved', booking: bk };
        },

        setStatus: (id, status) => {
          const g = need('bookings.edit');
          if (!g.ok) return { kind: 'error', message: g.message };
          const b = get().db.bookings.find((x) => x.id === id);
          if (!b) return { kind: 'error', message: 'Booking not found.' };
          if (status === 'confirmed') return get().confirmBooking(id);
          if (status === 'cancelled') return get().cancelBooking(id, 'Cancelled');
          const bk = persist_({ ...b }, status, { auditAction: 'status_changed', auditSummary: `Status changed: ${b.status.replace('_', ' ')} → ${status.replace('_', ' ')}` });
          return { kind: 'saved', booking: bk };
        },

        recordPayment: (bookingId, amount, kind, method, reference) => {
          const g = need('bookings.edit');
          if (!g.ok || amount <= 0) return;
          patch((db) => ({
            payments: [...db.payments, { id: uid('pay'), orgId: g.c.orgId, bookingId, amount, kind, method, reference, paidAt: nowISO() }],
            audit: audit(db, { bookingId, action: 'payment_recorded', summary: `${kind === 'refund' ? 'Refund' : 'Payment'} recorded: ₱${amount.toLocaleString('en-PH')} via ${method.replace('_', ' ')}` }),
          }));
        },

        requestPayment: (bookingId) => {
          const g = need('bookings.message');
          if (!g.ok) return g.message;
          const db = get().db;
          const b = db.bookings.find((x) => x.id === bookingId);
          if (!b) return 'Booking not found.';
          const paid = paidAmount(db.payments, b.id);
          const due = Math.max(0, (b.depositAmount || b.totalAmount) - paid) || Math.max(0, b.totalAmount - paid);
          const convId = ensureConversation(b);
          const body = `Hi! Payment request for booking ${b.ref}: ₱${due.toLocaleString('en-PH')} is due. ${g.c.org.paymentInstructions}`;
          patch((d) => ({
            bookings: d.bookings.map((x) => (x.id === b.id ? { ...x, paymentRequestedAt: nowISO() } : x)),
            messages: [...d.messages, { id: uid('m'), orgId: b.orgId, conversationId: convId, bookingId: b.id, direction: 'out', body, sentAt: nowISO(), readAt: nowISO(), authorId: g.c.memberId }],
            audit: audit(d, { bookingId: b.id, action: 'payment_requested', summary: `Payment request of ₱${due.toLocaleString('en-PH')} sent (mock delivery)` }),
          }));
          return null;
        },

        sendConfirmation: (bookingId) => {
          const g = need('bookings.message');
          if (!g.ok) return g.message;
          const db = get().db;
          const b = db.bookings.find((x) => x.id === bookingId);
          if (!b) return 'Booking not found.';
          if (!['confirmed', 'checked_in'].includes(b.status)) return 'Only confirmed bookings can be sent a confirmation.';
          const doc = buildConfirmation(g.c.org, b, db.guests.find((x) => x.id === b.guestId), db.resources.find((x) => x.id === b.resourceId), paidAmount(db.payments, b.id));
          const convId = ensureConversation(b);
          patch((d) => ({
            bookings: d.bookings.map((x) => (x.id === b.id ? { ...x, confirmationSentAt: nowISO() } : x)),
            messages: [...d.messages, { id: uid('m'), orgId: b.orgId, conversationId: convId, bookingId: b.id, direction: 'out', body: doc.text, sentAt: nowISO(), readAt: nowISO(), authorId: g.c.memberId }],
            audit: audit(d, { bookingId: b.id, action: 'message_sent', summary: 'Booking confirmation sent to guest (mock delivery)' }),
          }));
          return null;
        },

        addNote: (bookingId, body) => {
          const g = need('bookings.edit');
          if (!g.ok || !body.trim()) return;
          patch((db) => ({
            notes: [...db.notes, { id: uid('n'), orgId: g.c.orgId, bookingId, authorId: g.c.memberId, body: body.trim(), createdAt: nowISO() }],
            audit: audit(db, { bookingId, action: 'note_added', summary: 'Internal note added' }),
          }));
        },

        addAttachment: (bookingId, f) => {
          const g = need('bookings.edit');
          if (!g.ok) return;
          patch((db) => ({
            attachments: [...db.attachments, { id: uid('att'), orgId: g.c.orgId, bookingId, ...f, uploadedBy: g.c.memberId, createdAt: nowISO() }],
            audit: audit(db, { bookingId, action: 'attachment_added', summary: `Attachment added: ${f.name}` }),
          }));
        },

        // -------------------------------------------------------------- blocks
        addBlock: (b) => {
          const g = need('calendar.block');
          if (!g.ok) return { ok: false, message: g.message };
          if (b.endDate <= b.startDate) return { ok: false, message: 'The "available again" date must be after the start date.' };
          if (!hasResourceAccess(g.c, b.resourceId)) return { ok: false, message: 'You are not assigned to this property.' };
          const clash = get().db.bookings.filter((x) => x.orgId === g.c.orgId && x.resourceId === b.resourceId && holdsDates(x.status) && rangesOverlap(b.startDate, b.endDate, x.checkIn, x.checkOut));
          if (clash.length) return { ok: false, message: `Cannot block — ${clash.map((x) => x.ref).join(', ')} already hold${clash.length === 1 ? 's' : ''} those dates. Move or cancel them first.` };
          if (get().db.blocks.some((x) => x.resourceId === b.resourceId && rangesOverlap(b.startDate, b.endDate, x.startDate, x.endDate))) return { ok: false, message: 'Part of that period is already blocked. Release the existing block first.' };
          patch((db) => ({
            blocks: [...db.blocks, { id: uid('blk'), orgId: g.c.orgId, ...b, createdBy: g.c.memberId }],
            audit: audit(db, { action: 'block_created', summary: `Dates blocked (${b.reason.replace('_', ' ')}) ${b.startDate} → ${b.endDate}` }),
          }));
          return { ok: true };
        },
        removeBlock: (id) => {
          const g = need('calendar.block');
          if (!g.ok) return;
          patch((db) => finish({ ...db, blocks: db.blocks.filter((b) => b.id !== id), audit: audit(db, { action: 'block_removed', summary: 'Blocked dates released' }) }));
        },

        // -------------------------------------------------------------- guests / resources
        upsertGuest: (gst) => {
          const c = cur()!;
          let saved!: Guest;
          patch((db) => {
            const existing = gst.id ? db.guests.find((x) => x.id === gst.id) : undefined;
            saved = { id: uid('g'), orgId: c.orgId, mobile: '', email: '', nationality: '', notes: '', tags: [], createdAt: nowISO(), ...existing, ...gst } as Guest;
            return { guests: existing ? db.guests.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...db.guests] };
          });
          return saved;
        },
        deleteGuest: (id) => {
          const g = need('guests.manage');
          if (!g.ok) return g.message;
          if (get().db.bookings.some((b) => b.guestId === id)) return 'This guest has bookings and cannot be deleted. Tag them instead.';
          patch((db) => ({ guests: db.guests.filter((x) => x.id !== id) }));
          return null;
        },
        upsertResource: (r) => {
          const c = cur()!;
          let saved!: Resource;
          patch((db) => {
            const existing = r.id ? db.resources.find((x) => x.id === r.id) : undefined;
            const mine = db.resources.filter((x) => x.orgId === c.orgId);
            saved = {
              id: uid('res'), orgId: c.orgId, propertyId: db.properties.find((p) => p.orgId === c.orgId)?.id ?? '', type: 'room', capacity: 2, description: '', photos: [], baseRate: 0, minStay: 1, bufferDays: 0,
              status: 'available', color: '#0ea5e9', amenities: [], notes: '', sortOrder: mine.length + 1, ...existing, ...r,
            } as Resource;
            return { resources: existing ? db.resources.map((x) => (x.id === saved.id ? saved : x)) : [...db.resources, saved] };
          });
          return saved;
        },
        deleteResource: (id) => {
          const g = need('properties.manage');
          if (!g.ok) return g.message;
          if (get().db.bookings.some((b) => b.resourceId === id)) return 'This resource has booking history. Set it to Inactive instead of deleting it.';
          patch((db) => ({ resources: db.resources.filter((x) => x.id !== id), blocks: db.blocks.filter((b) => b.resourceId !== id) }));
          return null;
        },
        upsertProperty: (p) => {
          const c = cur()!;
          const id = p.id ?? uid('prop');
          patch((db) => ({ properties: p.id ? db.properties.map((x) => (x.id === id ? { ...x, name: p.name, address: p.address } : x)) : [...db.properties, { id, orgId: c.orgId, name: p.name, address: p.address }] }));
          return id;
        },

        // -------------------------------------------------------------- channels
        toggleChannel: (id) => {
          if (!need('channels.manage').ok) return;
          patch((db) => ({ channels: db.channels.map((c) => (c.id === id ? { ...c, enabled: !c.enabled, status: !c.enabled ? (c.status === 'disconnected' ? 'mock' : c.status) : c.status } : c)) }));
        },
        setMapping: (channelId, mappingId, resourceId) => {
          if (!need('channels.manage').ok) return;
          patch((db) => ({ channels: db.channels.map((c) => (c.id === channelId ? { ...c, mappings: c.mappings.map((m) => (m.id === mappingId ? { ...m, resourceId } : m)) } : c)) }));
        },
        addMapping: (channelId, externalId, externalName, resourceId) => {
          if (!need('channels.manage').ok) return;
          patch((db) => ({ channels: db.channels.map((c) => (c.id === channelId ? { ...c, mappings: [...c.mappings, { id: uid('mp'), externalId, externalName, resourceId }] } : c)) }));
        },
        updateChannel: (id, p) => {
          if (!need('channels.manage').ok) return;
          patch((db) => ({ channels: db.channels.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
        },

        importBatch: (channelId, items, nextCursor) => {
          const summary: ImportSummary = { imported: 0, duplicates: 0, conflicts: 0, errors: [], created: [] };
          const c = cur();
          const channel = get().db.channels.find((x) => x.id === channelId);
          if (!c || !channel) return summary;
          const source: Source = channel.type;
          for (const ext of items) {
            const db = get().db;
            const map = channel.mappings.find((m) => m.externalId === ext.listingId);
            if (!map || !map.resourceId) { summary.errors.push(`${ext.externalRef}: listing "${ext.listingId}" is not mapped to a property. Map it, then sync again.`); continue; }
            let guest = db.guests.find((x) => x.orgId === c.orgId && ((ext.guestEmail && x.email.toLowerCase() === ext.guestEmail.toLowerCase()) || x.fullName.toLowerCase() === ext.guestName.toLowerCase()));
            const total = ext.totalAmount;
            const nights = Math.max(1, nightsBetween(ext.checkIn, ext.checkOut));
            const resource = db.resources.find((r) => r.id === map.resourceId)!;
            const probe: Candidate = { guestId: guest?.id, resourceId: map.resourceId, checkIn: ext.checkIn, checkOut: ext.checkOut, adults: ext.adults, children: ext.children, source, externalRef: ext.externalRef };
            const report = checkBooking(probe, orgCtx(db, c.orgId));
            if (report.conflicts.some((k) => k.kind === 'duplicate')) { summary.duplicates++; patch((d) => ({ audit: audit(d, { action: 'imported', summary: `${channel.name}: skipped duplicate ${ext.externalRef}`, actor: SYSTEM_ACTOR }) })); continue; }
            if (!guest) {
              guest = { id: uid('g'), orgId: c.orgId, fullName: ext.guestName, mobile: ext.guestPhone ?? '', email: ext.guestEmail ?? '', nationality: ext.nationality ?? '', notes: '', tags: [], createdAt: nowISO() };
              const gg = guest; patch((d) => ({ guests: [gg, ...d.guests] }));
            }
            const items_: BookingItem[] = [{ id: uid('bi'), description: `${resource.name} · ${nights} night${nights > 1 ? 's' : ''}`, quantity: 1, unitPrice: total || resource.baseRate * nights }];
            const conflicted = !report.ok;
            const status: BookingStatus = conflicted ? 'conflict_review' : 'confirmed';
            const saved = (() => {
              let s!: Booking;
              patch((d) => {
                s = { id: uid('bk'), orgId: c.orgId, ref: nextRef(d, c.orgId), guestId: guest!.id, resourceId: map.resourceId!, checkIn: ext.checkIn, checkOut: ext.checkOut, adults: ext.adults, children: ext.children, source, externalRef: ext.externalRef, status, items: items_, totalAmount: totalOf(items_), depositAmount: Math.round(totalOf(items_) / 2), notes: ext.notes ?? '', createdAt: nowISO(), createdBy: SYSTEM_ACTOR };
                return {
                  bookings: [s, ...d.bookings],
                  audit: audit(d, { bookingId: s.id, action: 'imported', summary: `Imported from ${channel.name} (${ext.externalRef})${conflicted ? ' — conflict detected, held in Conflict Review' : ' — availability check passed'}`, actor: SYSTEM_ACTOR }),
                };
              });
              return s;
            })();
            if (conflicted) { summary.conflicts++; patch((d) => ({ alerts: alertsFor(d, saved, report), audit: audit(d, { bookingId: saved.id, action: 'conflict_detected', summary: report.conflicts.map((k) => k.message).join(' '), actor: SYSTEM_ACTOR }) })); }
            summary.imported++; summary.created.push(saved.ref);
          }
          patch((d) => ({
            channels: d.channels.map((x) => (x.id === channelId ? { ...x, lastSyncAt: nowISO(), importedCount: x.importedCount + summary.imported, syncCursor: nextCursor ?? x.syncCursor, status: summary.errors.length ? 'error' : x.status === 'error' ? 'mock' : x.status, lastError: summary.errors[0] } : x)),
          }));
          return summary;
        },

        // -------------------------------------------------------------- inbox
        sendMessage: (conversationId, body, direction = 'out') => {
          const g = need('bookings.message');
          if (!g.ok || !body.trim()) return;
          const cv = get().db.conversations.find((x) => x.id === conversationId);
          if (!cv) return;
          patch((db) => ({
            messages: [...db.messages.map((m) => (m.conversationId === conversationId && m.direction === 'in' && !m.readAt ? { ...m, readAt: nowISO() } : m)), { id: uid('m'), orgId: g.c.orgId, conversationId, bookingId: cv.bookingId, direction, body: body.trim(), sentAt: nowISO(), readAt: nowISO(), authorId: g.c.memberId }],
            audit: cv.bookingId ? audit(db, { bookingId: cv.bookingId, action: 'message_sent', summary: direction === 'note' ? 'Internal conversation note' : `Message sent via ${cv.channel} (mock delivery)` }) : db.audit,
          }));
        },
        markRead: (conversationId) => patch((db) => ({ messages: db.messages.map((m) => (m.conversationId === conversationId && m.direction === 'in' && !m.readAt ? { ...m, readAt: nowISO() } : m)) })),
        linkConversation: (conversationId, bookingId) => patch((db) => ({ conversations: db.conversations.map((c) => (c.id === conversationId ? { ...c, bookingId, status: 'converted' as const } : c)), messages: db.messages.map((m) => (m.conversationId === conversationId ? { ...m, bookingId } : m)) })),
        createConversation: (guestId, channel, subject, body) => {
          const c = cur()!;
          const id = uid('cv');
          patch((db) => ({
            conversations: [{ id, orgId: c.orgId, guestId, channel, status: 'open', subject }, ...db.conversations],
            messages: [...db.messages, { id: uid('m'), orgId: c.orgId, conversationId: id, direction: 'in', body, sentAt: nowISO() }],
          }));
          return id;
        },

        // -------------------------------------------------------------- team & settings
        inviteMember: (name, email, role, resourceIds) => {
          const g = need('team.manage');
          if (!g.ok) return g.message;
          const db = get().db;
          let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
          if (user && db.members.some((m) => m.userId === user!.id && m.orgId === g.c.orgId)) return 'That person is already on the team.';
          const u = user ?? { id: uid('u'), email, name, password: 'demo123' };
          patch((d) => ({ users: user ? d.users : [...d.users, u], members: [...d.members, { id: uid('tm'), orgId: g.c.orgId, userId: u.id, role, resourceIds, active: true, invitedEmail: email }] }));
          return null;
        },
        updateMember: (id, p) => {
          if (!need('team.manage').ok) return;
          patch((db) => ({ members: db.members.map((m) => (m.id === id ? { ...m, ...p } : m)) }));
        },
        updateOrg: (p) => {
          if (!need('settings.owner').ok) return;
          const c = cur()!;
          patch((db) => ({ organizations: db.organizations.map((o) => (o.id === c.orgId ? { ...o, ...p } : o)) }));
        },
        updateTemplate: (id, body) => {
          if (!need('settings.view').ok) return;
          patch((db) => ({ templates: db.templates.map((t) => (t.id === id ? { ...t, body } : t)) }));
        },
        setNotification: (key, value) => {
          const c = cur();
          if (!c) return;
          patch((db) => ({ notificationSettings: db.notificationSettings.map((n) => (n.orgId === c.orgId && n.userId === get().session!.userId ? { ...n, [key]: value } : n)) }));
        },
        deleteOrg: () => {
          const g = need('org.delete');
          if (!g.ok) return g.message;
          const orgId = g.c.orgId;
          const userId = get().session!.userId;
          const rest = get().db.members.find((m) => m.userId === userId && m.orgId !== orgId && m.active);
          const keep = <T extends { orgId: string }>(a: T[]) => a.filter((x) => x.orgId !== orgId);
          patch((db) => ({
            organizations: db.organizations.filter((o) => o.id !== orgId), members: keep(db.members), properties: keep(db.properties), resources: keep(db.resources), blocks: keep(db.blocks), guests: keep(db.guests),
            bookings: keep(db.bookings), payments: keep(db.payments), notes: keep(db.notes), attachments: keep(db.attachments), audit: keep(db.audit), alerts: keep(db.alerts), conversations: keep(db.conversations),
            messages: keep(db.messages), templates: keep(db.templates), channels: keep(db.channels), notificationSettings: keep(db.notificationSettings),
          }));
          set({ session: rest ? { userId, orgId: rest.orgId } : null });
          return null;
        },
      };

      function ensureConversation(b: Booking): string {
        const db = get().db;
        const found = db.conversations.find((c) => c.bookingId === b.id) ?? db.conversations.find((c) => c.guestId === b.guestId && c.orgId === b.orgId);
        if (found) return found.id;
        const id = uid('cv');
        const channel = b.source === 'facebook' ? 'facebook' : b.source === 'whatsapp' ? 'whatsapp' : b.source === 'website' ? 'website' : 'email';
        patch((d) => ({ conversations: [{ id, orgId: b.orgId, guestId: b.guestId, channel, bookingId: b.id, status: 'converted', subject: `Booking ${b.ref}` }, ...d.conversations] }));
        return id;
      }
    },
    {
      name: 'bookingpilot-demo-v1',
      version: 1,
      storage: createJSONStorage(() => (typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} })),
      partialize: (s) => ({ db: s.db, session: s.session, seededOn: s.seededOn }),
    },
  ),
);

