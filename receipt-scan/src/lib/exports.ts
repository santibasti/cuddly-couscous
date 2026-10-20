import type { Company, Receipt } from './types';
import { DOC_TYPES, groupSum, inputVatClaimable, inPeriod, monthOf, round2, totalsOf, type Period } from './bir';

export interface Table { name: string; headers: string[]; rows: (string | number)[][]; totals?: (string | number)[]; money?: number[] }

const docLabel = (r: Receipt) => DOC_TYPES.find((d) => d.id === r.docType)?.label ?? r.docType;
const PURCHASE_LABEL = { goods: 'Goods', services: 'Services', capital: 'Capital goods' } as const;

/** every receipt in the period, one row each — the "purchase journal" */
export function purchaseJournal(list: Receipt[]): Table {
  const rows = list.map((r) => [
    r.date, docLabel(r), r.invoiceNo, r.supplierName, r.supplierTin, r.supplierAddress, r.category, r.paymentMethod,
    r.vatable, r.vatAmount, r.vatExempt, r.zeroRated, r.total, r.withholdingTax, r.deductible ? 'Yes' : 'No',
    r.status === 'verified' ? 'Verified' : 'Needs review', r.notes,
  ]);
  const t = totalsOf(list);
  return {
    name: 'Purchase journal',
    headers: ['Date', 'Document', 'Invoice / OR no.', 'Supplier', 'Supplier TIN', 'Address', 'Category', 'Paid by', 'VATable', 'Input VAT', 'VAT-exempt', 'Zero-rated', 'Total', 'Withholding tax', 'Deductible', 'Status', 'Notes'],
    rows, money: [8, 9, 10, 11, 12, 13],
    totals: ['TOTAL', '', '', '', '', '', '', '', t.vatable, t.vat, t.exempt, t.zeroRated, t.gross, t.withholding, '', '', ''],
  };
}

/** Summary List of Purchases — only receipts that support an input-VAT claim. Have your CPA confirm the layout before filing. */
export function summaryListOfPurchases(list: Receipt[], company: Company): Table {
  const claim = company.vatRegistered ? list.filter((r) => inputVatClaimable(r, company)) : [];
  const rows = claim.map((r) => {
    const taxable = r.vatable;
    return [
      monthOf(r.date), r.supplierTin, r.supplierName, r.supplierAddress, r.total, r.vatExempt, r.zeroRated, taxable,
      r.purchaseType === 'services' ? taxable : 0, r.purchaseType === 'capital' ? taxable : 0, r.purchaseType === 'goods' ? taxable : 0,
      r.vatAmount, round2(taxable + r.vatAmount),
    ];
  });
  const sum = (i: number) => round2(rows.reduce((a, r) => a + Number(r[i]), 0));
  return {
    name: 'SLP (input VAT)',
    headers: ['Taxable month', 'Supplier TIN', 'Registered name', 'Address', 'Gross purchase', 'Exempt', 'Zero-rated', 'Taxable purchase', 'Services', 'Capital goods', 'Goods other than capital', 'Input tax', 'Gross taxable purchase'],
    rows, money: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    totals: ['TOTAL', '', '', '', sum(4), sum(5), sum(6), sum(7), sum(8), sum(9), sum(10), sum(11), sum(12)],
  };
}

export function categorySummary(list: Receipt[]): Table {
  const g = groupSum(list, (r) => r.category);
  const total = round2(g.reduce((a, x) => a + x.amount, 0));
  return { name: 'By category', headers: ['Category', 'Amount', '% of total'], rows: g.map((x) => [x.name, x.amount, total ? round2((x.amount / total) * 100) : 0]), money: [1], totals: ['TOTAL', total, 100] };
}

export function monthlySummary(list: Receipt[]): Table {
  const months = [...new Set(list.map((r) => monthOf(r.date)))].sort();
  const rows = months.map((m) => { const t = totalsOf(list.filter((r) => monthOf(r.date) === m)); return [m, t.count, t.vatable, t.vat, t.exempt, t.zeroRated, t.gross]; });
  const t = totalsOf(list);
  return { name: 'By month', headers: ['Month', 'Receipts', 'VATable', 'Input VAT', 'VAT-exempt', 'Zero-rated', 'Total'], rows, money: [2, 3, 4, 5, 6], totals: ['TOTAL', t.count, t.vatable, t.vat, t.exempt, t.zeroRated, t.gross] };
}

export function withholdingSchedule(list: Receipt[]): Table {
  const w = list.filter((r) => r.withholdingTax > 0);
  return {
    name: 'Withholding tax',
    headers: ['Date', 'Supplier', 'TIN', 'Invoice / OR no.', 'ATC', 'Income payment', 'Tax withheld'],
    rows: w.map((r) => [r.date, r.supplierName, r.supplierTin, r.invoiceNo, r.atc, r.vatable || r.total, r.withholdingTax]),
    money: [5, 6], totals: ['TOTAL', '', '', '', '', round2(w.reduce((a, r) => a + (r.vatable || r.total), 0)), round2(w.reduce((a, r) => a + r.withholdingTax, 0))],
  };
}

export function reportPack(all: Receipt[], company: Company, period: Period, onlyVerified: boolean) {
  const list = all.filter((r) => inPeriod(r, period) && (!onlyVerified || r.status === 'verified')).sort((a, b) => a.date.localeCompare(b.date));
  return {
    list,
    tables: [purchaseJournal(list), summaryListOfPurchases(list, company), categorySummary(list), monthlySummary(list), withholdingSchedule(list)],
  };
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Spreadsheet-injection guard: a cell that starts with = + - @ would run as a formula in Excel. */
const safeCell = (v: string | number) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function csvOf(t: Table): string {
  const esc = (v: string | number) => `"${String(safeCell(v) ?? '').replace(/"/g, '""')}"`;
  return '﻿' + [t.headers, ...t.rows, ...(t.totals ? [t.totals] : [])].map((r) => r.map(esc).join(',')).join('\r\n');
}
export function downloadCsv(t: Table, company: Company, period: Period) {
  download(new Blob([csvOf(t)], { type: 'text/csv;charset=utf-8' }), `${slug(company.name)}-${slug(t.name)}-${period.label}.csv`);
}

export async function downloadXlsx(tables: Table[], company: Company, period: Period) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ResiboScan'; wb.created = new Date();
  for (const t of tables) {
    const ws = wb.addWorksheet(t.name.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    ws.addRow([`${company.name}${company.tin ? ' — TIN ' + company.tin : ''}`]).font = { bold: true, size: 13 };
    ws.addRow([`${t.name} · ${period.from} to ${period.to}`]).font = { color: { argb: 'FF555555' } };
    ws.addRow([]);
    const head = ws.addRow(t.headers);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    for (const r of t.rows) ws.addRow(r.map(safeCell));
    if (t.totals) { const tr = ws.addRow(t.totals); tr.font = { bold: true }; tr.eachCell((c) => { c.border = { top: { style: 'thin' } }; }); }
    (t.money ?? []).forEach((i) => { ws.getColumn(i + 1).numFmt = '#,##0.00'; });
    t.headers.forEach((h, i) => {
      const longest = Math.max(h.length, ...t.rows.slice(0, 200).map((r) => String(r[i] ?? '').length));
      ws.getColumn(i + 1).width = Math.min(40, Math.max(11, longest + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${slug(company.name)}-receipts-${period.label}.xlsx`);
}
