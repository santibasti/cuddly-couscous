// The bookkeeper's reports, as plain tables the screen shows and the exports (CSV, Excel, PDF) print. Built from the journal in books.ts.
import type { DB } from './types';
import type { ExportTable } from './export';
import { acctName, balanceSheet, cashFlow, equityStatement, flowOf, incomeStatement, inPeriod, ledger, trialBalance, type BookEntry, type Line } from './books';
import { buildSls, buildSlp, fmtTin, reliefDate, slpTotals, slsIncluded, slsTotals, type BirReceipt } from './bir';
import { fmtDate, round2 } from './util';

/** A report: the export table plus how to style each row on screen ('h' section heading, 'b' bold / total, 'i' indented, '' normal). */
export interface Report extends ExportTable { styles?: ('h' | 'b' | 'i' | '')[]; note?: string }
export type ReportId = 'crb' | 'cdb' | 'gj' | 'gl' | 'sls' | 'slp' | 'cfs' | 'bs' | 'is' | 'sce' | 'tb';
export const REPORTS: { id: ReportId; label: string; blurb: string; kind: 'period' | 'asof' | 'month' }[] = [
  { id: 'crb', label: 'Cash receipts book', blurb: 'Every peso received, with the OR number and who paid.', kind: 'period' },
  { id: 'cdb', label: 'Cash disbursements book', blurb: 'Every peso paid out: expenses, purchases, reimbursements.', kind: 'period' },
  { id: 'gj', label: 'General journal', blurb: 'Invoices, accruals and adjusting entries (everything that is not a cash receipt or payment).', kind: 'period' },
  { id: 'gl', label: 'General ledger', blurb: 'Each account with its postings and running balance.', kind: 'period' },
  { id: 'sls', label: 'Summary list of sales', blurb: 'BIR list of sales for one tax month.', kind: 'month' },
  { id: 'slp', label: 'Summary list of purchases', blurb: 'BIR list of purchases for one tax month.', kind: 'month' },
  { id: 'cfs', label: 'Cash flow statement', blurb: 'Where the cash came from and went (indirect method).', kind: 'period' },
  { id: 'bs', label: 'Balance sheet', blurb: 'What the company owns, owes and is worth on a date.', kind: 'asof' },
  { id: 'is', label: 'Income statement', blurb: 'Revenue, costs and net income for the period.', kind: 'period' },
  { id: 'sce', label: "Statement of changes in owner's equity", blurb: "The owner's capital from the start to the end of the period.", kind: 'period' },
  { id: 'tb', label: 'Trial balance', blurb: 'Every account balance; debits must equal credits.', kind: 'asof' },
];

const co = (db: DB) => db.settings.company;
const head = (db: DB, what: string) => `${co(db).name} · TIN ${fmtTin(co(db).tin) || '—'} · ${what}`;
const span = (from: string, to: string) => `${fmtDate(from)} to ${fmtDate(to)}`;
const sum = (a: number[]) => round2(a.reduce((n, x) => n + x, 0));
const lineRows = (l: Line[]): [string, number][] => l.map((x) => [x.label, x.amount]);

function twoCol(title: string, subtitle: string, items: { text: string; amount?: number; style: 'h' | 'b' | 'i' | '' }[], note?: string): Report {
  return { title, subtitle, headers: ['', 'Amount (₱)'], types: ['text', 'money'], rows: items.map((x) => [x.text, x.amount ?? '']), styles: items.map((x) => x.style), note };
}

export function cashReceiptsBook(db: DB, entries: BookEntry[], from: string, to: string): Report {
  const list = inPeriod(entries, from, to).filter((e) => flowOf(e) === 'in');
  const rows = list.map((e) => {
    const d = (c: string) => round2(e.lines.filter((l) => l.account === c).reduce((n, l) => n + l.debit, 0));
    const other = e.lines.filter((l) => !['1010', '1020', '1030', '1100', '1150'].includes(l.account) && l.credit > 0);
    return [fmtDate(e.date), e.ref, e.party, e.memo, d('1010'), d('1020'), d('1150'), round2(e.lines.filter((l) => l.account === '1100').reduce((n, l) => n + l.credit, 0)), sum(other.map((l) => l.credit)), other.map((l) => acctName(l.account)).join(', ')];
  });
  const col = (i: number) => sum(rows.map((r) => r[i] as number));
  return { title: 'Cash Receipts Book', subtitle: head(db, span(from, to)), headers: ['Date', 'OR / Ref', 'Received from', 'Particulars', 'Cash on hand (Dr)', 'Cash in bank & e-wallet (Dr)', 'Creditable withholding tax (Dr)', 'Accounts receivable (Cr)', 'Other credits (Cr)', 'Other accounts credited'],
    types: ['text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'text'], rows, totals: ['TOTAL', '', '', '', col(4), col(5), col(6), col(7), col(8), ''],
    note: 'Collections from clients, booked from verified payments. Cheques count once cleared.' };
}

export function cashDisbursementsBook(db: DB, entries: BookEntry[], from: string, to: string): Report {
  const list = inPeriod(entries, from, to).filter((e) => flowOf(e) === 'out');
  const rows = list.map((e) => {
    const c = (a: string) => round2(e.lines.filter((l) => l.account === a).reduce((n, l) => n + l.credit - l.debit, 0));
    const other = e.lines.filter((l) => !['1010', '1020', '1030', '1200', '2150'].includes(l.account) && l.debit > 0);
    return [fmtDate(e.date), e.ref, e.party, e.memo, c('1010'), c('1020'), c('1030'), round2(e.lines.filter((l) => l.account === '1200').reduce((n, l) => n + l.debit, 0)), sum(other.map((l) => l.debit)), other.map((l) => acctName(l.account)).join(', '), round2(e.lines.filter((l) => l.account === '2150').reduce((n, l) => n + l.credit, 0))];
  });
  const col = (i: number) => sum(rows.map((r) => r[i] as number));
  return { title: 'Cash Disbursements Book', subtitle: head(db, span(from, to)), headers: ['Date', 'Voucher / Ref', 'Paid to', 'Particulars', 'Cash on hand (Cr)', 'Cash in bank & e-wallet (Cr)', 'Petty cash fund (Cr)', 'Input VAT (Dr)', 'Expenses & other accounts (Dr)', 'Accounts debited', 'Withholding tax payable (Cr)'],
    types: ['text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'text', 'money'], rows, totals: ['TOTAL', '', '', '', col(4), col(5), col(6), col(7), col(8), '', col(10)],
    note: 'Approved expenses that were paid, reimbursements to employees and petty cash replenishments. Unpaid bills are in the general journal until they are paid.' };
}

export function generalJournal(db: DB, entries: BookEntry[], from: string, to: string, all: boolean): Report {
  const list = (all ? inPeriod(entries, from, to) : inPeriod(entries, from, to).filter((e) => flowOf(e) === 'general'));
  const rows: (string | number)[][] = []; const styles: ('h' | 'b' | 'i' | '')[] = [];
  let dt = 0, ct = 0;
  for (const e of list) {
    rows.push([fmtDate(e.date), e.ref, `${e.party ? `${e.party} — ` : ''}${e.memo}`, '', '']); styles.push('b');
    for (const l of e.lines) { rows.push(['', '', `${l.credit > 0 ? '      ' : ''}${acctName(l.account)}`, l.debit || '', l.credit || '']); styles.push('i'); dt += l.debit; ct += l.credit; }
  }
  return { title: 'General Journal', subtitle: head(db, span(from, to)), headers: ['Date', 'Ref', 'Particulars / account', 'Debit', 'Credit'], types: ['text', 'text', 'text', 'money', 'money'], rows, styles, totals: ['TOTAL', '', '', round2(dt), round2(ct)],
    note: all ? 'All entries, including cash receipts and payments.' : 'Billing invoices, unpaid bills, depreciation and the bookkeeper\'s adjusting entries. Cash receipts and payments are in their own books.' };
}

export function generalLedger(db: DB, entries: BookEntry[], from: string, to: string, only?: string): Report {
  const accts = ledger(entries, from, to, only);
  const rows: (string | number)[][] = []; const styles: ('h' | 'b' | 'i' | '')[] = [];
  for (const a of accts) {
    rows.push([`${a.code} ${a.name}`, '', '', '', '', '']); styles.push('h');
    rows.push(['', 'Balance forward', '', '', '', a.opening]); styles.push('i');
    for (const r of a.rows) { rows.push([fmtDate(r.date), r.ref, r.memo, r.debit || '', r.credit || '', r.balance]); styles.push(''); }
    rows.push(['', 'Total / ending balance', '', a.debit, a.credit, a.closing]); styles.push('b');
  }
  return { title: 'General Ledger', subtitle: head(db, span(from, to)), headers: ['Date', 'Ref', 'Particulars', 'Debit', 'Credit', 'Balance'], types: ['text', 'text', 'text', 'money', 'money', 'money'], rows, styles,
    note: 'Balances are shown on each account\'s normal side (debit for assets and expenses, credit for liabilities, equity and revenue).' };
}

export function salesList(db: DB, month: string): Report {
  const rows = buildSls(db, month); const t = slsTotals(rows);
  return { title: `Summary List of Sales ${month}`, subtitle: head(db, `Summary List of Sales for ${month}`), headers: ['Invoice date (MM/DD/YYYY)', 'TIN', 'Buyer registered name', 'Address', 'Gross taxable', 'Taxable (net of VAT)', 'Zero-rated', 'Exempt', 'Total output tax', 'Invoice no.'],
    types: ['text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'text'], rows: rows.filter(slsIncluded).map((r) => [reliefDate(r.date), fmtTin(r.tin), r.name, r.address, r.gross_taxable, r.taxable, r.zero, r.exempt, r.output_tax, r.invoice]),
    totals: ['TOTAL', '', '', '', t.gross_taxable, t.taxable, t.zero, t.exempt, t.output_tax, ''], note: 'The same list as Finance → BIR compliance. Fix any missing buyer TIN or address there before filing.' };
}
export function purchasesList(db: DB, month: string, receipts: BirReceipt[]): Report {
  const rows = buildSlp(db, month, receipts); const t = slpTotals(rows);
  return { title: `Summary List of Purchases ${month}`, subtitle: head(db, `Summary List of Purchases for ${month}`), headers: ['Invoice date (MM/DD/YYYY)', 'Supplier TIN', 'Supplier registered name', 'Supplier address', 'Invoice no.', 'Gross purchase', 'Exempt / non-VAT', 'Zero-rated', 'Taxable (net of VAT)', 'Services', 'Capital goods', 'Goods other than capital', 'Input VAT'],
    types: ['text', 'text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money'], rows: rows.filter((r) => !r.skipped).map((r) => [reliefDate(r.date), fmtTin(r.tin), r.supplier, r.address, r.invoice, r.gross, r.exempt, r.zero, r.taxable, r.services, r.capital, r.goods, r.input_vat]),
    totals: ['TOTAL', '', '', '', '', t.gross, t.exempt, t.zero, t.taxable, t.services, t.capital, t.goods, t.input_vat], note: 'The same list as Finance → BIR compliance, including scanned receipts marked for BIR.' };
}

export function incomeStatementReport(db: DB, entries: BookEntry[], from: string, to: string): Report {
  const s = incomeStatement(entries, from, to);
  const items: Parameters<typeof twoCol>[2] = [{ text: 'REVENUE', style: 'h' }, ...lineRows(s.revenue).map(([text, amount]) => ({ text, amount, style: 'i' as const })), { text: 'Total revenue', amount: s.totalRevenue, style: 'b' },
    { text: 'COST OF SERVICES', style: 'h' }, ...lineRows(s.cost).map(([text, amount]) => ({ text, amount, style: 'i' as const })), { text: 'Total cost of services', amount: s.totalCost, style: 'b' },
    { text: 'GROSS PROFIT', amount: s.grossProfit, style: 'b' },
    { text: 'OPERATING EXPENSES', style: 'h' }, ...lineRows(s.opex).map(([text, amount]) => ({ text, amount, style: 'i' as const })), { text: 'Total operating expenses', amount: s.totalOpex, style: 'b' },
    { text: 'NET INCOME BEFORE INCOME TAX', amount: s.netIncome, style: 'b' }];
  return twoCol('Income Statement', head(db, `for the period ${span(from, to)}`), items, 'Amounts are net of VAT. Income tax is not computed here: the bookkeeper adds it as an adjusting entry.');
}

export function balanceSheetReport(db: DB, entries: BookEntry[], date: string): Report {
  const s = balanceSheet(entries, date);
  const items: Parameters<typeof twoCol>[2] = [{ text: 'ASSETS', style: 'h' }, ...lineRows(s.assets).map(([text, amount]) => ({ text, amount, style: 'i' as const })), { text: 'Total assets', amount: s.totalAssets, style: 'b' },
    { text: 'LIABILITIES', style: 'h' }, ...lineRows(s.liabilities).map(([text, amount]) => ({ text, amount, style: 'i' as const })), { text: 'Total liabilities', amount: s.totalLiabilities, style: 'b' },
    { text: "OWNER'S EQUITY", style: 'h' }, ...lineRows(s.equity).map(([text, amount]) => ({ text, amount, style: 'i' as const })), { text: "Total owner's equity", amount: s.totalEquity, style: 'b' },
    { text: "TOTAL LIABILITIES AND OWNER'S EQUITY", amount: round2(s.totalLiabilities + s.totalEquity), style: 'b' }];
  return twoCol('Balance Sheet', head(db, `as of ${fmtDate(date)}`), items, Math.abs(s.check) > 0.005 ? `The balance sheet is out of balance by ${s.check.toFixed(2)}. Check the opening balances and adjusting entries.` : `Balanced: assets equal liabilities plus owner's equity.${s.assets.some((l) => ['1010', '1020', '1030'].includes(l.code ?? '') && l.amount < 0) ? ' A cash account is below zero: the books probably need opening balances, or an owner investment or deposit is missing.' : ''}`);
}

export function equityReport(db: DB, entries: BookEntry[], from: string, to: string): Report {
  const s = equityStatement(entries, from, to);
  return twoCol("Statement of Changes in Owner's Equity", head(db, `for the period ${span(from, to)}`), s.lines.map((l) => ({ text: l.label, amount: l.amount, style: l.bold ? 'b' as const : 'i' as const })));
}

export function cashFlowReport(db: DB, entries: BookEntry[], from: string, to: string): Report {
  const s = cashFlow(entries, from, to);
  const items: Parameters<typeof twoCol>[2] = [{ text: 'CASH FLOWS FROM OPERATING ACTIVITIES', style: 'h' }, ...lineRows(s.operating).map(([text, amount], i) => ({ text, amount, style: s.operating[i].bold ? 'b' as const : 'i' as const })), { text: 'Net cash from operating activities', amount: s.netOperating, style: 'b' },
    { text: 'CASH FLOWS FROM INVESTING ACTIVITIES', style: 'h' }, ...lineRows(s.investing).map(([text, amount]) => ({ text, amount, style: 'i' as const })), { text: 'Net cash from investing activities', amount: s.netInvesting, style: 'b' },
    { text: 'CASH FLOWS FROM FINANCING ACTIVITIES', style: 'h' }, ...lineRows(s.financing).map(([text, amount]) => ({ text, amount, style: 'i' as const })), { text: 'Net cash from financing activities', amount: s.netFinancing, style: 'b' },
    { text: 'NET INCREASE / (DECREASE) IN CASH', amount: s.netChange, style: 'b' }, { text: 'Cash at the beginning of the period', amount: s.beginning, style: 'i' }, { text: 'Cash at the end of the period', amount: s.ending, style: 'b' }];
  return twoCol('Cash Flow Statement', head(db, `for the period ${span(from, to)}`), items, Math.abs(s.difference) > 0.005 ? `Does not reconcile to the cash balance by ${s.difference.toFixed(2)}. Check the adjusting entries.` : 'Indirect method. Cash means cash on hand, cash in bank & e-wallet and the petty cash fund. Reconciles to the balance sheet.');
}

export function trialBalanceReport(db: DB, entries: BookEntry[], date: string): Report {
  const t = trialBalance(entries, date);
  return { title: 'Trial Balance', subtitle: head(db, `as of ${fmtDate(date)}`), headers: ['Account', 'Name', 'Debit', 'Credit'], types: ['text', 'text', 'money', 'money'], rows: t.rows.map((r) => [r.code, r.name, r.debit || '', r.credit || '']), totals: ['TOTAL', '', t.debit, t.credit],
    note: Math.abs(t.debit - t.credit) > 0.005 ? 'Debits and credits do not agree.' : 'Debits equal credits.' };
}

/** Everything in one go, in the order the bookkeeper lists them. */
export function allReports(db: DB, entries: BookEntry[], from: string, to: string, month: string, receipts: BirReceipt[]): Report[] {
  return [cashReceiptsBook(db, entries, from, to), cashDisbursementsBook(db, entries, from, to), generalJournal(db, entries, from, to, false), generalLedger(db, entries, from, to), salesList(db, month), purchasesList(db, month, receipts),
    cashFlowReport(db, entries, from, to), balanceSheetReport(db, entries, to), incomeStatementReport(db, entries, from, to), equityReport(db, entries, from, to), trialBalanceReport(db, entries, to)];
}
