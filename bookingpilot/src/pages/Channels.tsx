import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, FileUp, Link2, Loader2, Plus, RefreshCw, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { adapterFor, parseIcs } from '@/domain/integrations';
import { SOURCE_META } from '@/domain/meta';
import { fmtDateTime } from '@/domain/dates';
import type { Channel } from '@/types';
import { Button } from '@/components/ui/button';
import { Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Badge, Card, PageHeader } from '@/components/ui/bits';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { cn } from '@/lib/utils';

const MODE: Record<string, { label: string; note: string }> = {
  booking_com: { label: 'Channel API (mock)', note: 'Mock adapter returns sample reservations. Swap in the Booking.com Connectivity API without touching the rest of the app.' },
  agoda: { label: 'Channel API (mock)', note: 'Mock adapter returns sample reservations. Swap in Agoda YCS / Connectivity API later.' },
  airbnb: { label: 'iCal / API', note: 'Connect an iCal feed today; the official API can replace it later.' },
  facebook: { label: 'Webhook → Inbox', note: 'Messenger conversations land in the Inbox, where staff turn them into bookings.' },
  whatsapp: { label: 'Webhook → Inbox', note: 'WhatsApp Business conversations land in the Inbox.' },
  website: { label: 'Booking form', note: 'Website form submissions arrive as Inquiry / Pending bookings.' },
  ical: { label: 'iCal feed', note: 'Import Google Calendar / any .ics availability feed.' },
  manual: { label: 'Staff entry', note: 'Created by staff in BookingPilot.' },
  phone: { label: 'Staff entry', note: 'Phone and walk-in bookings entered by staff.' },
};

function StatusPill({ c }: { c: Channel }) {
  if (!c.enabled) return <Badge tone="gray" dot>Disabled</Badge>;
  if (c.status === 'error') return <Badge tone="red" dot>Sync error</Badge>;
  if (c.status === 'mock') return <Badge tone="blue" dot>Connected · demo data</Badge>;
  if (c.status === 'disconnected') return <Badge tone="gray" dot>Not connected</Badge>;
  return <Badge tone="green" dot>Connected</Badge>;
}

export default function Channels() {
  const org = useOrg()!;
  const s = useStore.getState;
  const toggle = useStore((st) => st.toggleChannel);
  const [busy, setBusy] = useState<string | null>(null);
  const [mapFor, setMapFor] = useState<string | null>(null);
  const [icsFor, setIcsFor] = useState<string | null>(null);
  const manage = org.can('channels.manage');
  const mapChannel = org.channels.find((c) => c.id === mapFor);
  const icsChannel = org.channels.find((c) => c.id === icsFor);
  const [ics, setIcs] = useState({ text: '', resourceId: org.resources[0]?.id ?? '' });
  const [newMap, setNewMap] = useState({ id: '', name: '' });

  const sync = async (c: Channel) => {
    const adapter = adapterFor(c.type);
    if (!adapter) { toast.info('This channel has no pull API — it delivers via webhooks or staff entry.'); return; }
    setBusy(c.id);
    try {
      const fresh = s().db.channels.find((x) => x.id === c.id)!;
      const res = await adapter.fetchBookings(fresh, { today: org.today });
      const sum = s().importBatch(c.id, res.bookings, res.nextCursor);
      if (!res.bookings.length) toast.info(`${c.name}: already up to date`);
      else toast.success(`${c.name}: ${sum.imported} imported · ${sum.duplicates} duplicate${sum.duplicates === 1 ? '' : 's'} skipped · ${sum.conflicts} conflict${sum.conflicts === 1 ? '' : 's'} flagged${sum.errors.length ? ` · ${sum.errors.length} error` : ''}`);
      if (sum.conflicts) toast.warning('Imported reservations that clash were NOT confirmed — see Conflict Review.');
      if (sum.errors.length) toast.error(sum.errors[0]);
    } finally { setBusy(null); }
  };

  const importIcs = () => {
    if (!icsChannel) return;
    const items = parseIcs(ics.text, 'ical').map((e) => ({ ...e, listingId: 'ical' }));
    if (!items.length) { toast.error('No events found in that iCal text.'); return; }
    const ch = s().db.channels.find((x) => x.id === icsChannel.id)!;
    if (!ch.mappings.some((m) => m.externalId === 'ical')) s().addMapping(ch.id, 'ical', 'Pasted iCal feed', ics.resourceId);
    else s().setMapping(ch.id, ch.mappings.find((m) => m.externalId === 'ical')!.id, ics.resourceId);
    const sum = s().importBatch(ch.id, items);
    toast.success(`iCal: ${sum.imported} imported · ${sum.duplicates} duplicates skipped · ${sum.conflicts} conflicts flagged`);
    setIcsFor(null);
  };
  const sample = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:demo-1@calendar\nDTSTART;VALUE=DATE:${org.today.replaceAll('-', '').slice(0, 6)}28\nDTEND;VALUE=DATE:${org.today.replaceAll('-', '').slice(0, 6)}30\nSUMMARY:Reserved - Garden Suite\nEND:VEVENT\nEND:VCALENDAR`;

  return (
    <div>
      <PageHeader title="Channels & integrations" subtitle="Every source of reservations. Imports go through the same conflict engine as manual bookings — a clash is never auto-confirmed." />
      <div className="grid gap-4 lg:grid-cols-2">
        {org.channels.map((c) => {
          const meta = SOURCE_META[c.type]; const mode = MODE[c.type]; const adapter = adapterFor(c.type);
          const unmapped = c.mappings.filter((m) => !m.resourceId).length;
          return (
            <Card key={c.id} className={cn('p-5', c.status === 'error' && c.enabled && 'border-coral-100')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl font-display text-lg font-extrabold text-white" style={{ background: meta.color }}>{meta.short[0]}</span>
                  <div><h3 className="font-display font-bold">{c.name}</h3><p className="flex items-center gap-1.5 text-xs text-ink-mute"><Webhook className="size-3" />{mode.label}</p></div>
                </div>
                <div className="flex items-center gap-3"><StatusPill c={c} />{manage && <Switch checked={c.enabled} onCheckedChange={() => toggle(c.id)} aria-label={`Enable ${c.name}`} />}</div>
              </div>
              <p className="mt-3 text-sm text-ink-soft">{mode.note}</p>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-ink-mute">Last sync</dt><dd className="font-semibold">{c.lastSyncAt ? fmtDateTime(c.lastSyncAt) : '—'}</dd></div>
                <div><dt className="text-xs text-ink-mute">Imported</dt><dd className="tabnum font-semibold">{c.importedCount} booking{c.importedCount === 1 ? '' : 's'}</dd></div>
                <div><dt className="text-xs text-ink-mute">Listings mapped</dt><dd className="font-semibold">{c.mappings.length ? `${c.mappings.length - unmapped}/${c.mappings.length}` : '—'}</dd></div>
              </dl>
              {c.lastError && c.enabled && <div className="mt-3 flex gap-2 rounded-xl bg-coral-50 p-3 text-sm text-coral-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{c.lastError}</div>}
              {unmapped > 0 && <div className="mt-3 flex gap-2 rounded-xl bg-warn-50 p-3 text-sm text-warn-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{unmapped} listing{unmapped > 1 ? 's are' : ' is'} not mapped — bookings for {unmapped > 1 ? 'them' : 'it'} cannot be imported.</div>}
              <div className="mt-4 flex flex-wrap gap-2">
                {adapter && <Button variant="outline" size="sm" disabled={!c.enabled || !manage || busy === c.id} onClick={() => sync(c)}>{busy === c.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}{busy === c.id ? 'Syncing…' : 'Sync now'}</Button>}
                {c.type === 'ical' && <Button variant="outline" size="sm" disabled={!c.enabled || !manage} onClick={() => setIcsFor(c.id)}><FileUp />Import iCal</Button>}
                {(c.mappings.length > 0 || adapter || c.type === 'ical' || c.type === 'airbnb') && <Button variant="subtle" size="sm" onClick={() => setMapFor(c.id)}><Link2 />Listing mapping</Button>}
                {!c.enabled && c.status === 'disconnected' && <span className="flex items-center gap-1.5 text-xs text-ink-mute"><CloudOff className="size-3.5" />Enable to start the connection wizard</span>}
                {c.enabled && c.status !== 'error' && c.lastSyncAt && <span className="ml-auto flex items-center gap-1 text-xs text-ok-700"><CheckCircle2 className="size-3.5" />Healthy</span>}
              </div>
              {c.type === 'ical' && c.icalUrl && <p className="mt-3 truncate rounded-lg bg-canvas px-3 py-2 font-mono text-xs text-ink-soft">{c.icalUrl}</p>}
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 p-5">
        <h3 className="font-display font-bold">How integrations plug in</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">Each channel implements a small <code className="rounded bg-canvas px-1">ChannelAdapter</code> that returns normalised reservations. Mapping, duplicate detection (channel reference and same-guest-same-dates), the availability check, conflict alerts and audit logging happen once, in the shared import pipeline — so a real Booking.com API, an iCal poller, a webhook handler or an email parser only has to produce reservations. See <code className="rounded bg-canvas px-1">src/domain/integrations.ts</code>.</p>
      </Card>

      <Dialog open={!!mapChannel} onOpenChange={(o) => !o && setMapFor(null)}>
        {mapChannel && (() => {
          const live = org.channels.find((c) => c.id === mapChannel.id)!;
          return (
            <DialogContent wide title={`${live.name} — listing mapping`} description="Link each external listing to the internal property/resource that holds its availability.">
              <DialogBody className="space-y-3">
                {live.mappings.length === 0 && <p className="text-sm text-ink-mute">No listings yet. Add one below.</p>}
                {live.mappings.map((m) => (
                  <div key={m.id} className="grid items-center gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_auto_1fr]">
                    <div><p className="text-sm font-semibold">{m.externalName}</p><p className="font-mono text-xs text-ink-mute">{m.externalId}</p></div>
                    <span className="hidden text-ink-mute sm:block">→</span>
                    <Select value={m.resourceId ?? ''} disabled={!manage} onChange={(e) => useStore.getState().setMapping(live.id, m.id, e.target.value || null)} className={cn(!m.resourceId && 'border-warn-500')}><option value="">— Not mapped —</option>{org.allResources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
                  </div>
                ))}
                {manage && (
                  <div className="grid gap-2 rounded-xl bg-canvas p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Input placeholder="External listing ID" value={newMap.id} onChange={(e) => setNewMap({ ...newMap, id: e.target.value })} /><Input placeholder="Listing name" value={newMap.name} onChange={(e) => setNewMap({ ...newMap, name: e.target.value })} />
                    <Button disabled={!newMap.id.trim()} onClick={() => { useStore.getState().addMapping(live.id, newMap.id.trim(), newMap.name.trim() || newMap.id.trim(), null); setNewMap({ id: '', name: '' }); }}><Plus />Add</Button>
                  </div>
                )}
              </DialogBody>
              <DialogFooter><Button onClick={() => setMapFor(null)}>Done</Button></DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>

      <Dialog open={!!icsChannel} onOpenChange={(o) => !o && setIcsFor(null)}>
        <DialogContent title="Import iCal events" description="Paste the contents of an .ics file. Events become bookings on the chosen resource, with the same duplicate and conflict checks.">
          <DialogBody className="space-y-3">
            <Select value={ics.resourceId} onChange={(e) => setIcs({ ...ics, resourceId: e.target.value })}>{org.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            <Textarea className="min-h-48 font-mono text-xs" value={ics.text} onChange={(e) => setIcs({ ...ics, text: e.target.value })} placeholder="BEGIN:VCALENDAR…" />
            <Button variant="ghost" size="sm" onClick={() => setIcs({ ...ics, text: sample })}>Paste a sample feed</Button>
          </DialogBody>
          <DialogFooter><Button variant="ghost" onClick={() => setIcsFor(null)}>Cancel</Button><Button disabled={!ics.text.trim()} onClick={importIcs}>Import events</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
