import { useMemo, useState } from 'react';
import { AlertOctagon, ArrowLeftRight, CalendarClock, Clock, Copy, Pencil, ShieldCheck, Trash2, Undo2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useFlow } from '@/store/flow';
import { useStore, type Resolution } from '@/store/store';
import { useOrg } from '@/store/hooks';
import { checkBooking, findAvailableResources, suggestWindows } from '@/domain/conflicts';
import { fmtDate, fmtRange, nightsBetween } from '@/domain/dates';
import { peso } from '@/domain/money';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { ConflictItem } from './ConflictList';
import { cn } from '@/lib/utils';

type Panel = 'move' | 'dates' | 'approval' | null;

export function ConflictModalHost() {
  const c = useFlow((s) => s.conflict);
  const close = useFlow((s) => s.closeConflict);
  return <Dialog open={!!c} onOpenChange={(o) => !o && close()}>{c && <ConflictInner key={JSON.stringify(c.draft) + c.report.conflicts.length} />}</Dialog>;
}

function ConflictInner() {
  const { draft, report, context } = useFlow((s) => s.conflict)!;
  const close = useFlow((s) => s.closeConflict);
  const openForm = useFlow((s) => s.openForm);
  const openConflict = useFlow((s) => s.openConflict);
  const resolve = useStore((s) => s.resolveConflict);
  const db = useStore((s) => s.db);
  const org = useOrg()!;
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState('');
  const [dates, setDates] = useState({ checkIn: draft.checkIn, checkOut: draft.checkOut });

  const guest = org.guestById(draft.guestId);
  const resource = org.resourceById(draft.resourceId);
  const nights = nightsBetween(draft.checkIn, draft.checkOut);
  const ctx = useMemo(() => ({ resources: org.resources, bookings: db.bookings.filter((b) => b.orgId === org.org.id), blocks: db.blocks.filter((b) => b.orgId === org.org.id) }), [db, org.resources, org.org.id]);
  const cand = { ...draft, source: draft.source };
  const alternatives = useMemo(() => findAvailableResources(cand, ctx), [draft, ctx]); // eslint-disable-line
  const windows = useMemo(() => suggestWindows(cand, ctx, 4), [draft, ctx]); // eslint-disable-line
  const customCheck = useMemo(() => (dates.checkOut > dates.checkIn ? checkBooking({ ...cand, ...dates }, ctx) : null), [dates, ctx]); // eslint-disable-line
  const hasOtherBooking = report.conflicts.some((c) => c.otherBookingId);
  const managerCanApprove = org.can('conflicts.override') && report.overridable;
  const isEdit = context === 'edit';
  const title = context === 'new' ? 'Conflict detected — booking not confirmed' : isEdit ? 'These changes would create a conflict' : 'Cannot confirm — conflict detected';

  const run = (r: Resolution) => {
    const out = resolve(draft, report, r, context);
    if (out.kind === 'saved') { toast.success(out.note ?? `Saved ${out.booking.ref}`); close(); useFlow.getState().closeForm(); }
    else if (out.kind === 'conflict') { toast.warning('Still in conflict — pick another option.'); openConflict({ draft: out.draft, report: out.report, context: out.context }); }
    else if (r.type === 'cancel') { toast.info(out.message); close(); }
    else toast.error(out.message);
  };

  const Option = ({ icon: Icon, title: t, body, onClick, active, tone = 'default', disabled }: { icon: LucideIcon; title: string; body: string; onClick: () => void; active?: boolean; tone?: 'default' | 'danger'; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick} className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-45', active ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/30' : tone === 'danger' ? 'border-coral-100 hover:bg-coral-50' : 'border-line hover:bg-brand-50/60')}>
      <span className={cn('mt-0.5 rounded-lg p-1.5', tone === 'danger' ? 'bg-coral-50 text-coral-600' : 'bg-brand-50 text-brand-600')}><Icon className="size-4" /></span>
      <span><span className="block text-sm font-bold text-ink">{t}</span><span className="block text-xs text-ink-soft">{body}</span></span>
    </button>
  );

  return (
    <DialogContent wide title={title} description="Nothing has been confirmed. Choose how to resolve this — every choice is recorded in the audit trail." className="md:max-w-3xl">
      <DialogBody className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl bg-navy-900 p-4 text-white">
          <AlertOctagon className="mt-0.5 size-5 shrink-0 text-coral-500" />
          <div className="text-sm">
            <p className="font-bold">{guest?.fullName ?? 'Guest'} · {resource?.name}</p>
            <p className="text-navy-300">{fmtRange(draft.checkIn, draft.checkOut)} · {nights} night{nights === 1 ? '' : 's'} · {draft.adults + draft.children} guests · {peso(draft.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}</p>
          </div>
        </div>

        <div className="space-y-2.5">{report.conflicts.map((c, i) => <ConflictItem key={i} c={c} />)}</div>

        <div>
          <p className="mb-2 font-display text-sm font-bold">How do you want to resolve it?</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {!isEdit && <Option icon={Clock} title="Keep as pending" body="Save without confirming. Dates stay flagged until the conflict is cleared." onClick={() => run({ type: 'keep_pending' })} />}
            <Option icon={ArrowLeftRight} title="Move to another available property" body={alternatives.length ? `${alternatives.length} option${alternatives.length > 1 ? 's' : ''} free for these dates.` : 'Nothing else is free for these dates.'} active={panel === 'move'} disabled={!alternatives.length} onClick={() => setPanel(panel === 'move' ? null : 'move')} />
            <Option icon={CalendarClock} title="Change dates" body="Pick a conflict-free window for the same stay." active={panel === 'dates'} onClick={() => setPanel(panel === 'dates' ? null : 'dates')} />
            {!isEdit && hasOtherBooking && <Option icon={Copy} title="Mark as duplicate" body="This is the same stay as the existing reservation. The new record is closed." onClick={() => run({ type: 'mark_duplicate' })} />}
            <Option icon={ShieldCheck} title={managerCanApprove ? 'Approve exception (manager)' : 'Request manager approval'} body={report.hasHard ? 'Double bookings and blocked dates cannot be overridden — the manager will decide how to resolve it.' : managerCanApprove ? 'Confirm anyway with a written reason. Recorded in the audit trail.' : 'Held in Conflict Review until a manager decides.'} active={panel === 'approval'} onClick={() => setPanel(panel === 'approval' ? null : 'approval')} />
            {isEdit
              ? <Option icon={Undo2} title="Keep original booking" body="Discard these changes. The reservation stays exactly as it was." onClick={() => run({ type: 'revert' })} />
              : <Option icon={Trash2} tone="danger" title={context === 'new' ? 'Cancel the new booking' : 'Cancel this booking'} body={context === 'new' ? 'Discard it. Nothing is saved.' : 'Cancel the reservation and release the dates.'} onClick={() => run({ type: 'cancel', reason: 'Cancelled at conflict check' })} />}
          </div>
        </div>

        {panel === 'move' && (
          <div className="rounded-xl border border-line p-3.5">
            <p className="mb-2 text-sm font-bold">Available for {fmtRange(draft.checkIn, draft.checkOut)}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {alternatives.map((r) => (
                <button key={r.id} type="button" onClick={() => run({ type: 'move_property', resourceId: r.id })} className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-left text-sm hover:border-ok-600 hover:bg-ok-50">
                  <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: r.color }} /><b>{r.name}</b></span>
                  <span className="text-xs text-ink-soft">sleeps {r.capacity} · {peso(r.baseRate)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {panel === 'dates' && (
          <div className="space-y-3 rounded-xl border border-line p-3.5">
            <p className="text-sm font-bold">Next free windows at {resource?.name}</p>
            <div className="flex flex-wrap gap-2">
              {windows.length ? windows.map((w) => (
                <button key={w.checkIn} type="button" onClick={() => setDates(w)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold', dates.checkIn === w.checkIn ? 'border-ok-600 bg-ok-50 text-ok-700' : 'border-line hover:bg-brand-50')}>{fmtDate(w.checkIn)} → {fmtDate(w.checkOut)}</button>
              )) : <span className="text-xs text-ink-mute">No free window of this length in the next 8 months.</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check-in"><Input type="date" value={dates.checkIn} onChange={(e) => setDates({ ...dates, checkIn: e.target.value })} /></Field>
              <Field label="Check-out"><Input type="date" value={dates.checkOut} onChange={(e) => setDates({ ...dates, checkOut: e.target.value })} /></Field>
            </div>
            {customCheck && (customCheck.ok
              ? <p className="text-sm font-semibold text-ok-700">✓ These dates are free.</p>
              : <p className="text-sm font-semibold text-coral-700">✕ {customCheck.conflicts[0].message}</p>)}
            <div className="flex justify-end"><Button disabled={!customCheck?.ok} onClick={() => run({ type: 'change_dates', ...dates })}>Apply new dates</Button></div>
          </div>
        )}

        {panel === 'approval' && (
          <div className="space-y-3 rounded-xl border border-line p-3.5">
            <Field label={managerCanApprove ? 'Reason for the exception (required)' : 'Note for the manager (required)'}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={managerCanApprove ? 'e.g. Guest is a VIP and agreed to the one-night stay.' : 'e.g. Guest is flexible, please advise whether to offer Villa 03.'} />
            </Field>
            <div className="flex justify-end">
              {managerCanApprove
                ? <Button variant="success" disabled={!reason.trim()} onClick={() => run({ type: 'override', reason })}>Approve exception &amp; confirm</Button>
                : <Button disabled={!reason.trim()} onClick={() => run({ type: 'request_approval', reason })}>Send for approval</Button>}
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => { close(); openForm({ bookingId: draft.id, prefill: draft, conversationId: draft.conversationId }); }}><Pencil />Back to the booking form</Button>
        <Button variant="outline" onClick={close}>Close</Button>
      </DialogFooter>
    </DialogContent>
  );
}
