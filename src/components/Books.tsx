// Finance → Bookkeeping: the bookkeeper picks a period and generates the books and statements from the company's own records.
// Opening balances and adjusting entries (owner investment, drawings, depreciation …) are typed in here; everything else is worked out.
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, attempt, toast } from '@/components/ui';
import { exportCsv, exportPdf, exportXlsx } from '@/lib/export';
import { COA, ACCT, buildEntries, entryProblem, openingLines, sumCredit, sumDebit, type BookLine, type ManualEntry } from '@/lib/books';
import { REPORTS, allReports, balanceSheetReport, cashDisbursementsBook, cashFlowReport, cashReceiptsBook, equityReport, generalJournal, generalLedger, incomeStatementReport, purchasesList, salesList, trialBalanceReport, type Report, type ReportId } from '@/lib/bookreports';
import { removeManual, saveManual, useManual } from '@/lib/booksdata';
import { listReceipts } from '@/lib/receipts';
import type { BirReceipt } from '@/lib/bir';
import { addDays, fmtDate, money, monthEnd, monthStart, today } from '@/lib/util';

/** Runs a save, shows what went wrong in plain words, and says whether it worked. */
async function run(fn: () => Promise<void>, ok: string): Promise<boolean> {
  try { await fn(); toast(ok, 'ok'); return true; } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'err'); return false; }
}

type Preset = 'month' | 'last' | 'quarter' | 'year' | 'lastyear' | 'custom';
const PRESETS: { id: Preset; label: string }[] = [{ id: 'month', label: 'This month' }, { id: 'last', label: 'Last month' }, { id: 'quarter', label: 'This quarter' }, { id: 'year', label: 'This year' }, { id: 'lastyear', label: 'Last year' }, { id: 'custom', label: 'Custom dates' }];
function range(p: Preset, T: string): [string, string] {
  const y = +T.slice(0, 4), m = +T.slice(5, 7);
  if (p === 'month') return [monthStart(T), monthEnd(T)];
  if (p === 'last') { const f = monthStart(addDays(monthStart(T), -1)); return [f, monthEnd(f)]; }
  if (p === 'quarter') { const q = Math.floor((m - 1) / 3) * 3 + 1; const f = `${y}-${String(q).padStart(2, '0')}-01`; return [f, monthEnd(`${y}-${String(q + 2).padStart(2, '0')}-01`)]; }
  if (p === 'year') return [`${y}-01-01`, `${y}-12-31`];
  if (p === 'lastyear') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  return [monthStart(T), T];
}

export function Books() {
  const { db, can } = useAuth(); const T = today();
  const manage = can('books.manage');
  const { rows: manual, missing, err, reload } = useManual();
  const [id, setId] = useState<ReportId>('is');
  const [preset, setPreset] = useState<Preset>('month'); const [custom, setCustom] = useState<[string, string]>(range('month', T));
  const [from, to] = preset === 'custom' ? custom : range(preset, T);
  const [month, setMonth] = useState(T.slice(0, 7)); const [account, setAccount] = useState(''); const [allInGj, setAllInGj] = useState(false);
  const [rcs, setRcs] = useState<BirReceipt[]>([]);
  useEffect(() => { let off = false; listReceipts().then((r) => { if (!off) setRcs(r); }).catch(() => undefined); return () => { off = true; }; }, []);
  const entries = useMemo(() => buildEntries(db, manual), [db, manual]);
  const opening = manual.filter((m) => m.kind === 'opening').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
  const [setup, setSetup] = useState(false); const [openOb, setOpenOb] = useState(false); const [edit, setEdit] = useState<ManualEntry | 'new' | null>(null);

  const report: Report = useMemo(() => {
    switch (id) {
      case 'crb': return cashReceiptsBook(db, entries, from, to);
      case 'cdb': return cashDisbursementsBook(db, entries, from, to);
      case 'gj': return generalJournal(db, entries, from, to, allInGj);
      case 'gl': return generalLedger(db, entries, from, to, account || undefined);
      case 'sls': return salesList(db, month);
      case 'slp': return purchasesList(db, month, rcs);
      case 'cfs': return cashFlowReport(db, entries, from, to);
      case 'bs': return balanceSheetReport(db, entries, to);
      case 'is': return incomeStatementReport(db, entries, from, to);
      case 'sce': return equityReport(db, entries, from, to);
      case 'tb': return trialBalanceReport(db, entries, to);
    }
  }, [id, db, entries, from, to, month, account, allInGj, rcs]);
  const meta = REPORTS.find((r) => r.id === id)!;
  const bad = (from > to) ? 'The start date is after the end date.' : '';

  const out = (kind: 'csv' | 'xlsx' | 'pdf') => attempt(async () => { if (kind === 'csv') exportCsv(report); else if (kind === 'xlsx') await exportXlsx(report); else await exportPdf(report); });
  const everything = () => attempt(async () => { await exportXlsx(allReports(db, entries, from, to, month, rcs), `topmop-books-${from}-to-${to}.xlsx`); toast('Downloaded all the books and statements in one Excel file', 'ok'); });

  return (
    <div className="stack">
      <div className="alert info">
        <b>Books and statements, prepared from the system's own records.</b> Invoices, collections, expenses, payroll and petty cash are booked automatically (accrual basis). Enter the <b>opening balances</b> once, and use <b>adjusting entries</b> for what the system cannot know: owner investments and drawings, loans, equipment purchases, depreciation and income tax. The bookkeeper reviews the figures; this is not an audit.
      </div>
      {missing && <div className="alert warn">The bookkeeping table is not in the database yet. Apply the latest database update (migration 0087). Reports still work from the system's records; opening balances and adjusting entries cannot be saved until then.</div>}
      {err && <div className="alert warn">{err}</div>}

      <Card title="1 · Choose the period">
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
          <Field label="Period"><select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
          <Field label="From"><input type="date" value={from} disabled={preset !== 'custom'} onChange={(e) => setCustom([e.target.value, custom[1]])} /></Field>
          <Field label="To"><input type="date" value={to} disabled={preset !== 'custom'} onChange={(e) => setCustom([custom[0], e.target.value])} /></Field>
          <Field label="Tax month (sales / purchases lists)"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          <button className="btn primary" disabled={!!bad} onClick={() => void everything()}>⬇ Download everything (Excel)</button>
        </div>
        {bad && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>{bad}</div>}
        <div className="small muted" style={{ marginTop: 6 }}>{opening ? `Books start ${fmtDate(opening.entry_date)} (opening balances entered). Records before that date are not included.` : 'No opening balances yet: the books start from the first record in the system. Enter opening balances below to include cash, equipment and amounts owed from before.'}</div>
      </Card>

      <Card title="2 · Pick a report">
        <div className="grid g3" style={{ gap: 8 }}>
          {REPORTS.map((r) => <button key={r.id} type="button" className={`btn${id === r.id ? ' primary' : ''}`} style={{ textAlign: 'left', whiteSpace: 'normal', padding: 10 }} onClick={() => setId(r.id)}><b>{r.label}</b><div className="small" style={{ opacity: 0.8 }}>{r.blurb}</div></button>)}
        </div>
      </Card>

      <Card title={report.title} actions={<div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => void out('csv')}>CSV</button><button className="btn sm" onClick={() => void out('xlsx')}>Excel</button><button className="btn sm primary" onClick={() => void out('pdf')}>PDF</button></div>}>
        <div className="small muted" style={{ marginBottom: 8 }}>{report.subtitle}</div>
        {id === 'gl' && <div style={{ maxWidth: 360, marginBottom: 8 }}><Field label="Account"><select value={account} onChange={(e) => setAccount(e.target.value)}><option value="">All accounts with activity</option>{COA.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field></div>}
        {id === 'gj' && <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" checked={allInGj} onChange={(e) => setAllInGj(e.target.checked)} />Include cash receipts and payments too</label>}
        <ReportTable r={report} />
        {report.note && <div className="small muted" style={{ marginTop: 8 }}>{report.note}</div>}
        <div className="small muted">{meta.kind === 'month' ? `Tax month ${month}` : meta.kind === 'asof' ? `As of ${fmtDate(to)}` : `${fmtDate(from)} to ${fmtDate(to)}`}</div>
      </Card>

      <Card title="3 · Opening balances and adjusting entries" actions={<button className="btn sm" onClick={() => setSetup(!setup)}>{setup ? 'Hide' : 'Show'}</button>}>
        {!setup && <div className="small muted">{manual.filter((m) => m.kind === 'manual').length} adjusting entr{manual.filter((m) => m.kind === 'manual').length === 1 ? 'y' : 'ies'}{opening ? ' · opening balances entered' : ' · no opening balances yet'}. Tap Show to enter or change them.</div>}
        {setup && <div className="stack">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" disabled={!manage || missing} onClick={() => setOpenOb(true)}>{opening ? 'Change opening balances' : 'Enter opening balances'}</button>
            <button className="btn primary" disabled={!manage || missing} onClick={() => setEdit('new')}>+ New adjusting entry</button>
            {!manage && <span className="small muted">Only Finance staff and the Owner can enter these.</span>}
          </div>
          <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Date</th><th>Ref</th><th>Entry</th><th className="num">Amount</th><th /></tr></thead><tbody>
            {[...manual].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).map((m) => <tr key={m.id}>
              <td>{fmtDate(m.entry_date)}</td><td>{m.ref}</td><td>{m.kind === 'opening' ? <><Badge tone="teal">Opening balances</Badge> {m.memo}</> : m.memo}<div className="small muted">{m.lines.map((l) => `${l.debit ? 'Dr' : 'Cr'} ${ACCT.get(l.account)?.name ?? l.account}`).join(' · ')}</div></td>
              <td className="num">{money(sumDebit(m.lines))}</td>
              <td className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>{manage && <><button className="btn sm" onClick={() => (m.kind === 'opening' ? setOpenOb(true) : setEdit(m))}>Edit</button><button className="btn sm danger" onClick={() => { if (confirm(`Delete this ${m.kind === 'opening' ? 'set of opening balances' : 'entry'}? The reports change straight away.`)) void run(async () => { await removeManual(m.id); reload(); }, 'Deleted'); }}>Delete</button></>}</td>
            </tr>)}
            {!manual.length && <tr><td colSpan={5} className="muted">Nothing entered yet.</td></tr>}
          </tbody></table></div>
        </div>}
      </Card>

      {openOb && <OpeningModal existing={opening} onClose={() => setOpenOb(false)} onSaved={reload} />}
      {edit && <EntryModal initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </div>
  );
}

function ReportTable({ r }: { r: Report }) {
  const cell = (v: string | number, i: number) => (typeof v === 'number' ? (r.types?.[i] === 'money' ? money(v) : v.toLocaleString('en-PH')) : v);
  if (!r.rows.length) return <div className="muted">Nothing to show for this period.</div>;
  return (
    <div className="tbl-wrap"><table className="tbl compact">
      <thead><tr>{r.headers.map((h, i) => <th key={i} className={r.types?.[i] === 'money' ? 'num' : ''}>{h}</th>)}</tr></thead>
      <tbody>
        {r.rows.map((row, k) => { const st = r.styles?.[k] ?? ''; return (
          <tr key={k} style={st === 'h' ? { background: 'rgba(120,140,170,.14)', fontWeight: 800 } : st === 'b' ? { fontWeight: 800 } : undefined}>
            {row.map((v, i) => <td key={i} className={r.types?.[i] === 'money' ? 'num' : ''} style={st === 'i' && i === 0 && r.headers.length === 2 ? { paddingLeft: 24 } : undefined}>{v === '' ? '' : cell(v, i)}</td>)}
          </tr>); })}
        {r.totals && <tr style={{ fontWeight: 800 }}>{r.totals.map((v, i) => <td key={i} className={r.types?.[i] === 'money' ? 'num' : ''}>{typeof v === 'number' ? money(v) : v}</td>)}</tr>}
      </tbody>
    </table></div>
  );
}

/** Opening balances: what each account held when the books begin. Owner's capital is worked out (assets less liabilities). */
const OPEN_ACCTS = COA.filter((a) => (a.type === 'asset' || a.type === 'liability' || a.code === '3020') && a.code !== '3020');
function OpeningModal({ existing, onClose, onSaved }: { existing?: ManualEntry; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(existing?.entry_date ?? `${today().slice(0, 4)}-01-01`);
  const start = useMemo(() => { const m: Record<string, string> = {}; for (const l of existing?.lines ?? []) { const a = ACCT.get(l.account); if (!a || l.account === '3010') continue; m[l.account] = String(l.debit || l.credit); } return m; }, [existing]);
  const [v, setV] = useState<Record<string, string>>(start);
  const num = Object.fromEntries(OPEN_ACCTS.map((a) => [a.code, Number(v[a.code]) || 0]));
  const lines = openingLines(num); const cap = lines.find((l) => l.account === '3010');
  const save = async () => { if (await run(() => saveManual({ id: existing?.id, entry_date: date, ref: 'OPENING', memo: 'Opening balances', kind: 'opening', lines }), 'Opening balances saved')) { onSaved(); onClose(); } };
  return (
    <Modal title="Opening balances" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!lines.length} onClick={() => void save()}>Save opening balances</button></>}>
      <div className="stack">
        <div className="alert info">Enter what the company had on the day the books begin, from your last balance sheet or bank statements. Records dated before this day are left out of the books, so nothing is counted twice. Leave a line empty if it is zero.</div>
        <Field label="Books begin on" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Account</th><th className="num">Balance (₱)</th></tr></thead><tbody>
          {OPEN_ACCTS.map((a) => <tr key={a.code}><td>{a.type === 'asset' ? 'Asset' : 'Liability'} · {a.name}{a.contra ? ' (enter as a positive amount)' : ''}</td><td className="num"><input type="number" min="0" step="0.01" inputMode="decimal" value={v[a.code] ?? ''} onChange={(e) => setV({ ...v, [a.code]: e.target.value })} style={{ width: 150 }} aria-label={a.name} /></td></tr>)}
          <tr style={{ fontWeight: 800 }}><td>Owner's capital (assets less liabilities, worked out)</td><td className="num">{money(cap ? cap.credit - cap.debit : 0)}</td></tr>
        </tbody></table></div>
      </div>
    </Modal>
  );
}

/** One adjusting entry: owner puts money in, takes drawings, depreciation, a loan … Debits must equal credits. */
const TEMPLATES: { label: string; memo: string; dr: string; cr: string }[] = [
  { label: 'Owner invests cash', memo: 'Owner invested cash in the business', dr: '1020', cr: '3010' },
  { label: "Owner's drawings", memo: "Owner's drawings", dr: '3020', cr: '1020' },
  { label: 'Depreciation', memo: 'Depreciation for the period', dr: '6100', cr: '1590' },
  { label: 'Equipment bought', memo: 'Purchase of equipment', dr: '1500', cr: '1020' },
  { label: 'Loan received', memo: 'Loan received', dr: '1020', cr: '2500' },
  { label: 'Loan repaid', memo: 'Loan repayment', dr: '2500', cr: '1020' },
  { label: 'Income tax', memo: 'Income tax for the period', dr: '6070', cr: '2010' },
];
function EntryModal({ initial, onClose, onSaved }: { initial?: ManualEntry; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(initial?.entry_date ?? today()); const [ref, setRef] = useState(initial?.ref ?? ''); const [memo, setMemo] = useState(initial?.memo ?? '');
  const [lines, setLines] = useState<BookLine[]>(initial?.lines.length ? initial.lines : [{ account: '1020', debit: 0, credit: 0 }, { account: '3010', debit: 0, credit: 0 }]);
  const set = (i: number, p: Partial<BookLine>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const d = sumDebit(lines), c = sumCredit(lines); const problem = entryProblem(lines);
  const tpl = (t: typeof TEMPLATES[number]) => { setMemo(t.memo); setLines([{ account: t.dr, debit: 0, credit: 0 }, { account: t.cr, debit: 0, credit: 0 }]); };
  const amount = (v: number) => setLines(lines.map((l, k) => (k === 0 ? { ...l, debit: v, credit: 0 } : k === 1 ? { ...l, debit: 0, credit: v } : l)));
  const save = async () => { if (await run(() => saveManual({ id: initial?.id, entry_date: date, ref, memo, kind: 'manual', lines }), 'Entry saved')) { onSaved(); onClose(); } };
  return (
    <Modal title={initial ? 'Edit adjusting entry' : 'New adjusting entry'} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!!problem} onClick={() => void save()}>Save entry</button></>}>
      <div className="stack">
        {!initial && <div><div className="small muted" style={{ marginBottom: 4 }}>Start from a common entry</div><div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{TEMPLATES.map((t) => <button key={t.label} type="button" className="btn sm" onClick={() => tpl(t)}>{t.label}</button>)}</div></div>}
        <div className="form-grid">
          <Field label="Date" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Reference"><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. JV-001" /></Field>
          <Field label="What is this entry?" required className="full"><input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Owner invested cash" /></Field>
        </div>
        {lines.length === 2 && <Field label="Amount (₱) — fills the first debit and credit"><input type="number" min="0" step="0.01" inputMode="decimal" value={lines[0].debit || lines[1].credit || ''} onChange={(e) => amount(Number(e.target.value) || 0)} /></Field>}
        <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th><th /></tr></thead><tbody>
          {lines.map((l, i) => <tr key={i}>
            <td><select value={l.account} onChange={(e) => set(i, { account: e.target.value })}>{COA.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></td>
            <td className="num"><input type="number" min="0" step="0.01" value={l.debit || ''} onChange={(e) => set(i, { debit: Number(e.target.value) || 0, credit: 0 })} style={{ width: 130 }} aria-label="Debit" /></td>
            <td className="num"><input type="number" min="0" step="0.01" value={l.credit || ''} onChange={(e) => set(i, { credit: Number(e.target.value) || 0, debit: 0 })} style={{ width: 130 }} aria-label="Credit" /></td>
            <td>{lines.length > 2 && <button className="btn sm danger" onClick={() => setLines(lines.filter((_, k) => k !== i))}>✕</button>}</td>
          </tr>)}
          <tr style={{ fontWeight: 800 }}><td>Total</td><td className="num">{money(d)}</td><td className="num">{money(c)}</td><td /></tr>
        </tbody></table></div>
        <button className="btn sm" onClick={() => setLines([...lines, { account: '6090', debit: 0, credit: 0 }])}>+ Add a line</button>
        {problem && (d > 0 || c > 0) && <div className="alert warn">{problem}</div>}
      </div>
    </Modal>
  );
}
