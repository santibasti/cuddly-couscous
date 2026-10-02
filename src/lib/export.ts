import type { DB, Invoice, Job, Payment, PayrollLine, PayrollPeriod, Quotation, Variation } from './types';
import { categoryLabel, docTotals, finalContract, finalQuoteSummary, lineTotals, panelBreakdown, invoiceBalance, invoiceSettled, invoiceTotals, jobCost, panelTotals, rowPanels, variationTotals } from './business';
import { fmtDate, fmtDateTime, nowLocal, round2, sum } from './util';
import { store } from './store';

export type ColType = 'text' | 'money' | 'num' | 'pct';
export interface ExportTable {
  title: string; subtitle?: string; headers: string[]; rows: (string | number)[][]; types?: ColType[]; totals?: (string | number)[];
}

/** jsPDF's built-in fonts have no ₱ glyph; print PHP instead and normalise other symbols. */
const clean = (t: string) => String(t ?? '').replace(/₱/g, 'PHP ').replace(/→/g, '->').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/·/g, '|').replace(/×/g, 'x');
const pm = (n: number) => 'PHP ' + round2(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NAVY: [number, number, number] = [11, 37, 69];
const CYAN: [number, number, number] = [34, 193, 195];

function save(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stampName = (t: string, ext: string) => `topmop-${slug(t)}-${nowLocal().slice(0, 10)}.${ext}`;

export function exportCsv(t: ExportTable) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [t.headers.map(esc).join(','), ...t.rows.map((r) => r.map(esc).join(',')), ...(t.totals ? [t.totals.map(esc).join(',')] : [])];
  save(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), stampName(t.title, 'csv'));
  store.audit('export', 'reports', t.title, `Exported CSV: ${t.title}`);
}

export async function exportXlsx(tables: ExportTable | ExportTable[], filename?: string) {
  const list = Array.isArray(tables) ? tables : [tables];
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TopMop Operations'; wb.created = new Date();
  for (const t of list) {
    const ws = wb.addWorksheet(t.title.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    ws.addRow([store.getDB().settings.company.name]).font = { bold: true, size: 13, color: { argb: 'FF0B2545' } };
    ws.addRow([t.title + (t.subtitle ? ` — ${t.subtitle}` : '')]).font = { bold: true };
    ws.addRow([`Generated ${fmtDateTime(nowLocal())} (Asia/Manila)`]).font = { italic: true, color: { argb: 'FF5B6B80' } };
    ws.addRow([]);
    const h = ws.addRow(t.headers);
    h.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    const body = [...t.rows, ...(t.totals ? [t.totals] : [])];
    for (const r of body) ws.addRow(r);
    if (t.totals) ws.lastRow!.font = { bold: true };
    t.headers.forEach((_, i) => {
      const col = ws.getColumn(i + 1);
      const ty = t.types?.[i] ?? 'text';
      if (ty === 'money') col.numFmt = '"₱"#,##0.00;[Red]-"₱"#,##0.00';
      if (ty === 'num') col.numFmt = '#,##0.##';
      if (ty === 'pct') col.numFmt = '0.0"%"';
      const w = Math.max(String(t.headers[i]).length, ...body.slice(0, 200).map((r) => String(r[i] ?? '').length));
      col.width = Math.min(48, Math.max(10, w + 2));
      if (ty !== 'text') col.alignment = { horizontal: 'right' };
    });
    ws.views = [{ state: 'frozen', ySplit: 5 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename ?? stampName(list[0].title, 'xlsx'));
  store.audit('export', 'reports', list[0].title, `Exported Excel: ${list.map((x) => x.title).join(', ')}`);
}

async function newPdf(orientation: 'p' | 'l' = 'p') {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  return { doc, autoTable: at.default };
}
type Doc = Awaited<ReturnType<typeof newPdf>>['doc'];

function header(doc: Doc, title: string, rightLine?: string) {
  const c = store.getDB().settings.company; const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 24, 'F');
  doc.setFillColor(...CYAN); doc.rect(0, 24, w, 1.2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(c.name, 12, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(170, 200, 230); doc.text(`${c.tagline} • ${c.address}`, 12, 17);
  doc.text(`${c.phone} • ${c.email}${c.tin ? ` • TIN ${c.tin}` : ''}`, 12, 21);
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(title.toUpperCase(), w - 12, 11, { align: 'right' });
  if (rightLine) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(rightLine, w - 12, 17, { align: 'right' }); }
  doc.setTextColor(20, 36, 58);
}
function footer(doc: Doc) {
  const n = doc.getNumberOfPages(); const w = doc.internal.pageSize.getWidth(); const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 135, 155);
    doc.text(`Generated ${fmtDateTime(nowLocal())} (Asia/Manila) by ${store.user?.name ?? 'system'}`, 12, h - 7);
    doc.text(`Page ${i} of ${n}`, w - 12, h - 7, { align: 'right' });
  }
}
const tableStyle = { theme: 'grid' as const, styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [221, 228, 236] as [number, number, number], lineWidth: 0.1 }, headStyles: { fillColor: NAVY, textColor: 255 }, alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] } };

export async function exportPdf(t: ExportTable) {
  const { doc, autoTable } = await newPdf(t.headers.length > 6 ? 'l' : 'p');
  header(doc, t.title, t.subtitle);
  const fmt = (v: string | number, i: number) => {
    const ty = t.types?.[i] ?? 'text';
    return typeof v === 'number' ? (ty === 'money' ? pm(v) : ty === 'pct' ? `${v.toFixed(1)}%` : v.toLocaleString('en-PH', { maximumFractionDigits: 2 })) : v;
  };
  const right: Record<number, { halign: 'right' }> = {};
  (t.types ?? []).forEach((ty, i) => { if (ty !== 'text') right[i] = { halign: 'right' }; });
  autoTable(doc, {
    startY: 30, head: [t.headers], body: t.rows.map((r) => r.map(fmt)), foot: t.totals ? [t.totals.map(fmt)] : undefined, columnStyles: right,
    ...tableStyle, footStyles: { fillColor: [234, 239, 244], textColor: NAVY, fontStyle: 'bold' }, margin: { left: 10, right: 10 },
  });
  footer(doc);
  doc.save(stampName(t.title, 'pdf'));
  store.audit('export', 'reports', t.title, `Exported PDF: ${t.title}`);
}

/* ---------- party block ---------- */
function partyBlock(doc: Doc, y: number, left: [string, string[]], right?: [string, string[]]) {
  const w = doc.internal.pageSize.getWidth();
  const draw = (x: number, [h, lines]: [string, string[]]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(91, 107, 128); doc.text(h.toUpperCase(), x, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(20, 36, 58);
    lines.filter(Boolean).forEach((l, i) => doc.text(l, x, y + 5 + i * 4.6, { maxWidth: w / 2 - 16 }));
  };
  draw(12, left); if (right) draw(w / 2 + 4, right);
  return y + 5 + Math.max(left[1].length, right?.[1].length ?? 0) * 4.6 + 4;
}

function itemsTable(doc: Doc, autoTable: Awaited<ReturnType<typeof newPdf>>['autoTable'], y: number, items: Quotation['items'], mode: Quotation['vat_mode'], rate: number, discount: number, extra?: { wht?: number; label?: string }) {
  const t = docTotals(items, discount, mode, rate);
  autoTable(doc, {
    startY: y, head: [['#', 'Description', 'Qty', 'Unit', 'Unit Rate', 'Discount', 'Amount']],
    body: items.map((i, n) => [n + 1, clean(i.description), i.qty.toLocaleString('en-PH'), i.unit, pm(i.rate), i.discount ? pm(i.discount) : '—', pm(i.qty * i.rate - i.discount)]),
    columnStyles: { 0: { cellWidth: 8 }, 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }, ...tableStyle, margin: { left: 12, right: 12 },
  });
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  const w = doc.internal.pageSize.getWidth();
  const rows: [string, string, boolean?][] = [['Subtotal', pm(t.gross)]];
  if (t.discount) rows.push(['Discount', '- ' + pm(t.discount)]);
  if (mode !== 'none') rows.push([mode === 'inclusive' ? `VAT ${rate}% (included)` : `VAT ${rate}%`, pm(t.vat)]);
  rows.push(['TOTAL', pm(t.total), true]);
  if (extra?.wht) rows.push([extra.label ?? 'Less: Withholding tax', '- ' + pm(extra.wht)], ['NET AMOUNT DUE', pm(t.total - extra.wht), true]);
  let yy = endY;
  for (const [k, v, b] of rows) {
    doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(b ? 11 : 9.5); doc.text(k, w - 70, yy); doc.text(v, w - 12, yy, { align: 'right' }); yy += b ? 6.5 : 5;
  }
  return yy;
}
function wrapText(doc: Doc, text: string, x: number, y: number, maxW: number, lh = 4.2): number {
  const lines = doc.splitTextToSize(clean(text), maxW) as string[];
  const h = doc.internal.pageSize.getHeight();
  for (const l of lines) { if (y > h - 16) { doc.addPage(); y = 16; } doc.text(l, x, y); y += lh; }
  return y;
}
const clientLines = (db: DB, id: string, siteId?: string): string[] => {
  const c = db.clients.find((x) => x.id === id)!; const s = db.sites.find((x) => x.id === siteId);
  return [c.name, `Attn: ${c.contact_person}`, c.billing_address || c.address, c.tin ? `TIN: ${c.tin}` : '', s ? `Site: ${s.name} – ${s.address}` : ''];
};

export async function quotationPdf(db: DB, q: Quotation) {
  const { doc, autoTable } = await newPdf();
  header(doc, 'Quotation', `${q.number} • ${q.status}`);
  let y = partyBlock(doc, 34, ['Prepared for', clientLines(db, q.client_id, q.site_id)], ['Quotation details', [`Date: ${fmtDate(q.issue_date)}`, `Valid until: ${fmtDate(q.valid_until)}`, `Prepared by: ${db.users.find((u) => u.id === q.created_by)?.name ?? '—'}`]]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Scope of work', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  y = wrapText(doc, q.scope, 12, y + 5, 186) + 3;
  y = itemsTable(doc, autoTable, y, q.items, q.vat_mode, q.vat_rate, q.discount) + 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Terms & conditions', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  y = wrapText(doc, q.terms, 12, y + 5, 186, 4) + 8;
  doc.setFontSize(9); doc.text('Approved / accepted by (signature over printed name):', 12, y + 8); doc.line(12, y + 20, 100, y + 20); doc.text('Date:', 120, y + 20); doc.line(130, y + 20, 190, y + 20);
  footer(doc); doc.save(`${q.number}.pdf`);
  store.audit('export', 'quotations', q.id, `Exported PDF ${q.number}`);
}

export async function invoicePdf(db: DB, inv: Invoice) {
  const { doc, autoTable } = await newPdf();
  const st = invoiceSettled(db, inv); const t = invoiceTotals(inv);
  header(doc, inv.status === 'Draft' ? 'Draft Invoice' : 'Billing Invoice', `${inv.number}${inv.status === 'Reversed' ? ' • REVERSED' : ''}`);
  let y = partyBlock(doc, 34, ['Bill to', clientLines(db, inv.client_id, inv.site_id)], ['Invoice details', [`Issued: ${fmtDate(inv.issue_date)}`, `Due: ${fmtDate(inv.due_date)}`, db.jobs.find((j) => j.id === inv.job_id) ? `Job ref: ${db.jobs.find((j) => j.id === inv.job_id)!.number}` : '', inv.quotation_id ? `Quotation: ${db.quotations.find((x) => x.id === inv.quotation_id)?.number}` : '']]);
  y = itemsTable(doc, autoTable, y, inv.items, inv.vat_mode, inv.vat_rate, inv.discount, inv.withholding_rate ? { wht: t.wht, label: `Less: Expected withholding tax (${inv.withholding_rate}%)` } : undefined) + 4;
  if (inv.status === 'Approved') {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(`Payments received: ${pm(st.cash)}   •   Withholding credited: ${pm(st.wht)}`, 12, y);
    doc.setFont('helvetica', 'bold'); doc.text(`Outstanding balance: ${pm(invoiceBalance(db, inv))}`, 12, y + 6);
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  wrapText(doc, `Please make payment by the due date. Payment channels: bank transfer, check, GCash. ${inv.notes ?? ''}`, 12, y + 16, 186);
  footer(doc); doc.save(`${inv.number}.pdf`);
}

export async function receiptPdf(db: DB, p: Payment) {
  const { doc } = await newPdf();
  const inv = db.invoices.find((i) => i.id === p.invoice_id)!;
  header(doc, 'Payment Receipt', p.receipt_no);
  let y = partyBlock(doc, 34, ['Received from', clientLines(db, p.client_id)], ['Receipt details', [`Date: ${fmtDate(p.date)}`, `Method: ${p.method}`, `Reference: ${p.reference || '—'}`, `Invoice: ${inv.number}`]]);
  y += 6; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(`Amount received: ${pm(p.amount)}`, 12, y);
  if (p.wht_amount) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Withholding tax credited (BIR 2307): ${pm(p.wht_amount)}`, 12, y + 7); y += 7; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Invoice balance after this payment: ${pm(invoiceBalance(db, inv))}`, 12, y + 8);
  if (p.reversed) { doc.setTextColor(198, 47, 62); doc.setFont('helvetica', 'bold'); doc.text(`REVERSED – ${p.reversal_reason ?? ''}`, 12, y + 18); }
  doc.setTextColor(20, 36, 58); doc.setFontSize(9); doc.line(130, y + 40, 195, y + 40); doc.text('Authorized signature', 145, y + 45);
  footer(doc); doc.save(`${p.receipt_no}.pdf`);
}

export async function payslipPdf(db: DB, per: PayrollPeriod, l: PayrollLine) {
  const { doc, autoTable } = await newPdf();
  const e = db.employees.find((x) => x.id === l.employee_id)!;
  header(doc, 'Payslip', per.label);
  const y = partyBlock(doc, 34, ['Employee', [e.full_name, `${e.code} • ${e.position}`, `${e.department} • ${e.status}`, `Payout: ${e.payout_method}`]], ['Pay period', [`${fmtDate(per.start)} – ${fmtDate(per.end)}`, `Type: ${per.type}`, `Days worked: ${l.days_worked}`, `Status: ${per.status}${per.locked ? ' (locked)' : ''}`]]);
  autoTable(doc, {
    startY: y + 2, head: [['Earnings', 'Amount']], ...tableStyle, margin: { left: 12, right: 105 }, columnStyles: { 1: { halign: 'right' } },
    body: [['Basic / regular pay', pm(l.regular_pay)], ['Less: late / undertime / absences', '- ' + pm(l.late_undertime_deduction)], ['Overtime', pm(l.overtime_pay)], ['Holiday pay', pm(l.holiday_pay)], ['Rest-day pay', pm(l.rest_day_pay)], ['Paid leave', pm(l.leave_pay)], ['Allowances', pm(l.allowances)], ['Incentives', pm(l.incentives)], ['Reimbursements', pm(l.reimbursements)]],
    foot: [['GROSS PAY', pm(l.gross)]], footStyles: { fillColor: [234, 239, 244], textColor: NAVY, fontStyle: 'bold' },
  });
  autoTable(doc, {
    startY: y + 2, head: [['Deductions', 'Amount']], ...tableStyle, margin: { left: 108, right: 12 }, columnStyles: { 1: { halign: 'right' } },
    body: [['SSS', pm(l.sss)], ['PhilHealth', pm(l.philhealth)], ['Pag-IBIG', pm(l.pagibig)], ['Withholding tax', pm(l.wtax)], ['Cash advance', pm(l.cash_advance)], ['Loan', pm(l.loan)], ['Other deductions', pm(l.other_deductions)]],
    foot: [['TOTAL DEDUCTIONS', pm(l.total_deductions)]], footStyles: { fillColor: [234, 239, 244], textColor: NAVY, fontStyle: 'bold' },
  });
  const endY = Math.max((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY, y + 90) + 8;
  doc.setFillColor(...NAVY); doc.rect(12, endY, 186, 12, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('NET PAY', 16, endY + 8); doc.text(pm(l.net), 194, endY + 8, { align: 'right' });
  doc.setTextColor(20, 36, 58); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  doc.text('Statutory deductions are computed from rates configured by TopMop administration; verify against current government tables.', 12, endY + 20);
  doc.text('Employee signature: ____________________________', 12, endY + 34);
  footer(doc); doc.save(`payslip-${e.code}-${per.start}.pdf`);
}

export async function statementPdf(db: DB, clientId: string, asOf: string) {
  const { doc, autoTable } = await newPdf();
  const c = db.clients.find((x) => x.id === clientId)!;
  header(doc, 'Statement of Account', `As of ${fmtDate(asOf)}`);
  const y = partyBlock(doc, 34, ['Client', clientLines(db, clientId)]);
  const invs = db.invoices.filter((i) => i.client_id === clientId && i.status === 'Approved' && !i.deleted_at && i.issue_date <= asOf).sort((a, b) => a.issue_date.localeCompare(b.issue_date));
  const rows: (string | number)[][] = [];
  let bal = 0;
  const ev = [...invs.map((i) => ({ d: i.issue_date, r: i.number, desc: 'Invoice', deb: invoiceTotals(i).total, cr: 0 })), ...db.payments.filter((p) => p.client_id === clientId && !p.reversed && !p.deleted_at && p.date <= asOf).map((p) => ({ d: p.date, r: p.receipt_no, desc: `Payment (${p.method})${p.wht_amount ? ' + WHT' : ''}`, deb: 0, cr: p.amount + p.wht_amount }))].sort((a, b) => a.d.localeCompare(b.d));
  for (const e of ev) { bal += e.deb - e.cr; rows.push([fmtDate(e.d), e.r, e.desc, e.deb ? pm(e.deb) : '', e.cr ? pm(e.cr) : '', pm(bal)]); }
  autoTable(doc, { startY: y + 2, head: [['Date', 'Reference', 'Description', 'Charges', 'Payments', 'Balance']], body: rows, ...tableStyle, margin: { left: 12, right: 12 }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } });
  const fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(`Total outstanding: ${pm(sum(invs, (i) => invoiceBalance(db, i)))}`, 12, fy);
  footer(doc); doc.save(`statement-${slug(c.name)}-${asOf}.pdf`);
}

async function toRaster(src: string): Promise<{ data: string; fmt: 'JPEG' | 'PNG' }> {
  if (!src.startsWith('data:image/svg')) return { data: src, fmt: src.startsWith('data:image/png') ? 'PNG' : 'JPEG' };
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('image')); img.src = src; });
  const c = document.createElement('canvas'); c.width = img.width || 480; c.height = img.height || 320;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/png'), fmt: 'PNG' };
}

const ymax = (doc: Doc) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
const sigImg = (doc: Doc, data: string | undefined, x: number, y: number) => { if (data?.startsWith('data:image/png')) { try { doc.addImage(data, 'PNG', x, y, 50, 20); } catch { /* ignore */ } } };
const jobEmp = (db: DB, id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';

/* ---------- Service Accomplishment Report (job workflow step 7) ---------- */
export async function serviceReportPdf(db: DB, j: Job) {
  const { doc, autoTable } = await newPdf();
  const wf = db.workflows.find((w) => w.job_id === j.id && !w.deleted_at);
  const site = db.sites.find((s) => s.id === j.site_id)!;
  header(doc, 'Service Accomplishment Report', j.number);
  let y = partyBlock(doc, 34, ['Client / site', clientLines(db, j.client_id, j.site_id)], ['Job details', [`Job ref: ${j.number}`, `Service date: ${fmtDate(j.start_at)}`, `Completed: ${fmtDateTime(wf?.rep_at ?? j.completed_at)}`, `Team leader: ${jobEmp(db, j.leader_id)}`, `Site contact: ${wf?.arr_contact_name ?? site.contact_person}`]]);
  const sec = (t: string, body?: string) => { if (y > 262) { doc.addPage(); y = 16; } doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(t, 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); y = wrapText(doc, body || '—', 12, y + 5, 186) + 3; };
  sec('Scope of work completed', wf?.rep_scope || j.scope);
  const equip = wf ? wf.items.filter((i) => (i.loaded_qty ?? 0) > 0 && i.kind !== 'material' && i.kind !== 'ppe').map((i) => i.label).join(', ') : '';
  sec('Methodology and equipment used', `${wf?.rep_method ?? ''}${equip ? `\nEquipment: ${equip}` : ''}`.trim());
  const fc = finalContract(db, j);
  if (fc.variationsTotal > 0) {
    autoTable(doc, { startY: y, head: [['Contract value', 'Amount']], body: [['Original quotation', pm(fc.originalTotal)], ...db.variations.filter((v) => v.job_id === j.id && v.status === 'Approved').map((v) => [`Approved variation ${v.number}`, pm(variationTotals(v).total)]), ['Final contract value', pm(fc.finalTotal)]], ...tableStyle, columnStyles: { 1: { halign: 'right' } }, margin: { left: 12, right: 100 } });
    y = ymax(doc) + 6;
  }
  if (wf?.panels.length) {
    const pt = panelTotals(wf.panels);
    autoTable(doc, { startY: y, head: [['Area / floor', 'Side', 'External', 'Internal', 'Total', 'Notes']], body: wf.panels.map((p) => [p.area, p.side, p.external, p.internal, rowPanels(p), clean(`${p.additional ? '[additional] ' : ''}${p.notes ?? ''}`)]), foot: [['Total', '', pt.external, pt.internal, pt.total, '']], ...tableStyle, footStyles: { fillColor: [234, 239, 244], textColor: NAVY, fontStyle: 'bold' }, margin: { left: 12, right: 12 } });
    y = ymax(doc) + 6;
  }
  autoTable(doc, { startY: y, head: [['Crew', 'Role']], body: [...(j.leader_id ? [[jobEmp(db, j.leader_id), 'Team Leader']] : []), ...j.crew_ids.map((id) => [jobEmp(db, id), 'Technician'])], ...tableStyle, margin: { left: 12, right: 100 } });
  y = ymax(doc) + 6;
  if (j.materials.length) { autoTable(doc, { startY: y, head: [['Materials used', 'Qty', 'UoM']], body: j.materials.map((m) => { const it = db.items.find((i) => i.id === m.item_id)!; return [it.name, m.used_qty ?? m.planned_qty, it.uom]; }), ...tableStyle, margin: { left: 12, right: 100 } }); y = ymax(doc) + 6; }
  sec('Checklist', j.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.label}`).join('   '));
  sec('Findings', wf?.rep_findings || j.findings);
  sec('Limitations / exclusions', wf?.rep_limits || 'None noted.');
  sec('Recommendations', wf?.rep_recs || 'None.');
  sec('Complimentary services', wf?.rep_complimentary || 'None.');
  const ph = j.photos.filter((p) => p.kind === 'before' || p.kind === 'after').slice(-4);
  if (ph.length) {
    if (y > 200) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Before / after photos', 12, y); y += 3;
    for (const [i, p] of ph.entries()) {
      try { const r = await toRaster(p.data); doc.addImage(r.data, r.fmt, 12 + (i % 2) * 94, y + Math.floor(i / 2) * 52, 90, 48); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text(clean(p.caption || p.kind), 12 + (i % 2) * 94, y + Math.floor(i / 2) * 52 + 51); } catch { /* unsupported image */ }
    }
    y += Math.ceil(ph.length / 2) * 54;
  }
  if (y > 235) { doc.addPage(); y = 16; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Client acceptance', 12, y + 4); doc.text('TopMop representative', 110, y + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text(`${wf?.rep_client_name ?? j.signoff_name ?? '—'}`, 12, y + 10); doc.text(`${fmtDateTime(wf?.rep_client_at ?? j.signoff_at)}${wf?.rep_rating ?? j.client_rating ? ` - Rating ${wf?.rep_rating ?? j.client_rating}/5` : ''}`, 12, y + 15);
  sigImg(doc, wf?.rep_client_sig ?? j.signoff_data, 12, y + 17);
  doc.text(`${wf?.rep_tm_name ?? jobEmp(db, j.leader_id)}`, 110, y + 10); sigImg(doc, wf?.rep_tm_sig, 110, y + 17);
  footer(doc); doc.save(`service-accomplishment-report-${j.number}.pdf`);
  store.audit('export', 'jobs', j.id, `Exported service accomplishment report ${j.number}`);
}

/* ---------- Final quote & conforme: original quotation + additional work + final bill (job workflow step 4) ---------- */
export async function conformePdf(db: DB, j: Job) {
  const { doc, autoTable } = await newPdf();
  const wf = db.workflows.find((w) => w.job_id === j.id && !w.deleted_at);
  const q = db.quotations.find((x) => x.id === (wf?.conf_quotation_id ?? j.quotation_id));
  const w = doc.internal.pageSize.getWidth();
  header(doc, 'Final Quote & Conforme', q?.number ?? j.number);
  let y = partyBlock(doc, 34, ['Client / site', clientLines(db, j.client_id, j.site_id)], ['Reference', [`Original quotation: ${q?.number ?? '—'}`, `Job ref: ${j.number}`, `Presented on site: ${fmtDateTime(wf?.conf_at)}`]]);
  const room = (n: number) => { if (y > 285 - n) { doc.addPage(); y = 16; } };
  const h = (t: string) => { room(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY); doc.text(t, 12, y); doc.setTextColor(20, 36, 58); y += 5; };

  h('1. Original Scope of Work');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); y = wrapText(doc, q?.scope ?? j.scope, 12, y, 186) + 3;
  if (q) y = itemsTable(doc, autoTable, y, q.items, q.vat_mode, q.vat_rate, q.discount) + 3;
  if (wf?.panels.length) {
    const pt = panelTotals(wf.panels); const pb = panelBreakdown(db, q, wf.panels);
    autoTable(doc, { startY: y, head: [['Area / floor', 'Side', 'External', 'Internal', 'Total', 'Notes']], body: wf.panels.map((p) => [p.area, p.side, p.external, p.internal, rowPanels(p), clean(`${p.additional ? '[additional] ' : ''}${p.notes ?? ''}`)]), foot: [['Total', '', pt.external, pt.internal, pt.total, '']], ...tableStyle, footStyles: { fillColor: [234, 239, 244], textColor: NAVY, fontStyle: 'bold' }, margin: { left: 12, right: 12 } });
    y = ymax(doc) + 3; doc.setFontSize(9); doc.text(`Panels: ${pb.original} in original quotation, ${pb.additional} additional, ${pb.external} external, ${pb.internal} internal, ${pb.total} counted in total.`, 12, y); y += 7;
  }
  if (q?.terms) { room(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text('Terms and exclusions', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); y = wrapText(doc, q.terms, 12, y + 4.5, 186) + 4; }

  h('2. Additional Work Requested / Confirmed at Site');
  const vars = db.variations.filter((v) => v.job_id === j.id && !v.deleted_at && (v.status === 'Approved' || (v.source === 'final_review' && (v.status === 'Rejected' || v.items.length > 0)))).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (!vars.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text('No additional work was requested.', 12, y); y += 7; }
  for (const v of vars) {
    room(40);
    const label = v.status === 'Approved' ? 'APPROVED by client' : v.status === 'Rejected' ? 'OFFERED - DECLINED by client (not included in the final amount)' : 'AWAITING client approval (not included)';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(`${v.number} - ${label}`, 12, y); y += 2;
    autoTable(doc, { startY: y, head: [['Category', 'Description / area', 'Qty', 'Unit', 'Rate', 'Discount', 'VAT', 'Line total']], ...tableStyle, margin: { left: 12, right: 12 }, columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      body: v.items.map((i) => { const t = lineTotals(i, v.vat_mode, v.vat_rate); return [categoryLabel(i.category), clean(`${i.description}${i.note ? ` (${i.note})` : ''}${i.entered_qty !== undefined && i.entered_qty !== i.qty ? ` [counted ${i.entered_qty}, minimum ${i.qty} billed]` : ''}`), i.qty, i.unit, pm(i.rate), i.discount ? pm(i.discount) : '-', pm(t.vat), pm(t.total)]; }) });
    y = ymax(doc) + 3;
    if (v.status === 'Approved') { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(`Approved by ${clean(v.client_name ?? '')} on ${fmtDateTime(v.signed_at)}`, 12, y); y += 5; }
    if (v.status === 'Rejected' && v.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(clean(`Client note: ${v.notes}`), 12, y); y += 5; }
    const ph = v.items.filter((i) => i.photo).slice(0, 4);
    for (const [k, i] of ph.entries()) { try { room(36); const r = await toRaster(i.photo!); doc.addImage(r.data, r.fmt, 12 + k * 46, y, 42, 28); } catch { /* skip */ } }
    if (ph.length) y += 32;
  }

  h('3. Final Billing Summary');
  const sm = finalQuoteSummary(db, j, { deposit: wf?.conf_deposit });
  autoTable(doc, { startY: y, body: [
    ['Original quote total (incl. VAT)', pm(sm.originalTotal)], ['Approved additional work total (incl. VAT)', pm(sm.additionalTotal)],
    [`Discount included`, pm(sm.discount)], ['VAT included', pm(sm.vat)], ['FINAL TOTAL BILL', pm(sm.finalTotal)],
    ['Less: deposit / prior payment' + (wf?.conf_deposit_note ? ` (${wf.conf_deposit_note})` : ''), '- ' + pm(sm.deposit)], ['BALANCE DUE', pm(sm.balance)],
  ], theme: 'plain', styles: { fontSize: 10, cellPadding: 1.8 }, columnStyles: { 1: { halign: 'right' } }, margin: { left: 80, right: 12 },
    didParseCell: (d: { row: { index: number }; cell: { styles: { fontStyle: string } } }) => { if (d.row.index === 4 || d.row.index === 6) d.cell.styles.fontStyle = 'bold'; } });
  y = ymax(doc) + 6;
  room(60); doc.setFont('helvetica', 'italic'); doc.setFontSize(9); y = wrapText(doc, 'Any additional work listed above has been discussed with and approved by the client before commencement.', 12, y, 186) + 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Client conforme', 12, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text('I have reviewed the original quotation, the additional work and the final bill above, and I agree to the scope, rates and terms.', 12, y, { maxWidth: 186 }); y += 9;
  doc.text(`${clean(wf?.conf_name ?? '—')} - ${fmtDateTime(wf?.conf_at)}`, 12, y);
  const where = wf?.conf_lat !== undefined ? `GPS ${wf.conf_lat}, ${wf.conf_lng}` : wf?.conf_gps_note ? `GPS not captured (${clean(wf.conf_gps_note)})` : '';
  doc.setFontSize(8); doc.setTextColor(110, 125, 145); doc.text(clean([where, wf?.conf_device ? `Device: ${wf.conf_device}` : ''].filter(Boolean).join('   ')), 12, y + 4.5); doc.setTextColor(20, 36, 58);
  sigImg(doc, wf?.conf_signature, 12, y + 7);
  void w;
  footer(doc); doc.save(`final-quote-${j.number}.pdf`);
  store.audit('export', 'jobs', j.id, `Exported final quote & conforme ${j.number}`);
}

/* ---------- Variation / revised quotation (job workflow step 6) ---------- */
export async function variationPdf(db: DB, v: Variation) {
  const { doc, autoTable } = await newPdf();
  const j = db.jobs.find((x) => x.id === v.job_id)!;
  const wf = db.workflows.find((w) => w.job_id === j.id && !w.deleted_at);
  const fc = finalContract(db, j);
  header(doc, 'Variation / Final Quotation', v.number);
  let y = partyBlock(doc, 34, ['Client / site', clientLines(db, j.client_id, j.site_id)], ['Reference', [`Variation: ${v.number}`, `Job ref: ${j.number}`, `Status: ${v.status}`, `Original quotation: ${db.quotations.find((q) => q.id === j.quotation_id)?.number ?? '—'}`]]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Reason for variation', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); y = wrapText(doc, v.reason, 12, y + 5, 186) + 3;
  y = itemsTable(doc, autoTable, y, v.items, v.vat_mode, v.vat_rate, v.discount) + 3;
  const linked = wf?.panels.filter((p) => v.panel_row_ids.includes(p.id)) ?? [];
  if (linked.length) { autoTable(doc, { startY: y, head: [['Additional panels', 'Side', 'External', 'Internal', 'Total']], body: linked.map((p) => [p.area, p.side, p.external, p.internal, rowPanels(p)]), ...tableStyle, margin: { left: 12, right: 100 } }); y = ymax(doc) + 6; }
  autoTable(doc, { startY: y, head: [['Contract value (incl. VAT)', 'Amount']], body: [['Original quotation', pm(fc.originalTotal)], ['Approved variations', pm(fc.variationsTotal)], ['Final contract value', pm(fc.finalTotal)]], ...tableStyle, columnStyles: { 1: { halign: 'right' } }, margin: { left: 12, right: 100 } });
  y = ymax(doc) + 10;
  if (y > 240) { doc.addPage(); y = 16; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Client approval', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text(v.status === 'Approved' ? `${v.client_name ?? '—'} - ${fmtDateTime(v.signed_at)}` : `Not approved (${v.status})`, 12, y + 6); sigImg(doc, v.client_signature, 12, y + 8);
  footer(doc); doc.save(`variation-${v.number}.pdf`);
  store.audit('export', 'variations', v.id, `Exported variation ${v.number}`);
}

export const shareTextQuote = (db: DB, q: Quotation) => {
  const c = db.clients.find((x) => x.id === q.client_id)!; const t = docTotals(q.items, q.discount, q.vat_mode, q.vat_rate);
  return `Hello ${c.contact_person}, this is ${db.settings.company.name}. Quotation ${q.number} for ${q.scope} — Total ${pm(t.total).replace('PHP', '₱')} (valid until ${fmtDate(q.valid_until)}). Please reply to approve or ask questions. Thank you!`;
};

/* ---------- QR labels (A4, 3 × 8) ---------- */
export async function qrLabelsPdf(assets: { code: string; name: string; category: string }[]) {
  const { qrDataUrl } = await import('./qr');
  const { doc } = await newPdf();
  const cols = 3, rows = 8, w = 66, h = 34, ox = 6, oy = 8;
  for (const [n, a] of assets.entries()) {
    if (n > 0 && n % (cols * rows) === 0) doc.addPage();
    const k = n % (cols * rows); const x = ox + (k % cols) * w; const yy = oy + Math.floor(k / cols) * h;
    doc.setDrawColor(180, 195, 210); doc.rect(x + 1, yy + 1, w - 2, h - 2);
    doc.addImage(await qrDataUrl(a.code, 220), 'PNG', x + 3, yy + 3, 28, 28);
    doc.setTextColor(11, 37, 69); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(a.code, x + 34, yy + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); (doc.splitTextToSize(clean(a.name), w - 38) as string[]).slice(0, 2).forEach((l, i) => doc.text(l, x + 34, yy + 18 + i * 4));
    doc.setFontSize(6.5); doc.setTextColor(110, 125, 145); doc.text('TopMop - scan QR', x + 34, yy + 30);
  }
  doc.save(`topmop-qr-labels-${nowLocal().slice(0, 10)}.pdf`);
}
