import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, MessageSquare, Phone, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { useFlow } from '@/store/flow';
import { diffDays, fmtDate, fmtDateTime } from '@/domain/dates';
import { guestStats } from '@/domain/metrics';
import { GUEST_TAGS, STATUS_META } from '@/domain/meta';
import { peso } from '@/domain/money';
import type { Guest, GuestTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/bits';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { StatusBadge } from '@/components/common/badges';
import { cn } from '@/lib/utils';

type Segment = 'all' | 'repeat' | 'top' | 'upcoming' | 'away6' | 'away12';
const SEGMENTS: [Segment, string][] = [['all', 'All guests'], ['repeat', 'Repeat guests'], ['top', 'Top spenders'], ['upcoming', 'Upcoming stays'], ['away6', 'Not back in 6 months'], ['away12', 'Not back in 1 year']];
const tagTone = (t: GuestTag) => (t === 'Blacklist' ? 'red' : t === 'VIP' ? 'blue' : t === 'Needs Follow-up' ? 'amber' : t === 'Corporate' ? 'slate' : 'green') as 'red' | 'blue' | 'amber' | 'slate' | 'green';

export default function Guests() {
  const org = useOrg()!;
  const [sp, setSp] = useSearchParams();
  const upsert = useStore((s) => s.upsertGuest);
  const del = useStore((s) => s.deleteGuest);
  const openForm = useFlow((s) => s.openForm);
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState<Segment>('all');
  const [tag, setTag] = useState<'' | GuestTag>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Guest> | null>(null);
  const manage = org.can('guests.manage');
  const money = org.can('revenue.view');

  useEffect(() => {
    const o = sp.get('open'), e = sp.get('edit');
    if (o) setOpenId(o);
    if (e) { const g = org.guestById(e); if (g) setEdit(g); }
    if (o || e) setSp({}, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const rows = useMemo(() => {
    const withStats = org.guests.map((g) => ({ g, s: guestStats(g.id, org.bookings, org.today) }));
    let list = withStats.filter(({ g }) => (!tag || g.tags.includes(tag)) && (!q || `${g.fullName} ${g.email} ${g.mobile} ${g.nationality}`.toLowerCase().includes(q.toLowerCase())));
    if (seg === 'repeat') list = list.filter(({ g, s }) => s.stays >= 2 || g.tags.includes('Repeat Guest'));
    if (seg === 'upcoming') list = list.filter(({ s }) => !!s.nextStay);
    if (seg === 'away6') list = list.filter(({ s }) => s.lastStay && diffDays(s.lastStay, org.today) >= 183 && !s.nextStay);
    if (seg === 'away12') list = list.filter(({ s }) => s.lastStay && diffDays(s.lastStay, org.today) >= 365 && !s.nextStay);
    if (seg === 'top') list = [...list].sort((a, b) => b.s.lifetimeSpend - a.s.lifetimeSpend).slice(0, 10);
    return list;
  }, [org, q, seg, tag]);

  const open = openId ? org.guestById(openId) : undefined;
  const stats = open ? guestStats(open.id, org.bookings, org.today) : undefined;
  const history = open ? org.messages.filter((m) => org.conversations.some((c) => c.id === m.conversationId && c.guestId === open.id)).sort((a, b) => b.sentAt.localeCompare(a.sentAt)) : [];

  const saveEdit = () => {
    if (!edit?.fullName?.trim()) { toast.error('Name is required.'); return; }
    const g = upsert(edit as Guest & { fullName: string }); toast.success('Guest saved'); setEdit(null); if (!edit.id) setOpenId(g.id);
  };
  const toggleTag = (g: Guest, t: GuestTag) => upsert({ id: g.id, fullName: g.fullName, tags: g.tags.includes(t) ? g.tags.filter((x) => x !== t) : [...g.tags, t] });

  return (
    <div>
      <PageHeader title="Guests" subtitle="Your guest CRM — history, spend, tags and communication in one place." actions={manage && <Button onClick={() => setEdit({ fullName: '', mobile: '', email: '', nationality: 'Philippines', notes: '', tags: [] })}><UserPlus />New guest</Button>} />
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" /><Input className="pl-9" placeholder="Search name, phone, email, nationality…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-44" value={tag} onChange={(e) => setTag(e.target.value as GuestTag | '')}><option value="">All tags</option>{GUEST_TAGS.map((t) => <option key={t}>{t}</option>)}</Select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{SEGMENTS.map(([k, l]) => <button key={k} onClick={() => setSeg(k)} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset', seg === k ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-ink-soft ring-line hover:bg-brand-50')}>{l}</button>)}</div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={<Search />} title="No guests in this view" /> : (
          <Table>
            <thead><tr><Th>Guest</Th><Th>Mobile</Th><Th>Email</Th><Th>Nationality</Th><Th className="text-right">Stays</Th><Th className="text-right">Lifetime spend</Th><Th>Last stay</Th><Th>Tags</Th></tr></thead>
            <tbody>
              {rows.map(({ g, s }) => (
                <tr key={g.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => setOpenId(g.id)}>
                  <Td className="font-semibold">{g.fullName}</Td>
                  <Td>{g.mobile || <span className="text-warn-700">missing</span>}</Td><Td>{g.email || <span className="text-warn-700">missing</span>}</Td><Td>{g.nationality}</Td>
                  <Td className="tabnum text-right">{s.stays}</Td><Td className="tabnum text-right font-semibold">{money ? peso(s.lifetimeSpend) : '—'}</Td>
                  <Td className="text-ink-soft">{s.lastStay ? fmtDate(s.lastStay) : s.nextStay ? `Arrives ${fmtDate(s.nextStay)}` : '—'}</Td>
                  <Td><div className="flex gap-1">{g.tags.map((t) => <Badge key={t} tone={tagTone(t)}>{t}</Badge>)}</div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        {open && stats && (
          <DialogContent side title={open.fullName} description={`${open.nationality || 'Nationality unknown'} · guest since ${fmtDate(open.createdAt.slice(0, 10))}`}>
            <DialogBody className="space-y-6">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-canvas p-3"><p className="font-display text-xl font-extrabold">{stats.stays}</p><p className="text-xs text-ink-mute">Stays</p></div>
                <div className="rounded-xl bg-canvas p-3"><p className="font-display text-xl font-extrabold">{money ? peso(stats.lifetimeSpend) : '—'}</p><p className="text-xs text-ink-mute">Lifetime spend</p></div>
                <div className="rounded-xl bg-canvas p-3"><p className="font-display text-xl font-extrabold">{stats.lastStay ? fmtDate(stats.lastStay).replace(/ \d{4}$/, '') : '—'}</p><p className="text-xs text-ink-mute">Last stay</p></div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2"><Phone className="size-4 text-ink-mute" />{open.mobile || <span className="text-warn-700">No mobile</span>}</p>
                <p className="flex items-center gap-2"><Mail className="size-4 text-ink-mute" />{open.email || <span className="text-warn-700">No email</span>}</p>
                <p className="flex items-center gap-2"><MessageSquare className="size-4 text-ink-mute" />Preferred: {open.preferredResourceId ? org.resourceById(open.preferredResourceId)?.name : 'no preference recorded'}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">Tags</p>
                <div className="flex flex-wrap gap-2">{GUEST_TAGS.map((t) => <button key={t} disabled={!manage} onClick={() => toggleTag(open, t)} className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset', open.tags.includes(t) ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-ink-soft ring-line hover:bg-brand-50')}>{t}</button>)}</div>
              </div>
              {open.notes && <div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-mute">Notes</p><p className="rounded-xl bg-warn-50/60 p-3 text-sm ring-1 ring-warn-100">{open.notes}</p></div>}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">Booking history ({stats.bookings.length})</p>
                <ul className="space-y-2">{stats.bookings.map((b) => <li key={b.id}><Link to={`/bookings/${b.id}`} onClick={() => setOpenId(null)} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm hover:bg-brand-50/50"><span><b className="block">{org.resourceById(b.resourceId)?.name}</b><span className="text-xs text-ink-mute">{fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} · {b.ref}</span></span><StatusBadge status={b.status} /></Link></li>)}</ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">Communication history</p>
                {history.length === 0 ? <p className="text-sm text-ink-mute">No messages yet.</p> : <ul className="space-y-2">{history.slice(0, 6).map((m) => <li key={m.id} className="rounded-xl bg-canvas p-3 text-sm"><p className="line-clamp-2">{m.body}</p><p className="mt-1 text-xs text-ink-mute">{m.direction === 'in' ? 'Guest' : 'Staff'} · {fmtDateTime(m.sentAt)}</p></li>)}</ul>}
              </div>
            </DialogBody>
            <DialogFooter>
              {manage && <Button variant="danger-outline" className="mr-auto" onClick={() => { const e = del(open.id); if (e) toast.error(e); else { toast.success('Guest deleted'); setOpenId(null); } }}><Trash2 /></Button>}
              {manage && <Button variant="outline" onClick={() => { setEdit(open); }}>Edit</Button>}
              {org.can('bookings.create') && <Button onClick={() => { setOpenId(null); openForm({ prefill: { guestId: open.id } }); }}><Plus />New booking</Button>}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={edit.id ? 'Edit guest' : 'New guest'}>
            <DialogBody className="space-y-4">
              <Field label="Full name"><Input value={edit.fullName ?? ''} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Mobile"><Input value={edit.mobile ?? ''} onChange={(e) => setEdit({ ...edit, mobile: e.target.value })} /></Field><Field label="Email"><Input type="email" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field></div>
              <div className="grid grid-cols-2 gap-3"><Field label="Nationality"><Input value={edit.nationality ?? ''} onChange={(e) => setEdit({ ...edit, nationality: e.target.value })} /></Field>
                <Field label="Preferred property"><Select value={edit.preferredResourceId ?? ''} onChange={(e) => setEdit({ ...edit, preferredResourceId: e.target.value || undefined })}><option value="">None</option>{org.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field></div>
              <Field label="Notes"><Textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            </DialogBody>
            <DialogFooter><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={saveEdit}>Save guest</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
