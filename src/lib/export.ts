import { logoDataUrl } from './logo';
import { durationText, manpowerText } from './quote-text';
import type { DB, Invoice, OcularVisit, Job, Payment, QuoteImage, PayrollLine, PayrollPeriod, Quotation, Variation } from './types';
import { quoteImagesOf } from './quoteimages';
import { paymentCounts, paymentStatusLabel, categoryLabel, docTotals, finalContract, finalQuoteSummary, lineTotals, panelBreakdown, invoiceBalance, invoiceSettled, invoiceTotals, jobCost, panelTotals, rowPanels, variationTotals } from './business';
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
  const [ExcelJS, logo] = await Promise.all([import('exceljs').then((m) => m.default), logoDataUrl()]);
  const wb = new ExcelJS.Workbook();
  const logoId = logo ? wb.addImage({ base64: logo, extension: 'png' }) : undefined;
  wb.creator = 'TopMop Operations'; wb.created = new Date();
  for (const t of list) {
    const ws = wb.addWorksheet(t.title.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    const co = ws.addRow([store.getDB().settings.company.name]); co.font = { bold: true, size: 13, color: { argb: 'FF0B2545' } };
    if (logoId !== undefined) { co.height = 44; co.alignment = { vertical: 'middle', indent: 6 }; ws.addImage(logoId, { tl: { col: 0.08, row: 0.08 }, ext: { width: 52, height: 52 } }); }
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

let LOGO: string | null = null;
async function newPdf(orientation: 'p' | 'l' = 'p') {
  const [{ jsPDF }, at, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), logoDataUrl()]);
  LOGO = logo;
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  return { doc, autoTable: at.default };
}
type Doc = Awaited<ReturnType<typeof newPdf>>['doc'];

function header(doc: Doc, title: string, rightLine?: string) {
  const c = store.getDB().settings.company; const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 24, 'F');
  doc.setFillColor(...CYAN); doc.rect(0, 24, w, 1.2, 'F');
  let x0 = 12;
  if (LOGO) { try { doc.addImage(LOGO, 'PNG', 10, 2.5, 19, 19); x0 = 32; } catch { /* header without the logo */ } }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(c.name, x0, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(170, 200, 230); doc.text(`${c.tagline} • ${c.address}`, x0, 17);
  doc.text(`${c.phone} • ${c.email}${c.tin ? ` • TIN ${c.tin}` : ''}`, x0, 21);
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

function itemsTable(doc: Doc, autoTable: Awaited<ReturnType<typeof newPdf>>['autoTable'], y: number, items: Quotation['items'], mode: Quotation['vat_mode'], rate: number, discount: number, extra?: { wht?: number; label?: string; granted?: { net: number; label: string } }) {
  const t = docTotals(items, discount, mode, rate);
  autoTable(doc, {
    startY: y, head: [['#', 'Description', 'Qty', 'Unit', 'Unit Rate', 'Discount', 'Amount']],
    body: items.map((i, n) => [n + 1, clean(i.description), i.qty.toLocaleString('en-PH'), i.unit, pm(i.rate), i.discount ? pm(i.discount) : '—', pm(i.qty * i.rate - i.discount)]),
    columnStyles: { 0: { cellWidth: 8 }, 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }, ...tableStyle, margin: { left: 12, right: 12 },
  });
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  const w = doc.internal.pageSize.getWidth();
  const rows: [string, string, boolean?][] = [['Subtotal', pm(t.gross)]];
  const gr = extra?.granted?.net ?? 0;
  if (t.discount - gr > 0.005) rows.push(['Discount', '- ' + pm(t.discount - gr)]);
  if (gr > 0) rows.push([extra!.granted!.label, '- ' + pm(gr)]);
  if (mode !== 'none') rows.push([mode === 'inclusive' ? `VAT ${rate}% (included)` : `VAT ${rate}%`, pm(t.vat)]);
  rows.push(['TOTAL', pm(t.total), true]);
  if (extra?.wht) rows.push([extra.label ?? 'Less: Withholding tax', '- ' + pm(extra.wht)], ['NET AMOUNT DUE', pm(t.total - extra.wht), true]);
  let yy = endY;
  for (const [k, v, b] of rows) {
    doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(b ? 11 : 9.5); doc.text(k, w - 78, yy); doc.text(v, w - 12, yy, { align: 'right' }); yy += b ? 6.5 : 5;
  }
  if (gr > 0) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(30, 120, 70); doc.text(clean('Discount approved by TopMop management and reflected in the final agreed amount.'), 12, yy + 1); doc.setTextColor(20, 36, 58); yy += 6; }
  return yy;
}
/** jsPDF embeds JPEG / PNG only: anything else (e.g. an SVG) is drawn onto a canvas first. */
async function pdfReady(imgs: QuoteImage[]): Promise<QuoteImage[]> {
  return Promise.all(imgs.map(async (im) => {
    if (/^data:image\/(jpe?g|png)/.test(im.file)) return im;
    try {
      const el = new Image(); await new Promise<void>((res, rej) => { el.onload = () => res(); el.onerror = () => rej(new Error('img')); el.src = im.file; });
      const c = document.createElement('canvas'); c.width = Math.max(1, im.width || el.naturalWidth); c.height = Math.max(1, im.height || el.naturalHeight);
      const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(el, 0, 0, c.width, c.height);
      return { ...im, file: c.toDataURL('image/png') };
    } catch { return im; }
  }));
}
/** "Include Images in PDF": the images selected for the client, two per row, each with its category and caption. */
function imagesBlock(doc: Doc, y: number, imgs: QuoteImage[], title = 'Attachments'): number {
  if (!imgs.length) return y;
  const pageH = doc.internal.pageSize.getHeight();
  const ensure = (need: number) => { if (y + need > pageH - 16) { doc.addPage(); y = 16; } };
  ensure(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text(title, 12, y); doc.setTextColor(20, 36, 58); y += 5;
  const cellW = 90, maxH = 62;
  for (let k = 0; k < imgs.length; k += 2) {
    const row = imgs.slice(k, k + 2);
    const dims = row.map((im) => { const r = Math.min((cellW - 2) / im.width, maxH / im.height); return { w: im.width * r, h: im.height * r }; });
    const rowH = Math.max(...dims.map((d) => d.h)) + 16;
    ensure(rowH);
    row.forEach((im, c) => {
      const x = 12 + c * (cellW + 6);
      try { doc.addImage(im.file, im.file.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, dims[c].w, dims[c].h); } catch { doc.setFontSize(8); doc.text('[image could not be embedded]', x, y + 6); }
      doc.setDrawColor(221, 228, 236); doc.rect(x, y, dims[c].w, dims[c].h);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(clean(im.category), x, y + dims[c].h + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const cap = [im.caption, im.item_label ? `(line: ${im.item_label})` : ''].filter(Boolean).join(' ');
      if (cap) doc.text(doc.splitTextToSize(clean(cap), cellW - 2).slice(0, 2) as string[], x, y + dims[c].h + 8);
    });
    y += rowH;
  }
  return y + 2;
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

/** Manpower deployment, estimated duration and the service disclaimer (only what the quotation has). */
function deploymentBlock(doc: Doc, q: Quotation, y: number): number {
  const part = (title: string, text: string | null, size = 9) => {
    if (!text) return;
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(title, 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(size); y = wrapText(doc, text, 12, y + 4.5, 186, size === 9 ? 4.2 : 3.7) + 3;
  };
  part('Manpower Deployment', manpowerText(q)); part('Estimated Duration', durationText(q)); part('Service Disclaimer', q.disclaimer?.trim() || null, 8);
  return y + 2;
}
export async function quotationPdf(db: DB, q: Quotation, opts: { includeImages?: boolean } = {}) {
  const { doc, autoTable } = await newPdf();
  header(doc, 'Quotation', `${q.number} • ${q.status}`);
  let y = partyBlock(doc, 34, ['Prepared for', clientLines(db, q.client_id, q.site_id)], ['Quotation details', [`Date: ${fmtDate(q.issue_date)}`, `Valid until: ${fmtDate(q.valid_until)}`, `Prepared by: ${db.users.find((u) => u.id === q.created_by)?.name ?? '—'}`]]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Scope of work', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  y = wrapText(doc, q.scope, 12, y + 5, 186) + 3;
  y = itemsTable(doc, autoTable, y, q.items, q.vat_mode, q.vat_rate, q.discount) + 4;
  y = deploymentBlock(doc, q, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Terms & conditions', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  y = wrapText(doc, q.terms, 12, y + 5, 186, 4) + 8;
  if (opts.includeImages) y = imagesBlock(doc, y, await pdfReady(quoteImagesOf(db, { quotation_id: q.id }, true)), 'Attachments — site images');
  doc.setFontSize(9); doc.text('Approved / accepted by (signature over printed name):', 12, y + 8); doc.line(12, y + 20, 100, y + 20); doc.text('Date:', 120, y + 20); doc.line(130, y + 20, 190, y + 20);
  footer(doc); doc.save(`${q.number}.pdf`);
  store.audit('export', 'quotations', q.id, `Exported PDF ${q.number}`);
}


/** Ocular Inspection Report: what the estimator found and recommends, signed by the client. */
export async function ocularReportPdf(db: DB, v: OcularVisit) {
  const { doc, autoTable } = await newPdf();
  const names = (codes: string[]) => codes.map((c) => db.services.find((x) => x.code === c)?.name ?? c).join(', ') || '-';
  const estimator = db.employees.find((e) => e.id === v.assignee_id)?.full_name ?? '-';
  header(doc, 'Ocular Report', `${v.number}${v.client_sig ? ' | SIGNED' : ''}`);
  const cl = db.clients.find((c) => c.id === v.client_id); const site = db.sites.find((x) => x.id === v.site_id);
  const col = (x: number, head: string, lines: string[], yy: number) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(91, 107, 128); doc.text(head.toUpperCase(), x, yy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(20, 36, 58); let k = yy + 5;
    for (const l of lines.filter(Boolean)) for (const part of doc.splitTextToSize(clean(l), 88) as string[]) { doc.text(part, x, k); k += 4.5; }
    return k;
  };
  const yl = col(12, 'Prepared for', [cl?.name ?? '', `Attn: ${v.contact_person}${v.contact_mobile ? ` | ${v.contact_mobile}` : ''}`, site ? `Site: ${site.name}` : ''], 34);
  const yr = col(110, 'Inspection details', [`Date: ${fmtDate(v.start_at.slice(0, 10))}, ${v.start_at.slice(11)}`, `Location: ${v.location}`, `Inspected by: ${estimator}`, `Requested: ${names(v.service_codes)}`], 34);
  let y = Math.max(yl, yr) + 4;
  const room = (n: number) => { if (y > 285 - n) { doc.addPage(); y = 16; } };
  const section = (title: string, text?: string) => { if (!text?.trim()) return; room(24); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(11, 37, 69); doc.text(title, 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(20, 36, 58); y = wrapText(doc, text, 12, y + 5, 186, 4.4) + 4; };
  section("Client's concerns / requested scope", v.concerns);
  section('Site access', v.access_notes);
  if (v.panels.length) {
    room(40); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(11, 37, 69); doc.text('Glass panel count', 12, y); y += 3;
    const pt = panelTotals(v.panels);
    autoTable(doc, { startY: y, head: [['Floor / area', 'Side', 'External', 'Internal', 'Total', 'Notes']], body: v.panels.map((p) => [p.area, p.side, p.external, p.internal, p.external + p.internal, clean(p.notes ?? '')]), foot: [['Total', '', pt.external, pt.internal, pt.total, '']], ...tableStyle, footStyles: { fillColor: [234, 239, 244], textColor: NAVY, fontStyle: 'bold' }, margin: { left: 12, right: 12 } });
    y = ymax(doc) + 6; doc.setTextColor(20, 36, 58);
  }
  if (v.measurements.length) {
    room(36); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(11, 37, 69); doc.text('Measurements', 12, y); y += 3;
    autoTable(doc, { startY: y, head: [['Item / area', 'Service', 'Quantity', 'Notes']], body: v.measurements.map((m) => [clean(m.label), m.service_code ? names([m.service_code]) : '-', `${m.qty} ${m.unit}`, clean(m.notes ?? '')]), ...tableStyle, margin: { left: 12, right: 12 } });
    y = ymax(doc) + 6; doc.setTextColor(20, 36, 58);
  }
  section('Findings', v.findings);
  section('Surface and site condition', v.report_surface);
  section('Hazards, safety and access requirements', v.report_hazards);
  section('Recommended service', `${names(v.report_services?.length ? v.report_services : v.service_codes)}${v.report_days ? `\nEstimated working days: ${v.report_days}` : ''}${v.report_crew ? `\nRecommended crew: ${v.report_crew}` : ''}${v.report_recommendation ? `\n${v.report_recommendation}` : ''}`);
  section('Please note', 'This report records the conditions seen during the ocular visit and our recommended scope of work. It is not a quotation: prices, schedule and terms follow in a separate quotation. Hidden damage or conditions that were not visible during the visit may require changes to the scope.');
  room(52);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text('Acknowledgement', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); y += 5;
  y = wrapText(doc, 'I acknowledge that the site was inspected with me / my representative, and that the findings and recommended service above reflect what was seen and discussed.', 12, y, 186, 4.2) + 4;
  doc.text('Client representative (signature over printed name)', 12, y); doc.text('Inspected by (signature over printed name)', 110, y);
  sigImg(doc, v.client_sig, 12, y + 2); sigImg(doc, v.assessor_sig, 110, y + 2);
  doc.line(12, y + 22, 100, y + 22); doc.line(110, y + 22, 198, y + 22);
  doc.text(clean(v.client_sig_name ?? ''), 12, y + 27); doc.text(clean(estimator), 110, y + 27);
  doc.text(`Date: ${v.client_sig_at ? fmtDate(v.client_sig_at.slice(0, 10)) : '________________'}`, 12, y + 32); doc.text(`Date: ${v.assessor_sig_at ? fmtDate(v.assessor_sig_at.slice(0, 10)) : '________________'}`, 110, y + 32);
  footer(doc); doc.save(`Ocular-Report-${v.number}.pdf`);
  store.audit('export', 'ocular_visits', v.id, `Exported ocular report ${v.number}`);
}

export async function invoicePdf(db: DB, inv: Invoice) {
  const { doc, autoTable } = await newPdf();
  const st = invoiceSettled(db, inv); const t = invoiceTotals(inv);
  header(doc, inv.status === 'Draft' ? 'Draft Invoice' : 'Billing Invoice', `${inv.number}${inv.status === 'Reversed' ? ' • REVERSED' : ''}`);
  let y = partyBlock(doc, 34, ['Bill to', clientLines(db, inv.client_id, inv.site_id)], ['Invoice details', [`Issued: ${fmtDate(inv.issue_date)}`, `Due: ${fmtDate(inv.due_date)}`, db.jobs.find((j) => j.id === inv.job_id) ? `Job ref: ${db.jobs.find((j) => j.id === inv.job_id)!.number}` : '', inv.quotation_id ? `Quotation: ${db.quotations.find((x) => x.id === inv.quotation_id)?.number}` : '']]);
  const drq = db.discount_requests.find((r) => r.id === inv.discount_request_id);
  const gNet = drq && inv.discount_granted ? (inv.vat_mode === 'exclusive' ? Math.round((inv.discount_granted / (1 + inv.vat_rate / 100)) * 100) / 100 : inv.discount_granted) : 0;
  y = itemsTable(doc, autoTable, y, inv.items, inv.vat_mode, inv.vat_rate, inv.discount, { ...(inv.withholding_rate ? { wht: t.wht, label: `Less: Expected withholding tax (${inv.withholding_rate}%)` } : {}), ...(gNet ? { granted: { net: gNet, label: `Discount granted (${drq!.number})` } } : {}) }) + 4;
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
  const job = db.jobs.find((j) => j.id === (p.job_id ?? inv?.job_id));
  const st = paymentStatusLabel(p);
  header(doc, 'Payment Receipt', p.receipt_no);
  const det = p.method === 'Bank Transfer' ? [`Bank: ${p.bank_name ?? '-'}`, `Account / ref: ${p.reference || '-'}`, `Transfer date: ${fmtDate(p.transfer_date)}`]
    : p.method === 'Cheque' ? [`Bank: ${p.bank_name ?? '-'}`, `Cheque no.: ${p.cheque_no ?? '-'}`, `Cheque date: ${fmtDate(p.cheque_date)}`, `Clearing: ${p.cheque_status ?? '-'}`]
    : p.method === 'GCash' ? [`GCash ref: ${p.gcash_ref ?? '-'}`, `Sender: ${p.sender ?? '-'}`] : [];
  let y = partyBlock(doc, 34, ['Received from', clientLines(db, p.client_id)], ['Receipt details', [`Payment no.: ${p.receipt_no}`, `Date & time: ${p.paid_at ? fmtDateTime(p.paid_at) : fmtDate(p.date)}`, `Method: ${p.method}`, `Job: ${job?.number ?? '-'}  Invoice: ${inv?.number ?? '-'}`, `Received by: ${p.received_by ?? '-'}`, ...det]]);
  y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(`Amount received: ${pm(p.amount)}`, 12, y);
  if (p.wht_amount) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Withholding tax credited (BIR 2307): ${pm(p.wht_amount)}`, 12, y + 7); y += 7; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  if (inv) doc.text(`Final bill ${pm(invoiceTotals(inv).total)}  |  Outstanding balance on the invoice (verified payments only): ${pm(invoiceBalance(db, inv))}`, 12, y + 8);
  if (p.notes) doc.text(clean(`Notes: ${p.notes}`), 12, y + 15);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  if (p.reversed) { doc.setTextColor(198, 47, 62); doc.text(`REVERSED - ${p.reversal_reason ?? ''}`, 12, y + 24); }
  else if (st !== 'Verified') { doc.setTextColor(176, 112, 0); doc.text(clean(`${st.toUpperCase()} - not yet counted against the invoice. This is an acknowledgement of receipt only.`), 12, y + 24); }
  else { doc.setTextColor(30, 120, 70); doc.text('VERIFIED', 12, y + 24); }
  doc.setTextColor(20, 36, 58); doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.line(130, y + 44, 195, y + 44); doc.text('Received by / authorized signature', 133, y + 49);
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
  const ev = [...invs.map((i) => ({ d: i.issue_date, r: i.number, desc: 'Invoice', deb: invoiceTotals(i).total, cr: 0 })), ...db.payments.filter((p) => p.client_id === clientId && paymentCounts(p) && p.date <= asOf).map((p) => ({ d: p.date, r: p.receipt_no, desc: `Payment (${p.method})${p.wht_amount ? ' + WHT' : ''}`, deb: 0, cr: p.amount + p.wht_amount }))].sort((a, b) => a.d.localeCompare(b.d));
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
  if (fc.variationsTotal > 0 || fc.discount > 0) {
    autoTable(doc, { startY: y, head: [['Contract value', 'Amount']], body: [['Original quotation', pm(fc.originalTotal)], ...db.variations.filter((v) => v.job_id === j.id && v.status === 'Approved').map((v) => [`Approved variation ${v.number}`, pm(variationTotals(v).total)]), ...(fc.discount > 0 ? [['Discount granted (approved by TopMop management)', '- ' + pm(fc.discount)]] : []), ['Final contract value', pm(fc.payableTotal)]], ...tableStyle, columnStyles: { 1: { halign: 'right' } }, margin: { left: 12, right: 100 } });
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
  if (wf?.start_at && wf.finish_at) sec('Work period', `${fmtDateTime(wf.start_at)} to ${fmtDateTime(wf.finish_at)}${wf.work_notes ? `\n${wf.work_notes}` : ''}`);
  sec('Findings', wf?.rep_findings || j.findings);
  { const fb = db.client_feedback.find((x) => x.job_id === j.id && !x.deleted_at); if (fb) sec('Client satisfaction', `${['', 'Not Satisfied', 'Satisfied', 'Very Satisfied'][fb.rating]}${fb.aspects.length ? ` - ${fb.aspects.join(', ')}` : ''}${fb.comment ? ` - "${fb.comment}"` : ''}`); }
  sec('Limitations / exclusions', wf?.rep_limits || 'None noted.');
  sec('Recommendations', wf?.rep_recs || 'None.');
  sec('Complimentary services', wf?.rep_complimentary || 'None.');
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
export async function conformePdf(db: DB, j: Job, opts: { includeImages?: boolean } = {}) {
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
  if (q?.disclaimer?.trim()) { room(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text('Service disclaimer', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); y = wrapText(doc, q.disclaimer, 12, y + 4.5, 186, 3.7) + 4; }
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
  }

  if (opts.includeImages) {
    const qi = q ? quoteImagesOf(db, { quotation_id: q.id }, true) : [];
    const vi = vars.flatMap((v) => quoteImagesOf(db, { variation_id: v.id }, true));
    if (qi.length || vi.length) { room(40); y = imagesBlock(doc, y, await pdfReady([...qi, ...vi]), 'Attachments — site images'); }
  }

  h('3. Final Billing Summary');
  const sm = finalQuoteSummary(db, j, { deposit: wf?.conf_deposit });
  const sumRows: [string, string, boolean?][] = [
    ['Original Quote Total (incl. VAT)', pm(sm.originalTotal)], ['Additional Work Total (incl. VAT)', pm(sm.additionalTotal)],
    ...(sm.discount > 0 ? [['Discounts already in the quoted prices', pm(sm.discount)] as [string, string]] : []),
    ...(sm.granted > 0 ? [[`Discount (approved)${sm.request ? ` ${sm.request.number}` : ''}`, '- ' + pm(sm.granted)] as [string, string]] : []),
    ['VAT', pm(sm.vat)], ['FINAL AMOUNT PAYABLE', pm(sm.finalTotal), true],
    ...(sm.deposit > 0 ? [['Less: deposit / prior payment' + (wf?.conf_deposit_note ? ` (${wf.conf_deposit_note})` : ''), '- ' + pm(sm.deposit)] as [string, string], ['BALANCE DUE', pm(sm.balance), true] as [string, string, boolean]] : []),
  ];
  autoTable(doc, { startY: y, body: sumRows.map((r) => [r[0], r[1]]), theme: 'plain', styles: { fontSize: 10, cellPadding: 1.8 }, columnStyles: { 1: { halign: 'right' } }, margin: { left: 80, right: 12 },
    didParseCell: (d: { row: { index: number }; cell: { styles: { fontStyle: string } } }) => { if (sumRows[d.row.index]?.[2]) d.cell.styles.fontStyle = 'bold'; } });
  y = ymax(doc) + 6;
  room(60); doc.setFont('helvetica', 'italic'); doc.setFontSize(9); y = wrapText(doc, 'Any additional work listed above has been discussed with and approved by the client before commencement.', 12, y, 186) + 1;
  if (sm.granted > 0) y = wrapText(doc, 'Discount approved by TopMop management and reflected in the final agreed amount.', 12, y, 186) + 3; else y += 3;
  if (wf?.conf_mode === 'confirmed') {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Scope confirmed - no changes', 12, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(clean(`The existing approved scope was confirmed by the TopMop Team Leader (${db.users.find((u) => u.id === wf.conf_by)?.name ?? '-'}) on ${fmtDateTime(wf.conf_at)}. No new client signature was required.`), 12, y, { maxWidth: 186 });
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Client conforme', 12, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text('I have reviewed the original quotation, the additional work and the final bill above, and I agree to the scope, rates and terms.', 12, y, { maxWidth: 186 }); y += 9;
    doc.text(`${clean(wf?.conf_name ?? '—')} - ${fmtDateTime(wf?.conf_at)}`, 12, y);
    const where = wf?.conf_lat !== undefined ? `GPS ${wf.conf_lat}, ${wf.conf_lng}` : wf?.conf_gps_note ? `GPS not captured (${clean(wf.conf_gps_note)})` : '';
    doc.setFontSize(8); doc.setTextColor(110, 125, 145); doc.text(clean([where, wf?.conf_device ? `Device: ${wf.conf_device}` : ''].filter(Boolean).join('   ')), 12, y + 4.5); doc.setTextColor(20, 36, 58);
    sigImg(doc, wf?.conf_signature, 12, y + 7);
  }
  void w;
  footer(doc); doc.save(`final-quote-${j.number}.pdf`);
  store.audit('export', 'jobs', j.id, `Exported final quote & conforme ${j.number}`);
}

/* ---------- Variation / revised quotation (job workflow step 6) ---------- */
export async function variationPdf(db: DB, v: Variation, opts: { includeImages?: boolean } = {}) {
  const { doc, autoTable } = await newPdf();
  const j = db.jobs.find((x) => x.id === v.job_id)!;
  const wf = db.workflows.find((w) => w.job_id === j.id && !w.deleted_at);
  const fc = finalContract(db, j);
  header(doc, 'Variation / Final Quotation', v.number);
  let y = partyBlock(doc, 34, ['Client / site', clientLines(db, j.client_id, j.site_id)], ['Reference', [`Variation: ${v.number}`, `Job ref: ${j.number}`, `Status: ${v.status}`, `Original quotation: ${db.quotations.find((q) => q.id === j.quotation_id)?.number ?? '—'}`]]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Reason for variation', 12, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); y = wrapText(doc, v.reason, 12, y + 5, 186) + 3;
  y = itemsTable(doc, autoTable, y, v.items, v.vat_mode, v.vat_rate, v.discount) + 3;
  if (opts.includeImages) y = imagesBlock(doc, y, await pdfReady(quoteImagesOf(db, { variation_id: v.id }, true)), 'Attachments — additional work');
  const linked = wf?.panels.filter((p) => v.panel_row_ids.includes(p.id)) ?? [];
  if (linked.length) { autoTable(doc, { startY: y, head: [['Additional panels', 'Side', 'External', 'Internal', 'Total']], body: linked.map((p) => [p.area, p.side, p.external, p.internal, rowPanels(p)]), ...tableStyle, margin: { left: 12, right: 100 } }); y = ymax(doc) + 6; }
  autoTable(doc, { startY: y, head: [['Contract value (incl. VAT)', 'Amount']], body: [['Original quotation', pm(fc.originalTotal)], ['Approved variations', pm(fc.variationsTotal)], ...(fc.discount > 0 ? [['Discount granted (approved by TopMop management)', '- ' + pm(fc.discount)]] : []), ['Final contract value', pm(fc.payableTotal)]], ...tableStyle, columnStyles: { 1: { halign: 'right' } }, margin: { left: 12, right: 100 } });
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
