import { ExternalLink, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { useOrg } from '@/store/hooks';
import { useFlow } from '@/store/flow';
import { bookingActions } from '@/store/actions';
import { fmtDate, nightsBetween } from '@/domain/dates';
import { paidAmount } from '@/domain/metrics';
import { peso } from '@/domain/money';
import { conflictedBookingIds } from '@/domain/conflicts';
import { PaymentBadge, SourceChip, StatusBadge } from '@/components/common/badges';

export function QuickView({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const org = useOrg()!;
  const openForm = useFlow((s) => s.openForm);
  const b = bookingId ? org.bookings.find((x) => x.id === bookingId) : undefined;
  return (
    <Dialog open={!!b} onOpenChange={(o) => !o && onClose()}>
      {b && (() => {
        const g = org.guestById(b.guestId); const r = org.resourceById(b.resourceId);
        const paid = paidAmount(org.payments, b.id);
        const conflict = conflictedBookingIds(org.bookings, org.blocks).has(b.id);
        const row = (k: string, v: React.ReactNode) => <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 text-sm last:border-0"><span className="text-ink-mute">{k}</span><span className="text-right font-semibold">{v}</span></div>;
        return (
          <DialogContent side title={g?.fullName ?? 'Booking'} description={`${b.ref} · ${r?.name}`}>
            <DialogBody>
              <div className="mb-3 flex flex-wrap gap-2"><StatusBadge status={b.status} conflict={conflict} /><PaymentBadge status={org.payStatus(b)} /></div>
              {row('Property', r?.name)}
              {row('Check-in', fmtDate(b.checkIn))}{row('Check-out', fmtDate(b.checkOut))}
              {row('Length of stay', `${nightsBetween(b.checkIn, b.checkOut)} nights`)}
              {row('Guests', `${b.adults} adult${b.adults > 1 ? 's' : ''}${b.children ? `, ${b.children} child${b.children > 1 ? 'ren' : ''}` : ''}`)}
              {row('Source', <SourceChip source={b.source} />)}
              {row('Total', peso(b.totalAmount))}
              {row('Paid', peso(paid))}
              {row('Assigned to', org.memberName(b.assignedTo))}
              {b.notes && <p className="mt-3 rounded-lg bg-canvas p-3 text-sm text-ink-soft">{b.notes}</p>}
            </DialogBody>
            <DialogFooter>
              {org.can('bookings.edit') && !['cancelled', 'checked_out', 'no_show'].includes(b.status) && <Button variant="outline" onClick={() => { onClose(); openForm({ bookingId: b.id }); }}><Pencil />Edit</Button>}
              {org.can('bookings.confirm') && ['pending', 'inquiry', 'conflict_review'].includes(b.status) && <Button variant="success" onClick={() => { bookingActions.confirm(b.id); onClose(); }}>Confirm</Button>}
              <Button asChild><Link to={`/bookings/${b.id}`} onClick={onClose}><ExternalLink />Open details</Link></Button>
            </DialogFooter>
          </DialogContent>
        );
      })()}
    </Dialog>
  );
}
