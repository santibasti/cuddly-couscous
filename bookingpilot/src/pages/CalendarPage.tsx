import { useMemo, useState } from 'react';
import { Ban, ChevronLeft, ChevronRight, Filter, Plus, Search } from 'lucide-react';
import { useOrg } from '@/store/hooks';
import { useFlow } from '@/store/flow';
import { bookingActions } from '@/store/actions';
import { addDays, addMonths, fmtLong, fmtMonth, fmtRange, startOfMonth, startOfWeek } from '@/domain/dates';
import { conflictedBookingIds } from '@/domain/conflicts';
import { ALL_SOURCES, ALL_STATUSES, SOURCE_META, STATUS_META } from '@/domain/meta';
import type { BookingStatus, Source } from '@/types';
import { Button } from '@/components/ui/button';
import { Input, Select, Switch } from '@/components/ui/form';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/overlays';
import { PageHeader } from '@/components/ui/bits';
import { CalendarLegend, TimelineGrid } from '@/components/calendar/TimelineGrid';
import { AgendaView, DayView, MonthView } from '@/components/calendar/OtherViews';
import { BlockDetail, BlockDialog } from '@/components/calendar/BlockDialog';
import { QuickView } from '@/components/bookings/QuickView';
import { useIsMobile } from '@/lib/useMedia';

type View = 'day' | 'week' | 'month' | 'timeline' | 'agenda';

export default function CalendarPage() {
  const org = useOrg()!;
  const openForm = useFlow((s) => s.openForm);
  const mobile = useIsMobile();
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'agenda' : 'week'));
  const [anchor, setAnchor] = useState(org.today);
  const [filters, setFilters] = useState({ resource: '', source: '' as '' | Source, status: '' as '' | BookingStatus, staff: '', q: '', conflictsOnly: false, showCancelled: false });
  const [showFilters, setShowFilters] = useState(false);
  const [quick, setQuick] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState<null | { resourceId?: string; startDate?: string }>(null);
  const [blockDetail, setBlockDetail] = useState<string | null>(null);

  const conflictIds = useMemo(() => conflictedBookingIds(org.bookings, org.blocks), [org.bookings, org.blocks]);
  const canEdit = org.can('bookings.create');
  const resources = org.resources.filter((r) => !filters.resource || r.id === filters.resource);
  const resIds = new Set(resources.map((r) => r.id));
  const guestMatch = (gid: string) => org.guestById(gid)?.fullName.toLowerCase().includes(filters.q.toLowerCase());
  const bookings = useMemo(() => org.bookings.filter((b) =>
    resIds.has(b.resourceId) && (filters.showCancelled || (b.status !== 'cancelled' && b.status !== 'no_show')) &&
    (!filters.source || b.source === filters.source) && (!filters.status || b.status === filters.status) && (!filters.staff || b.assignedTo === filters.staff) &&
    (!filters.conflictsOnly || conflictIds.has(b.id)) &&
    (!filters.q || guestMatch(b.guestId) || b.ref.toLowerCase().includes(filters.q.toLowerCase()))), // eslint-disable-next-line react-hooks/exhaustive-deps
  [org.bookings, filters, conflictIds, org.guests]);
  const blocks = org.blocks.filter((b) => resIds.has(b.resourceId));
  const openConflicts = org.alerts.filter((a) => a.status === 'open');

  const step = (dir: 1 | -1) => setAnchor((a) => view === 'day' ? addDays(a, dir) : view === 'week' ? addDays(a, 7 * dir) : view === 'month' ? addMonths(a, dir) : addDays(a, 14 * dir));
  const label = view === 'day' ? fmtLong(anchor) : view === 'month' ? fmtMonth(anchor) : view === 'week' ? fmtRange(startOfWeek(anchor), addDays(startOfWeek(anchor), 6)) : fmtRange(anchor, addDays(anchor, view === 'timeline' ? 29 : 13));

  const create = (resourceId: string | undefined, checkIn: string, checkOut: string) => {
    const r = resourceId ? org.resourceById(resourceId) : undefined;
    const nights = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000;
    const out = r && nights === 1 && r.minStay > 1 ? addDays(checkIn, r.minStay) : checkOut;
    openForm({ prefill: { resourceId, checkIn, checkOut: out } });
  };
  const common = { today: org.today, bookings, blocks, resources, guests: org.guests, conflictIds, onOpenBooking: setQuick, onCreate: create, canEdit };
  const activeFilters = [filters.resource, filters.source, filters.status, filters.staff, filters.q, filters.conflictsOnly && 'c', filters.showCancelled && 's'].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Master Calendar" subtitle="Every channel, one source of truth. Drag a booking to move it, drag across empty dates to create one."
        actions={<>
          {org.can('calendar.block') && <Button variant="outline" onClick={() => setBlockOpen({})}><Ban />Block dates</Button>}
          {canEdit && <Button onClick={() => openForm({})}><Plus />New booking</Button>}
        </>} />

      {openConflicts.length > 0 && (
        <button type="button" onClick={() => setFilters({ ...filters, conflictsOnly: !filters.conflictsOnly })} className="flex w-full items-center justify-between rounded-xl border border-coral-100 bg-coral-50 px-4 py-2.5 text-left text-sm font-semibold text-coral-700">
          <span>⚠ {openConflicts.length} unresolved conflict{openConflicts.length > 1 ? 's' : ''} on the calendar</span>
          <span className="text-xs underline">{filters.conflictsOnly ? 'Show everything' : 'Show only conflicts'}</span>
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(org.today)}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Next"><ChevronRight /></Button>
          <h2 className="ml-2 font-display text-base font-bold sm:text-lg">{label}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={(v) => { setView(v as View); if (v === 'month') setAnchor(startOfMonth(anchor)); }}>
            <TabsList>
              {(['day', 'week', 'month', 'timeline', 'agenda'] as View[]).map((v) => <TabsTrigger key={v} value={v} className="capitalize">{v}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <Button variant={activeFilters ? 'subtle' : 'outline'} onClick={() => setShowFilters((s) => !s)}><Filter />Filters{activeFilters ? ` (${activeFilters})` : ''}</Button>
        </div>
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" /><Input className="pl-9" placeholder="Guest name or booking ref" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></div>
          <Select value={filters.resource} onChange={(e) => setFilters({ ...filters, resource: e.target.value })}><option value="">All properties</option>{org.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
          <Select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value as Source | '' })}><option value="">All sources</option>{ALL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_META[s].label}</option>)}</Select>
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as BookingStatus | '' })}><option value="">All statuses</option>{ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</Select>
          <Select value={filters.staff} onChange={(e) => setFilters({ ...filters, staff: e.target.value })}><option value="">All staff</option>{org.members.filter((m) => m.role !== 'viewer').map((m) => <option key={m.id} value={m.id}>{org.memberName(m.id)}</option>)}</Select>
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={filters.showCancelled} onCheckedChange={(v) => setFilters({ ...filters, showCancelled: v })} />Show cancelled</label>
          <div className="sm:col-span-2 lg:col-span-5 flex justify-end"><Button variant="ghost" size="sm" onClick={() => setFilters({ resource: '', source: '', status: '', staff: '', q: '', conflictsOnly: false, showCancelled: false })}>Clear filters</Button></div>
        </div>
      )}

      <CalendarLegend />

      {(view === 'week' || view === 'timeline') && (
        <TimelineGrid
          start={view === 'week' ? startOfWeek(anchor) : anchor} days={view === 'week' ? 7 : 30} cellWidth={view === 'timeline' ? 46 : undefined}
          today={org.today} resources={resources} bookings={bookings} blocks={blocks} conflictIds={conflictIds} allBookings={org.bookings} allResources={org.allResources} guests={org.guests}
          canEdit={canEdit} onOpenBooking={setQuick} onOpenBlock={setBlockDetail}
          onCreate={(rid, a, b) => create(rid, a, b)}
          onMove={(id, rid, ci) => bookingActions.move(id, rid, ci)}
        />
      )}
      {view === 'month' && <MonthView anchor={anchor} {...common} />}
      {view === 'day' && <DayView date={anchor} {...common} />}
      {view === 'agenda' && <AgendaView start={anchor} days={mobile ? 14 : 21} {...common} />}

      {(view === 'week' || view === 'timeline') && mobile && <p className="text-center text-xs text-ink-mute">Tip: the Agenda view is easier on a phone.</p>}

      <QuickView bookingId={quick} onClose={() => setQuick(null)} />
      {blockOpen && <BlockDialog open onClose={() => setBlockOpen(null)} initial={blockOpen} />}
      <BlockDetail blockId={blockDetail} onClose={() => setBlockDetail(null)} />
    </div>
  );
}
