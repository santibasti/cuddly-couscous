import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, Eye, MoreHorizontal, Pencil, Plus, Search, XCircle } from 'lucide-react';
import { useOrg } from '@/store/hooks';
import { useFlow } from '@/store/flow';
import { bookingActions } from '@/store/actions';
import { conflictedBookingIds } from '@/domain/conflicts';
import { fmtDate, nightsBetween, fmtDateTime } from '@/domain/dates';
import { ALL_SOURCES, ALL_STATUSES, PAYMENT_META, SOURCE_META, STATUS_META } from '@/domain/meta';
import { peso } from '@/domain/money';
import { downloadCsv } from '@/lib/export';
import type { BookingStatus, PaymentStatus, Source } from '@/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/bits';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/overlays';
import { PaymentBadge, SourceChip, StatusBadge } from '@/components/common/badges';
import { CancelDialog } from '@/components/bookings/Dialogs';

const PAGE = 15;

export default function Bookings() {
  const org = useOrg()!;
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const openForm = useFlow((s) => s.openForm);
  const [f, setF] = useState({ q: '', status: (sp.get('status') ?? '') as BookingStatus | '', source: '' as Source | '', resource: '', pay: '' as PaymentStatus | '', staff: '', from: '', to: '' });
  const [sort, setSort] = useState<{ k: 'created' | 'checkIn' | 'total'; dir: 1 | -1 }>({ k: 'checkIn', dir: -1 });
  const [page, setPage] = useState(0);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const conflictIds = useMemo(() => conflictedBookingIds(org.bookings, org.blocks), [org.bookings, org.blocks]);

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return org.bookings.filter((b) =>
      (!f.status || b.status === f.status) && (!f.source || b.source === f.source) && (!f.resource || b.resourceId === f.resource) && (!f.staff || b.assignedTo === f.staff) &&
      (!f.pay || org.payStatus(b) === f.pay) && (!f.from || b.checkOut > f.from) && (!f.to || b.checkIn <= f.to) &&
      (!q || `${b.ref} ${org.guestById(b.guestId)?.fullName} ${b.externalRef ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => sort.dir * (sort.k === 'created' ? a.createdAt.localeCompare(b.createdAt) : sort.k === 'checkIn' ? a.checkIn.localeCompare(b.checkIn) : a.totalAmount - b.totalAmount));
  }, [org, f, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF({ ...f, [k]: v }); setPage(0); };
  const sortBy = (k: typeof sort.k) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: -1 }));
  const arrow = (k: typeof sort.k) => (sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : '');

  const exportCsv = () => downloadCsv('bookings', ['Booking ID', 'Guest', 'Property', 'Check-in', 'Check-out', 'Nights', 'Guests', 'Source', 'Total (PHP)', 'Payment', 'Status', 'Assigned', 'Created'],
    rows.map((b) => [b.ref, org.guestById(b.guestId)?.fullName, org.resourceById(b.resourceId)?.name, b.checkIn, b.checkOut, nightsBetween(b.checkIn, b.checkOut), b.adults + b.children, SOURCE_META[b.source].label, b.totalAmount, PAYMENT_META[org.payStatus(b)].label, STATUS_META[b.status].label, org.memberName(b.assignedTo), b.createdAt.slice(0, 10)]));

  return (
    <div>
      <PageHeader title="Bookings" subtitle={`${rows.length} of ${org.bookings.length} reservations`} actions={<>
        <Button variant="outline" onClick={exportCsv}><Download />Export CSV</Button>
        {org.can('bookings.create') && <Button onClick={() => openForm({})}><Plus />New booking</Button>}
      </>} />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" /><Input className="pl-9" placeholder="Search guest, booking ID or channel ref…" value={f.q} onChange={(e) => set('q', e.target.value)} /></div>
        <Select value={f.status} onChange={(e) => set('status', e.target.value as BookingStatus | '')}><option value="">All statuses</option>{ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</Select>
        <Select value={f.source} onChange={(e) => set('source', e.target.value as Source | '')}><option value="">All sources</option>{ALL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_META[s].label}</option>)}</Select>
        <Select value={f.resource} onChange={(e) => set('resource', e.target.value)}><option value="">All properties</option>{org.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        <Select value={f.pay} onChange={(e) => set('pay', e.target.value as PaymentStatus | '')}><option value="">Any payment status</option>{(Object.keys(PAYMENT_META) as PaymentStatus[]).map((p) => <option key={p} value={p}>{PAYMENT_META[p].label}</option>)}</Select>
        <Select value={f.staff} onChange={(e) => set('staff', e.target.value)}><option value="">All staff</option>{org.members.filter((m) => m.role !== 'viewer').map((m) => <option key={m.id} value={m.id}>{org.memberName(m.id)}</option>)}</Select>
        <div className="flex items-center gap-2"><Input type="date" aria-label="Stay from" value={f.from} onChange={(e) => set('from', e.target.value)} /><span className="text-ink-mute">–</span><Input type="date" aria-label="Stay to" value={f.to} onChange={(e) => set('to', e.target.value)} /></div>
      </Card>

      <Card className="overflow-hidden">
        {view.length === 0 ? <EmptyState icon={<Search />} title="No bookings match" body="Try clearing a filter." action={<Button variant="outline" onClick={() => { setF({ q: '', status: '', source: '', resource: '', pay: '', staff: '', from: '', to: '' }); }}>Clear filters</Button>} /> : (
          <Table>
            <thead><tr>
              <Th>Booking ID</Th><Th>Guest</Th><Th>Property</Th><Th><button onClick={() => sortBy('checkIn')}>Check-in{arrow('checkIn')}</button></Th><Th>Check-out</Th><Th>Nights</Th><Th>Guests</Th><Th>Source</Th>
              <Th className="text-right"><button onClick={() => sortBy('total')}>Total{arrow('total')}</button></Th><Th>Payment</Th><Th>Status</Th><Th>Assigned</Th><Th><button onClick={() => sortBy('created')}>Created{arrow('created')}</button></Th><Th />
            </tr></thead>
            <tbody>
              {view.map((b) => (
                <tr key={b.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => nav(`/bookings/${b.id}`)}>
                  <Td className="font-semibold text-brand-700">{b.ref}</Td>
                  <Td className="font-semibold">{org.guestById(b.guestId)?.fullName}</Td>
                  <Td>{org.resourceById(b.resourceId)?.name}</Td>
                  <Td>{fmtDate(b.checkIn)}</Td><Td>{fmtDate(b.checkOut)}</Td>
                  <Td className="tabnum">{nightsBetween(b.checkIn, b.checkOut)}</Td><Td className="tabnum">{b.adults + b.children}</Td>
                  <Td><SourceChip source={b.source} /></Td>
                  <Td className="tabnum text-right font-semibold">{peso(b.totalAmount)}</Td>
                  <Td><PaymentBadge status={org.payStatus(b)} /></Td>
                  <Td><StatusBadge status={b.status} conflict={conflictIds.has(b.id)} /></Td>
                  <Td className="text-ink-soft">{org.memberName(b.assignedTo)}</Td>
                  <Td className="text-ink-mute" title={fmtDateTime(b.createdAt)}>{fmtDate(b.createdAt.slice(0, 10))}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem asChild><Link to={`/bookings/${b.id}`}><Eye />View details</Link></DropdownMenuItem>
                        {org.can('bookings.confirm') && ['pending', 'inquiry', 'conflict_review'].includes(b.status) && <DropdownMenuItem onSelect={() => bookingActions.confirm(b.id)}><CheckCircle2 className="text-ok-600" />Confirm</DropdownMenuItem>}
                        {org.can('bookings.edit') && !['cancelled', 'checked_out', 'no_show'].includes(b.status) && <DropdownMenuItem onSelect={() => openForm({ bookingId: b.id })}><Pencil />Edit</DropdownMenuItem>}
                        {org.can('bookings.cancel') && !['cancelled', 'checked_out', 'no_show'].includes(b.status) && <><DropdownMenuSeparator /><DropdownMenuItem danger onSelect={() => setCancelId(b.id)}><XCircle />Cancel booking</DropdownMenuItem></>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-soft">
          <span>Page {page + 1} of {pages}</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button></div>
        </div>
      </Card>
      <CancelDialog bookingId={cancelId} onClose={() => setCancelId(null)} />
    </div>
  );
}
