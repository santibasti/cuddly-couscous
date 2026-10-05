import { useMemo, useState } from 'react';
import { Copy, Download, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { retotalItems } from '@/store/retotal';
import { bookingActions } from '@/store/actions';
import { checkBooking } from '@/domain/conflicts';
import { addDays, fmtDate, nightsBetween } from '@/domain/dates';
import { buildConfirmation } from '@/domain/confirmation';
import { paidAmount } from '@/domain/metrics';
import { peso } from '@/domain/money';
import { downloadConfirmationPdf } from '@/lib/export';
import { AvailabilityVerdict } from './ConflictList';
import type { PaymentMethod } from '@/types';

const CANCEL_REASONS = ['Guest cancelled', 'Guest did not pay deposit', 'Duplicate booking', 'Property unavailable', 'Declined by management', 'Other'];

export function CancelDialog({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const org = useOrg()!;
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [note, setNote] = useState('');
  const b = bookingId ? org.bookings.find((x) => x.id === bookingId) : undefined;
  return (
    <Dialog open={!!b} onOpenChange={(o) => !o && onClose()}>
      {b && (
        <DialogContent title={`Cancel ${b.ref}?`} description={`${org.guestById(b.guestId)?.fullName} · ${org.resourceById(b.resourceId)?.name} · ${fmtDate(b.checkIn)} → ${fmtDate(b.checkOut)}`}>
          <DialogBody className="space-y-4">
            <p className="text-sm text-ink-soft">The dates are released immediately and this action is recorded in the audit trail. Refunds are handled separately under payments.</p>
            <Field label="Reason"><Select value={reason} onChange={(e) => setReason(e.target.value)}>{CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </DialogBody>
          <DialogFooter><Button variant="ghost" onClick={onClose}>Keep booking</Button><Button variant="danger" onClick={() => { bookingActions.cancel(b.id, note ? `${reason} — ${note}` : reason); onClose(); }}>Cancel booking</Button></DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function EditDatesDialog({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const org = useOrg()!;
  const db = useStore((s) => s.db);
  const b = bookingId ? org.bookings.find((x) => x.id === bookingId) : undefined;
  const [d, setD] = useState<{ checkIn: string; checkOut: string } | null>(null);
  const val = d ?? (b ? { checkIn: b.checkIn, checkOut: b.checkOut } : { checkIn: '', checkOut: '' });
  const report = useMemo(() => (b && val.checkOut > val.checkIn ? checkBooking({ ...b, ...val }, { resources: org.allResources, bookings: db.bookings.filter((x) => x.orgId === org.org.id), blocks: db.blocks.filter((x) => x.orgId === org.org.id) }) : null), [b, val.checkIn, val.checkOut, db, org]); // eslint-disable-line
  const close = () => { setD(null); onClose(); };
  return (
    <Dialog open={!!b} onOpenChange={(o) => !o && close()}>
      {b && (
        <DialogContent title="Edit dates" description={`${b.ref} · ${org.resourceById(b.resourceId)?.name}`}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check-in"><Input type="date" value={val.checkIn} onChange={(e) => setD({ checkIn: e.target.value, checkOut: val.checkOut <= e.target.value ? addDays(e.target.value, Math.max(1, nightsBetween(b.checkIn, b.checkOut))) : val.checkOut })} /></Field>
              <Field label="Check-out" hint={val.checkOut > val.checkIn ? `${nightsBetween(val.checkIn, val.checkOut)} nights` : undefined}><Input type="date" value={val.checkOut} min={addDays(val.checkIn, 1)} onChange={(e) => setD({ ...val, checkOut: e.target.value })} /></Field>
            </div>
            <AvailabilityVerdict report={report} />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button disabled={!(val.checkOut > val.checkIn)} onClick={() => { const nights = nightsBetween(val.checkIn, val.checkOut); bookingActions.save({ ...b, ...val, items: retotalItems(b.items, nights) }, 'Dates updated'); close(); }}>Save dates</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function ReassignDialog({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const org = useOrg()!;
  const db = useStore((s) => s.db);
  const b = bookingId ? org.bookings.find((x) => x.id === bookingId) : undefined;
  const ctx = { resources: org.allResources, bookings: db.bookings.filter((x) => x.orgId === org.org.id), blocks: db.blocks.filter((x) => x.orgId === org.org.id) };
  return (
    <Dialog open={!!b} onOpenChange={(o) => !o && onClose()}>
      {b && (
        <DialogContent title="Reassign property" description={`${b.ref} · ${fmtDate(b.checkIn)} → ${fmtDate(b.checkOut)}`}>
          <DialogBody className="space-y-2.5">
            {org.resources.map((r) => {
              const rep = checkBooking({ ...b, resourceId: r.id }, ctx);
              const current = r.id === b.resourceId;
              return (
                <button key={r.id} disabled={current} onClick={() => { onClose(); bookingActions.save({ ...b, resourceId: r.id }, `Moved to ${r.name}`); }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-line p-3 text-left hover:border-brand-500 hover:bg-brand-50/50 disabled:cursor-default disabled:bg-canvas">
                  <span className="flex items-center gap-2.5"><span className="size-3 rounded-full" style={{ background: r.color }} /><span><b className="block text-sm">{r.name}{current && ' (current)'}</b><span className="text-xs text-ink-mute">Sleeps {r.capacity} · {peso(r.baseRate)}</span></span></span>
                  {!current && (rep.ok ? <span className="text-xs font-bold text-ok-700">Available</span> : <span className="max-w-[55%] truncate text-xs font-semibold text-coral-700" title={rep.conflicts[0].message}>{rep.conflicts[0].message}</span>)}
                </button>
              );
            })}
          </DialogBody>
          <DialogFooter><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function PaymentDialog({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const org = useOrg()!;
  const record = useStore((s) => s.recordPayment);
  const b = bookingId ? org.bookings.find((x) => x.id === bookingId) : undefined;
  const paid = b ? paidAmount(org.payments, b.id) : 0;
  const due = b ? Math.max(0, b.totalAmount - paid) : 0;
  const [f, setF] = useState({ amount: 0, kind: 'deposit' as 'deposit' | 'balance' | 'refund', method: 'gcash' as PaymentMethod, ref: '' });
  return (
    <Dialog open={!!b} onOpenChange={(o) => !o && onClose()}>
      {b && (
        <DialogContent title="Record payment" description={`${b.ref} · total ${peso(b.totalAmount)} · outstanding ${peso(due)}`}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (₱)"><Input type="number" min={0} value={f.amount || ''} placeholder={String(due)} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
              <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}><option value="deposit">Deposit</option><option value="balance">Balance</option><option value="refund">Refund</option></Select></Field>
              <Field label="Method"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="ota_payout">OTA payout</option></Select></Field>
              <Field label="Reference"><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="Txn / receipt #" /></Field>
            </div>
          </DialogBody>
          <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!(f.amount || due)} onClick={() => { record(b.id, f.amount || due, f.kind, f.method, f.ref); toast.success('Payment recorded'); onClose(); }}>Save payment</Button></DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function ConfirmationDialog({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const org = useOrg()!;
  const send = useStore((s) => s.sendConfirmation);
  const b = bookingId ? org.bookings.find((x) => x.id === bookingId) : undefined;
  return (
    <Dialog open={!!b} onOpenChange={(o) => !o && onClose()}>
      {b && (() => {
        const doc = buildConfirmation(org.org, b, org.guestById(b.guestId), org.resourceById(b.resourceId), paidAmount(org.payments, b.id));
        const g = org.guestById(b.guestId);
        return (
          <DialogContent wide title="Booking confirmation" description={`To ${g?.fullName} · ${g?.email || g?.mobile || 'no contact on file'}`}>
            <DialogBody>
              <div className="rounded-2xl border border-line bg-white">
                <div className="rounded-t-2xl bg-navy-900 px-5 py-4 text-white"><p className="font-display text-lg font-bold">{org.org.name}</p><p className="text-sm text-navy-300">Booking Confirmation</p></div>
                <dl className="divide-y divide-line/70 px-5 py-2">{doc.rows.map(([k, v]) => <div key={k} className="grid grid-cols-[150px_1fr] gap-3 py-2 text-sm"><dt className="text-ink-mute">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>
                <div className="space-y-4 border-t border-line px-5 py-4 text-sm">
                  {[['Payment instructions', doc.paymentInstructions], ['Check-in / service instructions', doc.checkInInstructions], ['Cancellation policy', doc.cancellationPolicy], ['Contact', doc.contact]].map(([t, body]) => <div key={t}><p className="text-xs font-bold uppercase tracking-wide text-brand-700">{t}</p><p className="mt-1 text-ink-soft">{body}</p></div>)}
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(doc.text); toast.success('Copied to clipboard'); }}><Copy />Copy text</Button>
              <Button variant="outline" onClick={() => downloadConfirmationPdf(org.org.name, doc, `confirmation-${b.ref}`)}><Download />PDF</Button>
              {org.can('bookings.message') && <Button onClick={() => { const err = send(b.id); if (err) toast.error(err); else { toast.success('Confirmation sent (mock delivery) and logged'); onClose(); } }}><Send />Send to guest</Button>}
            </DialogFooter>
          </DialogContent>
        );
      })()}
    </Dialog>
  );
}
