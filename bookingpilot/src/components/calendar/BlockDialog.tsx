import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { BLOCK_REASONS } from '@/domain/meta';
import { addDays } from '@/domain/dates';
import type { BlockReason } from '@/types';
import { BLOCK_LABEL } from '@/domain/conflicts';
import { fmtRange } from '@/domain/dates';

export function BlockDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { resourceId?: string; startDate?: string } }) {
  const org = useOrg()!;
  const addBlock = useStore((s) => s.addBlock);
  const start = initial?.startDate ?? org.today;
  const [f, setF] = useState({ resourceId: initial?.resourceId ?? org.resources[0]?.id ?? '', startDate: start, endDate: addDays(start, 3), reason: 'maintenance' as BlockReason, note: '' });
  const [err, setErr] = useState('');
  const submit = () => {
    const out = addBlock(f);
    if (!out.ok) { setErr(out.message); return; }
    toast.success('Dates blocked'); onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Block dates" description="Blocked dates cannot be booked by any channel. Use it for maintenance, owner use, renovation or private events.">
        <DialogBody className="space-y-4">
          <Field label="Property / resource"><Select value={f.resourceId} onChange={(e) => setF({ ...f, resourceId: e.target.value })}>{org.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Blocked from"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
            <Field label="Available again on"><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
          </div>
          <Field label="Reason"><Select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value as BlockReason })}>{BLOCK_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
          <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Re-painting the deck" /></Field>
          {err && <p className="rounded-lg bg-coral-50 p-3 text-sm font-medium text-coral-700">{err}</p>}
        </DialogBody>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit}>Block dates</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BlockDetail({ blockId, onClose }: { blockId: string | null; onClose: () => void }) {
  const org = useOrg()!;
  const remove = useStore((s) => s.removeBlock);
  const bl = org.blocks.find((b) => b.id === blockId);
  return (
    <Dialog open={!!bl} onOpenChange={(o) => !o && onClose()}>
      {bl && (
        <DialogContent title={`${BLOCK_LABEL[bl.reason]} — ${org.resourceById(bl.resourceId)?.name}`} description={fmtRange(bl.startDate, bl.endDate)}>
          <DialogBody><p className="text-sm text-ink-soft">{bl.note || 'No note.'}</p><p className="mt-2 text-xs text-ink-mute">Created by {org.memberName(bl.createdBy)}</p></DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {org.can('calendar.block') && <Button variant="danger-outline" onClick={() => { remove(bl.id); toast.success('Dates released'); onClose(); }}>Release these dates</Button>}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
