import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Icon, Modal, PageHead, PhotoInput, Stat, Tabs, attempt, ask, useObj } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { confirmationOf, paymentPlanLabel, paymentCounts, paymentPending, paymentStatusLabel, isDone, AGING_BUCKETS, aggregateProfit, agingBucket, docTotals, invoiceBalance, invoiceSettled, invoiceState, invoiceTotals, jobProfitRows, profitAndLoss, serviceProfitRows, discountAggregate, discountRows, type AgingBucket, type DiscountAgg, type DiscountRow, type DiscountView } from '@/lib/business';
import { CHEQUE_STATUSES, approveInvoice, decideExpense, deletePayment, invoiceFromJob, pettyBalance, pettyCash, rejectPayment, reverseExpense, reverseInvoice, reversePayment, saveExpense, saveInvoice, setChequeStatus, verifyPayment } from '@/lib/actions';
import { RecordPaymentModal, canRecordPayment } from '@/components/RecordPayment';
import { invoicePdf, receiptPdf, statementPdf } from '@/lib/export';
import { addDays, diffDays, fmtDate, fmtDateTime, monthEnd, monthStart, money, moneyShort, pct, round2, sum, today } from '@/lib/util';
import type { ChequeStatus, Expense, ExpenseCategory, ExpenseMethod, Invoice, Payment, QuoteItem } from '@/lib/types';

const METHODS: ExpenseMethod[] = ['Cash', 'Bank Transfer', 'Check', 'GCash', 'Credit Card', 'Other'];
const CATEGORIES: ExpenseCategory[] = ['Payroll', 'Fuel', 'Materials', 'Equipment Repair', 'Transportation', 'Marketing', 'Rent', 'Utilities', 'Government Fees', 'Subcontractor', 'Toll & Parking', 'Meals & Snacks', 'Other'];
type Tab = 'overview' | 'invoices' | 'receivables' | 'payments' | 'expenses' | 'profit' | 'discounts';

/* ---------- Invoice editor ---------- */
function InvoiceModal({ initial, onClose }: { initial?: Invoice; onClose: () => void }) {
  const { db, can } = useAuth();
  const f = useObj<Omit<Invoice, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'number'>>(() => initial ?? { client_id: live(db.clients)[0].id, issue_date: today(), due_date: addDays(today(), db.settings.payment_terms_days), items: [{ service_code: 'OTHER', description: '', qty: 1, unit: 'lot', rate: 0, discount: 0 }], vat_mode: 'exclusive', vat_rate: db.settings.vat_rate, discount: 0, withholding_rate: 0, status: 'Draft', branch_id: db.branches[0].id });
  const v = f.v; const t = invoiceTotals(v);
  const upd = (i: number, p: Partial<QuoteItem>) => f.set('items', v.items.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const onClient = (id: string) => { const c = db.clients.find((x) => x.id === id)!; f.set('client_id', id); f.set('vat_mode', c.vat_status === 'VAT-registered' ? 'exclusive' : 'none'); f.set('withholding_rate', c.withholding_rate); f.set('branch_id', c.branch_id); f.set('site_id', undefined); f.set('job_id', undefined); };
  return (
    <Modal title={initial ? `Edit draft ${initial.number}` : 'New invoice'} size="xl" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => saveInvoice({ ...v, id: initial?.id, number: initial?.number }), 'Draft saved')) onClose(); }}>Save draft</button></>}>
      <div className="form-grid">
        <Field label="Client"><select value={v.client_id} onChange={(e) => onClient(e.target.value)}>{live(db.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Related job"><select value={v.job_id ?? ''} onChange={(e) => f.set('job_id', e.target.value || undefined)}><option value="">— none —</option>{live(db.jobs).filter((j) => j.client_id === v.client_id && isDone(j.status)).map((j) => <option key={j.id} value={j.id}>{j.number}</option>)}</select></Field>
        <Field label="Issue date"><input type="date" {...f.bind('issue_date')} /></Field><Field label="Due date"><input type="date" {...f.bind('due_date')} /></Field>
      </div>
      <div className="tbl-wrap" style={{ margin: '14px 0' }}><table className="tbl"><thead><tr><th>Description</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 70 }}>Unit</th><th style={{ width: 110 }}>Rate</th><th style={{ width: 100 }}>Discount</th><th className="num">Amount</th><th /></tr></thead><tbody>
        {v.items.map((it, i) => <tr key={i}><td><input value={it.description} onChange={(e) => upd(i, { description: e.target.value })} aria-label="Description" /></td><td><input type="number" value={it.qty} onChange={(e) => upd(i, { qty: +e.target.value })} aria-label="Qty" /></td><td><input value={it.unit} onChange={(e) => upd(i, { unit: e.target.value })} aria-label="Unit" /></td><td><input type="number" value={it.rate} onChange={(e) => upd(i, { rate: +e.target.value })} aria-label="Rate" /></td><td><input type="number" disabled={!can('discount.approve')} value={it.discount} onChange={(e) => upd(i, { discount: +e.target.value })} aria-label="Discount" /></td><td className="num">{money(it.qty * it.rate - it.discount)}</td><td><button className="icon-btn" onClick={() => f.set('items', v.items.filter((_, k) => k !== i))} aria-label="Remove"><Icon name="trash" /></button></td></tr>)}
      </tbody></table><button className="btn sm" style={{ margin: 8 }} onClick={() => f.set('items', [...v.items, { service_code: 'OTHER', description: '', qty: 1, unit: 'lot', rate: 0, discount: 0 }])}><Icon name="plus" />Add line</button></div>
      {v.discount_request_id && <div className="alert info" style={{ marginBottom: 10 }}>Includes discount {db.discount_requests.find((r) => r.id === v.discount_request_id)?.number} ({money(v.discount_granted ?? 0)}, incl. VAT) — approved by TopMop management and reflected in the final agreed amount.</div>}
      <div className="grid g2">
        <div className="form-grid"><Field label="VAT"><select {...f.bind('vat_mode')}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option><option value="none">None</option></select></Field><Field label="Withholding tax rate (%)"><input type="number" min="0" step="0.5" {...f.bind('withholding_rate')} /></Field><Field label="Discount (₱, ex-VAT)" hint={v.discount_request_id ? 'Includes the management-approved discount (locked)' : can('discount.approve') ? undefined : 'Owner / Admin only'}><input type="number" min="0" disabled={!can('discount.approve')} {...f.bind('discount')} /></Field></div>
        <table className="tbl"><tbody><tr><td>Subtotal (after discounts, ex-VAT)</td><td className="num">{money(t.net)}</td></tr><tr><td>VAT {v.vat_rate}%</td><td className="num">{money(t.vat)}</td></tr><tr><td><b>Invoice total</b></td><td className="num"><b>{money(t.total)}</b></td></tr><tr><td className="muted">Less expected withholding tax</td><td className="num muted">− {money(t.wht)}</td></tr><tr><td><b>Expected cash collection</b></td><td className="num"><b>{money(t.collectible)}</b></td></tr></tbody></table>
      </div>
    </Modal>
  );
}

/* ---------- Expense editor ---------- */
function ExpenseModal({ initial, onClose }: { initial?: Expense; onClose: () => void }) {
  const { db } = useAuth();
  const f = useObj<Omit<Expense, 'id' | 'created_at' | 'updated_at' | 'created_by'>>(() => initial ?? { date: today(), payee: '', category: 'Materials', branch_id: db.branches[0].id, amount: 0, vat: 0, wht: 0, method: 'Cash', approval: 'Pending', paid: true, petty_cash: false, recurring: null });
  return (
    <Modal title={initial ? 'Edit expense' : 'New expense'} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => {
      if (!f.v.payee.trim()) return attempt(() => { throw new Error('Payee is required.'); });
      if (attempt(() => saveExpense({ ...f.v, id: initial?.id }), 'Expense saved — pending approval')) { if (f.v.petty_cash && !initial) attempt(() => pettyCash('Disbursement', f.v.amount, `${f.v.category} – ${f.v.payee}`)); onClose(); }
    }}>Save expense</button></>}>
      <div className="form-grid">
        <Field label="Expense date"><input type="date" {...f.bind('date')} /></Field><Field label="Supplier / payee" required><input {...f.bind('payee')} /></Field>
        <Field label="Category"><select {...f.bind('category')}>{CATEGORIES.filter((c) => c !== 'Payroll').map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Related job (if any)"><select value={f.v.job_id ?? ''} onChange={(e) => f.set('job_id', e.target.value || undefined)}><option value="">— overhead —</option>{live(db.jobs).sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 100).map((j) => <option key={j.id} value={j.id}>{j.number} · {db.clients.find((c) => c.id === j.client_id)?.name}</option>)}</select></Field>
        <Field label="Amount incl. VAT (₱)"><input type="number" min="0" step="0.01" {...f.bind('amount')} /></Field><Field label="Input VAT (₱)"><input type="number" min="0" step="0.01" {...f.bind('vat')} /></Field>
        <Field label="Withholding tax (₱)"><input type="number" min="0" step="0.01" {...f.bind('wht')} /></Field><Field label="Payment method"><select {...f.bind('method')}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Recurring"><select value={f.v.recurring ?? ''} onChange={(e) => f.set('recurring', (e.target.value || null) as Expense['recurring'])}><option value="">One-time</option><option value="monthly">Monthly</option></select></Field>
        <div className="row" style={{ alignSelf: 'end' }}><label className="check"><input type="checkbox" checked={f.v.paid} onChange={(e) => f.set('paid', e.target.checked)} />Paid</label><label className="check"><input type="checkbox" checked={f.v.petty_cash} onChange={(e) => f.set('petty_cash', e.target.checked)} />Petty cash</label></div>
        <Field label="Notes" className="full"><input value={f.v.notes ?? ''} onChange={(e) => f.set('notes', e.target.value)} /></Field>
        <div className="full row"><PhotoInput label={f.v.receipt ? 'Replace receipt' : 'Upload receipt'} accept="image/*" onAdd={(d) => f.set('receipt', d)} />{f.v.receipt && <img src={f.v.receipt} alt="receipt" style={{ height: 60, borderRadius: 4 }} />}</div>
      </div>
    </Modal>
  );
}

/* ---------- Main ---------- */
export default function Finance() {
  const { db, can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const T = today();
  const allowed = (t: Tab) => (t === 'expenses' ? can('expenses.view') : t === 'profit' ? can('profit.view') : can('invoices.view'));
  const first: Tab = can('invoices.view') ? 'overview' : can('expenses.view') ? 'expenses' : 'profit';
  const [tab, setTabS] = useState<Tab>(((sp.get('tab') as Tab) && allowed(sp.get('tab') as Tab) ? (sp.get('tab') as Tab) : first));
  const setTab = (t: Tab) => { setTabS(t); setSp({ tab: t }, { replace: true }); };
  const [inv, setInv] = useState<Invoice | 'new' | null>(null);
  const [pay, setPay] = useState<Invoice | null>(null);
  const [editPay, setEditPay] = useState<Payment | null>(null);
  const [pst, setPst] = useState('');
  const [exp, setExp] = useState<Expense | 'new' | null>(null);
  const [status, setStatus] = useState(''); const [ecat, setEcat] = useState(''); const [eap, setEap] = useState('');
  const [pf, setPf] = useState<'job' | 'client' | 'service' | 'period'>('job');
  const [range, setRange] = useState<[string, string]>([monthStart(addDays(monthStart(T), -60)), T]);
  const cn = (id: string) => db.clients.find((c) => c.id === id)?.name ?? '—';

  const invoices = live(db.invoices).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  const approved = invoices.filter((i) => i.status === 'Approved');
  const open = approved.filter((i) => invoiceBalance(db, i) > 0.005);
  const receivable = sum(open, (i) => invoiceBalance(db, i));
  const overdue = open.filter((i) => i.due_date < T);
  const uninvoiced = live(db.jobs).filter((j) => isDone(j.status) && !db.invoices.some((i) => i.job_id === j.id && i.status !== 'Reversed' && !i.deleted_at));
  const cm = profitAndLoss(db, monthStart(T), monthEnd(T));

  const aging = useMemo(() => {
    const m = new Map<string, { client: string; total: number } & Record<AgingBucket, number>>();
    for (const i of open) {
      const b = agingBucket(i.due_date, T); const e = m.get(i.client_id) ?? { client: i.client_id, total: 0, Current: 0, '1–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
      const bal = invoiceBalance(db, i); e[b] += bal; e.total += bal; m.set(i.client_id, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [db, open.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { id: Tab; label: string; count?: number }[] = [
    ...(can('invoices.view') ? [{ id: 'overview' as Tab, label: 'Overview' }, { id: 'invoices' as Tab, label: 'Invoices', count: invoices.length }, { id: 'receivables' as Tab, label: 'Receivables & aging', count: open.length }, { id: 'payments' as Tab, label: 'Payments' }] : []),
    ...(can('expenses.view') ? [{ id: 'expenses' as Tab, label: 'Expenses & petty cash' }] : []), ...(can('profit.view') ? [{ id: 'profit' as Tab, label: 'Profitability' }, { id: 'discounts' as Tab, label: 'Discounts', count: db.discount_requests.filter((r) => r.status === 'Pending Admin Approval' && !r.deleted_at).length || undefined }] : []),
  ];

  /* profitability data */
  const rows = useMemo(() => jobProfitRows(db, range[0], range[1]), [db, range]);
  const agg = useMemo(() => {
    if (pf === 'client') return aggregateProfit(rows.map((r) => ({ key: r.clientId, label: cn(r.clientId), revenue: r.cost.revenue, cost: r.cost.total, estimated: r.cost.estimated })));
    if (pf === 'service') return aggregateProfit(serviceProfitRows(db, range[0], range[1]));
    return [];
  }, [db, range, pf, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => { const out: { m: string; p: ReturnType<typeof profitAndLoss> }[] = []; for (let k = 5; k >= 0; k--) { const ref = addDays(monthStart(T), -k * 30); const s = monthStart(ref); if (!out.some((o) => o.m === s)) out.push({ m: s, p: profitAndLoss(db, s, monthEnd(s)) }); } return out; }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  const expenses = live(db.expenses).filter((e) => (!ecat || e.category === ecat) && (!eap || (eap === 'Reversed' ? e.reversed : e.approval === eap && !e.reversed))).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PageHead title="Finance" sub="Expected → billed → collected → paid, kept separate. Approved records are locked; corrections are made by reversal.">
        {can('invoices.edit') && <button className="btn primary" onClick={() => setInv('new')}><Icon name="plus" />New invoice</button>}
        {can('expenses.edit') && <button className="btn" onClick={() => setExp('new')}><Icon name="plus" />New expense</button>}
      </PageHead>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="stack">
          <div className="grid g4 keep2">
            <Stat k="Receivables" v={money(receivable)} s={`${open.length} open invoices`} tone="navy" /><Stat k="Overdue" v={money(sum(overdue, (i) => invoiceBalance(db, i)))} s={`${overdue.length} invoices`} tone={overdue.length ? 'bad' : 'good'} />
            <Stat k="Collected this month" v={money(sum(live(db.payments).filter((p) => paymentCounts(p) && p.date >= monthStart(T)), (p) => p.amount))} tone="good" /><Stat k="Completed, not yet invoiced" v={uninvoiced.length} s={money(sum(uninvoiced, (j) => j.contract_amount)) + ' ex-VAT'} tone={uninvoiced.length ? 'warn' : 'good'} />
          </div>
          <Card title={`P&L this month (${T.slice(0, 7)})`}>
            <div className="grid g4 keep2"><Stat k="Revenue" v={moneyShort(cm.revenue)} /><Stat k="Gross profit" v={moneyShort(cm.grossProfit)} s={`${pct(cm.grossMargin)} margin`} tone={cm.grossProfit >= 0 ? 'good' : 'bad'} /><Stat k="Operating expenses" v={moneyShort(cm.opex)} /><Stat k="Net profit" v={moneyShort(cm.netProfit)} s={`${pct(cm.netMargin)} margin`} tone={cm.netProfit >= 0 ? 'good' : 'bad'} /></div>
          </Card>
          {uninvoiced.length > 0 && can('invoices.edit') && (
            <Card title="Completed jobs awaiting invoice" flush><ul className="list">{uninvoiced.slice(0, 8).map((j) => <li key={j.id}><div><Link to={`/jobs/${j.id}`}><b>{j.number}</b></Link> · {cn(j.client_id)}<div className="small muted">Completed {fmtDate(j.completed_at)} · {money(j.contract_amount)} ex-VAT</div></div><button className="btn sm primary" onClick={() => { const r = attempt(() => invoiceFromJob(j.id), 'Draft invoice created') as Invoice | undefined; if (r) setTab('invoices'); }}>Create invoice</button></li>)}</ul></Card>
          )}
        </div>
      )}

      {tab === 'invoices' && (
        <Card flush><DataTable<Invoice> rows={invoices.filter((i) => !status || invoiceState(db, i) === status)} rowKey={(i) => i.id} exportTitle="Invoices" initialSort={{ key: 'issue', dir: -1 }}
          filters={<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{['Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Overdue', 'Reversed'].map((s) => <option key={s}>{s}</option>)}</select>}
          cols={[
            { key: 'n', header: 'Invoice #', value: (i) => i.number }, { key: 'c', header: 'Client', value: (i) => cn(i.client_id) }, { key: 'issue', header: 'Issued', value: (i) => i.issue_date, render: (i) => fmtDate(i.issue_date) }, { key: 'due', header: 'Due', value: (i) => i.due_date, render: (i) => fmtDate(i.due_date) },
            { key: 'net', header: 'Net of VAT', num: true, type: 'money', value: (i) => invoiceTotals(i).net, render: (i) => money(invoiceTotals(i).net) }, { key: 'vat', header: 'VAT', num: true, type: 'money', value: (i) => invoiceTotals(i).vat, render: (i) => money(invoiceTotals(i).vat) },
            { key: 'wht', header: 'WHT', num: true, type: 'money', value: (i) => invoiceTotals(i).wht, render: (i) => money(invoiceTotals(i).wht) }, { key: 'tot', header: 'Total', num: true, type: 'money', value: (i) => invoiceTotals(i).total, render: (i) => money(invoiceTotals(i).total) },
            { key: 'paid', header: 'Collected', num: true, type: 'money', value: (i) => invoiceSettled(db, i).cash, render: (i) => money(invoiceSettled(db, i).cash) }, { key: 'bal', header: 'Balance', num: true, type: 'money', value: (i) => invoiceBalance(db, i), render: (i) => money(invoiceBalance(db, i)) },
            { key: 'st', header: 'Status', value: (i) => invoiceState(db, i), render: (i) => <Badge>{invoiceState(db, i)}</Badge> },
            { key: 'actions', header: '', noExport: true, sortable: false, render: (i) => <span className="row">
              <button className="btn sm" onClick={() => attempt(() => invoicePdf(db, i))}>PDF</button>
              {i.status === 'Draft' && can('invoices.edit') && <button className="btn sm" onClick={() => setInv(i)}>Edit</button>}
              {i.status === 'Draft' && can('invoices.approve') && <button className="btn sm primary" onClick={() => attempt(() => approveInvoice(i.id), 'Invoice approved & locked')}>Approve</button>}
              {i.status === 'Draft' && can('invoices.edit') && <button className="btn sm danger" onClick={() => attempt(() => store.remove('invoices', i.id), 'Draft deleted')}>Delete</button>}
              {i.status === 'Approved' && invoiceBalance(db, i) > 0.005 && canRecordPayment(can) && <button className="btn sm primary" onClick={() => setPay(i)}>Record Payment</button>}
              {i.status === 'Approved' && can('invoices.approve') && <button className="btn sm danger" onClick={async () => { const r = await ask('Reverse invoice', 'Reason for reversal'); if (r) attempt(() => reverseInvoice(i.id, r), 'Invoice reversed'); }}>Reverse</button>}</span> },
          ]} /></Card>
      )}

      {tab === 'receivables' && (
        <div className="stack">
          <div className="grid g4 keep2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {AGING_BUCKETS.map((b) => <Stat key={b} k={b === 'Current' ? 'Current' : `${b} days overdue`} v={moneyShort(sum(open.filter((i) => agingBucket(i.due_date, T) === b), (i) => invoiceBalance(db, i)))} tone={b === 'Current' ? 'good' : b === '1–30' ? undefined : 'bad'} />)}
          </div>
          <Card title="Aging by client" flush><DataTable rows={aging} rowKey={(a) => a.client} exportTitle="Receivables aging" pageSize={15}
            totals={['Total', ...AGING_BUCKETS.map((b) => money(sum(aging, (a) => a[b]))), money(sum(aging, (a) => a.total)), ''] as never}
            cols={[{ key: 'c', header: 'Client', value: (a) => cn(a.client), render: (a) => <Link to={`/clients/${a.client}`}><b>{cn(a.client)}</b></Link> }, ...AGING_BUCKETS.map((b) => ({ key: b, header: b === 'Current' ? 'Current' : `${b} days`, num: true, type: 'money' as const, value: (a: (typeof aging)[number]) => a[b], render: (a: (typeof aging)[number]) => (a[b] ? money(a[b]) : '—') })), { key: 't', header: 'Total', num: true, type: 'money', value: (a) => a.total, render: (a) => <b>{money(a.total)}</b> },
              { key: 'actions', header: '', noExport: true, sortable: false, render: (a) => <button className="btn sm" onClick={() => attempt(() => statementPdf(db, a.client, T))}>Statement</button> }]} /></Card>
          <Card title="Open invoices & collection reminders" flush><DataTable<Invoice> rows={open.sort((a, b) => a.due_date.localeCompare(b.due_date))} rowKey={(i) => i.id} exportTitle="Open invoices" cols={[
            { key: 'n', header: 'Invoice', value: (i) => i.number }, { key: 'c', header: 'Client', value: (i) => cn(i.client_id) }, { key: 'due', header: 'Due', value: (i) => i.due_date, render: (i) => fmtDate(i.due_date) },
            { key: 'plan', header: 'Client payment plan', value: (i) => paymentPlanLabel(confirmationOf(db, i.job_id ?? '')), render: (i) => { const pc = confirmationOf(db, i.job_id ?? ''); return pc ? <div className="small">{paymentPlanLabel(pc)}{pc.note && <div className="muted">{pc.note}</div>}</div> : <span className="muted">—</span>; } },
            { key: 'late', header: 'Days overdue', num: true, value: (i) => Math.max(0, diffDays(T, i.due_date)) }, { key: 'bal', header: 'Balance', num: true, type: 'money', value: (i) => invoiceBalance(db, i), render: (i) => money(invoiceBalance(db, i)) }, { key: 'lr', header: 'Last reminder', value: (i) => i.last_reminder ?? '', render: (i) => fmtDate(i.last_reminder) },
            { key: 'actions', header: '', noExport: true, sortable: false, render: (i) => { const c = db.clients.find((x) => x.id === i.client_id)!; const msg = `Hello ${c.contact_person}, friendly reminder from ${db.settings.company.name}: Invoice ${i.number} (${money(invoiceBalance(db, i))}) ${i.due_date < T ? 'was due on' : 'is due on'} ${fmtDate(i.due_date)}. Thank you!`; return <span className="row" onClick={(e) => e.stopPropagation()}>
              {canRecordPayment(can) && <button className="btn sm primary" onClick={() => setPay(i)}>Record Payment</button>}
              <a className="btn sm" target="_blank" rel="noreferrer" href={`https://wa.me/${c.mobile.replace(/[^\d]/g, '').replace(/^0/, '63')}?text=${encodeURIComponent(msg)}`} onClick={() => can('invoices.edit') && store.update('invoices', i.id, { last_reminder: T }, 'update', `Reminder sent for ${i.number}`)}>WhatsApp</a>
              <a className="btn sm" href={`mailto:${c.email}?subject=${encodeURIComponent('Payment reminder – ' + i.number)}&body=${encodeURIComponent(msg)}`} onClick={() => can('invoices.edit') && store.update('invoices', i.id, { last_reminder: T }, 'update', `Reminder sent for ${i.number}`)}>Email</a></span>; } },
          ]} /></Card>
        </div>
      )}

      {tab === 'payments' && (
        <div className="stack">
          <div className="grid g4 keep2">
            <Stat k="Pending verification" v={live(db.payments).filter((p) => (p.status ?? 'Verified') === 'Pending Verification' && !p.reversed).length} s={money(sum(live(db.payments).filter((p) => (p.status ?? 'Verified') === 'Pending Verification' && !p.reversed), (p) => p.amount))} tone={live(db.payments).some((p) => p.status === 'Pending Verification') ? 'warn' : undefined} />
            <Stat k="Cheques awaiting clearance" v={live(db.payments).filter((p) => paymentPending(p) && p.method === 'Cheque' && (p.status ?? 'Verified') === 'Verified').length} s={money(sum(live(db.payments).filter((p) => paymentPending(p) && p.method === 'Cheque' && (p.status ?? 'Verified') === 'Verified'), (p) => p.amount))} />
            <Stat k="Verified this month" v={money(sum(live(db.payments).filter((p) => paymentCounts(p) && p.date >= monthStart(T)), (p) => p.amount))} tone="good" />
            <Stat k="Rejected / bounced" v={live(db.payments).filter((p) => p.status === 'Rejected' || p.cheque_status === 'Bounced').length} />
          </div>
          <Card flush><DataTable<Payment> rows={live(db.payments).filter((p) => !pst || paymentStatusLabel(p) === pst || (pst === 'Pending' && paymentPending(p))).sort((a, b) => (b.paid_at ?? b.date).localeCompare(a.paid_at ?? a.date))} rowKey={(p) => p.id} exportTitle="Payments received" pageSize={15}
            filters={<select value={pst} onChange={(e) => setPst(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="Pending">Not counted yet</option><option>Pending Verification</option><option>Verified</option><option value="Verified · awaiting clearance">Verified · awaiting clearance</option><option>Rejected</option><option>Reversed</option></select>}
            cols={[
            { key: 'r', header: 'Payment', value: (p) => p.receipt_no, render: (p) => <div><b>{p.receipt_no}</b><div className="small muted">{p.paid_at ? fmtDateTime(p.paid_at) : fmtDate(p.date)}</div></div> },
            { key: 'c', header: 'Client / job', value: (p) => cn(p.client_id), render: (p) => <div>{cn(p.client_id)}<div className="small muted">{db.jobs.find((j) => j.id === p.job_id)?.number ?? '—'} · {db.invoices.find((i) => i.id === p.invoice_id)?.number ?? ''}</div></div> },
            { key: 'm', header: 'Method', value: (p) => p.method, render: (p) => <div><b>{p.method}</b><div className="small muted">{p.method === 'Bank Transfer' ? `${p.bank_name ?? ''} · ref ${p.reference} · ${fmtDate(p.transfer_date)}` : p.method === 'Cheque' ? `${p.bank_name ?? ''} · #${p.cheque_no} · ${fmtDate(p.cheque_date)} · ${p.cheque_status}` : p.method === 'GCash' ? `ref ${p.gcash_ref} · ${p.sender}` : ''}</div><div className="small muted">Received by {p.received_by ?? '—'}</div></div> },
            { key: 'a', header: 'Amount', num: true, type: 'money', value: (p) => p.amount, render: (p) => <div>{money(p.amount)}{p.wht_amount > 0 && <div className="small muted">+ WHT {money(p.wht_amount)}</div>}</div> },
            { key: 's', header: 'Status', value: (p) => paymentStatusLabel(p), render: (p) => { const l = paymentStatusLabel(p); return <Badge tone={l === 'Verified' ? 'green' : l === 'Rejected' || l === 'Reversed' || l === 'Cheque Bounced' ? 'red' : 'amber'}>{l}</Badge>; } },
            { key: 'actions', header: '', noExport: true, sortable: false, render: (p) => {
              const st = p.status ?? 'Verified'; const v = can('payments.verify');
              return <span className="row">
                <button className="btn sm" onClick={() => attempt(() => receiptPdf(db, p))}>Receipt</button>
                {v && st === 'Pending Verification' && !p.reversed && <><button className="btn sm primary" onClick={() => attempt(() => verifyPayment(p.id), 'Payment verified')}>Verify</button><button className="btn sm danger" onClick={async () => { const r = await ask('Reject payment', 'Reason'); if (r) attempt(() => rejectPayment(p.id, r), 'Payment rejected'); }}>Reject</button><button className="btn sm" onClick={() => setEditPay(p)}>Edit</button></>}
                {v && p.method === 'Cheque' && !p.reversed && st !== 'Rejected' && <select aria-label="Cheque clearing status" value={p.cheque_status ?? 'Cleared'} onChange={(e) => attempt(() => setChequeStatus(p.id, e.target.value as ChequeStatus), 'Cheque status updated')}>{CHEQUE_STATUSES.map((c) => <option key={c}>{c}</option>)}</select>}
                {v && st === 'Verified' && !p.reversed && <button className="btn sm danger" onClick={async () => { const r = await ask('Reverse payment', 'Reason'); if (r) attempt(() => reversePayment(p.id, r), 'Payment reversed'); }}>Reverse</button>}
                {v && st !== 'Verified' && !p.reversed && <button className="btn sm danger" onClick={async () => { const r = await ask('Delete payment entry', 'Reason'); if (r) attempt(() => deletePayment(p.id, r), 'Payment entry removed (kept in the audit log)'); }}>Delete</button>}
              </span>; } },
          ]} /></Card>
        </div>
      )}

      {tab === 'expenses' && can('expenses.view') && (
        <div className="stack">
          <div className="grid g4 keep2"><Stat k="Approved this month" v={money(sum(live(db.expenses).filter((e) => e.approval === 'Approved' && !e.reversed && e.date >= monthStart(T)), (e) => e.amount))} /><Stat k="Pending approval" v={live(db.expenses).filter((e) => e.approval === 'Pending').length} tone="warn" /><Stat k="Unpaid (approved)" v={money(sum(live(db.expenses).filter((e) => e.approval === 'Approved' && !e.paid && !e.reversed), (e) => e.amount - e.wht))} /><Stat k="Petty cash balance" v={money(pettyBalance())} tone="navy" /></div>
          <Card flush><DataTable<Expense> rows={expenses} rowKey={(e) => e.id} exportTitle="Expenses" initialSort={{ key: 'd', dir: -1 }}
            filters={<><select value={ecat} onChange={(e) => setEcat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select><select value={eap} onChange={(e) => setEap(e.target.value)} aria-label="Approval"><option value="">All</option>{['Pending', 'Approved', 'Rejected', 'Reversed'].map((c) => <option key={c}>{c}</option>)}</select></>}
            actions={can('expenses.edit') && <button className="btn sm" onClick={async () => { const a = await ask('Petty cash replenishment', 'Amount (₱)'); const n = Number(a); if (a && n > 0) attempt(() => pettyCash('Replenishment', n, 'Petty cash replenishment'), 'Petty cash replenished'); }}>Replenish petty cash</button>}
            cols={[
              { key: 'd', header: 'Date', value: (e) => e.date, render: (e) => fmtDate(e.date) }, { key: 'p', header: 'Payee', value: (e) => e.payee, render: (e) => <div><b>{e.payee}</b>{e.notes && <div className="small muted">{e.notes}</div>}</div> }, { key: 'c', header: 'Category', value: (e) => e.category },
              { key: 'j', header: 'Job', value: (e) => db.jobs.find((j) => j.id === e.job_id)?.number ?? '' }, { key: 'a', header: 'Amount', num: true, type: 'money', value: (e) => e.amount, render: (e) => money(e.amount) }, { key: 'v', header: 'VAT', num: true, type: 'money', value: (e) => e.vat, render: (e) => money(e.vat) }, { key: 'w', header: 'WHT', num: true, type: 'money', value: (e) => e.wht, render: (e) => money(e.wht) },
              { key: 'm', header: 'Method', value: (e) => e.method + (e.petty_cash ? ' (petty)' : '') }, { key: 'rc', header: 'Receipt', noExport: true, sortable: false, render: (e) => (e.receipt ? <a href={e.receipt} target="_blank" rel="noreferrer">view</a> : '—') },
              { key: 'ap', header: 'Status', value: (e) => (e.reversed ? 'Reversed' : e.approval), render: (e) => <span className="row" style={{ gap: 4 }}><Badge>{e.reversed ? 'Reversed' : e.approval}</Badge>{e.paid && e.approval === 'Approved' && <Badge tone="teal">Paid</Badge>}{e.recurring && <Badge tone="blue">Recurring</Badge>}{e.source === 'payroll' && <Badge tone="navy">Payroll</Badge>}</span> },
              { key: 'actions', header: '', noExport: true, sortable: false, render: (e) => <span className="row">{e.approval === 'Pending' && can('expenses.approve') && <><button className="btn sm primary" onClick={() => attempt(() => decideExpense(e.id, true), 'Approved')}>Approve</button><button className="btn sm" onClick={() => attempt(() => decideExpense(e.id, false), 'Rejected')}>Reject</button></>}{e.approval === 'Pending' && can('expenses.edit') && <button className="btn sm" onClick={() => setExp(e)}>Edit</button>}{e.approval === 'Approved' && !e.reversed && e.source !== 'payroll' && can('expenses.approve') && <button className="btn sm danger" onClick={async () => { const r = await ask('Reverse expense', 'Reason'); if (r) attempt(() => reverseExpense(e.id, r), 'Expense reversed'); }}>Reverse</button>}</span> },
            ]} /></Card>
          <Card title="Petty cash log" flush><ul className="list">{live(db.petty).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map((p) => <li key={p.id}><span>{fmtDate(p.date)} · {p.description}</span><b className="mono" style={{ color: p.kind === 'Replenishment' ? 'var(--green)' : undefined }}>{p.kind === 'Replenishment' ? '+' : '−'}{money(p.amount)}</b></li>)}</ul></Card>
        </div>
      )}

      {tab === 'profit' && can('profit.view') && (
        <div className="stack">
          <div className="filterbar"><Field label="From"><input type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} /></Field><Field label="To"><input type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} /></Field>
            <Field label="View"><select value={pf} onChange={(e) => setPf(e.target.value as never)}><option value="job">Per job</option><option value="client">Per client</option><option value="service">Per service type</option><option value="period">Per period (P&L)</option></select></Field></div>
          {pf === 'job' && (
            <>
              {rows.filter((r) => r.cost.revenue > 0 && r.cost.grossProfit < 0).length > 0 && <div className="alert err">Unprofitable jobs in this range: {rows.filter((r) => r.cost.revenue > 0 && r.cost.grossProfit < 0).map((r) => r.job.number).join(', ')}</div>}
              <Card flush><DataTable rows={rows} rowKey={(r) => r.job.id} exportTitle="Job profitability" pageSize={15} initialSort={{ key: 'gp', dir: 1 }} cols={[
                { key: 'n', header: 'Job', value: (r) => r.job.number, render: (r) => <Link to={`/jobs/${r.job.id}`}>{r.job.number}</Link> }, { key: 'c', header: 'Client', value: (r) => cn(r.clientId) }, { key: 'rev', header: 'Revenue', num: true, type: 'money', value: (r) => r.cost.revenue, render: (r) => money(r.cost.revenue) },
                { key: 'basis', header: 'Basis', value: (r) => r.cost.revenueBasis, render: (r) => <Badge tone={r.cost.revenueBasis === 'billed' ? 'green' : 'amber'}>{r.cost.revenueBasis}</Badge> },
                { key: 'lab', header: 'Labor', num: true, type: 'money', value: (r) => r.cost.labor, render: (r) => money(r.cost.labor) }, { key: 'mat', header: 'Materials', num: true, type: 'money', value: (r) => r.cost.materials, render: (r) => money(r.cost.materials) }, { key: 'tr', header: 'Transport', num: true, type: 'money', value: (r) => r.cost.transport, render: (r) => money(r.cost.transport) },
                { key: 'eq', header: 'Equipment', num: true, type: 'money', value: (r) => r.cost.equipment, render: (r) => money(r.cost.equipment) }, { key: 'sub', header: 'Subcon', num: true, type: 'money', value: (r) => r.cost.subcontractor, render: (r) => money(r.cost.subcontractor) }, { key: 'oth', header: 'Other', num: true, type: 'money', value: (r) => r.cost.other, render: (r) => money(r.cost.other) },
                { key: 'col', header: 'Collected (verified)', num: true, type: 'money', value: (r) => r.cost.collected, render: (r) => money(r.cost.collected) }, { key: 'out', header: 'Outstanding', num: true, type: 'money', value: (r) => r.cost.outstanding, render: (r) => money(r.cost.outstanding) },
                { key: 'disc', header: 'Discount granted', num: true, type: 'money', value: (r) => r.cost.discount, render: (r) => (r.cost.discount ? money(r.cost.discount) : '—') }, { key: 'gpb', header: 'GP before discount', num: true, type: 'money', value: (r) => r.cost.grossProfitBefore, render: (r) => money(r.cost.grossProfitBefore) },
                { key: 'bjc', header: 'Back job cost', num: true, type: 'money', value: (r) => r.cost.backJobCost, render: (r) => (r.cost.backJobCost ? <span style={{ color: 'var(--red)' }}>{money(r.cost.backJobCost)}</span> : '—') },
                { key: 'tot', header: 'Total cost', num: true, type: 'money', value: (r) => r.cost.total, render: (r) => money(r.cost.total) }, { key: 'gp', header: 'Gross profit', num: true, type: 'money', value: (r) => r.cost.grossProfit, render: (r) => <b style={{ color: r.cost.grossProfit < 0 ? 'var(--red)' : undefined }}>{money(r.cost.grossProfit)}</b> },
                { key: 'm', header: 'Margin', num: true, type: 'pct', value: (r) => r.cost.margin, render: (r) => pct(r.cost.margin) }, { key: 'est', header: 'Cost basis', value: (r) => (r.cost.estimated ? 'Estimated' : 'Actual'), render: (r) => <Badge tone={r.cost.estimated ? 'amber' : 'green'}>{r.cost.estimated ? 'Estimated' : 'Actual'}</Badge> },
              ]} /></Card>
            </>
          )}
          {(pf === 'client' || pf === 'service') && (
            <Card flush><DataTable rows={agg} rowKey={(a) => a.key} exportTitle={pf === 'client' ? 'Client profitability' : 'Service-type profitability'} cols={[
              { key: 'l', header: pf === 'client' ? 'Client' : 'Service type', value: (a) => a.label }, { key: 'j', header: 'Jobs', num: true, value: (a) => a.jobs }, { key: 'r', header: 'Revenue', num: true, type: 'money', value: (a) => a.revenue, render: (a) => money(a.revenue) },
              { key: 'c', header: 'Direct cost', num: true, type: 'money', value: (a) => a.cost, render: (a) => money(a.cost) }, { key: 'g', header: 'Gross profit', num: true, type: 'money', value: (a) => a.gp, render: (a) => <b style={{ color: a.gp < 0 ? 'var(--red)' : undefined }}>{money(a.gp)}</b> },
              { key: 'm', header: 'Margin', num: true, type: 'pct', value: (a) => a.margin, render: (a) => pct(a.margin) }, { key: 'e', header: 'Basis', value: (a) => (a.estimated ? 'Includes estimates' : 'Actual'), render: (a) => <Badge tone={a.estimated ? 'amber' : 'green'}>{a.estimated ? 'Includes estimates' : 'Actual'}</Badge> },
            ]} /></Card>
          )}
          {pf === 'period' && (
            <Card title="Profit & loss by month" flush>
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Line</th>{months.map((m) => <th key={m.m} className="num">{m.m.slice(0, 7)}</th>)}</tr></thead><tbody>
                {([['Revenue (billed, ex-VAT)', (p: ReturnType<typeof profitAndLoss>) => p.revenue], ['Direct labor', (p) => p.direct.labor], ['Materials used', (p) => p.direct.materials], ['Transport & fuel', (p) => p.direct.transport], ['Equipment allocation', (p) => p.direct.equipment], ['Subcontractors & other job costs', (p) => p.direct.subcontractor + p.direct.other], ['Gross profit', (p) => p.grossProfit, true], ['Gross margin %', (p) => p.grossMargin, false, true], ['Operating expenses', (p) => p.opex], ['Net profit', (p) => p.netProfit, true], ['Net margin %', (p) => p.netMargin, false, true]] as [string, (p: ReturnType<typeof profitAndLoss>) => number, boolean?, boolean?][]).map(([l, fn, b, isPct]) => <tr key={l} style={b ? { fontWeight: 700, background: 'rgba(255,255,255,.06)' } : undefined}><td>{l}</td>{months.map((m) => <td key={m.m} className="num">{isPct ? pct(fn(m.p)) : money(fn(m.p))}</td>)}</tr>)}
              </tbody></table></div>
              <p className="small muted" style={{ padding: '0 16px' }}>Direct costs are those of jobs invoiced in the month. Payroll not attributable to invoiced jobs is treated as overhead. Approved payroll appears in the month of the period end.</p>
            </Card>
          )}
        </div>
      )}
      {tab === 'discounts' && can('profit.view') && <DiscountsTab range={range} setRange={setRange} />}
      {inv && <InvoiceModal initial={inv === 'new' ? undefined : inv} onClose={() => setInv(null)} />}
      {pay && <RecordPaymentModal invoice={pay} onClose={() => setPay(null)} />}
      {editPay && <RecordPaymentModal edit={editPay} onClose={() => setEditPay(null)} />}
      {exp && <ExpenseModal initial={exp === 'new' ? undefined : exp} onClose={() => setExp(null)} />}
    </>
  );
}

function DiscountsTab({ range, setRange }: { range: [string, string]; setRange: (r: [string, string]) => void }) {
  const { db } = useAuth();
  const [view, setView] = useState<DiscountView>('client');
  const rows = useMemo(() => discountRows(db, range[0], range[1]), [db, range]);
  const agg = useMemo(() => discountAggregate(db, rows, view), [db, rows, view]);
  const tot = useMemo(() => ({ n: rows.length, granted: sum(rows, (r) => r.granted), net: sum(rows, (r) => r.net), rb: sum(rows, (r) => r.revenueBefore), ra: sum(rows, (r) => r.revenueAfter), gb: sum(rows, (r) => r.gpBefore), ga: sum(rows, (r) => r.gpAfter) }), [rows]);
  const pending = live(db.discount_requests).filter((r) => r.status === 'Pending Admin Approval');
  const label: Record<DiscountView, string> = { client: 'Client', service: 'Service type', leader: 'Team Leader', reason: 'Reason', month: 'Month', job: 'Job' };
  return (
    <div className="stack">
      <div className="filterbar"><Field label="From"><input type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} /></Field><Field label="To"><input type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} /></Field>
        <Field label="Group by"><select value={view} onChange={(e) => setView(e.target.value as DiscountView)}>{(Object.keys(label) as DiscountView[]).map((k) => <option key={k} value={k}>{label[k]}</option>)}</select></Field></div>
      {pending.length > 0 && <div className="alert warn">{pending.length} discount request(s) waiting for Admin approval: {pending.map((r) => <Link key={r.id} to={`/jobs/${r.job_id}`} style={{ marginRight: 8 }}>{r.number}</Link>)}</div>}
      <div className="grid g4 keep2">
        <Stat k="Total discounts granted" v={money(tot.granted)} s={`${tot.n} job(s), incl. VAT`} tone="warn" />
        <Stat k="Revenue impact (ex-VAT)" v={`− ${money(tot.net)}`} s={`${money(tot.rb)} → ${money(tot.ra)}`} />
        <Stat k="Gross profit impact" v={`− ${money(tot.gb - tot.ga)}`} s={`${money(tot.gb)} → ${money(tot.ga)}`} tone={tot.ga < 0 ? 'bad' : undefined} />
        <Stat k="Gross margin" v={pct(tot.ra ? (tot.ga / tot.ra) * 100 : 0)} s={`was ${pct(tot.rb ? (tot.gb / tot.rb) * 100 : 0)} before discounts`} tone="navy" />
      </div>
      <Card flush><DataTable<DiscountAgg> rows={agg} rowKey={(a) => a.key} exportTitle={`Discounts by ${label[view].toLowerCase()}`} cols={[
        { key: 'l', header: label[view], value: (a) => a.label }, { key: 'n', header: 'Discounts', num: true, value: (a) => a.count }, { key: 'g', header: 'Granted (incl. VAT)', num: true, type: 'money', value: (a) => a.granted, render: (a) => <b>{money(a.granted)}</b> },
        { key: 'p', header: 'Avg % of bill', num: true, type: 'pct', value: (a) => a.avgPct, render: (a) => pct(a.avgPct) }, { key: 'rb', header: 'Revenue before', num: true, type: 'money', value: (a) => a.revenueBefore, render: (a) => money(a.revenueBefore) }, { key: 'ra', header: 'Revenue after', num: true, type: 'money', value: (a) => a.revenueAfter, render: (a) => money(a.revenueAfter) },
        { key: 'gb', header: 'GP before', num: true, type: 'money', value: (a) => a.gpBefore, render: (a) => money(a.gpBefore) }, { key: 'ga', header: 'GP after', num: true, type: 'money', value: (a) => a.gpAfter, render: (a) => <b style={{ color: a.gpAfter < 0 ? 'var(--red)' : undefined }}>{money(a.gpAfter)}</b> },
        { key: 'mb', header: 'Margin before', num: true, type: 'pct', value: (a) => a.marginBefore, render: (a) => pct(a.marginBefore) }, { key: 'ma', header: 'Margin after', num: true, type: 'pct', value: (a) => a.marginAfter, render: (a) => pct(a.marginAfter) },
      ]} /></Card>
      <Card title="Discount register" flush><DataTable<DiscountRow> rows={rows} rowKey={(r) => r.req.id} exportTitle="Discount register" pageSize={10} cols={[
        { key: 'n', header: 'Request', value: (r) => r.req.number }, { key: 'j', header: 'Job', value: (r) => r.job.number, render: (r) => <Link to={`/jobs/${r.job.id}`}>{r.job.number}</Link> }, { key: 'c', header: 'Client', value: (r) => db.clients.find((c) => c.id === r.clientId)?.name ?? '' },
        { key: 'tl', header: 'Team Leader', value: (r) => db.employees.find((e) => e.id === r.leaderId)?.full_name ?? '' }, { key: 'rs', header: 'Reason', value: (r) => r.req.reason }, { key: 'm', header: 'Month', value: (r) => r.month },
        { key: 'g', header: 'Granted', num: true, type: 'money', value: (r) => r.granted, render: (r) => money(r.granted) }, { key: 'by', header: 'Approved by', value: (r) => db.users.find((u) => u.id === r.req.decided_by)?.name ?? '' }, { key: 'nt', header: 'Approval note', value: (r) => r.req.decision_note ?? '' },
      ]} /></Card>
    </div>
  );
}
void docTotals;
