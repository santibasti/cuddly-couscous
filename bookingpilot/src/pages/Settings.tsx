import { useState } from 'react';
import { AlertOctagon, Lock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { Organization } from '@/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch, Textarea } from '@/components/ui/form';
import { Card, CardHeader, PageHeader } from '@/components/ui/bits';
import { Tabs, TabsContent, TabsList, TabsTrigger, Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';

export default function Settings() {
  const org = useOrg()!;
  const nav = useNavigate();
  const updateOrg = useStore((s) => s.updateOrg);
  const updateTemplate = useStore((s) => s.updateTemplate);
  const setNotification = useStore((s) => s.setNotification);
  const resetDemo = useStore((s) => s.resetDemo);
  const deleteOrg = useStore((s) => s.deleteOrg);
  const owner = org.can('settings.owner');
  const [o, setO] = useState<Organization>(org.org);
  const [tpl, setTpl] = useState<Record<string, string>>({});
  const [del, setDel] = useState<null | string>(null);
  const ns = org.notificationSettings;

  const save = () => { updateOrg({ name: o.name, tagline: o.tagline, contactPhone: o.contactPhone, contactEmail: o.contactEmail, depositPercent: o.depositPercent, paymentInstructions: o.paymentInstructions, checkInInstructions: o.checkInInstructions, cancellationPolicy: o.cancellationPolicy }); toast.success('Settings saved'); };
  const lock = !owner && <p className="flex items-center gap-2 px-5 pb-3 text-xs text-ink-mute"><Lock className="size-3.5" />Only the organization owner can change these.</p>;

  return (
    <div>
      <PageHeader title="Settings" subtitle={org.org.name} />
      <Tabs defaultValue="org">
        <TabsList><TabsTrigger value="org">Organization</TabsTrigger><TabsTrigger value="policy">Confirmation & policies</TabsTrigger><TabsTrigger value="templates">Message templates</TabsTrigger><TabsTrigger value="notify">Notifications</TabsTrigger><TabsTrigger value="data">Data</TabsTrigger></TabsList>

        <TabsContent value="org">
          <Card className="max-w-3xl"><CardHeader title="Organization" />{lock}
            <fieldset disabled={!owner} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label="Business name"><Input value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} /></Field>
              <Field label="Tagline"><Input value={o.tagline} onChange={(e) => setO({ ...o, tagline: e.target.value })} /></Field>
              <Field label="Timezone" hint="All dates are Asia/Manila calendar days."><Input value={o.timezone} disabled /></Field>
              <Field label="Currency"><Input value="Philippine Peso (₱ PHP)" disabled /></Field>
              <Field label="Contact phone"><Input value={o.contactPhone} onChange={(e) => setO({ ...o, contactPhone: e.target.value })} /></Field>
              <Field label="Contact email"><Input value={o.contactEmail} onChange={(e) => setO({ ...o, contactEmail: e.target.value })} /></Field>
              {owner && <div className="sm:col-span-2"><Button onClick={save}>Save changes</Button></div>}
            </fieldset>
          </Card>
        </TabsContent>

        <TabsContent value="policy">
          <Card className="max-w-3xl"><CardHeader title="Confirmation message content" subtitle="Used in generated booking confirmations (message, PDF)." />{lock}
            <fieldset disabled={!owner} className="grid gap-4 px-5 pb-5">
              <Field label="Default deposit (%)"><Input type="number" min={0} max={100} className="w-40" value={o.depositPercent} onChange={(e) => setO({ ...o, depositPercent: Number(e.target.value) })} /></Field>
              <Field label="Payment instructions"><Textarea value={o.paymentInstructions} onChange={(e) => setO({ ...o, paymentInstructions: e.target.value })} /></Field>
              <Field label="Check-in / service instructions"><Textarea value={o.checkInInstructions} onChange={(e) => setO({ ...o, checkInInstructions: e.target.value })} /></Field>
              <Field label="Cancellation policy"><Textarea value={o.cancellationPolicy} onChange={(e) => setO({ ...o, cancellationPolicy: e.target.value })} /></Field>
              {owner && <div><Button onClick={save}>Save changes</Button></div>}
            </fieldset>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid max-w-4xl gap-4">
            <p className="text-sm text-ink-soft">Variables: <code className="rounded bg-white px-1.5 py-0.5 ring-1 ring-line">{'{{guest}} {{property}} {{checkIn}} {{checkOut}} {{nights}} {{total}} {{deposit}} {{balance}} {{ref}} {{business}} {{phone}}'}</code></p>
            {org.templates.map((t) => (
              <Card key={t.id} className="p-5"><p className="mb-2 font-display font-bold">{t.name}</p><Textarea className="min-h-24" value={tpl[t.id] ?? t.body} onChange={(e) => setTpl({ ...tpl, [t.id]: e.target.value })} />
                <div className="mt-3"><Button size="sm" disabled={tpl[t.id] === undefined || tpl[t.id] === t.body} onClick={() => { updateTemplate(t.id, tpl[t.id]); toast.success('Template saved'); }}>Save template</Button></div></Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="notify">
          <Card className="max-w-2xl"><CardHeader title="Your notifications" subtitle="Applies to your account in this organization." />
            <div className="divide-y divide-line/70 px-5 pb-3">
              {([['newBooking', 'New booking received', 'From any channel'], ['conflictAlert', 'Conflict alerts', 'Double bookings, blocked-date clashes, duplicates'], ['unreadInquiry', 'Unread Facebook / WhatsApp inquiries', 'Reminder after 30 minutes'], ['dailyDigest', 'Daily digest', 'Arrivals, departures and open items each morning']] as const).map(([k, l, d]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-3.5"><div><p className="text-sm font-semibold">{l}</p><p className="text-xs text-ink-mute">{d}</p></div><Switch checked={!!ns?.[k]} onCheckedChange={(v) => setNotification(k, v)} aria-label={l} /></div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <div className="grid max-w-2xl gap-4">
            <Card className="p-5"><p className="font-display font-bold">Data source</p><p className="mt-1 text-sm text-ink-soft">{isSupabaseConfigured ? 'Supabase credentials are configured, but this build still reads and writes the in-browser demo store. See the README ("Moving from demo mode to Supabase").' : 'Demo mode: all data lives in this browser. The Supabase schema, row-level security and seed are in supabase/ and are ready to apply.'}</p></Card>
            <Card className="p-5"><p className="font-display font-bold">Demo data</p><p className="mt-1 text-sm text-ink-soft">All data lives in this browser. Reset restores the Sunrise Villas &amp; Suites sample data, re-dated around today.</p><Button variant="outline" className="mt-3" onClick={() => { resetDemo(); toast.success('Demo data restored'); }}><RotateCcw />Reset demo data</Button></Card>
            {org.can('org.delete') && <Card className="border-coral-100 p-5"><p className="flex items-center gap-2 font-display font-bold text-coral-700"><AlertOctagon className="size-5" />Danger zone</p><p className="mt-1 text-sm text-ink-soft">Deleting the organization removes all of its properties, bookings, guests and history. Only the owner can do this.</p><Button variant="danger-outline" className="mt-3" onClick={() => setDel('')}>Delete organization…</Button></Card>}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={del !== null} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent title="Delete organization" description="This cannot be undone.">
          <DialogBody className="space-y-3"><p className="text-sm">Type <b>{org.org.name}</b> to confirm.</p><Input value={del ?? ''} onChange={(e) => setDel(e.target.value)} /></DialogBody>
          <DialogFooter><Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button><Button variant="danger" disabled={del !== org.org.name} onClick={() => { const e = deleteOrg(); if (e) toast.error(e); else { toast.success('Organization deleted'); nav('/'); } }}>Delete forever</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
