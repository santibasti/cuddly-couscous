import { useState } from 'react';
import { Check, Lock, Minus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { ROLE_BLURB, ROLE_LABEL, ROLE_PERMISSIONS, type Permission } from '@/domain/permissions';
import type { Role } from '@/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from '@/components/ui/bits';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { cn, initials } from '@/lib/utils';

const ROLES: Role[] = ['owner', 'manager', 'staff', 'viewer'];
const MATRIX: [string, Permission][] = [
  ['View calendar, bookings & availability', 'bookings.view'], ['Create & edit bookings', 'bookings.create'], ['Confirm bookings', 'bookings.confirm'], ['Cancel bookings', 'bookings.cancel'], ['Message guests', 'bookings.message'],
  ['Approve conflict exceptions', 'conflicts.override'], ['Block dates', 'calendar.block'], ['Manage properties & resources', 'properties.manage'], ['Manage channels', 'channels.manage'], ['Manage guests', 'guests.manage'],
  ['View revenue & reports', 'reports.view'], ['Manage team & roles', 'team.manage'], ['Owner settings', 'settings.owner'], ['Delete organization', 'org.delete'],
];

export default function Team() {
  const org = useOrg()!;
  const invite = useStore((s) => s.inviteMember);
  const update = useStore((s) => s.updateMember);
  const [dlg, setDlg] = useState<null | { name: string; email: string; role: Role; resourceIds: string[] }>(null);
  const manage = org.can('team.manage');
  const [editId, setEditId] = useState<string | null>(null);
  const editing = org.members.find((m) => m.id === editId);

  return (
    <div>
      <PageHeader title="Team" subtitle={manage ? 'Invite people and control exactly what they can see and do.' : 'Read-only — only the owner can change roles.'} actions={manage && <Button onClick={() => setDlg({ name: '', email: '', role: 'staff', resourceIds: [] })}><UserPlus />Invite member</Button>} />
      <Card className="mb-6 overflow-hidden">
        <Table>
          <thead><tr><Th>Member</Th><Th>Role</Th><Th>Property access</Th><Th>Status</Th>{manage && <Th />}</tr></thead>
          <tbody>
            {org.members.map((m) => {
              const u = org.users.find((x) => x.id === m.userId);
              return (
                <tr key={m.id}>
                  <Td><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">{initials(u?.name ?? '?')}</span><div><p className="font-semibold">{u?.name}</p><p className="text-xs text-ink-mute">{u?.email}</p></div></div></Td>
                  <Td>{manage && m.role !== 'owner' ? <Select className="w-48" value={m.role} onChange={(e) => update(m.id, { role: e.target.value as Role, resourceIds: e.target.value === 'staff' ? m.resourceIds : [] })}>{ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select> : <Badge tone={m.role === 'owner' ? 'blue' : 'slate'}>{ROLE_LABEL[m.role]}</Badge>}</Td>
                  <Td className="text-ink-soft">{m.role === 'staff' && m.resourceIds.length ? m.resourceIds.map((id) => org.resourceById(id)?.name).join(', ') : 'All properties'}</Td>
                  <Td>{manage && m.role !== 'owner' ? <Switch checked={m.active} onCheckedChange={(v) => update(m.id, { active: v })} aria-label="Active" /> : <Badge tone="green" dot>Active</Badge>}</Td>
                  {manage && <Td>{m.role === 'staff' && <Button variant="ghost" size="sm" onClick={() => setEditId(m.id)}>Edit access</Button>}</Td>}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Roles & permissions" subtitle="Enforced in the interface, the data layer and — with Supabase — row-level security." />
        <div className="grid gap-3 px-5 pb-4 md:grid-cols-2 xl:grid-cols-4">{ROLES.map((r) => <div key={r} className="rounded-xl bg-canvas p-3.5"><p className="text-sm font-bold">{ROLE_LABEL[r]}</p><p className="mt-1 text-xs text-ink-soft">{ROLE_BLURB[r]}</p></div>)}</div>
        <Table>
          <thead><tr><Th>Capability</Th>{ROLES.map((r) => <Th key={r} className="text-center">{ROLE_LABEL[r].split(' /')[0]}</Th>)}</tr></thead>
          <tbody>{MATRIX.map(([label, p]) => <tr key={p}><Td>{label}</Td>{ROLES.map((r) => <Td key={r} className="text-center">{ROLE_PERMISSIONS[r].includes(p) ? <Check className={cn('mx-auto size-4 text-ok-600')} /> : <Minus className="mx-auto size-4 text-slate-300" />}</Td>)}</tr>)}</tbody>
        </Table>
        {!manage && <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-mute"><Lock className="size-3.5" />Role changes are limited to the organization owner.</p>}
      </Card>

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        {dlg && (
          <DialogContent title="Invite team member" description="Demo mode adds them instantly (password demo123). With Supabase Auth an invite email is sent.">
            <DialogBody className="space-y-4">
              <Field label="Full name"><Input value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={dlg.email} onChange={(e) => setDlg({ ...dlg, email: e.target.value })} /></Field>
              <Field label="Role"><Select value={dlg.role} onChange={(e) => setDlg({ ...dlg, role: e.target.value as Role })}>{ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
              {dlg.role === 'staff' && <Field label="Assigned properties" hint="Reservation staff only see these. None selected = all."><div className="flex flex-wrap gap-2">{org.allResources.map((r) => <button type="button" key={r.id} onClick={() => setDlg({ ...dlg, resourceIds: dlg.resourceIds.includes(r.id) ? dlg.resourceIds.filter((x) => x !== r.id) : [...dlg.resourceIds, r.id] })} className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset', dlg.resourceIds.includes(r.id) ? 'bg-navy-900 text-white ring-navy-900' : 'ring-line')}>{r.name}</button>)}</div></Field>}
            </DialogBody>
            <DialogFooter><Button variant="ghost" onClick={() => setDlg(null)}>Cancel</Button><Button disabled={!dlg.name.trim() || !dlg.email.includes('@')} onClick={() => { const e = invite(dlg.name, dlg.email, dlg.role, dlg.resourceIds); if (e) toast.error(e); else { toast.success('Member added'); setDlg(null); } }}>Send invite</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditId(null)}>
        {editing && (
          <DialogContent title="Property access" description="Reservation staff only see and book these properties.">
            <DialogBody><div className="flex flex-wrap gap-2">{org.allResources.map((r) => { const on = editing.resourceIds.includes(r.id); return <button type="button" key={r.id} onClick={() => update(editing.id, { resourceIds: on ? editing.resourceIds.filter((x) => x !== r.id) : [...editing.resourceIds, r.id] })} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset', on ? 'bg-navy-900 text-white ring-navy-900' : 'ring-line')}>{r.name}</button>; })}</div><p className="mt-3 text-xs text-ink-mute">No property selected means access to all.</p></DialogBody>
            <DialogFooter><Button onClick={() => setEditId(null)}>Done</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
