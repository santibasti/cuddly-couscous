import { AlertTriangle, Ban, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { Conflict, ConflictReport } from '@/domain/conflicts';
import { BLOCK_LABEL, CONFLICT_LABEL } from '@/domain/conflicts';
import { fmtDate } from '@/domain/dates';
import { useOrg } from '@/store/hooks';
import { Badge } from '@/components/ui/bits';
import { SourceChip, StatusBadge } from '@/components/common/badges';
import { useStore } from '@/store/store';

export function ConflictItem({ c }: { c: Conflict }) {
  const org = useOrg();
  const block = useStore((s) => s.db.blocks.find((b) => b.id === c.blockId));
  const other = org?.bookings.find((b) => b.id === c.otherBookingId) ?? useStore.getState().db.bookings.find((b) => b.id === c.otherBookingId);
  const guest = other ? useStore.getState().db.guests.find((g) => g.id === other.guestId) : undefined;
  return (
    <div className="rounded-xl border border-coral-100 bg-coral-50/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-coral-700">
          {c.severity === 'hard' ? <Ban className="size-4" /> : <ShieldAlert className="size-4" />}
          {CONFLICT_LABEL[c.kind]}
        </p>
        <Badge tone={c.severity === 'hard' ? 'red' : 'amber'}>{c.severity === 'hard' ? 'Cannot be overridden' : 'Manager can approve an exception'}</Badge>
      </div>
      <p className="mt-1.5 text-sm text-ink">{c.message}</p>
      {other && (
        <div className="mt-2.5 grid gap-x-4 gap-y-1 rounded-lg bg-white p-3 text-xs text-ink-soft ring-1 ring-coral-100 sm:grid-cols-2">
          <span><b className="text-ink">{other.ref}</b> · {guest?.fullName ?? 'Guest'}</span>
          <span className="flex items-center gap-2"><SourceChip source={other.source} /><StatusBadge status={other.status} /></span>
          <span>{fmtDate(other.checkIn)} → {fmtDate(other.checkOut)}</span>
          <span>{other.adults + other.children} guests</span>
        </div>
      )}
      {block && (
        <div className="mt-2.5 rounded-lg bg-white p-3 text-xs text-ink-soft ring-1 ring-coral-100">
          <b className="text-ink">{BLOCK_LABEL[block.reason]}</b> · {fmtDate(block.startDate)} → {fmtDate(block.endDate)}{block.note ? ` · ${block.note}` : ''}
        </div>
      )}
    </div>
  );
}

/** Live availability verdict shown while a booking is being edited. */
export function AvailabilityVerdict({ report }: { report: ConflictReport | null }) {
  if (!report) return null;
  if (report.ok) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-ok-100 bg-ok-50 px-3.5 py-3 text-sm font-semibold text-ok-700">
        <CheckCircle2 className="size-5" /> Available — no conflicts for these dates.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold text-coral-700"><AlertTriangle className="size-4" /> {report.conflicts.length} issue{report.conflicts.length > 1 ? 's' : ''} — this booking cannot be confirmed as entered</div>
      {report.conflicts.map((c, i) => <ConflictItem key={i} c={c} />)}
    </div>
  );
}
