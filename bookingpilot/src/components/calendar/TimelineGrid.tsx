import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, Check, Hammer } from 'lucide-react';
import type { BlockedDate, Booking, Guest, Resource } from '@/types';
import { addDays, diffDays, eachDay, fmtMonth, fmtWeekday, dayOfWeek, nightsBetween } from '@/domain/dates';
import { checkBooking } from '@/domain/conflicts';
import { BLOCK_LABEL } from '@/domain/conflicts';
import { SOURCE_META } from '@/domain/meta';
import { cn } from '@/lib/utils';
import { layoutRow, type Placed } from './layout';

interface Props {
  start: string;
  days: number;
  /** Fixed cell width in px. Omit to stretch to the container. */
  cellWidth?: number;
  today: string;
  resources: Resource[];
  bookings: Booking[];
  blocks: BlockedDate[];
  conflictIds: Set<string>;
  allBookings: Booking[]; // used for live drag-preview checks
  allResources: Resource[];
  guests: Guest[];
  compact?: boolean;
  canEdit?: boolean;
  onOpenBooking: (id: string) => void;
  onOpenBlock?: (id: string) => void;
  onCreate?: (resourceId: string, checkIn: string, checkOut: string) => void;
  onMove?: (bookingId: string, resourceId: string, checkIn: string) => void;
}

const LABEL_W = 176;
const LABEL_W_COMPACT = 132;

export function TimelineGrid(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const labelW = p.compact ? LABEL_W_COMPACT : LABEL_W;
  const cw = p.cellWidth ?? Math.max(p.compact ? 56 : 84, Math.floor((width - labelW) / p.days));
  const laneH = p.compact ? 38 : 46;
  const days = useMemo(() => eachDay(p.start, addDays(p.start, p.days)), [p.start, p.days]);
  const guestName = (id: string) => p.guests.find((g) => g.id === id)?.fullName ?? 'Guest';

  // drag & drop state
  const drag = useRef<{ id: string; offset: number } | null>(null);
  const [ghost, setGhost] = useState<null | { resourceId: string; idx: number; nights: number; ok: boolean; soft: boolean; label: string }>(null);
  // range selection state
  const [sel, setSel] = useState<null | { resourceId: string; a: number; b: number }>(null);
  const selRef = useRef(sel); selRef.current = sel;

  useEffect(() => {
    const up = () => {
      const s = selRef.current; if (!s) return;
      setSel(null);
      const lo = Math.min(s.a, s.b), hi = Math.max(s.a, s.b);
      p.onCreate?.(s.resourceId, days[lo], days[hi + 1] ?? addDays(days[hi], 1));
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  });

  const idxFromEvent = (e: { clientX: number }, rowEl: HTMLElement) => {
    const rect = rowEl.getBoundingClientRect();
    return Math.max(0, Math.min(p.days - 1, Math.floor((e.clientX - rect.left) / cw)));
  };

  const rows = useMemo(() => p.resources.map((r) => ({
    r, ...layoutRow(p.bookings.filter((b) => b.resourceId === r.id), p.blocks.filter((b) => b.resourceId === r.id), p.start, p.days),
  })), [p.resources, p.bookings, p.blocks, p.start, p.days]);

  // month header spans
  const months = useMemo(() => {
    const out: { label: string; span: number }[] = [];
    for (const d of days) { const l = fmtMonth(d); if (out.at(-1)?.label === l) out.at(-1)!.span++; else out.push({ label: l, span: 1 }); }
    return out;
  }, [days]);
  const todayIdx = diffDays(p.start, p.today);
  const gridW = cw * p.days;

  const onDragOverRow = (e: React.DragEvent<HTMLDivElement>, r: Resource) => {
    if (!drag.current || !p.canEdit) return;
    e.preventDefault();
    const b = p.allBookings.find((x) => x.id === drag.current!.id); if (!b) return;
    const idx = idxFromEvent(e, e.currentTarget) - drag.current.offset;
    if (ghost && ghost.resourceId === r.id && ghost.idx === idx) return;
    const nights = nightsBetween(b.checkIn, b.checkOut);
    const rep = checkBooking({ ...b, resourceId: r.id, checkIn: addDays(p.start, idx), checkOut: addDays(p.start, idx + nights) }, { resources: p.allResources, bookings: p.allBookings, blocks: p.blocks });
    setGhost({ resourceId: r.id, idx, nights, ok: rep.ok, soft: !rep.ok && !rep.hasHard, label: rep.ok ? 'Available' : rep.conflicts[0].message });
  };
  const onDropRow = (e: React.DragEvent<HTMLDivElement>, r: Resource) => {
    if (!drag.current || !p.canEdit) return;
    e.preventDefault();
    const idx = idxFromEvent(e, e.currentTarget) - drag.current.offset;
    const id = drag.current.id;
    drag.current = null; setGhost(null);
    p.onMove?.(id, r.id, addDays(p.start, idx));
  };

  return (
    <div ref={wrapRef} className="relative overflow-x-auto rounded-2xl border border-line bg-white scroll-thin no-select" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setGhost(null); }}>
      <div style={{ width: labelW + gridW }}>
        {/* header */}
        <div className="sticky top-0 z-30 flex border-b border-line bg-white">
          <div className="sticky left-0 z-40 shrink-0 border-r border-line bg-white" style={{ width: labelW }}>
            <div className="flex h-full items-end px-4 pb-2 text-[11px] font-bold uppercase tracking-wide text-ink-mute">Property / resource</div>
          </div>
          <div style={{ width: gridW }}>
            <div className="flex border-b border-line/70">
              {months.map((m, i) => <div key={i} style={{ width: m.span * cw }} className="truncate px-3 py-1 text-xs font-bold text-ink">{m.label}</div>)}
            </div>
            <div className="flex">
              {days.map((d, i) => {
                const dow = dayOfWeek(d); const isToday = i === todayIdx;
                return (
                  <div key={d} style={{ width: cw }} className={cn('border-r border-line/50 py-1.5 text-center', (dow === 0 || dow === 6) && 'bg-canvas/70', isToday && 'bg-brand-50')}>
                    <div className={cn('text-[10px] font-semibold uppercase tracking-wide text-ink-mute', isToday && 'text-brand-700')}>{fmtWeekday(d)}</div>
                    <div className={cn('mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-xs font-bold', isToday ? 'bg-brand-600 text-white' : 'text-ink')}>{Number(d.slice(8))}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* rows */}
        {rows.length === 0 && <div className="p-10 text-center text-sm text-ink-mute">No properties match the current filters.</div>}
        {rows.map(({ r, placed, lanes }) => {
          const h = lanes * laneH + 14;
          return (
            <div key={r.id} className="flex border-b border-line/70 last:border-b-0" style={{ height: h }}>
              <div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-0.5 border-r border-line bg-white px-4" style={{ width: labelW }}>
                <div className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} /><span className="truncate text-sm font-bold text-ink">{r.name}</span></div>
                <span className="truncate pl-[18px] text-[11px] text-ink-mute">{r.status !== 'available' ? <b className="text-warn-700">{r.status === 'maintenance' ? 'Under maintenance' : 'Inactive'}</b> : `Sleeps ${r.capacity} · min ${r.minStay}n`}</span>
              </div>
              <div
                className={cn('relative', p.canEdit && r.status === 'available' && 'cursor-cell')}
                style={{ width: gridW, backgroundImage: `linear-gradient(to right, rgba(225,232,242,.7) 1px, transparent 1px)`, backgroundSize: `${cw}px 100%` }}
                onMouseDown={(e) => {
                  if (!p.canEdit || e.button !== 0 || (e.target as HTMLElement).closest('[data-bar]') || r.status !== 'available') return;
                  const idx = idxFromEvent(e, e.currentTarget); setSel({ resourceId: r.id, a: idx, b: idx });
                }}
                onMouseMove={(e) => { if (sel && sel.resourceId === r.id) { const idx = idxFromEvent(e, e.currentTarget); if (idx !== sel.b) setSel({ ...sel, b: idx }); } }}
                onDragOver={(e) => onDragOverRow(e, r)}
                onDrop={(e) => onDropRow(e, r)}
              >
                {/* weekend / today tint */}
                {days.map((d, i) => (dayOfWeek(d) === 0 || dayOfWeek(d) === 6 ? <div key={d} className="pointer-events-none absolute inset-y-0 bg-canvas/60" style={{ left: i * cw, width: cw }} /> : null))}
                {todayIdx >= 0 && todayIdx < p.days && <div className="pointer-events-none absolute inset-y-0 z-[5] bg-brand-500/[0.07]" style={{ left: todayIdx * cw, width: cw }} />}
                {r.status !== 'available' && <div className="bar-blocked pointer-events-none absolute inset-0 opacity-[.08]" />}

                {sel && sel.resourceId === r.id && (
                  <div className="pointer-events-none absolute inset-y-1.5 z-10 rounded-lg border-2 border-dashed border-brand-600 bg-brand-500/15" style={{ left: Math.min(sel.a, sel.b) * cw + 2, width: (Math.abs(sel.b - sel.a) + 1) * cw - 4 }}>
                    <span className="m-1 inline-block rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{Math.abs(sel.b - sel.a) + 1} night{Math.abs(sel.b - sel.a) ? 's' : ''}</span>
                  </div>
                )}
                {ghost && ghost.resourceId === r.id && (
                  <div className={cn('pointer-events-none absolute z-30 rounded-lg border-2 border-dashed px-2 py-1 text-[11px] font-bold shadow-lg', ghost.ok ? 'border-ok-600 bg-ok-50 text-ok-700' : ghost.soft ? 'border-warn-600 bg-warn-50 text-warn-700' : 'border-coral-600 bg-coral-50 text-coral-700')} style={{ left: (ghost.idx + 0.5) * cw, width: ghost.nights * cw - 2, top: 7, height: laneH - 2 }}>
                    <span className="line-clamp-2">{ghost.ok ? '✓ Drop here' : `✕ ${ghost.label}`}</span>
                  </div>
                )}

                {placed.map((pl) => pl.kind === 'block'
                  ? <BlockBar key={(pl.item as BlockedDate).id} pl={pl as Placed<BlockedDate>} cw={cw} laneH={laneH} onOpen={p.onOpenBlock} />
                  : <BookingBar key={(pl.item as Booking).id} pl={pl as Placed<Booking>} cw={cw} laneH={laneH} name={guestName((pl.item as Booking).guestId)} conflict={p.conflictIds.has((pl.item as Booking).id)} compact={p.compact}
                      draggable={!!p.canEdit && ['pending', 'confirmed', 'conflict_review', 'inquiry', 'checked_in'].includes((pl.item as Booking).status)}
                      onOpen={p.onOpenBooking}
                      onDragStart={(e, offset) => { drag.current = { id: (pl.item as Booking).id, offset }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', (pl.item as Booking).id); }}
                      onDragEnd={() => { drag.current = null; setGhost(null); }} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BlockBar({ pl, cw, laneH, onOpen }: { pl: Placed<BlockedDate>; cw: number; laneH: number; onOpen?: (id: string) => void }) {
  const bl = pl.item;
  return (
    <button data-bar type="button" onClick={() => onOpen?.(bl.id)} title={`${BLOCK_LABEL[bl.reason]}${bl.note ? ' — ' + bl.note : ''}`}
      className="bar-blocked absolute z-[8] flex items-center gap-1.5 overflow-hidden rounded-lg px-2 text-left text-[11px] font-semibold text-white/95"
      style={{ left: pl.s * cw + 2, width: (pl.e - pl.s) * cw - 4, top: 7 + pl.lane * laneH, height: laneH - 4 }}>
      {bl.reason === 'maintenance' || bl.reason === 'renovation' ? <Hammer className="size-3.5 shrink-0" /> : <Ban className="size-3.5 shrink-0" />}
      <span className="truncate">{BLOCK_LABEL[bl.reason]}{bl.note ? ` · ${bl.note}` : ''}</span>
    </button>
  );
}

function BookingBar({ pl, cw, laneH, name, conflict, compact, draggable, onOpen, onDragStart, onDragEnd }: {
  pl: Placed<Booking>; cw: number; laneH: number; name: string; conflict: boolean; compact?: boolean; draggable: boolean;
  onOpen: (id: string) => void; onDragStart: (e: React.DragEvent, offset: number) => void; onDragEnd: () => void;
}) {
  const b = pl.item;
  const meta = SOURCE_META[b.source];
  const inactive = b.status === 'cancelled' || b.status === 'no_show';
  const isConflict = conflict || b.status === 'conflict_review';
  const style: React.CSSProperties = { left: pl.s * cw + 1, width: Math.max(cw * 0.6, (pl.e - pl.s) * cw - 3), top: 7 + pl.lane * laneH, height: laneH - 4, background: inactive ? '#94a3b8' : meta.color };
  const nights = nightsBetween(b.checkIn, b.checkOut);
  return (
    <div
      data-bar role="button" tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); onDragStart(e, Math.floor((cw / 2 + (e.clientX - rect.left)) / cw)); }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(b.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(b.id); }}
      title={`${name} · ${b.ref}\n${meta.label} · ${b.status.replace('_', ' ')}${isConflict ? '\n⚠ Conflict' : ''}`}
      className={cn(
        'absolute z-[9] flex cursor-pointer flex-col justify-center overflow-hidden px-2 text-white shadow-sm transition-[filter,transform] hover:brightness-110',
        pl.clippedL ? 'rounded-l-none' : 'rounded-l-lg', pl.clippedR ? 'rounded-r-none' : 'rounded-r-lg',
        draggable && 'cursor-grab active:cursor-grabbing',
        b.status === 'pending' && 'bar-pending outline-2 -outline-offset-2 outline-dashed outline-warn-500',
        b.status === 'inquiry' && 'opacity-70 outline-2 -outline-offset-2 outline-dotted outline-white',
        b.status === 'checked_out' && 'opacity-60',
        inactive && 'opacity-50 line-through',
        isConflict && !inactive && 'bar-conflict z-[11] !outline-2 !-outline-offset-2 outline-solid !outline-coral-500',
      )}
      style={style}
    >
      <div className="flex items-center gap-1.5">
        {isConflict ? <AlertTriangle className="size-3.5 shrink-0 text-white" /> : b.status === 'confirmed' || b.status === 'checked_in' ? <Check className="size-3.5 shrink-0 rounded-full bg-ok-600 p-[1px]" /> : null}
        <span className="truncate text-xs font-bold leading-tight">{name}</span>
        {!compact && nights >= 3 && <span className="ml-auto shrink-0 text-[10px] font-semibold opacity-80">{nights}n</span>}
      </div>
      <div className="truncate text-[10px] font-medium leading-tight opacity-90">
        {meta.short}{b.status === 'pending' ? ' · Pending' : b.status === 'checked_in' ? ' · In-house' : isConflict ? ' · CONFLICT' : ''}
      </div>
    </div>
  );
}

export function CalendarLegend({ className }: { className?: string }) {
  const chip = (cls: string, label: string, style?: React.CSSProperties) => <span className="flex items-center gap-1.5"><span className={cn('inline-block h-3.5 w-6 rounded', cls)} style={style} />{label}</span>;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-ink-soft', className)}>
      {chip('bg-slate-500', 'Confirmed (solid)')}
      {chip('bar-pending bg-slate-500 outline-2 -outline-offset-2 outline-dashed outline-warn-500', 'Pending (amber dashed)')}
      {chip('bg-slate-500 ring-2 ring-coral-500', 'Conflict (red)')}
      {chip('bar-blocked', 'Blocked')}
      {chip('bg-slate-400 opacity-50', 'Cancelled')}
    </div>
  );
}
