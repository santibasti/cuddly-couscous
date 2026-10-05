import { AlertTriangle } from 'lucide-react';
import type { BookingStatus, PaymentStatus, Source } from '@/types';
import { PAYMENT_META, SOURCE_META, STATUS_META } from '@/domain/meta';
import { Badge } from '@/components/ui/bits';

export const StatusBadge = ({ status, conflict }: { status: BookingStatus; conflict?: boolean }) => {
  if (conflict && status !== 'cancelled') return <Badge tone="red" dot><AlertTriangle className="size-3" />{status === 'conflict_review' ? 'Conflict Review' : `${STATUS_META[status].label} · Conflict`}</Badge>;
  return <Badge tone={STATUS_META[status].tone} dot>{STATUS_META[status].label}</Badge>;
};
export const PaymentBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={PAYMENT_META[status].tone}>{PAYMENT_META[status].label}</Badge>;
export const SourceChip = ({ source, className }: { source: Source; className?: string }) => (
  <span className={`inline-flex items-center gap-1.5 text-sm font-medium text-ink ${className ?? ''}`}>
    <span className="size-2.5 rounded-sm" style={{ background: SOURCE_META[source].color }} />
    {SOURCE_META[source].short}
  </span>
);
