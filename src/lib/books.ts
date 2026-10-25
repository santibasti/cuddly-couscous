// Bookkeeping: turns the company's own records (invoices, payments, expenses, petty cash) plus the bookkeeper's opening balances and adjusting entries
// into double-entry journal entries, and from those the books and statements. Nothing here is typed in twice: the app's records stay the source.
// Accrual basis: a sale is booked when the invoice is approved, a purchase when the expense is approved. Pure functions: no store, no screens.
import type { DB, Expense, ExpenseCategory, Payment } from './types';
import { invoiceTotals, paymentCounts } from './business';
import { round2 } from './util';

/* ---------- chart of accounts ---------- */
export type AcctType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export interface Account { code: string; name: string; type: AcctType; cost?: boolean; contra?: boolean }
export const COA: Account[] = [
  { code: '1010', name: 'Cash on hand', type: 'asset' },
  { code: '1020', name: 'Cash in bank & e-wallet', type: 'asset' },
  { code: '1030', name: 'Petty cash fund', type: 'asset' },
  { code: '1100', name: 'Accounts receivable', type: 'asset' },
  { code: '1150', name: 'Creditable withholding tax (BIR 2307)', type: 'asset' },
  { code: '1200', name: 'Input VAT', type: 'asset' },
  { code: '1500', name: 'Equipment, vehicles & tools (at cost)', type: 'asset' },
  { code: '1590', name: 'Accumulated depreciation', type: 'asset', contra: true },
  { code: '2010', name: 'Accounts payable', type: 'liability' },
  { code: '2020', name: 'Credit card payable', type: 'liability' },
  { code: '2100', name: 'Output VAT payable', type: 'liability' },
  { code: '2150', name: 'Withholding tax payable', type: 'liability' },
  { code: '2300', name: 'Due to employees (reimbursements)', type: 'liability' },
  { code: '2500', name: 'Loans payable', type: 'liability' },
  { code: '3010', name: "Owner's capital", type: 'equity' },
  { code: '3020', name: "Owner's drawings", type: 'equity', contra: true },
  { code: '4010', name: 'Service revenue', type: 'revenue' },
  { code: '4090', name: 'Other income', type: 'revenue' },
  { code: '5010', name: 'Materials & supplies used', type: 'expense', cost: true },
  { code: '5020', name: 'Fuel', type: 'expense', cost: true },
  { code: '5030', name: 'Transportation', type: 'expense', cost: true },
  { code: '5035', name: 'Toll & parking', type: 'expense', cost: true },
  { code: '5040', name: 'Subcontractors', type: 'expense', cost: true },
  { code: '6010', name: 'Salaries & wages', type: 'expense' },
  { code: '6030', name: 'Repairs & maintenance', type: 'expense' },
  { code: '6040', name: 'Marketing & advertising', type: 'expense' },
  { code: '6050', name: 'Rent', type: 'expense' },
  { code: '6060', name: 'Utilities', type: 'expense' },
  { code: '6070', name: 'Taxes, licenses & government fees', type: 'expense' },
  { code: '6080', name: 'Meals & snacks', type: 'expense' },
  { code: '6090', name: 'Miscellaneous expense', type: 'expense' },
  { code: '6100', name: 'Depreciation', type: 'expense' },
];
export const ACCT = new Map(COA.map((a) => [a.code, a]));
export const acctName = (code: string) => ACCT.get(code)?.name ?? code;
export const CASH = ['1010', '1020', '1030'];
const isCash = (code: string) => CASH.includes(code);
/** Natural balance side: assets & expenses grow with debits; liabilities, equity and revenue with credits. Contra accounts are the other way round. */
const debitNormal = (a: Account) => (a.type === 'asset' || a.type === 'expense') !== !!a.contra;

const EXPENSE_ACCT: Record<ExpenseCategory, string> = {
  Payroll: '6010', Fuel: '5020', Materials: '5010', 'Equipment Repair': '6030', Transportation: '5030', Marketing: '6040', Rent: '6050', Utilities: '6060',
  'Government Fees': '6070', Subcontractor: '5040', 'Toll & Parking': '5035', 'Meals & Snacks': '6080', Other: '6090',
};

/* ---------- entries ---------- */
export interface BookLine { account: string; debit: number; credit: number }
export type EntrySource = 'invoice' | 'payment' | 'expense' | 'reimbursement' | 'petty' | 'manual' | 'opening';
export interface BookEntry { id: string; date: string; ref: string; party: string; memo: string; source: EntrySource; lines: BookLine[] }
/** What the bookkeeper typed in: the opening balances (one set) and adjusting / owner entries. Stored in the book_entries table. */
export interface ManualEntry { id: string; entry_date: string; ref: string; memo: string; kind: 'manual' | 'opening'; lines: BookLine[]; deleted_at?: string | null; created_at?: string }

const dr = (account: string, amount: number): BookLine => ({ account, debit: round2(amount), credit: 0 });
const cr = (account: string, amount: number): BookLine => ({ account, debit: 0, credit: round2(amount) });
const live = <T extends { deleted_at?: string | null }>(a: T[]) => a.filter((x) => !x.deleted_at);
const clean = (lines: BookLine[]) => lines.filter((l) => l.debit > 0.004 || l.credit > 0.004);
export const sumDebit = (l: BookLine[]) => round2(l.reduce((n, x) => n + x.debit, 0));
export const sumCredit = (l: BookLine[]) => round2(l.reduce((n, x) => n + x.credit, 0));
/** Push any cent of rounding difference onto one line so an entry always balances (it never changes a total by more than a few cents). */
function balance(lines: BookLine[], adjust: number): BookLine[] {
  const d = sumDebit(lines) - sumCredit(lines);
  if (Math.abs(d) > 0.004 && Math.abs(d) < 0.1) { const l = lines[adjust]; if (d > 0) l.credit = round2(l.credit + d); else l.debit = round2(l.debit - d); }
  return lines;
}
const cashFor = (method: string) => (method === 'Cash' || method === 'Other' ? '1010' : '1020');

function payDate(p: Payment) { return (p.paid_at ?? p.date).slice(0, 10); }

/** The journal: every record of the company as debit / credit lines, oldest first, from the date the books start (the opening balances' date). */
export function buildEntries(db: DB, manual: ManualEntry[]): BookEntry[] {
  const out: BookEntry[] = [];
  const clients = new Map(db.clients.map((c) => [c.id, c.name] as const));
  const man = live(manual);
  const opening = man.filter((m) => m.kind === 'opening').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.entry_date.localeCompare(a.entry_date))[0];
  const start = opening?.entry_date ?? '';
  const keep = (date: string) => !start || date >= start;
  const add = (e: BookEntry) => { const lines = clean(e.lines); if (lines.length >= 2 && keep(e.date)) out.push({ ...e, lines }); };

  if (opening) out.push({ id: `op:${opening.id}`, date: opening.entry_date, ref: opening.ref || 'OPENING', party: '', memo: opening.memo || 'Opening balances', source: 'opening', lines: clean(opening.lines) });

  // sales: Dr Accounts receivable, Cr Service revenue and Output VAT
  for (const i of live(db.invoices)) {
    if (i.status === 'Draft') continue;
    const t = invoiceTotals(i);
    const lines = balance([dr('1100', t.total), cr('4010', t.net), cr('2100', t.vat)], 1);
    const who = clients.get(i.client_id) ?? '';
    add({ id: `inv:${i.id}`, date: i.issue_date, ref: i.number, party: who, memo: `Billing invoice ${i.number}`, source: 'invoice', lines });
    if (i.status === 'Reversed' && i.reversed_at) add({ id: `invr:${i.id}`, date: i.reversed_at.slice(0, 10), ref: i.number, party: who, memo: `Reversal of invoice ${i.number}${i.reversal_reason ? ` (${i.reversal_reason})` : ''}`, source: 'invoice', lines: lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit })) });
  }
  // collections: Dr Cash (and Creditable withholding tax), Cr Accounts receivable
  for (const p of live(db.payments)) {
    if (!paymentCounts(p)) continue;
    const inv = db.invoices.find((x) => x.id === p.invoice_id);
    const lines = [dr(cashFor(p.method), p.amount), dr('1150', p.wht_amount || 0), cr('1100', p.amount + (p.wht_amount || 0))];
    add({ id: `pay:${p.id}`, date: payDate(p), ref: p.receipt_no || p.reference, party: clients.get(p.client_id) ?? '', memo: `Collection${inv ? ` for invoice ${inv.number}` : ''} (${p.method}${p.reference ? ` ${p.reference}` : ''})`, source: 'payment', lines });
  }
  // purchases and expenses
  for (const e of live(db.expenses)) {
    if (e.approval !== 'Approved' || e.reversed) continue;
    const vat = Math.min(e.vat || 0, e.amount); const base = e.amount - vat; const wht = Math.min(e.wht || 0, e.amount);
    const owed = e.paid_by_employee && !e.reimbursed_at;
    const payAcct = owed ? '2300' : !e.paid ? (e.method === 'Credit Card' ? '2020' : '2010') : e.petty_cash ? '1030' : e.method === 'Credit Card' ? '2020' : cashFor(e.method);
    const lines = [dr(EXPENSE_ACCT[e.category] ?? '6090', base), dr('1200', vat), cr(payAcct, e.amount - wht), cr('2150', wht)];
    add({ id: `exp:${e.id}`, date: e.date, ref: e.supplier_invoice_no || e.source_id || '', party: e.supplier_name || e.payee, memo: `${e.category}: ${e.notes?.trim() || e.payee}`, source: 'expense', lines: balance(lines, 0) });
    if (e.paid_by_employee && e.reimbursed_at) {
      const via = (e as Expense & { reimbursed_via?: string }).reimbursed_via ?? 'Cash';
      add({ id: `rei:${e.id}`, date: e.reimbursed_at.slice(0, 10), ref: e.supplier_invoice_no || '', party: e.paid_by_employee ? (db.employees.find((x) => x.id === e.paid_by_employee)?.full_name ?? 'Employee') : '', memo: `Reimbursed ${e.payee}`, source: 'reimbursement', lines: [dr('2300', e.amount - wht), cr(/cash/i.test(via) ? '1010' : '1020', e.amount - wht)] });
    }
  }
  // petty cash fund: money put into it, and spending that has no expense record behind it
  for (const p of live(db.petty)) {
    if (p.kind === 'Replenishment') add({ id: `pet:${p.id}`, date: p.date, ref: '', party: 'Petty cash custodian', memo: p.description || 'Petty cash replenishment', source: 'petty', lines: [dr('1030', p.amount), cr('1010', p.amount)] });
    else if (!p.expense_id) add({ id: `pet:${p.id}`, date: p.date, ref: '', party: 'Petty cash custodian', memo: p.description || 'Petty cash disbursement', source: 'petty', lines: [dr('6090', p.amount), cr('1030', p.amount)] });
  }
  for (const m of man) if (m.kind === 'manual') add({ id: `man:${m.id}`, date: m.entry_date, ref: m.ref, party: '', memo: m.memo, source: 'manual', lines: m.lines });
  return out.sort((a, b) => (a.source === 'opening' ? -1 : 0) - (b.source === 'opening' ? -1 : 0) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/* ---------- balances ---------- */
export const natural = (code: string, debit: number, credit: number) => { const a = ACCT.get(code); return a && debitNormal(a) ? debit - credit : credit - debit; };
/** Signed natural balance of every account over a set of entries. */
export function balances(entries: BookEntry[]): Record<string, number> {
  const raw: Record<string, [number, number]> = {};
  for (const e of entries) for (const l of e.lines) { const r = (raw[l.account] ??= [0, 0]); r[0] += l.debit; r[1] += l.credit; }
  return Object.fromEntries(Object.entries(raw).map(([c, [d, k]]) => [c, round2(natural(c, d, k))]));
}
/** Balance at the end of `asOf` (everything dated on or before it). */
export const asOf = (entries: BookEntry[], date: string) => balances(entries.filter((e) => e.date <= date));
/** Balance at the start of a period: everything before it, and the opening balances always (they are where the books begin). */
export const before = (entries: BookEntry[], from: string) => balances(entries.filter((e) => e.date < from || e.source === 'opening'));
export const during = (entries: BookEntry[], from: string, to: string) => balances(entries.filter((e) => e.date >= from && e.date <= to && e.source !== 'opening'));
const g = (b: Record<string, number>, c: string) => b[c] ?? 0;

export interface Trial { rows: { code: string; name: string; debit: number; credit: number }[]; debit: number; credit: number }
export function trialBalance(entries: BookEntry[], date: string): Trial {
  const raw: Record<string, [number, number]> = {};
  for (const e of entries.filter((x) => x.date <= date)) for (const l of e.lines) { const r = (raw[l.account] ??= [0, 0]); r[0] += l.debit; r[1] += l.credit; }
  const rows = COA.filter((a) => raw[a.code]).map((a) => { const [d, k] = raw[a.code]; const n = round2(d - k); return { code: a.code, name: a.name, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }; });
  return { rows, debit: round2(rows.reduce((s, r) => s + r.debit, 0)), credit: round2(rows.reduce((s, r) => s + r.credit, 0)) };
}

/* ---------- statements ---------- */
export interface Line { label: string; amount: number; code?: string; bold?: boolean; indent?: boolean }
export interface Income { revenue: Line[]; totalRevenue: number; cost: Line[]; totalCost: number; grossProfit: number; opex: Line[]; totalOpex: number; netIncome: number }
export function incomeStatement(entries: BookEntry[], from: string, to: string): Income {
  const b = during(entries, from, to);
  const pick = (f: (a: Account) => boolean) => COA.filter(f).map((a) => ({ label: a.name, amount: g(b, a.code), code: a.code })).filter((l) => Math.abs(l.amount) > 0.004);
  const revenue = pick((a) => a.type === 'revenue'); const cost = pick((a) => a.type === 'expense' && !!a.cost); const opex = pick((a) => a.type === 'expense' && !a.cost);
  const s = (l: Line[]) => round2(l.reduce((n, x) => n + x.amount, 0));
  const totalRevenue = s(revenue), totalCost = s(cost), totalOpex = s(opex);
  return { revenue, totalRevenue, cost, totalCost, grossProfit: round2(totalRevenue - totalCost), opex, totalOpex, netIncome: round2(totalRevenue - totalCost - totalOpex) };
}
/** Net income of everything from the start of the books up to a date. */
export function incomeToDate(entries: BookEntry[], date: string): number {
  const b = asOf(entries, date);
  return round2(COA.filter((a) => a.type === 'revenue').reduce((n, a) => n + g(b, a.code), 0) - COA.filter((a) => a.type === 'expense').reduce((n, a) => n + g(b, a.code), 0));
}

export interface Sheet { assets: Line[]; totalAssets: number; liabilities: Line[]; totalLiabilities: number; equity: Line[]; totalEquity: number; check: number }
export function balanceSheet(entries: BookEntry[], date: string): Sheet {
  const b = asOf(entries, date);
  const section = (t: AcctType): Line[] => COA.filter((a) => a.type === t).map((a) => ({ label: a.contra ? `Less: ${a.name}` : a.name, amount: a.contra && (t === 'asset' || t === 'equity') ? -g(b, a.code) : g(b, a.code), code: a.code })).filter((l) => Math.abs(l.amount) > 0.004);
  const assets = section('asset'), liabilities = section('liability'); const equity = section('equity');
  const ni = incomeToDate(entries, date);
  if (Math.abs(ni) > 0.004) equity.push({ label: 'Retained earnings (net income since the books started)', amount: ni });
  const s = (l: Line[]) => round2(l.reduce((n, x) => n + x.amount, 0));
  const totalAssets = s(assets), totalLiabilities = s(liabilities), totalEquity = s(equity);
  return { assets, totalAssets, liabilities, totalLiabilities, equity, totalEquity, check: round2(totalAssets - totalLiabilities - totalEquity) };
}

export interface EquityStatement { beginning: number; investments: number; netIncome: number; drawings: number; ending: number; lines: Line[] }
const equityOf = (b: Record<string, number>) => round2(g(b, '3010') - g(b, '3020') + COA.filter((a) => a.type === 'revenue').reduce((n, a) => n + g(b, a.code), 0) - COA.filter((a) => a.type === 'expense').reduce((n, a) => n + g(b, a.code), 0));
export function equityStatement(entries: BookEntry[], from: string, to: string): EquityStatement {
  const beginning = equityOf(before(entries, from));
  const d = during(entries, from, to); const income = incomeStatement(entries, from, to);
  const investments = round2(g(d, '3010')), drawings = round2(g(d, '3020')), netIncome = income.netIncome;
  const ending = round2(beginning + investments + netIncome - drawings);
  return { beginning, investments, netIncome, drawings, ending, lines: [
    { label: "Owner's equity, beginning", amount: beginning, bold: true }, { label: 'Add: additional investments by the owner', amount: investments, indent: true }, { label: 'Add: net income for the period', amount: netIncome, indent: true },
    { label: "Less: owner's drawings", amount: -drawings, indent: true }, { label: "Owner's equity, ending", amount: ending, bold: true },
  ] };
}

export interface CashFlow { operating: Line[]; netOperating: number; investing: Line[]; netInvesting: number; financing: Line[]; netFinancing: number; netChange: number; beginning: number; ending: number; difference: number }
export function cashFlow(entries: BookEntry[], from: string, to: string): CashFlow {
  const b0 = before(entries, from); const b1 = asOf(entries, to);
  const d = (c: string) => round2(g(b1, c) - g(b0, c));            // growth of an account over the period (natural sign)
  const ni = incomeStatement(entries, from, to).netIncome;
  const cash = (b: Record<string, number>) => round2(CASH.reduce((n, c) => n + g(b, c), 0));
  const op: Line[] = [{ label: 'Net income for the period', amount: ni, bold: true },
    { label: 'Add: depreciation', amount: d('1590'), indent: true },
    { label: '(Increase) / decrease in accounts receivable', amount: -d('1100'), indent: true },
    { label: '(Increase) / decrease in creditable withholding tax', amount: -d('1150'), indent: true },
    { label: '(Increase) / decrease in input VAT', amount: -d('1200'), indent: true },
    { label: 'Increase / (decrease) in accounts payable', amount: d('2010') + d('2020'), indent: true },
    { label: 'Increase / (decrease) in output VAT payable', amount: d('2100'), indent: true },
    { label: 'Increase / (decrease) in withholding tax payable', amount: d('2150'), indent: true },
    { label: 'Increase / (decrease) in amounts due to employees', amount: d('2300'), indent: true }];
  const inv: Line[] = [{ label: 'Purchase of equipment, vehicles & tools', amount: -d('1500'), indent: true }];
  const fin: Line[] = [{ label: 'Owner\'s additional investments', amount: d('3010'), indent: true }, { label: 'Owner\'s drawings', amount: -d('3020'), indent: true }, { label: 'Loans obtained / (repaid)', amount: d('2500'), indent: true }];
  const s = (l: Line[]) => round2(l.reduce((n, x) => n + x.amount, 0));
  const keep = (l: Line[]) => l.filter((x) => x.bold || Math.abs(x.amount) > 0.004);
  const netOperating = s(op), netInvesting = s(inv), netFinancing = s(fin); const netChange = round2(netOperating + netInvesting + netFinancing);
  const beginning = cash(b0), ending = cash(b1);
  return { operating: keep(op), netOperating, investing: keep(inv), netInvesting, financing: keep(fin), netFinancing, netChange, beginning, ending, difference: round2(beginning + netChange - ending) };
}

/* ---------- books of original entry ---------- */
export type Flow = 'in' | 'out' | 'general';
/** An entry is a cash receipt when cash goes up, a cash disbursement when it goes down, otherwise it belongs in the general journal. */
export function flowOf(e: BookEntry): Flow {
  const net = round2(e.lines.reduce((n, l) => n + (isCash(l.account) ? l.debit - l.credit : 0), 0));
  return e.source === 'opening' ? 'general' : net > 0.004 ? 'in' : net < -0.004 ? 'out' : 'general';
}
export const inPeriod = (entries: BookEntry[], from: string, to: string) => entries.filter((e) => e.date >= from && e.date <= to && e.source !== 'opening');

export interface LedgerAccount { code: string; name: string; opening: number; rows: { date: string; ref: string; memo: string; debit: number; credit: number; balance: number }[]; closing: number; debit: number; credit: number }
/** The general ledger: for each account, what it started the period with, every posting, and where it ended. */
export function ledger(entries: BookEntry[], from: string, to: string, only?: string): LedgerAccount[] {
  const open = before(entries, from);
  const out: LedgerAccount[] = [];
  for (const a of COA) {
    if (only && a.code !== only) continue;
    const opening = g(open, a.code); let run = opening; let td = 0, tc = 0; const rows: LedgerAccount['rows'] = [];
    for (const e of entries.filter((x) => x.date >= from && x.date <= to && x.source !== 'opening')) {
      for (const l of e.lines.filter((x) => x.account === a.code)) { run = round2(run + natural(a.code, l.debit, l.credit)); td += l.debit; tc += l.credit; rows.push({ date: e.date, ref: e.ref, memo: `${e.party ? `${e.party} — ` : ''}${e.memo}`, debit: l.debit, credit: l.credit, balance: run }); }
    }
    if (!rows.length && Math.abs(opening) < 0.005) continue;
    out.push({ code: a.code, name: a.name, opening, rows, closing: run, debit: round2(td), credit: round2(tc) });
  }
  return out;
}

/* ---------- opening balances ---------- */
/** Turns "what the books start with" into an opening entry; Owner's capital is the balancing figure (assets less liabilities). */
export function openingLines(amounts: Record<string, number>): BookLine[] {
  const lines: BookLine[] = []; let net = 0;
  for (const a of COA) {
    if (a.type === 'revenue' || a.type === 'expense' || a.code === '3010') continue;
    const v = round2(amounts[a.code] ?? 0); if (!v) continue;
    const onDebit = debitNormal(a);
    lines.push(onDebit ? dr(a.code, v) : cr(a.code, v)); net += onDebit ? v : -v;
  }
  net = round2(net);
  if (net > 0) lines.push(cr('3010', net)); else if (net < 0) lines.push(dr('3010', -net));
  return lines;
}
/** Does a manual entry balance? Returns the problem, or null. */
export function entryProblem(lines: BookLine[]): string | null {
  const l = clean(lines);
  if (l.length < 2) return 'Add at least two lines: something debited and something credited.';
  if (l.some((x) => x.debit > 0 && x.credit > 0)) return 'A line is either a debit or a credit, not both.';
  const d = sumDebit(l), c = sumCredit(l);
  return Math.abs(d - c) > 0.004 ? `Debits (${d.toFixed(2)}) and credits (${c.toFixed(2)}) must be equal. Difference ${(d - c).toFixed(2)}.` : null;
}
