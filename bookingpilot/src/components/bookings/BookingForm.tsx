import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, UserRound, X } from 'lucide-react';
import { useFlow } from '@/store/flow';
import { useStore, type BookingDraft } from '@/store/store';
import { useOrg } from '@/store/hooks';
import { bookingActions } from '@/store/actions';
import { addDays, nightsBetween, todayISO } from '@/domain/dates';
import { checkBooking } from '@/domain/conflicts';
import { ALL_SOURCES, SOURCE_META } from '@/domain/meta';
import { peso } from '@/domain/money';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { AvailabilityVerdict } from './ConflictList';
import type { Guest } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function GuestPicker({ guests, value, onChange, error }: { guests: Guest[]; value: string; onChange: (id: string) => void; error?: string }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [nw, setNw] = useState({ fullName: '', mobile: '', email: '', nationality: 'Philippines' });
  const upsertGuest = useStore((s) => s.upsertGuest);
  const selected = guests.find((g) => g.id === value);
  const matches = useMemo(() => (q.trim() ? guests.filter((g) => `${g.fullName} ${g.email} ${g.mobile}`.toLowerCase().includes(q.toLowerCase())).slice(0, 5) : []), [q, guests]);

  if (selected && !creating) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/60 px-3 py-2">
        <div className="flex items-center gap-2.5 text-sm"><UserRound className="size-4 text-brand-600" /><div><p className="font-semibold">{selected.fullName}</p><p className="text-xs text-ink-mute">{selected.mobile || 'no mobile'} · {selected.email || 'no email'}</p></div></div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>Change</Button>
      </div>
    );
  }
  if (creating) {
    return (
      <div className="space-y-2.5 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Input placeholder="Full name *" value={nw.fullName} onChange={(e) => setNw({ ...nw, fullName: e.target.value })} autoFocus />
          <Input placeholder="Mobile (+63…)" value={nw.mobile} onChange={(e) => setNw({ ...nw, mobile: e.target.value })} />
          <Input placeholder="Email" type="email" value={nw.email} onChange={(e) => setNw({ ...nw, email: e.target.value })} />
          <Input placeholder="Nationality" value={nw.nationality} onChange={(e) => setNw({ ...nw, nationality: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
          <Button type="button" size="sm" disabled={!nw.fullName.trim()} onClick={() => { const g = upsertGuest(nw); onChange(g.id); setCreating(false); }}>Save guest</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
        <Input className={cn('pl-9', error && 'border-coral-500')} placeholder="Search guest by name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {matches.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          {matches.map((g) => (
            <button key={g.id} type="button" onClick={() => { onChange(g.id); setQ(''); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50">
              <span className="font-semibold">{g.fullName}</span><span className="text-xs text-ink-mute">{g.mobile || g.email}</span>
            </button>
          ))}
        </div>
      )}
      <Button type="button" variant="subtle" size="sm" onClick={() => { setCreating(true); setNw({ ...nw, fullName: q }); }}><Plus />New guest</Button>
      {error && <p className="text-xs font-medium text-coral-600">{error}</p>}
    </div>
  );
}

export function BookingFormHost() {
  const form = useFlow((s) => s.form);
  const close = useFlow((s) => s.closeForm);
  return <Dialog open={!!form} onOpenChange={(o) => !o && close()}>{form && <BookingFormInner key={JSON.stringify([form.bookingId, form.prefill, form.conversationId])} />}</Dialog>;
}

function BookingFormInner() {
  const form = useFlow((s) => s.form)!;
  const close = useFlow((s) => s.closeForm);
  const org = useOrg()!;
  const db = useStore((s) => s.db);
  const existing = form.bookingId ? org.bookings.find((b) => b.id === form.bookingId) : undefined;
  const today = todayISO(org.org.timezone);

  const initial = useMemo(() => {
    const roomItem = existing?.items[0];
    const extrasItems = existing?.items.slice(1) ?? [];
    const res = org.resources[0];
    const pre = form.prefill ?? {};
    const resourceId = pre.resourceId ?? existing?.resourceId ?? res?.id ?? '';
    const r = org.resourceById(resourceId);
    const checkIn = pre.checkIn ?? existing?.checkIn ?? today;
    const checkOut = pre.checkOut ?? existing?.checkOut ?? addDays(checkIn, Math.max(1, r?.minStay ?? 1));
    return {
      guestId: pre.guestId ?? existing?.guestId ?? '', resourceId, checkIn, checkOut,
      adults: pre.adults ?? existing?.adults ?? 2, children: pre.children ?? existing?.children ?? 0,
      source: pre.source ?? existing?.source ?? 'manual', externalRef: pre.externalRef ?? existing?.externalRef ?? '',
      rate: pre.items?.[0]?.unitPrice ?? roomItem?.unitPrice ?? r?.baseRate ?? 0,
      extrasDesc: pre.items?.[1]?.description ?? extrasItems[0]?.description ?? '',
      extras: pre.items?.slice(1).reduce((s, i) => s + i.quantity * i.unitPrice, 0) ?? extrasItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
      deposit: pre.depositAmount ?? existing?.depositAmount ?? null as number | null,
      assignedTo: pre.assignedTo ?? existing?.assignedTo ?? org.member.id,
      notes: pre.notes ?? existing?.notes ?? '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [f, setF] = useState(initial);
  const [rateTouched, setRateTouched] = useState(!!existing || !!form.prefill?.items);
  const [depTouched, setDepTouched] = useState(initial.deposit !== null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const resource = org.resourceById(f.resourceId);
  const nights = nightsBetween(f.checkIn, f.checkOut);
  const total = nights * f.rate + (Number(f.extras) || 0);
  const deposit = depTouched ? (f.deposit ?? 0) : Math.round((total * org.org.depositPercent) / 100 / 50) * 50;

  useEffect(() => { if (!rateTouched && resource) setF((x) => ({ ...x, rate: resource.baseRate })); }, [f.resourceId, rateTouched, resource]);

  const ctx = useMemo(() => ({ resources: org.allResources, bookings: db.bookings.filter((b) => b.orgId === org.org.id), blocks: db.blocks.filter((b) => b.orgId === org.org.id) }), [db, org.allResources, org.org.id]);
  const cand = { id: existing?.id, guestId: f.guestId || undefined, resourceId: f.resourceId, checkIn: f.checkIn, checkOut: f.checkOut, adults: f.adults, children: f.children, source: f.source, externalRef: f.externalRef || undefined };
  const validDates = f.checkIn && f.checkOut && f.checkOut > f.checkIn;
  const report = useMemo(() => (validDates ? checkBooking(cand, ctx) : null), [f.guestId, f.resourceId, f.checkIn, f.checkOut, f.adults, f.children, f.source, f.externalRef, ctx]); // eslint-disable-line
  const availability = (rid: string) => (validDates ? checkBooking({ ...cand, resourceId: rid }, ctx).ok : true);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const build = (status: BookingDraft['status']): BookingDraft | null => {
    const e: Record<string, string> = {};
    if (!f.guestId) e.guest = 'Choose or create a guest.';
    if (!f.resourceId) e.resource = 'Choose a property / resource.';
    if (!validDates) e.dates = 'Check-out must be after check-in.';
    if (f.adults < 1) e.adults = 'At least 1 adult.';
    setErrors(e);
    if (Object.keys(e).length) return null;
    const items = [{ id: existing?.items[0]?.id ?? 'bi-room', description: `${resource?.name} · ${nights} ${['vehicle', 'equipment', 'service_crew'].includes(resource?.type ?? '') ? 'day' : 'night'}${nights === 1 ? '' : 's'}`, quantity: nights, unitPrice: f.rate }];
    if (Number(f.extras) > 0) items.push({ id: existing?.items[1]?.id ?? 'bi-extras', description: f.extrasDesc || 'Extras / fees', quantity: 1, unitPrice: Number(f.extras) });
    return {
      id: existing?.id, guestId: f.guestId, resourceId: f.resourceId, checkIn: f.checkIn, checkOut: f.checkOut, adults: f.adults, children: f.children, source: f.source,
      externalRef: f.externalRef || undefined, status, items, depositAmount: deposit, assignedTo: f.assignedTo, notes: f.notes, conversationId: form.conversationId,
    };
  };
  const submit = (status: BookingDraft['status']) => {
    const d = build(status);
    if (!d) { toast.error('Please fix the highlighted fields.'); return; }
    close();
    bookingActions.save(d, status === 'confirmed' ? `Confirmed — availability check passed` : existing ? 'Booking updated' : `Booking created as ${status}`);
  };

  const canConfirm = org.can('bookings.confirm');
  const staffOptions = org.members.filter((m) => m.role !== 'viewer');
  const isOta = ['booking_com', 'agoda', 'airbnb', 'ical'].includes(f.source);
  const editingFinal = existing && ['checked_in'].includes(existing.status);

  return (
    <DialogContent wide title={existing ? `Edit booking ${existing.ref}` : 'New booking'} description={existing ? 'Changes are re-checked against availability before they are saved.' : 'Availability is checked live as you type. Nothing is confirmed until it passes.'} className="md:max-w-4xl">
      <DialogBody>
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="space-y-4">
            <Field label="Guest" error={errors.guest}><GuestPicker guests={org.guests} value={f.guestId} onChange={(id) => set('guestId', id)} /></Field>
            <Field label="Property / resource" error={errors.resource}>
              <Select value={f.resourceId} onChange={(e) => set('resourceId', e.target.value)}>
                {org.resources.map((r) => <option key={r.id} value={r.id}>{availability(r.id) ? '● ' : '○ '}{r.name} — {peso(r.baseRate)}{availability(r.id) ? '' : ' (not available)'}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check-in"><Input type="date" value={f.checkIn} onChange={(e) => { const v = e.target.value; setF((x) => ({ ...x, checkIn: v, checkOut: x.checkOut <= v ? addDays(v, Math.max(1, nights || resource?.minStay || 1)) : x.checkOut })); }} /></Field>
              <Field label="Check-out" error={errors.dates} hint={validDates ? `${nights} night${nights === 1 ? '' : 's'}` : undefined}><Input type="date" min={addDays(f.checkIn, 1)} value={f.checkOut} onChange={(e) => set('checkOut', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Adults" error={errors.adults}><Input type="number" min={1} value={f.adults} onChange={(e) => set('adults', Number(e.target.value))} /></Field>
              <Field label="Children"><Input type="number" min={0} value={f.children} onChange={(e) => set('children', Number(e.target.value))} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Booking source"><Select value={f.source} onChange={(e) => set('source', e.target.value as typeof f.source)}>{ALL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_META[s].label}</option>)}</Select></Field>
              <Field label="Assigned staff"><Select value={f.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>{staffOptions.map((m) => <option key={m.id} value={m.id}>{org.memberName(m.id)}</option>)}</Select></Field>
            </div>
            {isOta && <Field label="Channel reservation #" hint="Used to detect duplicate imports."><Input value={f.externalRef} onChange={(e) => set('externalRef', e.target.value)} placeholder="e.g. BDC-4410231" /></Field>}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-canvas/50 p-4">
              <p className="mb-3 font-display text-sm font-bold">Pricing</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Rate per ${['vehicle', 'equipment', 'service_crew'].includes(resource?.type ?? '') ? 'day' : 'night'} (₱)`}><Input type="number" min={0} value={f.rate} onChange={(e) => { setRateTouched(true); set('rate', Number(e.target.value)); }} /></Field>
                <Field label="Extras / fees (₱)"><Input type="number" min={0} value={f.extras} onChange={(e) => set('extras', Number(e.target.value))} /></Field>
              </div>
              {f.extras > 0 && <Input className="mt-3" placeholder="Describe extras (airport transfer, cleaning…)" value={f.extrasDesc} onChange={(e) => set('extrasDesc', e.target.value)} />}
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm"><span className="text-ink-soft">{nights || 0} × {peso(f.rate)}{f.extras > 0 ? ` + ${peso(f.extras)}` : ''}</span><b className="tabnum font-display text-lg">{peso(total)}</b></div>
              <Field className="mt-3" label={`Deposit (₱) — default ${org.org.depositPercent}%`}><Input type="number" min={0} value={deposit} onChange={(e) => { setDepTouched(true); set('deposit', Number(e.target.value)); }} /></Field>
            </div>
            <AvailabilityVerdict report={report} />
            <Field label="Notes"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Special requests, arrival time, payment agreements…" /></Field>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close}><X />Close</Button>
        {existing ? (
          <>
            {existing.status !== 'confirmed' && !editingFinal && canConfirm && <Button variant="success" onClick={() => submit('confirmed')}>Save &amp; confirm</Button>}
            <Button onClick={() => submit(existing.status === 'confirmed' ? 'confirmed' : existing.status === 'inquiry' ? 'inquiry' : 'pending')}>Save changes</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => submit('pending')}>Save as pending</Button>
            {canConfirm && <Button variant="success" onClick={() => submit('confirmed')}>Save &amp; confirm</Button>}
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
