import { DEFAULT_DISCLAIMER } from '@/lib/quote-text';
import { CLOUD } from '@/lib/cloud';
import { useState } from 'react';
import { store, useAuth } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, Tabs, attempt, ask, useObj, toast } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { DEFAULT_ACCESS, PERMISSIONS, ROLE_LABEL } from '@/lib/rbac';
import { clone, fmtStamp, sha256 } from '@/lib/util';
import type { AuditLog, Role, ServiceDef, Settings, StatutoryRate, TableName, UserAccount } from '@/lib/types';

const ROLES = Object.keys(ROLE_LABEL) as Role[];

/** Cloud: save a login's role / employee / on-off; shows the reason if it is refused. */
async function saveLogin(id: string, patch: Parameters<typeof store.saveProfile>[1], ok: string): Promise<boolean> {
  try { await store.saveProfile(id, patch); toast(ok, 'ok'); return true; } catch (e) { toast((e as Error).message || 'Could not save the login.', 'err'); return false; }
}
function UserModal({ initial, onClose }: { initial?: UserAccount; onClose: () => void }) {
  const { db } = useAuth();
  const f = useObj({ name: initial?.name ?? '', email: initial?.email ?? '', role: (initial?.role ?? 'field') as Role, employee_id: initial?.employee_id ?? '', password: '', active: initial?.active ?? true });
  const save = async () => {
    if (CLOUD && initial) { /* email belongs to the Supabase login */ } else if (!f.v.name.trim() || !/^\S+@\S+\.\S+$/.test(f.v.email)) return attempt(() => { throw new Error('Enter a name and a valid email.'); });
    if (!initial && f.v.password.length < 8) return attempt(() => { throw new Error('Password must be at least 8 characters.'); });
    if (db.users.some((u) => u.email.toLowerCase() === f.v.email.toLowerCase() && u.id !== initial?.id && !u.deleted_at)) return attempt(() => { throw new Error('Email already in use.'); });
    if (CLOUD && initial) { if (await saveLogin(initial.id, { name: f.v.name.trim(), role: f.v.role, employee_id: f.v.employee_id || null, active: f.v.active }, 'Login saved')) onClose(); return; }
    if (initial) attempt(() => { store.require('admin.users'); if (initial.id === store.user?.id && f.v.role !== 'owner') throw new Error('You cannot remove your own Owner role.'); store.update('users', initial.id, { name: f.v.name, email: f.v.email, role: f.v.role, employee_id: f.v.employee_id || null }, 'update', `Updated user ${f.v.name} (${ROLE_LABEL[f.v.role]})`); }, 'User updated');
    else attempt(async () => { store.require('admin.users'); store.insert('users', { name: f.v.name, email: f.v.email, role: f.v.role, employee_id: f.v.employee_id || null, pass_hash: await sha256(`topmop:${f.v.password}`), active: true }); }, 'User created');
    onClose();
  };
  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'New user'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save user</button></>}>
      <div className="form-grid">
        <Field label="Full name" required><input {...f.bind('name')} /></Field><Field label="Email" required hint={CLOUD ? 'Set in Supabase (Authentication → Users).' : undefined}><input type="email" {...f.bind('email')} disabled={CLOUD && !!initial} /></Field>
        <Field label="Role"><select {...f.bind('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        <Field label="Linked employee"><select value={f.v.employee_id} onChange={(e) => f.set('employee_id', e.target.value)}><option value="">— none —</option>{db.employees.filter((e) => !e.deleted_at).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        {CLOUD && initial && <Field label="Login switched on" hint="Off = this person cannot use the app."><select value={f.v.active ? 'yes' : 'no'} onChange={(e) => f.set('active', e.target.value === 'yes')}><option value="yes">On</option><option value="no">Off</option></select></Field>}
        {!initial && <Field label="Temporary password" required hint="Minimum 8 characters."><input type="password" {...f.bind('password')} /></Field>}
      </div>
    </Modal>
  );
}

function Rates({ s }: { s: Settings }) {
  const [draft, setDraft] = useState<Settings>(() => clone(s));
  const setM = (k: keyof Settings['multipliers'], v: number) => setDraft({ ...draft, multipliers: { ...draft.multipliers, [k]: v } });
  const setStat = (i: number, patch: Partial<StatutoryRate>) => setDraft({ ...draft, statutory: draft.statutory.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const save = () => attempt(() => { store.require('admin.settings'); store.patchSettings({ vat_rate: draft.vat_rate, multipliers: draft.multipliers, statutory: draft.statutory, std_hours_per_day: draft.std_hours_per_day, monthly_divisor_days: draft.monthly_divisor_days, grace_minutes: draft.grace_minutes, payment_terms_days: draft.payment_terms_days, quote_validity_days: draft.quote_validity_days, glass_group_size: draft.glass_group_size, channels: draft.channels, reminder_days: draft.reminder_days, default_terms: draft.default_terms, default_crew_size: draft.default_crew_size, default_disclaimer: draft.default_disclaimer, company: draft.company }, 'Updated payroll, tax and system settings'); }, 'Settings saved');
  const n = (v: number, fn: (x: number) => void, label: string, step = 'any') => <Field label={label}><input type="number" step={step} value={v} onChange={(e) => fn(+e.target.value)} /></Field>;
  return (
    <div className="stack">
      <Card title="Statutory contributions & withholding tax (configurable — not hard-coded)">
        <div className="alert warn" style={{ marginBottom: 12 }}>The values below are <b>sample placeholders</b>. Set SSS, PhilHealth, Pag-IBIG and withholding tax to the current government schedules before running live payroll. Each is applied per payroll period to the employee's basic pay (percent or fixed), with optional minimum and cap.</div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Item</th><th>Mode</th><th>Rate (% or ₱)</th><th>Min / period</th><th>Cap / period (0 = none)</th><th>Tax threshold / period</th></tr></thead><tbody>
          {draft.statutory.map((r, i) => <tr key={r.key}><td><b>{r.label}</b></td><td><select value={r.mode} onChange={(e) => setStat(i, { mode: e.target.value as StatutoryRate['mode'] })}><option value="percent">Percent of pay</option><option value="fixed">Fixed amount</option></select></td><td><input type="number" step="any" value={r.value} onChange={(e) => setStat(i, { value: +e.target.value })} /></td><td><input type="number" value={r.min} onChange={(e) => setStat(i, { min: +e.target.value })} /></td><td><input type="number" value={r.max} onChange={(e) => setStat(i, { max: +e.target.value })} /></td><td>{r.key === 'wtax' ? <input type="number" value={r.threshold} onChange={(e) => setStat(i, { threshold: +e.target.value })} /> : '—'}</td></tr>)}
        </tbody></table></div>
      </Card>
      <Card title="Pay rules & multipliers"><div className="form-grid">
        {n(draft.multipliers.overtime, (v) => setM('overtime', v), 'Overtime multiplier')}{n(draft.multipliers.regular_holiday, (v) => setM('regular_holiday', v), 'Regular holiday multiplier')}{n(draft.multipliers.special_holiday, (v) => setM('special_holiday', v), 'Special holiday multiplier')}{n(draft.multipliers.rest_day, (v) => setM('rest_day', v), 'Rest-day multiplier')}
        {n(draft.std_hours_per_day, (v) => setDraft({ ...draft, std_hours_per_day: v }), 'Standard hours per day')}{n(draft.monthly_divisor_days, (v) => setDraft({ ...draft, monthly_divisor_days: v }), 'Monthly salary → daily divisor (days)')}{n(draft.grace_minutes, (v) => setDraft({ ...draft, grace_minutes: v }), 'Late grace period (minutes)')}
      </div></Card>
      <Card title="Commercial defaults"><div className="form-grid">
        {n(draft.vat_rate, (v) => setDraft({ ...draft, vat_rate: v }), 'VAT rate (%)')}{n(draft.payment_terms_days, (v) => setDraft({ ...draft, payment_terms_days: v }), 'Default payment terms (days)')}{n(draft.quote_validity_days, (v) => setDraft({ ...draft, quote_validity_days: v }), 'Quotation validity (days)')}{n(draft.glass_group_size, (v) => setDraft({ ...draft, glass_group_size: v }), 'Small glass panels grouped per 1 panel')}
        <Field label="Default crew size on quotations" hint="e.g. 6-7"><input value={draft.default_crew_size ?? ''} onChange={(e) => setDraft({ ...draft, default_crew_size: e.target.value })} placeholder="6-7" /></Field>
        <Field label="Default service disclaimer on quotations" className="full" hint="Leave empty to use the standard wording. Each quotation can still be edited."><textarea rows={6} value={draft.default_disclaimer ?? ''} onChange={(e) => setDraft({ ...draft, default_disclaimer: e.target.value })} placeholder={DEFAULT_DISCLAIMER} /></Field>
        <Field label="Default quotation terms & conditions" className="full"><textarea rows={5} value={draft.default_terms} onChange={(e) => setDraft({ ...draft, default_terms: e.target.value })} /></Field>
      </div></Card>
      <Card title="Notifications & reminders"><div className="form-grid">
        <div className="full row">{(['email', 'sms', 'whatsapp'] as const).map((c) => <label key={c} className="check"><input type="checkbox" checked={draft.channels[c]} onChange={(e) => setDraft({ ...draft, channels: { ...draft.channels, [c]: e.target.checked } })} />Queue {c === 'sms' ? 'SMS' : c === 'whatsapp' ? 'WhatsApp' : 'email'} for critical alerts</label>)}</div>
        <div className="full small muted">In-app alerts are always on. External channels are queued and marked on each notification; connect a provider (Supabase Edge Function + email/SMS/WhatsApp API) to deliver them.</div>
        {(['quote_expiry', 'doc_expiry', 'chemical_expiry', 'invoice_due', 'maintenance'] as const).map((k) => n(draft.reminder_days[k], (v) => setDraft({ ...draft, reminder_days: { ...draft.reminder_days, [k]: v } }), `${{ quote_expiry: 'Quotation expiry', doc_expiry: 'Document / certification expiry', chemical_expiry: 'Chemical / PPE expiry', invoice_due: 'Invoice due', maintenance: 'Maintenance due' }[k]} — days before`))}
      </div></Card>
      <Card title="Company profile (printed on PDFs)"><div className="form-grid">
        {(['name', 'tin', 'address', 'phone', 'email', 'tagline'] as const).map((k) => <Field key={k} label={k.toUpperCase()}><input value={draft.company[k]} onChange={(e) => setDraft({ ...draft, company: { ...draft.company, [k]: e.target.value } })} /></Field>)}
      </div></Card>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary lg" onClick={save}>Save settings</button></div>
    </div>
  );
}

function Pricing() {
  const { db } = useAuth();
  const [rows, setRows] = useState<ServiceDef[]>(() => clone(db.services));
  const set = (i: number, p: Partial<ServiceDef>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const save = () => attempt(() => { store.require('admin.settings'); rows.forEach((r) => { const cur = db.services.find((s) => s.id === r.id)!; if (JSON.stringify(cur) !== JSON.stringify(r)) store.update('services', r.id, r, 'update', `Pricing updated: ${r.name}`); }); }, 'Pricing saved');
  return (
    <Card title="Service pricing defaults (Admin-editable)" actions={<button className="btn primary" onClick={save}>Save pricing</button>}>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Service</th><th>Unit</th><th>Rate (₱)</th><th>Minimum qty</th><th>Package price (₱)</th><th>Package covers</th><th>Excess rate (₱)</th><th>Custom quote</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={r.id}><td><b>{r.name}</b></td><td><input value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} style={{ width: 70 }} /></td><td><input type="number" value={r.rate} onChange={(e) => set(i, { rate: +e.target.value })} style={{ width: 100 }} /></td><td><input type="number" value={r.minimum_qty} onChange={(e) => set(i, { minimum_qty: +e.target.value })} style={{ width: 80 }} /></td>
          <td>{r.code === 'GLASS_EXT' ? <input type="number" value={r.package_price ?? 0} onChange={(e) => set(i, { package_price: +e.target.value })} style={{ width: 100 }} /> : '—'}</td><td>{r.code === 'GLASS_EXT' ? <input type="number" value={r.package_qty ?? 0} onChange={(e) => set(i, { package_qty: +e.target.value })} style={{ width: 80 }} /> : '—'}</td><td>{r.code === 'GLASS_EXT' ? <input type="number" value={r.excess_rate ?? 0} onChange={(e) => set(i, { excess_rate: +e.target.value })} style={{ width: 90 }} /> : '—'}</td>
          <td><input type="checkbox" checked={r.custom_quote} onChange={(e) => set(i, { custom_quote: e.target.checked })} /></td></tr>)}
      </tbody></table></div>
      <p className="small muted">Defaults: Glass starter package ₱4,799 up to 31 panels, ₱140 per excess panel; Roof ₱145/sqm (min 100 sqm); Wall/Floor ₱125/sqm (min 50 sqm); Solar ₱245/panel (min 20 panels). Services marked “custom quote” have no standard rate — set the rate per quotation.</p>
    </Card>
  );
}

function Permissions({ access }: { access: Settings['access'] }) {
  const [draft, setDraft] = useState<Settings['access']>(() => clone(access));
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];
  const toggle = (r: Role, k: string) => setDraft({ ...draft, [r]: draft[r].includes(k) ? draft[r].filter((x) => x !== k) : [...draft[r], k] });
  return (
    <Card title="Role permissions" actions={<><button className="btn" onClick={() => setDraft(clone(DEFAULT_ACCESS) as Settings['access'])}>Reset to defaults</button><button className="btn primary" onClick={() => attempt(() => { store.require('admin.users'); store.patchSettings({ access: { ...draft, owner: DEFAULT_ACCESS.owner } }, 'Updated role permissions'); }, 'Permissions saved')}>Save permissions</button></>}>
      <p className="small muted" style={{ marginTop: 0 }}>Owner / Admin always has every permission. Changes apply to all users of a role the next time they load a page. In production these map to Postgres row-level-security policies.</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Permission</th>{ROLES.map((r) => <th key={r} style={{ textAlign: 'center' }}>{ROLE_LABEL[r].split(' ')[0]}<br />{ROLE_LABEL[r].split(' ').slice(1).join(' ')}</th>)}</tr></thead><tbody>
        {groups.map((g) => [<tr key={g}><td colSpan={ROLES.length + 1} style={{ background: 'rgba(255,255,255,.07)', fontWeight: 700, color: 'var(--head)' }}>{g}</td></tr>, ...PERMISSIONS.filter((p) => p.group === g).map((p) => <tr key={p.key}><td>{p.label}<div className="small muted">{p.key}</div></td>{ROLES.map((r) => <td key={r} style={{ textAlign: 'center' }}><input type="checkbox" disabled={r === 'owner'} checked={r === 'owner' || draft[r].includes(p.key)} onChange={() => toggle(r, p.key)} aria-label={`${ROLE_LABEL[r]} ${p.label}`} /></td>)}</tr>)])}
      </tbody></table></div>
    </Card>
  );
}

export default function Admin() {
  const { db, can } = useAuth();
  const [tab, setTab] = useState<'users' | 'perms' | 'pricing' | 'rates' | 'audit' | 'bin' | 'data'>(can('admin.users') ? 'users' : can('admin.settings') ? 'rates' : 'audit');
  const [um, setUm] = useState<UserAccount | 'new' | null>(null);
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [tbl, setTbl] = useState(''); const [act, setAct] = useState('');
  const bin: { table: TableName; id: string; label: string; at: string; by?: string | null }[] = [];
  for (const t of ['clients', 'sites', 'jobs', 'employees', 'items', 'assets', 'quotations', 'invoices', 'expenses', 'users'] as TableName[]) for (const r of db[t] as unknown as Record<string, unknown>[]) if (r.deleted_at) bin.push({ table: t, id: String(r.id), label: String(r.number ?? r.name ?? r.full_name ?? r.code ?? r.payee ?? r.id), at: String(r.deleted_at), by: r.deleted_by as string });
  const uname = (id?: string | null) => db.users.find((u) => u.id === id)?.name ?? id ?? '—';
  const logs = db.audit.filter((a) => (!tbl || a.table === tbl) && (!act || a.action === act));
  return (
    <>
      <PageHead title="Administration" sub="Users, permissions, pricing, statutory rates, audit trail and recycle bin." />
      <Tabs tabs={[...(can('admin.users') ? [{ id: 'users' as const, label: 'Users', count: db.users.filter((u) => !u.deleted_at).length }, { id: 'perms' as const, label: 'Permissions' }] : []), ...(can('admin.settings') ? [{ id: 'pricing' as const, label: 'Service pricing' }, { id: 'rates' as const, label: 'Rates & settings' }] : []), ...(can('admin.audit') ? [{ id: 'audit' as const, label: 'Audit log' }] : []), ...(can('admin.users') ? [{ id: 'bin' as const, label: 'Recycle bin', count: bin.length }, { id: 'data' as const, label: 'Data & security' }] : [])]} value={tab} onChange={setTab} />

      {tab === 'users' && can('admin.users') && CLOUD && (() => {
        const linked = new Set(db.users.filter((u) => !u.deleted_at).map((u) => u.employee_id)); const missing = db.employees.filter((e) => !e.deleted_at && e.status !== 'inactive' && !linked.has(e.id));
        return <Card title={`Employees without a login (${missing.length})`}><p className="small muted" style={{ marginTop: 0 }}>To give someone a login: in Supabase go to <b>Authentication → Users → Add user</b> (email + password, tick “Auto confirm”). It then appears in the list below as <b>Waiting for Admin</b> — click <b>Edit</b>, choose the role (Team Leader / Field Employee …), link the employee and switch it on. The employee link is what lets a Team Leader or crew member clock in and see their own jobs.</p>{missing.length ? <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{missing.map((e) => <Badge key={e.id}>{e.code} · {e.full_name}</Badge>)}</div> : <span className="muted">Everyone has a login.</span>}</Card>;
      })()}
      {tab === 'users' && can('admin.users') && (
        <Card flush><DataTable<UserAccount> rows={db.users.filter((u) => !u.deleted_at)} rowKey={(u) => u.id} exportTitle="Users" actions={CLOUD ? <span className="small muted">Add a login in Supabase → Authentication → Users → Add user, then set it up here</span> : <button className="btn sm primary" onClick={() => setUm('new')}><Icon name="plus" />New user</button>} cols={[
          { key: 'n', header: 'Name', value: (u) => u.name, render: (u) => <b>{u.name}</b> }, { key: 'e', header: 'Email', value: (u) => u.email }, { key: 'r', header: 'Role', value: (u) => ROLE_LABEL[u.role], render: (u) => <Badge tone="blue">{ROLE_LABEL[u.role]}</Badge> },
          { key: 'emp', header: 'Employee', value: (u) => db.employees.find((e) => e.id === u.employee_id)?.full_name ?? '—' }, { key: 'st', header: 'Status', value: (u) => (u.active ? 'Active' : 'Disabled'), render: (u) => <Badge tone={!u.active && !u.employee_id ? 'amber' : undefined}>{u.active ? 'Active' : !u.employee_id && CLOUD ? 'Waiting for Admin' : 'Inactive'}</Badge> },
          { key: 'c', header: 'Created', value: (u) => u.created_at, render: (u) => fmtStamp(u.created_at) },
          { key: 'actions', header: '', noExport: true, sortable: false, render: (u) => CLOUD ? <span className="row"><button className="btn sm" onClick={() => setUm(u)}>Edit</button><button className="btn sm" onClick={() => void saveLogin(u.id, { active: !u.active }, u.active ? 'Login switched off' : 'Login switched on')}>{u.active ? 'Disable' : 'Enable'}</button></span> : <span className="row"><button className="btn sm" onClick={() => setUm(u)}>Edit</button><button className="btn sm" onClick={() => attempt(() => { store.require('admin.users'); if (u.id === store.user?.id) throw new Error('You cannot disable your own account.'); store.update('users', u.id, { active: !u.active }, 'update', `${u.active ? 'Disabled' : 'Enabled'} user ${u.name}`); })}>{u.active ? 'Disable' : 'Enable'}</button><button className="btn sm" onClick={async () => { const pw = await ask('Reset password', 'New password (min 8 characters)'); if (pw) { if (pw.length < 8) return toast('Password must be at least 8 characters.', 'err'); attempt(async () => store.setPassword(u.id, pw), 'Password reset'); } }}>Reset password</button></span> },
        ]} /></Card>
      )}
      {tab === 'perms' && can('admin.users') && <Permissions access={db.settings.access} />}
      {tab === 'pricing' && can('admin.settings') && <Pricing />}
      {tab === 'rates' && can('admin.settings') && <Rates s={db.settings} />}
      {tab === 'audit' && can('admin.audit') && (
        <Card flush><DataTable<AuditLog> rows={logs} rowKey={(a) => a.id} onRow={(a) => setDetail(a)} exportTitle="Audit log" pageSize={20}
          filters={<><select value={tbl} onChange={(e) => setTbl(e.target.value)} aria-label="Table"><option value="">All records</option>{[...new Set(db.audit.map((a) => a.table))].sort().map((t) => <option key={t}>{t}</option>)}</select><select value={act} onChange={(e) => setAct(e.target.value)} aria-label="Action"><option value="">All actions</option>{['create', 'update', 'delete', 'restore', 'approve', 'reverse', 'lock', 'login', 'logout', 'export'].map((t) => <option key={t}>{t}</option>)}</select></>}
          cols={[{ key: 'at', header: 'When (Manila)', value: (a) => a.at, render: (a) => fmtStamp(a.at) }, { key: 'u', header: 'User', value: (a) => a.user_name }, { key: 'a', header: 'Action', value: (a) => a.action, render: (a) => <Badge tone={a.action === 'delete' || a.action === 'reverse' ? 'red' : a.action === 'approve' || a.action === 'lock' ? 'green' : 'blue'}>{a.action}</Badge> }, { key: 't', header: 'Record', value: (a) => a.table }, { key: 's', header: 'Summary', value: (a) => a.summary }, { key: 'r', header: 'Reason', value: (a) => a.reason ?? '' }]} /></Card>
      )}
      {tab === 'bin' && can('admin.users') && (
        <Card title="Soft-deleted records" flush><ul className="list">{bin.map((b) => <li key={b.table + b.id}><div><b>{b.label}</b> <span className="muted small">{b.table}</span><div className="small muted">Deleted {fmtStamp(b.at)} by {uname(b.by)}</div></div><button className="btn sm" onClick={() => attempt(() => store.restore(b.table, b.id), 'Restored')}>Restore</button></li>)}{!bin.length && <li className="muted">Nothing deleted.</li>}</ul></Card>
      )}
      {tab === 'data' && can('admin.users') && (
        <div className="stack">
          <Card title="Security model">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li><b>Authentication:</b> this demo signs in against local accounts (password hashed with SHA-256). Production uses Supabase Auth (see <code>supabase/README.md</code>).</li>
              <li><b>Authorization:</b> the role/permission matrix above is enforced in every screen and action here, and by Postgres row-level security in the Supabase schema.</li>
              <li><b>Immutability:</b> stock transactions, approved invoices, finalized payroll and completed equipment out/in records cannot be edited or deleted — only reversed or adjusted.</li>
              <li><b>Audit:</b> every create / update / approve / reverse / lock / export is logged with user and timestamp ({db.audit.length.toLocaleString()} entries).</li>
            </ul>
          </Card>
          <Card title="Demo data"><p className="muted" style={{ marginTop: 0 }}>Demo data is stored in this browser only.</p><button className="btn danger" onClick={async () => { const c = await ask('Reset demo data', 'Type RESET to erase all changes and reload the sample dataset', { okLabel: 'Reset' }); if (c === 'RESET') { store.reset(); location.hash = '#/login'; } }}>Reset to sample data</button></Card>
        </div>
      )}
      {detail && (
        <Modal title={`Audit entry – ${detail.action} ${detail.table}`} size="wide" onClose={() => setDetail(null)}>
          <dl className="kv"><dt>When</dt><dd>{fmtStamp(detail.at)}</dd><dt>User</dt><dd>{detail.user_name}</dd><dt>Record</dt><dd>{detail.table} · {detail.record_id}</dd><dt>Summary</dt><dd>{detail.summary}</dd>{detail.reason && <><dt>Reason</dt><dd><b>{detail.reason}</b></dd></>}</dl>
          <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>Field</th><th>Old value</th><th>New value</th></tr></thead><tbody>
            {Object.keys({ ...((detail.before as object) ?? {}), ...((detail.after as object) ?? {}) }).map((k) => { const b = (detail.before as Record<string, unknown> | undefined)?.[k]; const a = (detail.after as Record<string, unknown> | undefined)?.[k]; return <tr key={k}><td><b>{k}</b></td><td style={{ maxWidth: 320, wordBreak: 'break-word' }}>{b === undefined ? '—' : typeof b === 'string' && b.startsWith('data:') ? '[file]' : JSON.stringify(b).slice(0, 300)}</td><td style={{ maxWidth: 320, wordBreak: 'break-word' }}>{a === undefined ? '—' : typeof a === 'string' && a.startsWith('data:') ? '[file]' : JSON.stringify(a).slice(0, 300)}</td></tr>; })}
          </tbody></table></div>
        </Modal>
      )}
      {um && <UserModal initial={um === 'new' ? undefined : um} onClose={() => setUm(null)} />}
    </>
  );
}
