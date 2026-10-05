import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, BedDouble, CalendarCheck, CircleDollarSign, Clock, LogIn, Lock, Trophy, Receipt } from 'lucide-react';
import { useOrg } from '@/store/hooks';
import { bookingActions } from '@/store/actions';
import { useStore } from '@/store/store';
import { addDays, eachDay, endOfMonth, fmtDate, fmtShort, nightsBetween, startOfMonth, startOfWeek, fmtLong } from '@/domain/dates';
import { applyFilters, bookingsCreatedIn, channelMix, isRevenue, occupancyByResource, occupancyRate, revenueByDay, revenueInRange } from '@/domain/metrics';
import { buildAttention, type AttentionItem } from '@/domain/attention';
import { conflictedBookingIds } from '@/domain/conflicts';
import { ALL_SOURCES, SOURCE_META } from '@/domain/meta';
import { peso, pct, pesoCompact } from '@/domain/money';
import type { Source } from '@/types';
import { Card, CardHeader, EmptyState } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Kpi } from '@/components/common/Kpi';
import { SourceChip, StatusBadge } from '@/components/common/badges';
import { CalendarLegend, TimelineGrid } from '@/components/calendar/TimelineGrid';
import { QuickView } from '@/components/bookings/QuickView';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Range = 'today' | 'week' | 'month' | 'custom';
const AXIS = { fontSize: 11, fill: '#7a8aa6' };

export default function Dashboard() {
  const org = useOrg()!;
  const nav = useNavigate();
  const requestPayment = useStore((s) => s.requestPayment);
  const [range, setRange] = useState<Range>('week');
  const [custom, setCustom] = useState({ from: org.today, to: addDays(org.today, 6) });
  const [resFilter, setResFilter] = useState('');
  const [srcFilter, setSrcFilter] = useState<'' | Source>('');
  const [quick, setQuick] = useState<string | null>(null);

  const showRevenue = org.can('revenue.view');
  const { start, end } = useMemo(() => {
    if (range === 'today') return { start: org.today, end: addDays(org.today, 1) };
    if (range === 'week') { const s = startOfWeek(org.today); return { start: s, end: addDays(s, 7) }; }
    if (range === 'month') return { start: startOfMonth(org.today), end: addDays(endOfMonth(org.today), 1) };
    const s = custom.from <= custom.to ? custom.from : custom.to; return { start: s, end: addDays(custom.from <= custom.to ? custom.to : custom.from, 1) };
  }, [range, custom, org.today]);

  const filters = useMemo(() => ({ resourceIds: resFilter ? [resFilter] : undefined, sources: srcFilter ? [srcFilter] : undefined }), [resFilter, srcFilter]);
  const bookings = useMemo(() => applyFilters(org.bookings, filters), [org.bookings, filters]);
  const resources = org.resources.filter((r) => !resFilter || r.id === resFilter);
  const conflictIds = useMemo(() => conflictedBookingIds(org.bookings, org.blocks), [org.bookings, org.blocks]);

  const k = useMemo(() => {
    const created = bookingsCreatedIn(bookings, start, end).filter((b) => b.status !== 'cancelled').length;
    const occ = occupancyRate(bookings, resources, org.blocks, start, end);
    const rev = revenueInRange(bookings, start, end);
    const upEnd = end > addDays(org.today, 7) ? end : addDays(org.today, 7);
    const upcoming = bookings.filter((b) => ['pending', 'confirmed'].includes(b.status) && b.checkIn >= org.today && b.checkIn < upEnd).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    const pending = bookings.filter((b) => b.status === 'pending');
    const conflicts = new Set(org.alerts.filter((a) => a.status === 'open' && bookings.some((b) => b.id === a.bookingId)).map((a) => a.bookingId));
    return { created, occ, rev, upcoming, pending, conflicts: conflicts.size };
  }, [bookings, resources, org.blocks, org.alerts, start, end, org.today]);

  const previewStart = startOfWeek(org.today);
  const chartStart = nightsBetween(start, end) >= 7 ? start : addDays(org.today, -13);
  const chartEnd = nightsBetween(start, end) >= 7 ? end : addDays(org.today, 1);
  const revSeries = useMemo(() => revenueByDay(bookings, chartStart, chartEnd), [bookings, chartStart, chartEnd]);
  const occSeries = useMemo(() => occupancyByResource(bookings, resources, org.blocks, start, end), [bookings, resources, org.blocks, start, end]);
  const mix = useMemo(() => channelMix(bookings.filter((b) => b.checkOut > start && b.checkIn < end)), [bookings, start, end]);
  const mixAll = useMemo(() => channelMix(bookings), [bookings]);
  const top = [...occSeries].sort((a, b) => b.revenue - a.revenue)[0];
  const revBookings = bookings.filter((b) => isRevenue(b) && b.checkOut > start && b.checkIn < end);
  const avg = revBookings.length ? revBookings.reduce((s, b) => s + b.totalAmount, 0) / revBookings.length : 0;
  const attention = useMemo(() => buildAttention(org), [org]).filter((i) => !resFilter || org.bookings.find((b) => b.id === i.bookingId)?.resourceId === resFilter);
  const incoming = bookings.filter((b) => ['pending', 'inquiry', 'conflict_review'].includes(b.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const usedMix = useMemo(() => (mix.length ? mix : mixAll), [mix, mixAll]);

  const runAttention = (i: AttentionItem) => {
    if (i.kind === 'unpaid' && i.bookingId && org.can('bookings.message')) { const err = requestPayment(i.bookingId); if (err) toast.error(err); else toast.success('Payment request sent (mock delivery)'); return; }
    nav(i.to);
  };
  const decline = (id: string) => { const out = useStore.getState().cancelBooking(id, 'Declined'); if (out.kind === 'error') toast.error(out.message); else toast.success('Booking declined'); };

  const rangeLabel = range === 'today' ? 'today' : range === 'week' ? 'this week' : range === 'month' ? 'this month' : `${fmtShort(start)} – ${fmtShort(addDays(end, -1))}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-soft">{fmtLong(org.today)}</p>
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{greet}, {org.user.name.split(' ')[0]} 👋</h1>
          <p className="mt-1 text-sm text-ink-soft">Here’s how {org.org.name} is doing {rangeLabel}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-line">
            {([['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Custom']] as [Range, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setRange(v)} className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', range === v ? 'bg-navy-900 text-white' : 'text-ink-soft hover:bg-black/5')}>{l}</button>
            ))}
          </div>
          <Select className="w-44" aria-label="Property" value={resFilter} onChange={(e) => setResFilter(e.target.value)}><option value="">All properties</option>{org.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
          <Select className="w-44" aria-label="Channel" value={srcFilter} onChange={(e) => setSrcFilter(e.target.value as Source | '')}><option value="">All channels</option>{ALL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_META[s].label}</option>)}</Select>
        </div>
      </div>
      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm"><span className="font-semibold text-ink-soft">From</span><Input type="date" className="w-44" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><span className="font-semibold text-ink-soft">to</span><Input type="date" className="w-44" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={range === 'today' ? 'Today’s Bookings' : 'New Bookings'} value={k.created} sub={`created ${rangeLabel}`} icon={CalendarCheck} tone="blue" onClick={() => nav('/bookings')} />
        <Kpi label="Occupancy Rate" value={pct(k.occ)} sub={`${rangeLabel} · confirmed stays`} icon={BedDouble} tone="green" />
        {showRevenue ? <Kpi label={range === 'today' ? 'Revenue Today' : 'Revenue'} value={peso(k.rev)} sub="room revenue per night stayed" icon={CircleDollarSign} tone="green" /> : <Kpi label="Revenue" value={<Lock className="size-6 text-ink-mute" />} sub="Restricted for your role" icon={CircleDollarSign} tone="slate" />}
        <Kpi label="Upcoming Check-ins" value={k.upcoming.length} sub={k.upcoming[0] ? `Next: ${org.guestById(k.upcoming[0].guestId)?.fullName.split(' ')[0]} · ${fmtShort(k.upcoming[0].checkIn)}` : 'none scheduled'} icon={LogIn} tone="blue" onClick={() => nav('/bookings?status=confirmed')} />
        <Kpi label="Pending Confirmations" value={k.pending.length} sub="waiting on staff" icon={Clock} tone="amber" onClick={() => nav('/bookings?status=pending')} />
        <Kpi label="Conflict Alerts" value={k.conflicts} sub={k.conflicts ? 'needs resolving now' : 'all clear'} icon={AlertTriangle} tone={k.conflicts ? 'red' : 'green'} alert={k.conflicts > 0} onClick={() => nav('/calendar')} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Master availability — this week" subtitle="Live from the calendar. Red bars are overlapping reservations." action={<Button asChild variant="subtle" size="sm"><Link to="/calendar">Open calendar <ArrowRight /></Link></Button>} />
          <div className="px-4 pb-4">
            <TimelineGrid compact start={previewStart} days={7} today={org.today} resources={resources} bookings={bookings} blocks={org.blocks} conflictIds={conflictIds} allBookings={org.bookings} allResources={org.allResources} guests={org.guests} onOpenBooking={setQuick} />
            <CalendarLegend className="mt-3" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Needs attention" subtitle={`${attention.length} item${attention.length === 1 ? '' : 's'}`} />
          <div className="max-h-[430px] divide-y divide-line/70 overflow-y-auto scroll-thin">
            {attention.length === 0 && <EmptyState icon={<CalendarCheck />} title="All clear" body="No conflicts, pending items or unread inquiries." />}
            {attention.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-5 py-3">
                <span className={cn('size-2 shrink-0 rounded-full', i.severity === 'urgent' ? 'bg-coral-600' : i.severity === 'action' ? 'bg-warn-500' : 'bg-brand-500')} />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{i.title}</p><p className="truncate text-xs text-ink-soft">{i.detail}</p></div>
                <Button size="sm" variant={i.severity === 'urgent' ? 'danger' : 'outline'} onClick={() => runAttention(i)}>{i.actionLabel}</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Incoming bookings" subtitle="Waiting for a decision" action={<Button asChild variant="ghost" size="sm"><Link to="/bookings">All bookings <ArrowRight /></Link></Button>} />
          {incoming.length === 0 ? <EmptyState icon={<CalendarCheck />} title="Nothing waiting" body="New reservations that need a decision appear here." /> : (
            <div className="divide-y divide-line/70">
              {incoming.map((b) => {
                const g = org.guestById(b.guestId); const r = org.resourceById(b.resourceId);
                return (
                  <div key={b.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5">
                    <div className="min-w-[180px] flex-1">
                      <button className="text-left text-sm font-bold hover:text-brand-700" onClick={() => nav(`/bookings/${b.id}`)}>{g?.fullName}</button>
                      <p className="text-xs text-ink-mute">{r?.name} · {b.adults + b.children} guest{b.adults + b.children > 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-xs"><p className="font-semibold">{fmtShort(b.checkIn)} → {fmtShort(b.checkOut)}</p><p className="text-ink-mute">{nightsBetween(b.checkIn, b.checkOut)} nights</p></div>
                    <div className="flex items-center gap-2"><SourceChip source={b.source} className="!text-xs" /><StatusBadge status={b.status} conflict={conflictIds.has(b.id)} /></div>
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setQuick(b.id)}>Review</Button>
                      {org.can('bookings.confirm') && <Button size="sm" variant="success" onClick={() => bookingActions.confirm(b.id)}>Confirm</Button>}
                      {org.can('bookings.cancel') && <Button size="sm" variant="danger-outline" onClick={() => decline(b.id)}>Decline</Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Channel mix" subtitle="Share of reservations by source" />
          <div className="space-y-3.5 px-5 pb-5">
            {usedMix.length === 0 && <p className="text-sm text-ink-mute">No bookings for these filters.</p>}
            {usedMix.map((g) => (
              <div key={g.key}>
                <div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-sm" style={{ background: g.color }} />{g.label}</span><span className="tabnum text-ink-soft"><b className="text-ink">{pct(g.share)}</b> · {g.count} booking{g.count === 1 ? '' : 's'}</span></div>
                <div className="h-2 rounded-full bg-canvas"><div className="h-2 rounded-full" style={{ width: `${Math.max(3, g.share * 100)}%`, background: g.color }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {showRevenue ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Daily revenue trend" subtitle={`${fmtShort(chartStart)} – ${fmtShort(addDays(chartEnd, -1))} · room revenue per night stayed`} />
            <div className="h-64 px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revSeries} margin={{ left: 4, right: 16, top: 8 }}>
                  <CartesianGrid stroke="#e1e8f2" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => fmtShort(d)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={pesoCompact} tick={AXIS} axisLine={false} tickLine={false} width={52} />
                  <RTooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"><p className="font-semibold">{fmtDate(payload[0].payload.date)}</p><p className="tabnum text-brand-700">{peso(Number(payload[0].value))}</p></div> : null} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.1} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardHeader title="Highlights" subtitle={rangeLabel} />
            <div className="grid gap-3 px-5 pb-5">
              <div className="flex items-center gap-3 rounded-xl bg-ok-50 p-3.5"><Trophy className="size-6 text-ok-700" /><div><p className="text-xs font-semibold text-ok-700">Top-performing property</p><p className="font-display text-lg font-bold">{top && top.revenue > 0 ? top.name : '—'}</p><p className="text-xs text-ink-soft">{top ? `${peso(top.revenue)} · ${pct(top.rate)} occupied` : ''}</p></div></div>
              <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3.5"><Receipt className="size-6 text-brand-700" /><div><p className="text-xs font-semibold text-brand-700">Average booking value</p><p className="font-display text-lg font-bold">{peso(avg)}</p><p className="text-xs text-ink-soft">across {revBookings.length} confirmed stays</p></div></div>
            </div>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Occupancy by property" subtitle={`${rangeLabel} · share of sellable nights occupied (blocked nights excluded)`} />
        <div className="px-2 pb-4" style={{ height: Math.max(180, occSeries.length * 48 + 30) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={occSeries} layout="vertical" margin={{ left: 8, right: 36 }}>
              <CartesianGrid stroke="#e1e8f2" horizontal={false} />
              <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#0f1d3a' }} width={110} axisLine={false} tickLine={false} />
              <RTooltip cursor={{ fill: 'rgba(37,99,235,.06)' }} content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg"><p className="font-semibold">{payload[0].payload.name}</p><p className="tabnum text-brand-700">{pct(Number(payload[0].value), 0)} occupied</p></div> : null} />
              <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={20}>{occSeries.map((o) => <Cell key={o.id} fill="#2563eb" />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <QuickView bookingId={quick} onClose={() => setQuick(null)} />
    </div>
  );
}
