// Client-facing Job Order Confirmation PDF (A4, large readable type for tablets). Built only from the saved Job Order content.
import { logoDataUrl } from './logo';
import type { JobOrder } from './types';
import { CHANGE_NOTE, PREPARE, WEATHER_NOTE, orderLabel } from './joborder-core';
import { DEFAULT_TECHNOLOGY } from './quote-text';
import { fmtDate } from './util';

const NAVY: [number, number, number] = [11, 37, 69]; const CYAN: [number, number, number] = [34, 193, 195]; const INK: [number, number, number] = [20, 36, 58]; const MUTED: [number, number, number] = [91, 107, 128];
const clean = (t: string) => String(t ?? '').replace(/\(₱\)/g, '(PHP)').replace(/₱/g, 'PHP ').replace(/→/g, '->').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/·/g, '|').replace(/×/g, 'x');
const pm = (n: number) => 'PHP ' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const t12 = (hm: string) => { const h = +hm.slice(0, 2); return `${((h + 11) % 12) + 1}:${hm.slice(3, 5)} ${h >= 12 ? 'PM' : 'AM'}`; };
const hoursText = (h: number) => (h === 1 ? '1 hour' : `${h} hours`);

export const jobOrderFilename = (o: Pick<JobOrder, 'number' | 'version'>) => `TopMop-${o.number}${o.version > 1 ? `-Rev${o.version}` : ''}.pdf`;

/** Builds the PDF; returns it as a Blob (the caller downloads, prints or attaches it). */
export async function buildJobOrderPdf(o: JobOrder, opts: { generatedBy?: string } = {}): Promise<Blob> {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = at.default; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c = o.content; const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 14; const CW = W - 2 * M;
  type RGB = [number, number, number];
  const SOFT: RGB = [243, 247, 250]; const TEAL: RGB = [14, 154, 167]; const WHITE: RGB = [255, 255, 255]; const PALE: RGB = [170, 200, 230];
  const txt = (s: string, x: number, y: number, o2: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center'; max?: number } = {}) => {
    doc.setFont('helvetica', o2.bold ? 'bold' : 'normal'); doc.setFontSize(o2.size ?? 10.5); doc.setTextColor(...(o2.color ?? INK));
    doc.text(clean(s), x, y, { align: o2.align ?? 'left', maxWidth: o2.max });
  };
  // ---- header: logo, company, document title ----
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 34, 'F'); doc.setFillColor(...CYAN); doc.rect(0, 34, W, 1.4, 'F');
  const logo = await logoDataUrl(); if (logo) { try { doc.addImage(logo, 'PNG', M - 1, 5, 22, 22); } catch { /* without the logo */ } }
  txt(c.company.name, M + 24, 13, { size: 14, bold: true, color: WHITE });
  txt(c.company.tagline, M + 24, 18.2, { size: 8.5, color: PALE });
  txt(c.company.address, M + 24, 22.6, { size: 8.5, color: PALE, max: 100 });
  txt(`${c.company.phone}  |  ${c.company.email}${c.company.tin ? `  |  TIN ${c.company.tin}` : ''}`, M + 24, 27, { size: 8.5, color: PALE, max: 110 });
  txt('JOB ORDER', W - M, 12, { size: 17, bold: true, color: WHITE, align: 'right' });
  txt('CONFIRMATION', W - M, 18.5, { size: 11, bold: true, color: CYAN, align: 'right' });
  txt(orderLabel(o), W - M, 25, { size: 10.5, bold: true, color: WHITE, align: 'right' });
  txt(`Issued ${fmtDate(o.issued_on)}`, W - M, 29.8, { size: 9, color: PALE, align: 'right' });

  let y = 43;
  const page = () => { doc.addPage(); doc.setFillColor(...NAVY); doc.rect(0, 0, W, 11, 'F'); doc.setFillColor(...CYAN); doc.rect(0, 11, W, 0.8, 'F'); txt(c.company.name, M, 7.2, { size: 8.5, bold: true, color: WHITE }); txt(`Job Order ${orderLabel(o)}`, W - M, 7.2, { size: 8.5, color: WHITE, align: 'right' }); y = 20; };
  const need = (h: number) => { if (y + h > H - 18) page(); };
  const lines = (t: string, w: number, size: number) => { doc.setFontSize(size); return doc.splitTextToSize(clean(t), w) as string[]; };
  const para = (t: string, x: number, w: number, size = 9.8, lh = 4.8, color: RGB = INK) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...color); for (const l of lines(t, w, size)) { need(lh); doc.text(l, x, y); y += lh; } };
  const section = (title: string) => { need(20); y += 2; txt(title.toUpperCase(), M, y, { size: 10, bold: true, color: NAVY }); doc.setFillColor(...CYAN); doc.rect(M, y + 1.6, 14, 0.9, 'F'); y += 7; };
  const accentCard = (x: number, w: number, h: number) => { doc.setFillColor(...SOFT); doc.roundedRect(x, y, w, h, 2, 2, 'F'); doc.setFillColor(...CYAN); doc.rect(x, y + 2, 1.2, h - 4, 'F'); };

  const stamp = o.status === 'Superseded' ? 'SUPERSEDED - a newer version of this Job Order has been issued. Please use the latest version.' : o.status === 'Draft' || o.status === 'Revised' ? 'DRAFT - not yet sent to the client' : '';
  if (stamp) { doc.setFillColor(...(o.status === 'Superseded' ? [253, 235, 234] as RGB : [255, 243, 214] as RGB)); doc.roundedRect(M, y - 4, CW, 8, 1.5, 1.5, 'F'); txt(stamp, W / 2, y + 1.2, { size: 9.3, bold: true, color: o.status === 'Superseded' ? [180, 35, 24] : [150, 95, 10], align: 'center' }); y += 11; }
  txt('This document confirms your scheduled service. It is not an invoice, an official receipt or a new quotation.', M, y, { size: 9, color: MUTED, max: CW }); y += 7;

  // ---- client and location cards ----
  const half = (CW - 6) / 2; const inner = half - 11;
  const sameContact = !c.location.contact_person || c.location.contact_person === c.client.contact_person;
  const left = [c.client.name, c.client.contact_person && c.client.contact_person !== c.client.name ? `Attention: ${c.client.contact_person}` : ''].filter(Boolean);
  const right = [c.location.name, c.location.address, c.location.contact_mobile ? `Contact number: ${c.location.contact_mobile}` : '', !sameContact ? `On-site contact: ${c.location.contact_person}` : ''].filter(Boolean);
  const hOf = (arr: string[]) => arr.reduce((n, l) => n + lines(l, inner, 9.8).length, 0) * 4.7 + 12;
  const ch = Math.max(hOf(left), hOf(right));
  const draw = (x: number, head: string, arr: string[], boldFirst: boolean) => { accentCard(x, half, ch); txt(head.toUpperCase(), x + 6, y + 6, { size: 7.5, bold: true, color: MUTED }); let k = y + 11.5; arr.forEach((l, i) => { doc.setFont('helvetica', boldFirst && i === 0 ? 'bold' : 'normal'); doc.setFontSize(boldFirst && i === 0 ? 10.5 : 9.8); doc.setTextColor(...INK); for (const part of lines(l, inner, boldFirst && i === 0 ? 10.5 : 9.8)) { doc.text(part, x + 6, k); k += 4.7; } }); };
  draw(M, 'Client', left, true); draw(M + half + 6, 'Service location', right, true); y += ch + 6;

  // ---- schedule tiles ----
  const tiles: [string, string][] = [['Booking date', fmtDate(c.booking_date)], ['Service date', fmtDate(c.service_date)], ['Arrival window', `${t12(c.arrival_from)} - ${t12(c.arrival_to)}`], ['Estimated duration', `about ${hoursText(c.duration_hours)}`]];
  const tw = (CW - 9) / 4; need(20);
  tiles.forEach(([k, v], i) => { const x = M + i * (tw + 3); doc.setFillColor(...(i === 1 ? NAVY : SOFT)); doc.roundedRect(x, y, tw, 16, 2, 2, 'F'); txt(k.toUpperCase(), x + 4, y + 5.5, { size: 7, bold: true, color: i === 1 ? PALE : MUTED }); txt(v, x + 4, y + 12, { size: 10.2, bold: true, color: i === 1 ? WHITE : INK, max: tw - 6 }); });
  y += 22;

  // ---- service, technology, scope ----
  section('Service');
  txt(c.service_types.join(', ') || '-', M, y, { size: 11.5, bold: true, color: TEAL, max: CW }); y += lines(c.service_types.join(', ') || '-', CW, 11.5).length * 5 + 2;
  need(24); doc.setFillColor(...NAVY); doc.roundedRect(M, y, CW, 10.5, 2, 2, 'F'); txt(DEFAULT_TECHNOLOGY, M + 5, y + 6.8, { size: 9.8, bold: true, color: WHITE });
  txt('Pre-Rinse  >  Deep Cleaning  >  Final Rinse  |  Water-Fed Pole, deionized water', W - M - 5, y + 6.8, { size: 8.2, color: PALE, align: 'right' }); y += 15;
  txt('APPROVED SCOPE OF WORK', M, y, { size: 7.5, bold: true, color: MUTED }); y += 4.8; para(c.scope || 'As per the approved quotation.', M, CW, 9.8, 4.8); y += 3;

  // ---- priced services ----
  const itemTable = (title: string, rows: { description: string; qty: number; unit: string; rate: number; amount: number }[]) => {
    if (!rows.length) return; need(30);
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'plain',
      head: [[title, 'Qty / unit', 'Rate', 'Amount']],
      body: rows.map((r) => [clean(r.description), `${r.qty.toLocaleString('en-PH')} ${r.unit}`, pm(r.rate), pm(r.amount)]),
      styles: { fontSize: 9.5, cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 }, textColor: INK, lineColor: [221, 228, 236], lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 }, alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right', cellWidth: 30 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 34, fontStyle: 'bold' } },
      didParseCell: (d) => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right'; },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };
  itemTable('Approved services', c.items);
  for (const a of c.additions) itemTable(`Approved additional work ${a.number}${a.reason ? ` - ${a.reason}` : ''}`, a.items);

  // ---- totals ----
  const trows: [string, string][] = [...c.discounts.map((d) => [d.label, `- ${pm(d.amount)}`] as [string, string]), ['Subtotal (before VAT)', pm(c.subtotal)], [c.vat_label, pm(c.vat)]];
  need(trows.length * 5.6 + 20); const bx = W - M - 86;
  doc.setFillColor(...SOFT); doc.roundedRect(bx, y, 86, trows.length * 5.6 + 3, 2, 2, 'F');
  let ty = y + 5.5; for (const [l, v] of trows) { txt(l, bx + 4, ty, { size: 9.5, color: MUTED }); txt(v, bx + 82, ty, { size: 9.5, align: 'right' }); ty += 5.6; }
  doc.setFillColor(...NAVY); doc.roundedRect(bx, ty - 1.5, 86, 10, 2, 2, 'F'); txt('FINAL APPROVED TOTAL', bx + 4, ty + 5, { size: 9.5, bold: true, color: WHITE }); txt(pm(c.total), bx + 82, ty + 5, { size: 11, bold: true, color: WHITE, align: 'right' });
  y = ty + 15;

  // ---- payment ----
  need(52); section('Payment terms and status');
  const terms = c.payment_terms.trim().split(/\s+(?=\d{1,2}\.\s)/);
  const [first, ...rest] = terms; para(first, M, CW, 9.6, 4.7); for (const t of rest) para(t, M + 3, CW - 3, 9.2, 4.4, MUTED);
  y += 1.5; need(9); doc.setFillColor(...(/paid/i.test(c.payment_status) && !/no payment|not paid/i.test(c.payment_status) ? [227, 244, 232] as RGB : [255, 243, 214] as RGB)); const sl = lines(c.payment_status, CW - 10, 9.6); const sh = sl.length * 4.6 + 4.5; doc.roundedRect(M, y, CW, sh, 2, 2, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.6); doc.setTextColor(...INK); let k = y + 5.4; for (const l of sl) { doc.text(l, M + 5, k); k += 4.6; } y += sh + 3;

  // ---- team ----
  section('Your team');
  const team = [c.team.leader ? `Team Leader: ${c.team.leader}` : 'Team assignment to follow.', ...(c.team.leader && c.team.crew.length ? [`Crew: ${c.team.crew.join(', ')}`] : [])];
  const th = team.reduce((n, l) => n + lines(l, CW - 12, 9.8).length, 0) * 4.7 + 7; need(th + 2); accentCard(M, CW, th); let tk = y + 6.2; for (const l of team) for (const part of lines(l, CW - 12, 9.8)) { txt(part, M + 6, tk, { size: 9.8 }); tk += 4.7; } y += th + 4;
  if (c.access_notes.length) { section('Safety and access notes / your requirements'); for (const n of c.access_notes) para(`- ${n}`, M + 2, CW - 2, 9.4, 4.5); y += 2; }

  // ---- what to prepare ----
  section('What to prepare');
  const ph = PREPARE.reduce((n, l) => n + lines(l, CW - 16, 9.4).length, 0) * 4.5 + PREPARE.length * 1.6 + 5; need(Math.min(ph, 60));
  doc.setFillColor(...SOFT); doc.roundedRect(M, y, CW, ph, 2, 2, 'F'); let pk = y + 6;
  for (const l of PREPARE) { doc.setFillColor(...TEAL); doc.circle(M + 6, pk - 1.2, 1.1, 'F'); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.4); doc.setTextColor(...INK); for (const part of lines(l, CW - 16, 9.4)) { doc.text(part, M + 11, pk); pk += 4.5; } pk += 1.6; }
  y += ph + 4;

  // ---- please note ----
  const notes = [CHANGE_NOTE, WEATHER_NOTE]; const nh = notes.reduce((n, l) => n + lines(l, CW - 18, 9.2).length, 0) * 4.4 + notes.length * 1.4 + 9; need(nh + 2);
  doc.setFillColor(255, 247, 224); doc.roundedRect(M, y, CW, nh, 2, 2, 'F'); doc.setFillColor(...[44, 154, 69] as RGB); doc.rect(M, y + 2, 1.2, nh - 4, 'F'); txt('PLEASE NOTE', M + 6, y + 6, { size: 7.5, bold: true, color: [138, 90, 16] });
  let nk = y + 11; for (const l of notes) { for (const part of lines(l, CW - 18, 9.2)) { txt(part, M + 6, nk, { size: 9.2 }); nk += 4.4; } nk += 1.4; } y += nh + 6;

  need(14); doc.setDrawColor(...CYAN); doc.setLineWidth(0.4); doc.line(M, y, W - M, y); y += 6;
  para(`Questions or changes? Call ${c.company.phone} or e-mail ${c.company.email}. Thank you for choosing ${c.company.name}${c.company.name.endsWith('.') ? '' : '.'}`, M, CW, 9.2, 4.5, MUTED);

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setDrawColor(221, 228, 236); doc.setLineWidth(0.2); doc.line(M, H - 13, W - M, H - 13); txt(`${orderLabel(o)}  |  ${c.company.name}${opts.generatedBy ? '' : ''}`, M, H - 8, { size: 8, color: MUTED }); txt(`Page ${i} of ${n}`, W - M, H - 8, { size: 8, color: MUTED, align: 'right' }); }
  return doc.output('blob');
}
