// Clients → Import customers: paste the rows from Excel, check the preview, import. Each person becomes a client with a service site,
// and each line becomes a "previous bill" on that client (so repeat quotations can start from it).
import { useMemo, useState } from 'react';
import { store, useAuth } from '@/lib/store';
import { Badge, Modal, toast } from '@/components/ui';
import { pastBillOf, planImport, siteAddress, type ImportClient } from '@/lib/clientimport';
import { CLIENT_TYPES } from '@/pages/Clients';
import { fmtDate, money, round2 } from '@/lib/util';
import type { Client, ClientType } from '@/lib/types';

export function ClientImport({ onClose }: { onClose: () => void }) {
  const { db } = useAuth();
  const [text, setText] = useState(''); const [types, setTypes] = useState<Record<string, ClientType>>({}); const [sal, setSal] = useState<Record<string, '' | 'Sir' | 'Mam'>>({}); const [busy, setBusy] = useState(false);
  const plan = useMemo(() => planImport(db, text), [db, text]);
  const typeOf = (c: ImportClient) => types[c.key] ?? c.type;
  const total = (c: ImportClient) => round2(c.bills.reduce((n, b) => n + b.amount, 0));

  const run = () => {
    if (!plan.newBills && !plan.newClients) return toast('Nothing new to import.', 'err');
    if (!confirm(`Import ${plan.newClients} new client${plan.newClients === 1 ? '' : 's'} and ${plan.newBills} previous bill${plan.newBills === 1 ? '' : 's'}?`)) return;
    setBusy(true);
    try {
      for (const c of plan.clients) {
        if (!c.bills.length && c.existing) continue;
        const bills = c.bills.map(pastBillOf);
        if (c.existing) { store.update('clients', c.existing.id, { past_bills: [...(c.existing.past_bills ?? []), ...bills] }, 'update', `Added ${bills.length} previous bill(s) to ${c.existing.name} (imported)`); continue; }
        const addr = siteAddress(c);
        const row = { name: c.name, contact_person: c.name, mobile: c.phone, email: '', address: addr, billing_address: addr, type: typeOf(c), salutation: sal[c.key] || undefined, status: 'Active', notes: 'Imported from the previous customer list', access_instructions: '', tin: '', vat_status: 'Non-VAT', withholding_rate: 0, withholding_notes: '', branch_id: db.branches[0].id, past_bills: bills } as Omit<Client, 'id' | 'created_at' | 'updated_at' | 'created_by'>;
        const made = store.insert('clients', row, `Imported client ${c.name}`) as Client;
        store.insert('sites', { client_id: made.id, name: 'Main site', address: addr, contact_person: c.name, contact_mobile: c.phone, access_instructions: '' } as never);
      }
      toast(`Imported ${plan.newClients} client${plan.newClients === 1 ? '' : 's'} and ${plan.newBills} previous bill${plan.newBills === 1 ? '' : 's'}`, 'ok');
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not import', 'err'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Import customers and their previous bills" size="xl" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || (!plan.newBills && !plan.newClients)} onClick={run}>Import {plan.newClients} client{plan.newClients === 1 ? '' : 's'} · {plan.newBills} bill{plan.newBills === 1 ? '' : 's'}</button></>}>
      <div className="stack">
        <div className="alert info">Set <b>Text as</b> to Sir or Mam for each new client so the SMS reminders greet them properly (Auto uses a Mr. / Ms. in the name, otherwise just the first name). In Excel, select the rows with six columns in this order — <b>date, name, address, city, phone, amount</b> — copy them and paste below. Each person becomes one client with a service site; every row becomes a previous bill. A customer who is already in the system is not duplicated, and a bill already on the client is skipped.</div>
        <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'24 Sept 2024\tTantan Reyes\t2 Milano St. Vista Real Classica Subd. Batasan Hills QC\tQuezon\t9175608409\t7,599.00'} aria-label="Pasted rows" style={{ fontFamily: 'monospace', fontSize: 12 }} />
        {plan.bad.length > 0 && <div className="alert warn"><b>{plan.bad.length} line{plan.bad.length === 1 ? '' : 's'} could not be read</b> and will be left out:<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{plan.bad.slice(0, 6).map((b) => <li key={b.row}>Line {b.row}: {b.why}</li>)}{plan.bad.length > 6 && <li>… and {plan.bad.length - 6} more</li>}</ul></div>}
        {plan.clients.length > 0 && <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Client</th><th>What happens</th><th>Type</th><th>Text as</th><th>Phone</th><th className="num">Bills</th><th className="num">Total</th><th>Check</th></tr></thead><tbody>
          {plan.clients.map((c) => <tr key={c.key}>
            <td><b>{c.name}</b><div className="small muted">{siteAddress(c)}</div></td>
            <td>{c.existing ? <Badge tone="blue">Already a client</Badge> : <Badge tone="green">New client</Badge>}</td>
            <td>{c.existing ? <span className="muted small">{c.existing.type}</span> : <select style={{ minWidth: 170 }} value={typeOf(c)} onChange={(e) => setTypes({ ...types, [c.key]: e.target.value as ClientType })} aria-label={`Type of ${c.name}`}>{CLIENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>}</td>
            <td>{c.existing ? <span className="muted small">{c.existing.salutation ?? 'Auto'}</span> : <select value={sal[c.key] ?? ''} onChange={(e) => setSal({ ...sal, [c.key]: e.target.value as '' | 'Sir' | 'Mam' })} aria-label={`Sir or Mam for ${c.name}`}><option value="">Auto</option><option value="Sir">Sir</option><option value="Mam">Mam</option></select>}</td>
            <td>{c.phone || <span className="muted">—</span>}</td>
            <td className="num">{c.bills.length}{c.skipped > 0 && <div className="small muted">{c.skipped} already there</div>}</td>
            <td className="num">{money(total(c))}<div className="small muted">{c.bills.length ? `${fmtDate(c.bills[0].date)}${c.bills.length > 1 ? ' …' : ''}` : ''}</div></td>
            <td className="small" style={{ color: 'var(--amber)' }}>{c.warnings.join(' ')}</td>
          </tr>)}
        </tbody></table></div>}
      </div>
    </Modal>
  );
}
