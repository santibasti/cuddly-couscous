import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BedDouble, ClipboardList, Search, UserSquare2 } from 'lucide-react';
import { useFlow } from '@/store/flow';
import { useOrg } from '@/store/hooks';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { fmtRange } from '@/domain/dates';
import { STATUS_META } from '@/domain/meta';

export function GlobalSearch() {
  const open = useFlow((s) => s.searchOpen);
  const setOpen = useFlow((s) => s.setSearchOpen);
  const org = useOrg();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    if (!org) return { bookings: [], guests: [], props: [] };
    const t = q.trim().toLowerCase();
    if (!t) return { bookings: org.bookings.filter((b) => ['pending', 'conflict_review'].includes(b.status)).slice(0, 4), guests: [], props: org.resources.slice(0, 3) };
    return {
      bookings: org.bookings.filter((b) => `${b.ref} ${org.guestById(b.guestId)?.fullName} ${b.externalRef ?? ''}`.toLowerCase().includes(t)).slice(0, 6),
      guests: org.can('guests.view') ? org.guests.filter((g) => `${g.fullName} ${g.email} ${g.mobile}`.toLowerCase().includes(t)).slice(0, 5) : [],
      props: org.resources.filter((r) => r.name.toLowerCase().includes(t)).slice(0, 4),
    };
  }, [q, org]);
  const go = (to: string) => { setOpen(false); setQ(''); nav(to); };
  if (!org) return null;
  const Row = ({ icon: I, title, sub, to }: { icon: typeof Search; title: string; sub: string; to: string }) => (
    <button onClick={() => go(to)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-brand-50"><I className="size-4 shrink-0 text-brand-600" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{title}</span><span className="block truncate text-xs text-ink-mute">{sub}</span></span></button>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Search" hideClose className="top-[20%] -translate-y-0 [&>div:first-child]:sr-only">
        <div className="flex items-center gap-3 border-b border-line px-4"><Search className="size-4 text-ink-mute" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const b = results.bookings[0]; if (b) go(`/bookings/${b.id}`); } }} placeholder="Search bookings, guests, properties…" className="h-12 flex-1 bg-transparent text-sm outline-none" /></div>
        <div className="max-h-[50vh] overflow-y-auto p-2 scroll-thin">
          {results.bookings.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-mute">{q ? 'Bookings' : 'Needs a decision'}</p>}
          {results.bookings.map((b) => <Row key={b.id} icon={ClipboardList} title={`${org.guestById(b.guestId)?.fullName} · ${b.ref}`} sub={`${org.resourceById(b.resourceId)?.name} · ${fmtRange(b.checkIn, b.checkOut)} · ${STATUS_META[b.status].label}`} to={`/bookings/${b.id}`} />)}
          {results.guests.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-mute">Guests</p>}
          {results.guests.map((g) => <Row key={g.id} icon={UserSquare2} title={g.fullName} sub={`${g.mobile || '—'} · ${g.email || '—'}`} to={`/guests?open=${g.id}`} />)}
          {results.props.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-mute">Properties</p>}
          {results.props.map((r) => <Row key={r.id} icon={BedDouble} title={r.name} sub={`Sleeps ${r.capacity} · ${r.status}`} to={`/properties?open=${r.id}`} />)}
          {q && !results.bookings.length && !results.guests.length && !results.props.length && <p className="p-6 text-center text-sm text-ink-mute">No matches for “{q}”.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
