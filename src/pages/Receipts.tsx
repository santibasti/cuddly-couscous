// Receipts: photograph an official receipt, the AI reads what BIR filing needs (supplier, TIN, address, VAT, amounts), a person checks it,
// and the scan is kept, so a fading or damaged receipt no longer loses its details. Posting a receipt creates the expense (and feeds the SLP).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { store, useAuth, live } from '@/lib/store';
import { Badge, Card, Field, Modal, PageHead, Stat, attempt, toast } from '@/components/ui';
import { CLOUD } from '@/lib/cloud';
import { saveExpense } from '@/lib/actions';
import { exportCsv } from '@/lib/export';
import { blankDraft, checkReceipt, deleteReceipt, draftFromReading, forAi, isOwnDocument, listReceipts, prepareScan, readReceipt, readyForBir, rotateScan, saveNewReceipt, scanUrl, updateReceipt, type Check, type Receipt, type ReceiptDraft, type ReceiptVat } from '@/lib/receipts';
import { fmtTin } from '@/lib/bir';
import { fmtDate, money, today } from '@/lib/util';
import type { ExpenseCategory, ExpenseMethod } from '@/lib/types';

const CATEGORIES: ExpenseCategory[] = ['Fuel', 'Materials', 'Equipment Repair', 'Transportation', 'Marketing', 'Rent', 'Utilities', 'Government Fees', 'Subcontractor', 'Toll & Parking', 'Meals & Snacks', 'Other'];
const METHODS: ExpenseMethod[] = ['Cash', 'Bank Transfer', 'Check', 'GCash', 'Credit Card', 'Other'];
const num = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(/[^\d.\-]/g, '')) || 0);

function Editor({ initial, seed, scan, reading, others, onClose, onSaved, onRotate }: { initial?: Receipt; seed?: ReceiptDraft; scan?: { blob: Blob; dataUrl: string }; reading?: { busy: boolean; error?: string }; others: Receipt[]; onClose: () => void; onSaved: () => void; onRotate?: () => void }) {
  const { db, can, user } = useAuth();
  const [d, setD] = useState<ReceiptDraft>(initial ? { ...initial } : blankDraft()); const [busy, setBusy] = useState(false); const [confirmed, setConfirmed] = useState(false); const [askBir, setAskBir] = useState(false);
  const [img, setImg] = useState(scan?.dataUrl ?? ''); const [zoom, setZoom] = useState(false);
  useEffect(() => { if (initial) void scanUrl(initial).then(setImg); }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (scan) setImg(scan.dataUrl); }, [scan?.dataUrl]);
  const own = isOwnDocument(d, db.settings.company);
  useEffect(() => { if (seed && !reading?.busy) setD(seed); }, [seed, reading?.busy]); // the AI's reading arrives after the window opens
  const set = <K extends keyof ReceiptDraft>(k: K, v: ReceiptDraft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const checks = useMemo(() => checkReceipt(d, others, initial?.id), [d, others, initial?.id]);
  const bad = (f: string) => checks.find((c) => c.field === f && c.level !== 'info');
  const st = (f: string) => (bad(f) ? { borderColor: bad(f)!.level === 'error' ? 'var(--red)' : 'var(--amber)' } : undefined);
  const locked = initial?.status === 'Posted';
  const text = (k: keyof ReceiptDraft, f: string) => <input style={st(f)} disabled={locked} value={(d[k] as string | null) ?? ''} onChange={(e) => set(k, (e.target.value || null) as never)} />;
  const money_ = (k: keyof ReceiptDraft, f: string) => <input style={st(f)} disabled={locked} inputMode="decimal" value={(d[k] as number | null) ?? ''} onChange={(e) => set(k, num(e.target.value) as never)} />;
  const save = async () => {
    setBusy(true);
    try {
      if (initial) await updateReceipt(initial.id, { ...d }); else await saveNewReceipt(d, scan!, user?.name ?? user?.email ?? 'Scanner');
      toast(initial ? 'Receipt updated' : 'Receipt saved with its scan', 'ok'); onSaved(); onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save the receipt', 'err'); }
    setBusy(false);
  };
  const post = (mode: BirMode) => {
    if (!initial) return; if (!d.total_amount) return toast('Enter the total amount first.', 'err');
    if (mode === 'yes') { void updateReceipt(initial.id, { ...d, status: 'Posted', expense_id: null, bir_mode: 'yes' }).then(() => { toast('Kept for BIR only. It is not counted as an expense.', 'ok'); onSaved(); onClose(); }); return; }
    const e = attempt(() => saveExpense({ date: d.receipt_date ?? today(), payee: d.supplier_name ?? 'Receipt', category: (d.category as ExpenseCategory) ?? 'Other', job_id: d.job_id ?? undefined, branch_id: db.branches[0].id, amount: d.total_amount!, vat: d.supplier_vat === 'VAT' ? (d.vat_amount ?? 0) : 0, wht: 0,
      method: ((d.payment_method as ExpenseMethod) ?? 'Cash'), approval: 'Pending', paid: true, petty_cash: false, recurring: null, notes: `Scanned receipt ${d.receipt_no ?? ''}${d.description ? ` · ${d.description}` : ''}`.trim(),
      supplier_name: d.supplier_name ?? undefined, supplier_tin: d.supplier_tin ?? undefined, supplier_address: d.supplier_address ?? undefined, supplier_vat: (d.supplier_vat as ReceiptVat | null) ?? undefined, supplier_invoice_no: d.receipt_no ?? undefined, bir_use: mode === 'both' }), 'Posted as an expense, pending approval') as { id: string } | undefined;
    if (e) void updateReceipt(initial.id, { ...d, status: 'Posted', expense_id: e.id, bir_mode: mode }).then(() => { onSaved(); onClose(); });
  };
  const errors = checks.filter((c) => c.level === 'error').length;

  return (
    <Modal title={initial ? 'Receipt' : 'New receipt'} size="xl" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{locked ? 'Close' : 'Cancel'}</button>
      {initial && !locked && can('receipts.manage') && <button className="btn danger" disabled={busy} onClick={async () => { if (!confirm('Delete this receipt and its scan record? It goes to the recycle bin.')) return; try { await deleteReceipt(initial.id); toast('Receipt deleted', 'ok'); onSaved(); onClose(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'err'); } }}>Delete</button>}
      {initial && img && <a className="btn" href={img} download={`receipt-${d.receipt_no ?? initial.id.slice(0, 6)}.jpg`}>Download scan</a>}
      {!locked && <button className="btn primary" disabled={busy || reading?.busy || (!initial && !confirmed)} title={!initial && !confirmed ? 'Tick the box to confirm the details first' : undefined} onClick={save}>{initial ? 'Save changes' : 'Save receipt'}</button>}
      {initial && !locked && !own && can('expenses.edit') && <button className="btn primary" disabled={busy} onClick={() => setAskBir(true)}>Post receipt</button>}
    </>}>
      <div className="rc-grid">
        <div className="rc-scan">
          {img ? <img src={img} alt="Receipt scan" className={zoom ? 'zoom' : ''} onClick={() => setZoom(!zoom)} title="Tap to zoom" /> : <div className="muted">No scan</div>}
          <div className="small muted">Tap the picture to zoom. The scan is kept with the record.</div>
          {onRotate && !initial && <button type="button" className="btn sm" disabled={reading?.busy} onClick={onRotate}>↻ Turn 90° and read again</button>}
        </div>
        <div className="stack">
          {reading?.busy && <div className="alert info rc-reading"><span className="rc-spin" /> Reading the receipt…</div>}
          {own && <div className="alert info small"><b>This is TopMop's own invoice (a sale), not a purchase.</b> The scan is kept as a copy of the invoice you issued, but it is not posted as an expense and does not go on the Summary List of Purchases.{d.ocr?.buyer?.name ? <> Sold to: <b>{d.ocr.buyer.name}</b>{d.ocr.buyer.tin ? ` · TIN ${d.ocr.buyer.tin}` : ''}{d.ocr.buyer.address ? ` · ${d.ocr.buyer.address}` : ''}.</> : null}</div>}
          {reading?.error && <div className="alert warn">{reading.error} You can still type the details below.</div>}
          {!initial && !CLOUD && <div className="alert info small">Demo mode: the AI reader works on the live site. Type the details below to try the rest.</div>}
          <div className="form-grid">
            <Field label="Supplier registered name" className="full">{text('supplier_name', 'supplier_name')}</Field>
            <Field label="Supplier TIN">{text('supplier_tin', 'supplier_tin')}</Field>
            <Field label="Receipt / invoice no.">{text('receipt_no', 'receipt_no')}</Field>
            <Field label="Supplier address" className="full">{text('supplier_address', 'supplier_address')}</Field>
            <Field label="Date"><input type="date" style={st('receipt_date')} disabled={locked} value={d.receipt_date ?? ''} onChange={(e) => set('receipt_date', e.target.value || null)} /></Field>
            <Field label="Document"><select disabled={locked} value={d.doc_type ?? ''} onChange={(e) => set('doc_type', e.target.value || null)}><option value="">—</option>{['Official Receipt', 'Sales Invoice', 'Cash Invoice', 'Billing Invoice', 'Other'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Supplier VAT status"><select style={st('supplier_vat')} disabled={locked} value={d.supplier_vat ?? ''} onChange={(e) => set('supplier_vat', (e.target.value || null) as ReceiptVat | null)}><option value="">— choose —</option><option value="VAT">VAT-registered</option><option value="Non-VAT">Non-VAT</option><option value="Zero-rated">Zero-rated</option><option value="Exempt">VAT-exempt</option></select></Field>
            <Field label="Payment method"><select disabled={locked} value={d.payment_method ?? ''} onChange={(e) => set('payment_method', e.target.value || null)}><option value="">—</option>{METHODS.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Total amount (₱)">{money_('total_amount', 'total_amount')}</Field>
            <Field label="VATable sales (₱)">{money_('vatable_sales', 'vatable_sales')}</Field>
            <Field label="VAT (₱)">{money_('vat_amount', 'vat_amount')}</Field>
            <Field label="VAT-exempt sales (₱)">{money_('exempt_amount', 'exempt_amount')}</Field>
            <Field label="Zero-rated sales (₱)">{money_('zero_rated_amount', 'zero_rated_amount')}</Field>
            <Field label="Expense category"><select disabled={locked} value={d.category ?? ''} onChange={(e) => set('category', e.target.value || null)}><option value="">— choose —</option>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Related job (optional)" className="full"><select disabled={locked} value={d.job_id ?? ''} onChange={(e) => set('job_id', e.target.value || null)}><option value="">— overhead —</option>{live(db.jobs).sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 80).map((j) => <option key={j.id} value={j.id}>{j.number} · {db.clients.find((c) => c.id === j.client_id)?.name}</option>)}</select></Field>
            <Field label="What was bought" className="full">{text('description', 'description')}</Field>
          </div>
          {!initial && <label className="check rc-confirm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> <span><b>I checked every detail against the receipt.</b> Supplier, TIN, address, receipt no., date and amounts match what is printed. <small>Saved under {user?.name ?? 'your name'}.</small></span></label>}
          {initial && <div className="small muted">{initial.confirmed_by ? `Details confirmed by ${initial.confirmed_by}${initial.confirmed_at ? ` on ${fmtDate(initial.confirmed_at.slice(0, 10))}` : ''}.` : 'Not confirmed by the scanner.'}</div>}
          {initial && initial.status === 'Posted' && can('receipts.manage') && <BirChoice r={initial} onSaved={onSaved} />}
          <div className="stack" style={{ gap: 4 }}>
            {checks.map((c: Check, i) => <div key={i} className="small" style={{ color: c.level === 'error' ? 'var(--red)' : c.level === 'warn' ? 'var(--amber)' : 'var(--muted)' }}>{c.level === 'error' ? '⛔' : c.level === 'warn' ? '⚠️' : 'ℹ️'} {c.text}</div>)}
            {!checks.length && <div className="small" style={{ color: 'var(--green)' }}>✓ Everything BIR needs is on this receipt.</div>}
            {errors > 0 && <div className="small muted">You can save it now and complete it later; it stays flagged until the ⛔ items are filled.</div>}
          </div>
        </div>
      </div>
      {askBir && (
        <Modal title="Use this receipt for BIR filing?" onClose={() => setAskBir(false)} footer={<button className="btn" onClick={() => setAskBir(false)}>Cancel</button>}>
          <div className="stack">
            <div>Receipt of <b>{d.supplier_name ?? 'this supplier'}</b> ({money(d.total_amount ?? 0)}). Choose where it goes:</div>
            {!readyForBir(checks) && <div className="alert warn small">This receipt still has missing details (⛔). BIR needs the supplier TIN, address and receipt number.</div>}
            <button className="btn lg" style={{ textAlign: 'left' }} onClick={() => { setAskBir(false); post('yes'); }}><b>Yes: BIR only.</b> <span className="small muted">On the BIR Summary List of Purchases, <u>not</u> counted as an expense (no effect on profit or job costs).</span></button>
            <button className="btn lg" style={{ textAlign: 'left' }} onClick={() => { setAskBir(false); post('no'); }}><b>No: expense only.</b> <span className="small muted">Counted as an expense, left off the BIR list.</span></button>
            <button className="btn primary lg" style={{ textAlign: 'left' }} onClick={() => { setAskBir(false); post('both'); }}><b>Both: expense and BIR.</b> <span className="small">Counted as an expense and on the BIR list.</span></button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

type BirMode = 'yes' | 'no' | 'both';
const MODE_LABEL: Record<BirMode, string> = { yes: 'Yes: BIR only', no: 'No: expense only', both: 'Both: expense and BIR' };
function BirChoice({ r, onSaved }: { r: Receipt; onSaved: () => void }) {
  const { db } = useAuth();
  const set = async (m: BirMode) => {
    try {
      if (m === r.bir_mode) return;
      if (r.expense_id) {
        if (m === 'yes') return toast('The expense is already posted. Keep it as No or Both, or reverse the expense first.', 'err');
        if (!attempt(() => store.update('expenses', r.expense_id!, { bir_use: m === 'both' } as never), 'Updated')) return;
        await updateReceipt(r.id, { bir_mode: m });
      } else if (m !== 'yes') {   // was "BIR only" (no expense yet): create the expense now
        const e = attempt(() => saveExpense({ date: r.receipt_date ?? today(), payee: r.supplier_name ?? 'Receipt', category: (r.category as ExpenseCategory) ?? 'Other', job_id: r.job_id ?? undefined, branch_id: db.branches[0].id, amount: r.total_amount ?? 0, vat: r.supplier_vat === 'VAT' ? (r.vat_amount ?? 0) : 0, wht: 0,
          method: (r.payment_method as ExpenseMethod) ?? 'Cash', approval: 'Pending', paid: true, petty_cash: false, recurring: null, notes: `Scanned receipt ${r.receipt_no ?? ''}`.trim(), supplier_name: r.supplier_name ?? undefined, supplier_tin: r.supplier_tin ?? undefined,
          supplier_address: r.supplier_address ?? undefined, supplier_vat: (r.supplier_vat as ReceiptVat | null) ?? undefined, supplier_invoice_no: r.receipt_no ?? undefined, bir_use: m === 'both' }), 'Posted as an expense, pending approval') as { id: string } | undefined;
        if (!e) return; await updateReceipt(r.id, { bir_mode: m, expense_id: e.id });
      }
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not update', 'err'); }
  };
  return (
    <div className="card" style={{ padding: 10 }}>
      <b>Use for BIR filing?</b> <span className="small muted">{r.bir_mode ? MODE_LABEL[r.bir_mode] : 'Not decided yet.'}</span>
      <div className="row" style={{ marginTop: 6 }}>{(['yes', 'no', 'both'] as BirMode[]).map((m) => <button key={m} className={`btn sm${r.bir_mode === m ? ' primary' : ''}`} onClick={() => void set(m)}>{m === 'yes' ? 'Yes' : m === 'no' ? 'No' : 'Both'}</button>)}</div>
      <div className="small muted" style={{ marginTop: 4 }}>Yes = BIR list only, not an expense · No = expense only · Both = expense and BIR list.</div>
    </div>
  );
}

export default function Receipts() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Receipt[]>([]); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [month, setMonth] = useState(today().slice(0, 7)); const [q, setQ] = useState(''); const [only, setOnly] = useState<'' | 'fix' | 'posted'>('');
  const [open, setOpen] = useState<Receipt | null>(null);
  const [draft, setDraft] = useState<{ d: ReceiptDraft; scan: { blob: Blob; dataUrl: string; base64?: string }; reading: { busy: boolean; error?: string } } | null>(null);
  const [enhance, setEnhance] = useState(true); const file = useRef<HTMLInputElement>(null);
  const manage = can('receipts.manage');
  const load = useCallback(() => { listReceipts().then((r) => { setRows(r); setErr(''); }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the receipts')).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);

  const pick = async (f: File) => {
    try {
      if (!f.type.startsWith('image/')) throw new Error('Choose a picture of the receipt.');
      const scan = await prepareScan(f, enhance);
      setDraft({ d: blankDraft(), scan, reading: { busy: CLOUD } });
      if (CLOUD) {
        try {
          let r = await readReceipt(await forAi(scan.dataUrl)); let cur: { blob: Blob; dataUrl: string } = scan;
          if (r.rotate) { cur = await rotateScan(scan.dataUrl, r.rotate); setDraft((x) => (x ? { ...x, scan: cur } : x)); r = await readReceipt(await forAi(cur.dataUrl)); }  // photographed sideways: turn it upright and read again
          setDraft((x) => (x ? { ...x, scan: cur, d: draftFromReading(r), reading: { busy: false } } : x));
        }
        catch (e) { setDraft((cur) => (cur ? { ...cur, reading: { busy: false, error: e instanceof Error ? e.message : 'The AI could not read this receipt.' } } : cur)); }
      }
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not open the picture', 'err'); }
  };

  const turn = async () => {
    if (!draft) return;
    try {
      const scan = await rotateScan(draft.scan.dataUrl, 90); setDraft({ ...draft, scan, reading: { busy: CLOUD } });
      if (CLOUD) { const r = await readReceipt(await forAi(scan.dataUrl)); setDraft((x) => (x ? { ...x, scan, d: draftFromReading(r), reading: { busy: false } } : x)); }
    } catch (e) { setDraft((x) => (x ? { ...x, reading: { busy: false, error: e instanceof Error ? e.message : 'The AI could not read this receipt.' } } : x)); }
  };

  const shown = rows.filter((r) => {
    const m = (r.receipt_date ?? r.created_at).slice(0, 7); if (month && m !== month) return false;
    if (q && !`${r.supplier_name ?? ''} ${r.supplier_tin ?? ''} ${r.receipt_no ?? ''} ${r.description ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    const fix = !readyForBir(checkReceipt(r, rows, r.id));
    return only === 'fix' ? fix : only === 'posted' ? r.status === 'Posted' : true;
  });
  const fixCount = rows.filter((r) => (r.receipt_date ?? r.created_at).slice(0, 7) === month && !readyForBir(checkReceipt(r, rows, r.id))).length;
  const inMonth = rows.filter((r) => (r.receipt_date ?? r.created_at).slice(0, 7) === month);
  const total = inMonth.reduce((a, r) => a + (r.total_amount ?? 0), 0); const vat = inMonth.reduce((a, r) => a + (r.supplier_vat === 'VAT' ? (r.vat_amount ?? 0) : 0), 0);

  return (
    <>
      <PageHead title="Receipts" sub="Photograph a receipt: the app reads the supplier, TIN, address, VAT and amounts, and keeps the scan.">
        <label className="check small" title="Evens out light and sharpens faded print on the scan that is kept"><input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />Enhance faded print</label>
        {can('receipts.capture') || manage ? <button className="btn primary lg" onClick={() => file.current?.click()}>📷 Scan a receipt</button> : null}
        <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
      </PageHead>
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat k="Receipts this month" v={String(inMonth.length)} s={`${inMonth.filter((r) => r.expense_id).length} posted as expenses`} tone="navy" />
        <Stat k="Total amount" v={money(total)} s="VAT inclusive" tone="navy" />
        <Stat k="Input VAT on the receipts" v={money(vat)} s="VAT-registered suppliers" tone="navy" />
        <Stat k="Need attention" v={String(fixCount)} s="Missing TIN, address or amounts" tone={fixCount ? 'bad' : 'good'} />
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <input type="month" style={{ width: 180 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
        <input placeholder="Search supplier, TIN, receipt no." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
        <select style={{ width: 200 }} value={only} onChange={(e) => setOnly(e.target.value as typeof only)}><option value="">All receipts</option><option value="fix">Need attention</option><option value="posted">Posted</option></select>
        <button className="btn" disabled={!shown.some((r) => r.bir_mode === 'yes')} title="Exports only the receipts marked Yes (BIR only) for the month shown" onClick={() => exportCsv({ title: `BIR receipts ${month}`, headers: ['Date', 'Supplier', 'TIN', 'Address', 'Receipt no.', 'VAT status', 'Total', 'VATable sales', 'VAT', 'Exempt', 'Zero-rated', 'Category', 'Use for BIR', 'Status'], types: ['text', 'text', 'text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'text', 'text', 'text'],
          rows: shown.filter((r) => r.bir_mode === 'yes').map((r) => [r.receipt_date ?? '', r.supplier_name ?? '', fmtTin(r.supplier_tin ?? ''), r.supplier_address ?? '', r.receipt_no ?? '', r.supplier_vat ?? '', r.total_amount ?? 0, r.vatable_sales ?? 0, r.vat_amount ?? 0, r.exempt_amount ?? 0, r.zero_rated_amount ?? 0, r.category ?? '', r.status !== 'Posted' ? '' : r.bir_mode === 'yes' ? 'Yes (BIR only)' : r.bir_mode === 'no' ? 'No (expense only)' : r.bir_mode === 'both' ? 'Both' : 'Not decided', r.status]) })}>Export CSV (BIR: Yes only)</button>
      </div>
      {err && <div className="alert warn">{err}</div>}
      {!CLOUD && <div className="alert info small" style={{ marginBottom: 10 }}>Demo mode: scans are kept in this browser only. On the live site they go to private storage and the AI reads them.</div>}
      <Card flush>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Scan</th><th>Date</th><th>Supplier · TIN · Address</th><th>Receipt no.</th><th>VAT</th><th className="num">Total</th><th className="num">VATable sales</th><th className="num">VAT</th><th>BIR</th></tr></thead>
          <tbody>
            {shown.map((r) => <Row key={r.id} r={r} all={rows} onOpen={() => setOpen(r)} />)}
            {!shown.length && <tr><td colSpan={9} className="muted" style={{ padding: 20 }}>{loading ? 'Loading…' : 'No receipts here yet. Tap “Scan a receipt” and take a clear photo of the whole receipt.'}</td></tr>}
          </tbody></table></div>
      </Card>
      {draft && <Editor seed={draft.d} scan={draft.scan} reading={draft.reading} others={rows} onClose={() => setDraft(null)} onSaved={load} key="new" onRotate={() => void turn()} />}
      {open && <Editor initial={open} others={rows} onClose={() => setOpen(null)} onSaved={load} />}
    </>
  );
}

function Row({ r, all, onOpen }: { r: Receipt; all: Receipt[]; onOpen: () => void }) {
  const [src, setSrc] = useState(''); const checks = checkReceipt(r, all, r.id); const ready = readyForBir(checks);
  useEffect(() => { void scanUrl(r).then(setSrc); }, [r.id, r.image_path]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <tr onClick={onOpen} style={{ cursor: 'pointer' }}>
      <td>{src ? <img src={src} alt="" className="rc-thumb" /> : <span className="rc-thumb" />}</td>
      <td>{r.receipt_date ? fmtDate(r.receipt_date) : <span className="muted">—</span>}</td>
      <td><b>{r.supplier_name || <span className="muted">no name</span>}</b><div className="small muted">{fmtTin(r.supplier_tin ?? '') || 'no TIN'}</div><div className="small muted">{r.supplier_address || 'no address'}</div></td>
      <td>{r.receipt_no || <span className="muted">—</span>}<div className="small muted">{r.doc_type}</div></td>
      <td>{r.supplier_vat ? <Badge tone={r.supplier_vat === 'VAT' ? 'blue' : 'gray'}>{r.supplier_vat}</Badge> : <span className="muted">—</span>}</td>
      <td className="num">{r.total_amount === null ? '—' : money(r.total_amount)}</td><td className="num">{r.vatable_sales ? money(r.vatable_sales) : '—'}</td><td className="num">{r.vat_amount ? money(r.vat_amount) : '—'}</td>
      <td title={ready ? 'Has everything BIR needs' : checks.filter((c) => c.level === 'error').map((c) => c.text).join('\n')}>
        {r.status !== 'Posted' ? <><span className="muted">—</span><div className="small muted">{ready ? 'complete' : 'incomplete'} · not posted</div></>
          : r.bir_mode ? <><Badge tone={r.bir_mode === 'no' ? 'gray' : 'green'}>{r.bir_mode === 'yes' ? 'Yes' : r.bir_mode === 'no' ? 'No' : 'Both'}</Badge>{r.bir_mode !== 'no' && !ready && <div className="small" style={{ color: 'var(--red)' }}>incomplete</div>}{r.bir_mode === 'yes' && <div className="small muted">not an expense</div>}</> : <Badge tone="amber">Decide</Badge>}
      </td>
    </tr>
  );
}
