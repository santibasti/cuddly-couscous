import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Facebook, Globe, Mail, MessageCircle, MessagesSquare, Phone, Plus, Send, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { useFlow } from '@/store/flow';
import { fillTemplate, templateVars } from '@/domain/confirmation';
import { paidAmount } from '@/domain/metrics';
import { fmtDate, fmtDateTime, tsToDay } from '@/domain/dates';
import type { Conversation, MessageChannel, Source } from '@/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/bits';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { StatusBadge } from '@/components/common/badges';
import { ConfirmationDialog } from '@/components/bookings/Dialogs';
import { cn, initials } from '@/lib/utils';

const CH: Record<MessageChannel, { label: string; icon: typeof Facebook; color: string; source: Source }> = {
  facebook: { label: 'Messenger', icon: Facebook, color: '#0284c7', source: 'facebook' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#4d7c0f', source: 'whatsapp' },
  website: { label: 'Website', icon: Globe, color: '#334155', source: 'website' },
  email: { label: 'Email', icon: Mail, color: '#6d28d9', source: 'manual' },
  note: { label: 'Manual note', icon: StickyNote, color: '#92400e', source: 'phone' },
};

export default function Inbox() {
  const org = useOrg()!;
  const [sp, setSp] = useSearchParams();
  const send = useStore((s) => s.sendMessage);
  const markRead = useStore((s) => s.markRead);
  const createConv = useStore((s) => s.createConversation);
  const openForm = useFlow((s) => s.openForm);
  const [filter, setFilter] = useState<'all' | 'unread' | MessageChannel>('all');
  const [active, setActive] = useState<string | null>(sp.get('c'));
  const [draft, setDraft] = useState('');
  const [asNote, setAsNote] = useState(false);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [newDlg, setNewDlg] = useState<null | { guestId: string; channel: MessageChannel; subject: string; body: string }>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const convs = useMemo(() => {
    const last = (c: Conversation) => org.messages.filter((m) => m.conversationId === c.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    return org.conversations.map((c) => ({ c, last: last(c), unread: org.messages.filter((m) => m.conversationId === c.id && m.direction === 'in' && !m.readAt).length }))
      .filter((x) => x.last && (filter === 'all' || (filter === 'unread' ? x.unread > 0 : x.c.channel === filter)))
      .sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || b.last.sentAt.localeCompare(a.last.sentAt));
  }, [org.conversations, org.messages, filter]);

  const cv = org.conversations.find((c) => c.id === active);
  const guest = cv ? org.guestById(cv.guestId) : undefined;
  const booking = cv?.bookingId ? org.bookings.find((b) => b.id === cv.bookingId) : undefined;
  const resource = booking ? org.resourceById(booking.resourceId) : undefined;
  const thread = org.messages.filter((m) => m.conversationId === active).sort((a, b) => a.sentAt.localeCompare(b.sentAt));

  useEffect(() => { if (active) markRead(active); }, [active, thread.length]); // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [active, thread.length]);
  useEffect(() => { if (sp.get('c')) setSp({}, { replace: true }); }, []); // eslint-disable-line

  const applyTemplate = (key: string) => {
    const t = org.templates.find((x) => x.key === key); if (!t) return;
    setAsNote(false);
    setDraft(fillTemplate(t, templateVars(org.org, guest, booking, resource, booking ? paidAmount(org.payments, booking.id) : 0)));
  };
  const submit = () => { if (!draft.trim() || !cv) return; send(cv.id, draft, asNote ? 'note' : 'out'); setDraft(''); if (!asNote) toast.success(`Sent via ${CH[cv.channel].label} (mock delivery)`); };
  const canReply = org.can('bookings.message');

  const List = (
    <div className={cn('flex min-h-0 flex-col border-line bg-white lg:w-80 lg:shrink-0 lg:border-r', cv && 'hidden lg:flex')}>
      <div className="flex flex-wrap gap-1.5 border-b border-line p-3">
        {(['all', 'unread', 'facebook', 'whatsapp', 'website'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset', filter === f ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-ink-soft ring-line')}>{{ all: 'All', unread: 'Unread', facebook: 'Messenger', whatsapp: 'WhatsApp', website: 'Website' }[f]}</button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {convs.length === 0 && <EmptyState icon={<MessagesSquare />} title="No conversations" />}
        {convs.map(({ c, last, unread }) => {
          const g = org.guestById(c.guestId); const Icon = CH[c.channel].icon;
          return (
            <button key={c.id} onClick={() => setActive(c.id)} className={cn('flex w-full gap-3 border-b border-line/70 px-4 py-3.5 text-left hover:bg-brand-50/50', active === c.id && 'bg-brand-50')}>
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-bold">{initials(g?.fullName ?? '?')}<span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-white ring-2 ring-white" style={{ background: CH[c.channel].color }}><Icon className="size-2.5" /></span></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2"><b className={cn('truncate text-sm', unread && 'text-ink')}>{g?.fullName}</b><span className="shrink-0 text-[11px] text-ink-mute">{tsToDay(last.sentAt) === org.today ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(last.sentAt)) : fmtDate(tsToDay(last.sentAt)).replace(/, \d{4}$/, '')}</span></span>
                <span className={cn('block truncate text-xs', unread ? 'font-semibold text-ink' : 'text-ink-mute')}>{last.direction === 'out' ? 'You: ' : ''}{last.body}</span>
                <span className="mt-1 flex items-center gap-1.5">{unread > 0 && <Badge tone="blue">{unread} new</Badge>}{c.status === 'converted' ? <Badge tone="green">Booking linked</Badge> : <Badge tone="amber">No booking yet</Badge>}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Facebook, WhatsApp, website and manual inquiries — turn a conversation into a booking in two clicks." actions={canReply && <Button variant="outline" onClick={() => setNewDlg({ guestId: org.guests[0]?.id ?? '', channel: 'whatsapp', subject: '', body: '' })}><Plus />Log inquiry</Button>} />
      <Card className="flex h-[calc(100dvh-210px)] min-h-[520px] overflow-hidden">
        {List}
        <div className={cn('min-w-0 flex-1 flex-col', cv ? 'flex' : 'hidden lg:flex')}>
          {!cv ? <div className="m-auto"><EmptyState icon={<MessagesSquare />} title="Select a conversation" body="Reply with a template, then create a pending booking right from the chat." /></div> : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setActive(null)} aria-label="Back"><ArrowLeft /></Button>
                <div className="min-w-0 flex-1"><p className="truncate font-display font-bold">{guest?.fullName}</p><p className="text-xs text-ink-mute">{CH[cv.channel].label} · {cv.subject}</p></div>
                {org.can('bookings.create') && !booking && <Button size="sm" onClick={() => openForm({ prefill: { guestId: cv.guestId, source: CH[cv.channel].source }, conversationId: cv.id })}><CalendarPlus />Create Booking from Conversation</Button>}
                {booking && ['confirmed', 'checked_in'].includes(booking.status) && canReply && <Button size="sm" variant="success" onClick={() => setConfirmFor(booking.id)}><Send />Send Booking Confirmation</Button>}
                {booking && !['confirmed', 'checked_in'].includes(booking.status) && <Button size="sm" variant="outline" asChild><Link to={`/bookings/${booking.id}`}>Open booking</Link></Button>}
              </div>
              <div className="flex-1 space-y-2.5 overflow-y-auto bg-canvas/50 p-4 scroll-thin">
                {thread.map((m) => (
                  <div key={m.id} className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm', m.direction === 'in' ? 'bg-white' : m.direction === 'note' ? 'mx-auto bg-warn-50 ring-1 ring-warn-100' : 'ml-auto bg-brand-600 text-white')}>
                    {m.direction === 'note' && <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-warn-700">Internal note</p>}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={cn('mt-1 text-[11px]', m.direction === 'out' ? 'text-white/70' : 'text-ink-mute')}>{m.direction === 'out' ? `${org.memberName(m.authorId)} · ` : ''}{fmtDateTime(m.sentAt)}</p>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              {canReply ? (
                <div className="border-t border-line p-3">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {([['availability', 'Availability reply'], ['payment_reminder', 'Payment reminder'], ['booking_confirmation', 'Booking confirmation'], ['check_in', 'Check-in instructions'], ['cancellation_policy', 'Cancellation policy']] as const).map(([k, l]) => <button key={k} onClick={() => applyTemplate(k)} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">{l}</button>)}
                  </div>
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={asNote ? 'Internal note — not sent to the guest' : `Reply on ${CH[cv.channel].label}…`} className={cn('min-h-[88px]', asNote && 'bg-warn-50')} />
                  <div className="mt-2 flex items-center justify-between"><label className="flex items-center gap-2 text-xs font-semibold text-ink-soft"><input type="checkbox" checked={asNote} onChange={(e) => setAsNote(e.target.checked)} />Internal note only</label><Button onClick={submit} disabled={!draft.trim()}><Send />{asNote ? 'Save note' : 'Send'}</Button></div>
                </div>
              ) : <p className="border-t border-line p-4 text-center text-sm text-ink-mute">Your role can read the inbox but not reply.</p>}
            </>
          )}
        </div>
        {cv && guest && (
          <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-line bg-white p-4 xl:block scroll-thin">
            <div className="text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-700">{initials(guest.fullName)}</span><p className="mt-2 font-display font-bold">{guest.fullName}</p><p className="text-xs text-ink-mute">{guest.nationality}</p></div>
            <div className="space-y-1.5 text-sm"><p className="flex items-center gap-2"><Phone className="size-3.5 text-ink-mute" />{guest.mobile || <span className="text-warn-700">No mobile</span>}</p><p className="flex items-center gap-2"><Mail className="size-3.5 text-ink-mute" />{guest.email || <span className="text-warn-700">No email</span>}</p></div>
            {guest.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{guest.tags.map((t) => <Badge key={t} tone={t === 'Blacklist' ? 'red' : 'blue'}>{t}</Badge>)}</div>}
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-mute">Booking</p>
              {booking ? (
                <Link to={`/bookings/${booking.id}`} className="block rounded-xl border border-line p-3 text-sm hover:bg-brand-50/50"><div className="mb-1.5 flex items-center justify-between"><b>{booking.ref}</b><StatusBadge status={booking.status} /></div><p className="text-xs text-ink-soft">{resource?.name}<br />{fmtDate(booking.checkIn)} → {fmtDate(booking.checkOut)}</p></Link>
              ) : <p className="rounded-xl bg-warn-50 p-3 text-sm text-warn-700">No booking linked. Pick dates and a property to create a pending booking.</p>}
            </div>
          </aside>
        )}
      </Card>
      <ConfirmationDialog bookingId={confirmFor} onClose={() => setConfirmFor(null)} />
      <Dialog open={!!newDlg} onOpenChange={(o) => !o && setNewDlg(null)}>
        {newDlg && (
          <DialogContent title="Log an inquiry" description="Record a call, walk-in question or message that came in outside the connected channels.">
            <DialogBody className="space-y-4">
              <Field label="Guest"><Select value={newDlg.guestId} onChange={(e) => setNewDlg({ ...newDlg, guestId: e.target.value })}>{org.guests.map((g) => <option key={g.id} value={g.id}>{g.fullName}</option>)}</Select></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Channel"><Select value={newDlg.channel} onChange={(e) => setNewDlg({ ...newDlg, channel: e.target.value as MessageChannel })}>{(Object.keys(CH) as MessageChannel[]).map((c) => <option key={c} value={c}>{CH[c].label}</option>)}</Select></Field><Field label="Subject"><Input value={newDlg.subject} onChange={(e) => setNewDlg({ ...newDlg, subject: e.target.value })} placeholder="Dates for Nov 12–15" /></Field></div>
              <Field label="Message"><Textarea value={newDlg.body} onChange={(e) => setNewDlg({ ...newDlg, body: e.target.value })} /></Field>
            </DialogBody>
            <DialogFooter><Button variant="ghost" onClick={() => setNewDlg(null)}>Cancel</Button><Button disabled={!newDlg.guestId || !newDlg.body.trim()} onClick={() => { const id = createConv(newDlg.guestId, newDlg.channel, newDlg.subject || 'New inquiry', newDlg.body); setNewDlg(null); setActive(id); }}>Log inquiry</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
