import { useMemo } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BedDouble, Hammer, Plus } from 'lucide-react';
import type { BlockedDate, Booking, Guest, Resource } from '@/types';
import { addDays, dayOfWeek, endOfMonth, fmtLong, fmtShort, fmtWeekday, startOfMonth, startOfWeek, eachDay, rangesOverlap } from '@/domain/dates';
import { BLOCK_LABEL, holdsDates } from '@/domain/conflicts';
import { SOURCE_META } from '@/domain/meta';
import { StatusBadge, SourceChip } from '@/components/common/badges';
import { Card, EmptyState } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Common {
  today: string; bookings: Booking[]; blocks: BlockedDate[]; resources: Resource[]; guests: Guest[]; conflictIds: Set<string>;
  onOpenBooking: (id: string) => void; onCreate?: (resourceId: string | undefined, checkIn: string, checkOut: string) => void; canEdit?: boolean;
}
const gname = (guests: Guest[], id: string) => guests.find((g) => g.id === id)?.fullName ?? 'Guest';
const live = (b: Booking) => b.status !== 'cancelled' && b.status !== 'no_show';

export function MonthView({ anchor, ...c }: Common & { anchor: string }) {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil((eachDay(first, addDays(endOfMonth(anchor), 1)).length + (dayOfWeek(first) + 6) % 7) / 7);
  const days = eachDay(gridStart, addDays(gridStart, weeks * 7));
  const resName = (id: string) => c.resources.find((r) => r.id === id)?.name ?? '';
  const single = c.resources.length === 1 ? c.resources[0].id : undefined;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="grid grid-cols-7 border-b border-line bg-canvas/70 text-center text-[11px] font-bold uppercase tracking-wide text-ink-mute">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.slice(0, 7) === first.slice(0, 7);
          const list = c.bookings.filter((b) => live(b) && b.checkIn <= d && b.checkOut > d);
          return (
            <div key={d} onClick={() => c.canEdit && c.onCreate?.(single, d, addDays(d, 1))} className={cn('min-h-28 border-b border-r border-line/70 p-1.5 last:border-r-0', !inMonth && 'bg-canvas/50', c.canEdit && 'cursor-pointer hover:bg-brand-50/40')}>
              <div className={cn('mb-1 flex size-6 items-center justify-center rounded-full text-xs font-bold', d === c.today ? 'bg-brand-600 text-white' : inMonth ? 'text-ink' : 'text-ink-mute')}>{Number(d.slice(8))}</div>
              <div className="space-y-1">
                {list.slice(0, 3).map((b) => {
                  const conflict = c.conflictIds.has(b.id) || b.status === 'conflict_review';
                  return (
                    <button key={b.id} type="button" onClick={(e) => { e.stopPropagation(); c.onOpenBooking(b.id); }} title={`${gname(c.guests, b.guestId)} · ${resName(b.resourceId)}`}
                      className={cn('flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold text-white', b.status === 'pending' && 'bar-pending outline-1 -outline-offset-1 outline-dashed outline-warn-500', conflict && 'ring-2 ring-coral-500')} style={{ background: SOURCE_META[b.source].color }}>
                      {conflict && <AlertTriangle className="size-3 shrink-0" />}<span className="truncate">{gname(c.guests, b.guestId).split(' ')[0]} · {resName(b.resourceId)}</span>
                    </button>
                  );
                })}
                {list.length > 3 && <p className="px-1 text-[11px] font-semibold text-ink-mute">+{list.length - 3} more</p>}
                {c.blocks.some((bl) => bl.startDate <= d && bl.endDate > d) && <p className="flex items-center gap-1 px-1 text-[10px] font-semibold text-slate-600"><Hammer className="size-3" />Blocked</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DayView({ date, ...c }: Common & { date: string }) {
  return (
    <div className="space-y-3">
      <p className="font-display text-lg font-bold">{fmtLong(date)}</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {c.resources.map((r) => {
          const mine = c.bookings.filter((b) => b.resourceId === r.id && live(b));
          const inHouse = mine.find((b) => b.checkIn <= date && b.checkOut > date && holdsDates(b.status));
          const arriving = mine.filter((b) => b.checkIn === date);
          const leaving = mine.filter((b) => b.checkOut === date);
          const block = c.blocks.find((bl) => bl.resourceId === r.id && bl.startDate <= date && bl.endDate > date);
          const clash = mine.filter((b) => b.checkIn <= date && b.checkOut > date).length > 1;
          const state = r.status !== 'available' ? { l: 'Unavailable', c: 'bg-slate-100 text-slate-700' } : block ? { l: BLOCK_LABEL[block.reason], c: 'bg-slate-700 text-white' } : clash ? { l: 'Conflict', c: 'bg-coral-600 text-white' } : inHouse ? { l: 'Occupied', c: 'bg-brand-50 text-brand-700' } : { l: 'Available', c: 'bg-ok-50 text-ok-700' };
          return (
            <Card key={r.id} className={cn('p-4', clash && 'ring-2 ring-coral-500')}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-display font-bold"><span className="size-2.5 rounded-full" style={{ background: r.color }} />{r.name}</p>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', state.c)}>{state.l}</span>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {mine.filter((b) => (b.checkIn <= date && b.checkOut > date) || b.checkOut === date).map((b) => (
                  <button key={b.id} type="button" onClick={() => c.onOpenBooking(b.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left hover:bg-brand-50/50">
                    <span><b>{gname(c.guests, b.guestId)}</b><span className="block text-xs text-ink-mute">{b.checkOut === date ? 'Checks out today' : b.checkIn === date ? 'Checks in today' : `${fmtShort(b.checkIn)} → ${fmtShort(b.checkOut)}`} · {SOURCE_META[b.source].short}</span></span>
                    <StatusBadge status={b.status} conflict={c.conflictIds.has(b.id)} />
                  </button>
                ))}
                {!inHouse && !arriving.length && !leaving.length && !block && r.status === 'available' && <p className="text-xs text-ink-mute">Free tonight · {r.minStay}-night minimum</p>}
              </div>
              <div className="mt-3 flex gap-3 text-xs text-ink-soft"><span className="flex items-center gap-1"><ArrowDownToLine className="size-3.5 text-ok-600" />{arriving.length} arriving</span><span className="flex items-center gap-1"><ArrowUpFromLine className="size-3.5 text-warn-600" />{leaving.length} departing</span></div>
              {c.canEdit && r.status === 'available' && !block && <Button variant="subtle" size="sm" className="mt-3" onClick={() => c.onCreate?.(r.id, date, addDays(date, Math.max(1, r.minStay)))}><Plus />Book {r.name}</Button>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaView({ start, days, ...c }: Common & { start: string; days: number }) {
  const list = useMemo(() => {
    const out: { date: string; events: { b: Booking; type: 'in' | 'out' }[]; inHouse: Booking[]; blocks: BlockedDate[] }[] = [];
    for (const d of eachDay(start, addDays(start, days))) {
      const events: { b: Booking; type: 'in' | 'out' }[] = [];
      for (const b of c.bookings.filter(live)) { if (b.checkIn === d) events.push({ b, type: 'in' }); if (b.checkOut === d && b.status !== 'inquiry') events.push({ b, type: 'out' }); }
      const blocks = c.blocks.filter((bl) => rangesOverlap(bl.startDate, bl.endDate, d, addDays(d, 1)) && (bl.startDate === d || d === start));
      if (events.length || blocks.length) out.push({ date: d, events, inHouse: c.bookings.filter((b) => live(b) && holdsDates(b.status) && b.checkIn < d && b.checkOut > d), blocks });
    }
    return out;
  }, [start, days, c.bookings, c.blocks]);
  const resName = (id: string) => c.resources.find((r) => r.id === id)?.name ?? '';
  if (!list.length) return <Card><EmptyState icon={<BedDouble />} title="Nothing scheduled" body="No arrivals, departures or blocked dates in this period." /></Card>;
  return (
    <div className="space-y-4">
      {list.map((day) => (
        <div key={day.date}>
          <div className="mb-2 flex items-center gap-2"><span className={cn('rounded-lg px-2.5 py-1 text-xs font-bold', day.date === c.today ? 'bg-brand-600 text-white' : 'bg-white text-ink ring-1 ring-line')}>{day.date === c.today ? 'Today' : fmtWeekday(day.date)}</span><span className="text-sm font-semibold text-ink-soft">{fmtShort(day.date)}</span><span className="text-xs text-ink-mute">· {day.inHouse.length} in-house</span></div>
          <Card className="divide-y divide-line/70">
            {day.events.map(({ b, type }) => (
              <button key={b.id + type} type="button" onClick={() => c.onOpenBooking(b.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50/40">
                <span className={cn('rounded-lg p-2', type === 'in' ? 'bg-ok-50 text-ok-700' : 'bg-warn-50 text-warn-700')}>{type === 'in' ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-sm">{gname(c.guests, b.guestId)}</b><span className="block truncate text-xs text-ink-mute">{type === 'in' ? 'Check-in' : 'Check-out'} · {resName(b.resourceId)} · <SourceChip source={b.source} className="!text-xs" /></span></span>
                <StatusBadge status={b.status} conflict={c.conflictIds.has(b.id)} />
              </button>
            ))}
            {day.blocks.map((bl) => <div key={bl.id} className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700"><span className="rounded-lg bg-slate-700 p-2 text-white"><Hammer className="size-4" /></span><span><b>{resName(bl.resourceId)}</b> blocked — {BLOCK_LABEL[bl.reason]}{bl.note ? ` (${bl.note})` : ''}</span></div>)}
          </Card>
        </div>
      ))}
    </div>
  );
}
