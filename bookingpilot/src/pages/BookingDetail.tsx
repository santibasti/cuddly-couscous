import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, CreditCard, FileText, MessageSquare, Paperclip, Pencil, Repeat, Send, ShieldCheck, StickyNote, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { useFlow } from '@/store/flow';
import { bookingActions } from '@/store/actions';
import { checkBooking, conflictedBookingIds } from '@/domain/conflicts';
import { fmtDate, fmtDateTime, fmtLong, nightsBetween } from '@/domain/dates';
import { paidAmount } from '@/domain/metrics';
import { peso } from '@/domain/money';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/bits';
import { Tabs, TabsContent, TabsList, TabsTrigger, Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { PaymentBadge, SourceChip, StatusBadge } from '@/components/common/badges';
import { ConflictItem } from '@/components/bookings/ConflictList';
import { CancelDialog, ConfirmationDialog, EditDatesDialog, PaymentDialog, ReassignDialog } from '@/components/bookings/Dialogs';
import { cn, initials } from '@/lib/utils';
import type { AuditAction } from '@/types';

const AUDIT_TONE: Partial<Record<AuditAction, string>> = {
  conflict_detected: 'bg-coral-600', conflict_override: 'bg-coral-600', cancelled: 'bg-slate-500', confirmed: 'bg-ok-600', approval_requested: 'bg-warn-500', approval_rejected: 'bg-coral-600', marked_duplicate: 'bg-slate-500',
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-line/60 py-2.5 text-sm last:border-0"><span className="text-ink-mute">{k}</span><span className="text-right font-semibold">{v}</span></div>;
}

export default function BookingDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const org = useOrg()!;
  const db = useStore((s) => s.db);
  const openForm = useFlow((s) => s.openForm);
  const addNote = useStore((s) => s.addNote);
  const addAttachment = useStore((s) => s.addAttachment);
  const requestPayment = useStore((s) => s.requestPayment);
  const approveOverride = useStore((s) => s.approveOverride);
  const rejectApproval = useStore((s) => s.rejectApproval);
  const setStatus = bookingActions.setStatus;
  const [dlg, setDlg] = useState<null | 'cancel' | 'dates' | 'reassign' | 'pay' | 'confirmation' | 'decide'>(null);
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const paySent = useRef<string | null>(null);

  const b = org.bookings.find((x) => x.id === id);
  const g = b ? org.guestById(b.guestId) : undefined;
  const r = b ? org.resourceById(b.resourceId) : undefined;
  const ctx = useMemo(() => ({ resources: org.allResources, bookings: db.bookings.filter((x) => x.orgId === org.org.id), blocks: db.blocks.filter((x) => x.orgId === org.org.id) }), [db, org.allResources, org.org.id]);
  const report = useMemo(() => (b && ['pending', 'inquiry', 'conflict_review', 'confirmed', 'checked_in'].includes(b.status) ? checkBooking(b, ctx) : null), [b, ctx]);
  const conflict = b ? conflictedBookingIds(org.bookings, org.blocks).has(b.id) : false;

  // deep link from the "Unpaid reservation" button: send the payment request once, then clear the param
  const wantsPayment = sp.get('action') === 'payment';
  useEffect(() => {
    if (!wantsPayment || !b || paySent.current === b.id) return;
    paySent.current = b.id;
    const next = new URLSearchParams(sp); next.delete('action'); setSp(next, { replace: true });
    if (org.can('bookings.message')) { const err = requestPayment(b.id); if (err) toast.error(err); else toast.success('Payment request sent (mock delivery) and logged'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsPayment, b?.id]);

  if (!b) return <Card><EmptyState title="Booking not found" body="It may have been removed or you may not have access to its property." action={<Button asChild><Link to="/bookings">Back to bookings</Link></Button>} /></Card>;

  const paid = paidAmount(org.payments, b.id);
  const balance = Math.max(0, b.totalAmount - paid);
  const nights = nightsBetween(b.checkIn, b.checkOut);
  const closed = ['cancelled', 'checked_out', 'no_show'].includes(b.status);
  const canEdit = org.can('bookings.edit') && !closed;
  const logs = org.audit.filter((a) => a.bookingId === b.id).sort((a, c) => c.at.localeCompare(a.at));
  const changes = logs.filter((a) => ['edited', 'moved', 'status_changed', 'confirmed', 'cancelled'].includes(a.action));
  const notes = org.notes.filter((n) => n.bookingId === b.id).sort((a, c) => c.createdAt.localeCompare(a.createdAt));
  const files = org.attachments.filter((a) => a.bookingId === b.id);
  const convs = org.conversations.filter((c) => c.bookingId === b.id || (c.guestId === b.guestId && !c.bookingId));
  const msgs = org.messages.filter((m) => convs.some((c) => c.id === m.conversationId)).sort((a, c) => a.sentAt.localeCompare(c.sentAt));
  const payments = org.payments.filter((p) => p.bookingId === b.id).sort((a, c) => a.paidAt.localeCompare(c.paidAt));
  const alerts = org.alerts.filter((a) => a.bookingId === b.id);
  const reviewing = b.status === 'conflict_review' || (report && !report.ok && ['pending', 'confirmed', 'checked_in'].includes(b.status));

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2_000_000) { toast.error('Demo mode stores files in the browser — keep them under 2 MB.'); return; }
    const rd = new FileReader(); rd.onload = () => { addAttachment(b.id, { name: f.name, size: f.size, mime: f.type, url: String(rd.result) }); toast.success('File attached'); }; rd.readAsDataURL(f); e.target.value = '';
  };
  const decide = (kind: 'approve' | 'reject') => {
    const out = kind === 'approve' ? approveOverride(b.id, decision) : rejectApproval(b.id, decision);
    if (out.kind === 'saved') { toast.success(kind === 'approve' ? 'Exception approved and logged' : 'Declined — booking cancelled'); setDlg(null); setDecision(''); } else if (out.kind === 'error') toast.error(out.message);
  };

  return (
    <div>
      <Link to="/bookings" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"><ArrowLeft className="size-4" />All bookings</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="font-display text-2xl font-extrabold">{g?.fullName}</h1><StatusBadge status={b.status} conflict={conflict} /><PaymentBadge status={org.payStatus(b)} /></div>
          <p className="mt-1 text-sm text-ink-soft">{b.ref} · {r?.name} · {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} · <SourceChip source={b.source} className="!text-sm" /></p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {org.can('bookings.confirm') && ['pending', 'inquiry', 'conflict_review'].includes(b.status) && <Button variant="success" onClick={() => bookingActions.confirm(b.id)}><CheckCircle2 />Confirm booking</Button>}
        {org.can('bookings.message') && !closed && <Button variant="outline" onClick={() => { const e = requestPayment(b.id); e ? toast.error(e) : toast.success('Payment request sent (mock delivery) and logged'); }}><CreditCard />Send payment request</Button>}
        {org.can('bookings.message') && ['confirmed', 'checked_in'].includes(b.status) && <Button variant="outline" onClick={() => setDlg('confirmation')}><Send />Send confirmation message</Button>}
        {canEdit && <Button variant="outline" onClick={() => setDlg('dates')}><CalendarClock />Edit dates</Button>}
        {canEdit && <Button variant="outline" onClick={() => setDlg('reassign')}><Repeat />Reassign property</Button>}
        {canEdit && <Button variant="outline" onClick={() => openForm({ bookingId: b.id })}><Pencil />Edit booking</Button>}
        {org.can('bookings.cancel') && !closed && <Button variant="danger-outline" onClick={() => setDlg('cancel')}><XCircle />Cancel booking</Button>}
        {canEdit && <Button variant="subtle" onClick={() => document.getElementById('note-box')?.focus()}><StickyNote />Add internal note</Button>}
        {org.can('bookings.edit') && b.status === 'confirmed' && b.checkIn <= org.today && <Button variant="primary" onClick={() => setStatus(b.id, 'checked_in')}>Mark checked in</Button>}
        {org.can('bookings.edit') && b.status === 'checked_in' && <Button onClick={() => setStatus(b.id, 'checked_out')}>Mark checked out</Button>}
        {org.can('bookings.edit') && b.status === 'confirmed' && b.checkIn < org.today && <Button variant="danger-outline" onClick={() => setStatus(b.id, 'no_show')}>No show</Button>}
      </div>

      {reviewing && report && !report.ok && (
        <Card className="mb-5 border-coral-100 bg-coral-50/40 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-display text-lg font-bold text-coral-700">This booking is in conflict</h2><p className="text-sm text-ink-soft">It cannot be confirmed as it stands. Resolve it by moving or changing dates — or, for soft rule breaks only, a manager can approve an exception.</p></div>
            <div className="flex flex-wrap gap-2">
              {canEdit && <Button variant="outline" onClick={() => setDlg('reassign')}>Move to another property</Button>}
              {canEdit && <Button variant="outline" onClick={() => setDlg('dates')}>Change dates</Button>}
              {org.can('conflicts.override') && <Button variant="success" onClick={() => setDlg('decide')}><ShieldCheck />Manager decision</Button>}
            </div>
          </div>
          <div className="space-y-2.5">{report.conflicts.map((c, i) => <ConflictItem key={i} c={c} />)}</div>
          {b.approval && (
            <div className="mt-3 rounded-xl bg-white p-3.5 text-sm ring-1 ring-warn-100">
              <p className="font-bold text-warn-700">Manager approval {b.approval.status}</p>
              <p className="text-ink-soft">Requested by {org.memberName(b.approval.requestedBy)} · {fmtDateTime(b.approval.requestedAt)} — “{b.approval.reason}”</p>
              {b.approval.decidedBy && <p className="text-ink-soft">Decided by {org.memberName(b.approval.decidedBy)}: {b.approval.decisionNote}</p>}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Card><CardHeader title="Guest" action={org.can('guests.view') && <Button asChild variant="ghost" size="sm"><Link to={`/guests?open=${b.guestId}`}>Profile</Link></Button>} />
              <div className="px-5 pb-4">
                <div className="mb-3 flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">{initials(g?.fullName ?? '')}</span><div><p className="font-bold">{g?.fullName}</p><p className="text-xs text-ink-mute">{g?.nationality}</p></div></div>
                <Row k="Mobile" v={g?.mobile || <span className="text-warn-700">Missing</span>} /><Row k="Email" v={g?.email || <span className="text-warn-700">Missing</span>} />
                {g?.tags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{g.tags.map((t) => <Badge key={t} tone={t === 'Blacklist' ? 'red' : t === 'VIP' ? 'blue' : 'slate'}>{t}</Badge>)}</div> : null}
              </div>
            </Card>
            <Card><CardHeader title="Reservation" />
              <div className="px-5 pb-4">
                <Row k="Check-in" v={fmtLong(b.checkIn)} /><Row k="Check-out" v={fmtLong(b.checkOut)} /><Row k="Duration" v={`${nights} night${nights > 1 ? 's' : ''}`} />
                <Row k="Guests" v={`${b.adults} adult${b.adults > 1 ? 's' : ''}${b.children ? ` + ${b.children} child${b.children > 1 ? 'ren' : ''}` : ''}`} />
                <Row k="Source" v={<SourceChip source={b.source} />} />{b.externalRef && <Row k="Channel ref" v={b.externalRef} />}
                <Row k="Assigned to" v={org.memberName(b.assignedTo)} /><Row k="Created" v={`${fmtDateTime(b.createdAt)} by ${org.memberName(b.createdBy)}`} />
                {b.cancelReason && <Row k="Cancel reason" v={<span className="text-coral-700">{b.cancelReason}</span>} />}
              </div>
            </Card>
            <Card><CardHeader title="Property & resource" />
              <div className="px-5 pb-4">
                <div className="mb-2 flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: r?.color }} /><b>{r?.name}</b></div>
                <Row k="Type" v={r?.type.replace('_', ' ')} /><Row k="Capacity" v={`${r?.capacity} guests`} /><Row k="Min. stay" v={`${r?.minStay} night${(r?.minStay ?? 1) > 1 ? 's' : ''}`} /><Row k="Cleaning buffer" v={r?.bufferDays ? `${r.bufferDays} night` : 'Same-day turnover'} />
              </div>
            </Card>
            <Card><CardHeader title="Payment summary" action={org.can('bookings.edit') && !['cancelled'].includes(b.status) && <Button variant="subtle" size="sm" onClick={() => setDlg('pay')}>Record payment</Button>} />
              <div className="px-5 pb-4">
                {b.items.map((it) => <Row key={it.id} k={it.description} v={peso(it.quantity * it.unitPrice)} />)}
                <Row k="Total" v={<b className="text-base">{peso(b.totalAmount)}</b>} /><Row k="Deposit required" v={peso(b.depositAmount)} /><Row k="Paid" v={<span className="text-ok-700">{peso(paid)}</span>} /><Row k="Balance due" v={<span className={balance ? 'text-warn-700' : 'text-ok-700'}>{peso(balance)}</span>} />
                {payments.length > 0 && <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-soft">{payments.map((p) => <div key={p.id} className="flex justify-between"><span>{fmtDate(p.paidAt.slice(0, 10))} · {p.kind} · {p.method.replace('_', ' ')} {p.reference && `· ${p.reference}`}</span><span className="tabnum font-semibold">{p.kind === 'refund' ? '−' : ''}{peso(p.amount)}</span></div>)}</div>}
              </div>
            </Card>
          </div>
          {b.notes && <Card className="p-5"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-mute">Booking notes</p><p className="text-sm">{b.notes}</p></Card>}
        </div>

        <Card className="self-start">
          <Tabs defaultValue="notes" className="p-4">
            <TabsList><TabsTrigger value="notes">Notes</TabsTrigger><TabsTrigger value="chat">Conversation</TabsTrigger><TabsTrigger value="files">Files{files.length ? ` (${files.length})` : ''}</TabsTrigger><TabsTrigger value="audit">Timeline</TabsTrigger><TabsTrigger value="changes">Changes</TabsTrigger></TabsList>

            <TabsContent value="notes">
              {canEdit && <div className="mb-4 space-y-2"><Textarea id="note-box" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal staff comment — never shown to the guest" /><div className="flex justify-end"><Button size="sm" disabled={!note.trim()} onClick={() => { addNote(b.id, note); setNote(''); }}>Add internal note</Button></div></div>}
              {notes.length === 0 ? <EmptyState icon={<StickyNote />} title="No internal notes yet" /> : <ul className="space-y-3">{notes.map((n) => <li key={n.id} className="rounded-xl bg-warn-50/60 p-3 text-sm ring-1 ring-warn-100"><p>{n.body}</p><p className="mt-1.5 text-xs text-ink-mute">{org.memberName(n.authorId)} · {fmtDateTime(n.createdAt)}</p></li>)}</ul>}
            </TabsContent>

            <TabsContent value="chat">
              {msgs.length === 0 ? <EmptyState icon={<MessageSquare />} title="No messages yet" body="Payment requests, confirmations and guest replies appear here." /> : (
                <ul className="max-h-96 space-y-2.5 overflow-y-auto scroll-thin">{msgs.map((m) => <li key={m.id} className={cn('max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm', m.direction === 'in' ? 'bg-canvas' : m.direction === 'note' ? 'bg-warn-50 ring-1 ring-warn-100' : 'ml-auto bg-brand-600 text-white')}><p className="whitespace-pre-wrap">{m.body.length > 260 ? m.body.slice(0, 260) + '…' : m.body}</p><p className={cn('mt-1 text-[11px]', m.direction === 'out' ? 'text-white/70' : 'text-ink-mute')}>{fmtDateTime(m.sentAt)}</p></li>)}</ul>
              )}
              {convs[0] && <Button asChild variant="outline" size="sm" className="mt-3"><Link to={`/inbox?c=${convs[0].id}`}>Open in Inbox</Link></Button>}
            </TabsContent>

            <TabsContent value="files">
              {canEdit && <><input ref={fileRef} type="file" className="hidden" onChange={onFile} /><Button variant="outline" size="sm" className="mb-3" onClick={() => fileRef.current?.click()}><Paperclip />Attach file</Button></>}
              {files.length === 0 ? <EmptyState icon={<FileText />} title="No attachments" body="Proof of payment, IDs and signed agreements." /> : <ul className="space-y-2">{files.map((f) => <li key={f.id}><a href={f.url} download={f.name} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm hover:bg-brand-50/50"><FileText className="size-4 text-brand-600" /><span className="min-w-0 flex-1"><b className="block truncate">{f.name}</b><span className="text-xs text-ink-mute">{(f.size / 1024).toFixed(0)} KB · {org.memberName(f.uploadedBy)} · {fmtDateTime(f.createdAt)}</span></span></a></li>)}</ul>}
            </TabsContent>

            <TabsContent value="audit">
              <ol className="relative space-y-4 border-l-2 border-line pl-5">
                {logs.map((a) => (
                  <li key={a.id} className="relative"><span className={cn('absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white', AUDIT_TONE[a.action] ?? 'bg-brand-500')} />
                    <p className="text-sm font-semibold capitalize">{a.action.replace(/_/g, ' ')}</p><p className="text-sm text-ink-soft">{a.summary}</p><p className="text-xs text-ink-mute">{org.memberName(a.actorId)} · {fmtDateTime(a.at)}</p></li>
                ))}
                {logs.length === 0 && <p className="text-sm text-ink-mute">No activity recorded.</p>}
              </ol>
            </TabsContent>

            <TabsContent value="changes">
              {changes.length === 0 ? <EmptyState title="No edits yet" /> : <ul className="divide-y divide-line/70">{changes.map((a) => <li key={a.id} className="py-2.5 text-sm"><Badge tone="slate">{a.action.replace('_', ' ')}</Badge> <span className="text-ink-soft">{a.summary}</span><p className="mt-0.5 text-xs text-ink-mute">{org.memberName(a.actorId)} · {fmtDateTime(a.at)}</p></li>)}</ul>}
              {alerts.length > 0 && <div className="mt-4 border-t border-line pt-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">Conflict history</p>{alerts.map((a) => <p key={a.id} className="text-sm text-ink-soft"><Badge tone={a.status === 'open' ? 'red' : 'gray'}>{a.status}</Badge> {a.details}{a.resolution ? ` — ${a.resolution}` : ''}</p>)}</div>}
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <CancelDialog bookingId={dlg === 'cancel' ? b.id : null} onClose={() => setDlg(null)} />
      <EditDatesDialog bookingId={dlg === 'dates' ? b.id : null} onClose={() => setDlg(null)} />
      <ReassignDialog bookingId={dlg === 'reassign' ? b.id : null} onClose={() => setDlg(null)} />
      <PaymentDialog bookingId={dlg === 'pay' ? b.id : null} onClose={() => setDlg(null)} />
      <ConfirmationDialog bookingId={dlg === 'confirmation' ? b.id : null} onClose={() => setDlg(null)} />
      <Dialog open={dlg === 'decide'} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent title="Manager decision" description="Recorded in the audit trail with your name and reason.">
          <DialogBody className="space-y-3">
            {report && report.hasHard && <p className="rounded-xl bg-coral-50 p-3 text-sm font-medium text-coral-700">This includes a hard conflict (double booking, blocked dates or duplicate). It cannot be overridden — decline it, or move one of the reservations first.</p>}
            <Field label="Reason / note (required)"><Textarea value={decision} onChange={(e) => setDecision(e.target.value)} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlg(null)}>Close</Button>
            <Button variant="danger-outline" disabled={!decision.trim()} onClick={() => decide('reject')}><Trash2 />Decline &amp; cancel</Button>
            <Button variant="success" disabled={!decision.trim() || !report?.overridable} onClick={() => decide('approve')}>Approve exception</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
