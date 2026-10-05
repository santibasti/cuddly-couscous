// Client-facing Job Order Confirmation PDF (A4, large readable type for tablets). Built only from the saved Job Order content.
import { logoDataUrl } from './logo';
import type { JobOrder } from './types';
import { CHANGE_NOTE, PREPARE, WEATHER_NOTE, orderLabel } from './joborder-core';
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
  const c = o.content; const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 14;
  const txt = (s: string, x: number, y: number, o2: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' | 'center'; max?: number } = {}) => {
    doc.setFont('helvetica', o2.bold ? 'bold' : 'normal'); doc.setFontSize(o2.size ?? 10.5); doc.setTextColor(...(o2.color ?? INK));
    doc.text(clean(s), x, y, { align: o2.align ?? 'left', maxWidth: o2.max });
  };
  // ---- header: logo, company, document title ----
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 34, 'F'); doc.setFillColor(...CYAN); doc.rect(0, 34, W, 1.4, 'F');
  const logo = await logoDataUrl(); if (logo) { try { doc.addImage(logo, 'PNG', M - 1, 5, 22, 22); } catch { /* without the logo */ } }
  txt(c.company.name, M + 24, 13, { size: 14, bold: true, color: [255, 255, 255] });
  txt(c.company.tagline, M + 24, 18.2, { size: 8.5, color: [170, 200, 230] });
  txt(c.company.address, M + 24, 22.6, { size: 8.5, color: [170, 200, 230], max: 100 });
  txt(`${c.company.phone}  |  ${c.company.email}${c.company.tin ? `  |  TIN ${c.company.tin}` : ''}`, M + 24, 27, { size: 8.5, color: [170, 200, 230], max: 110 });
  txt('JOB ORDER', W - M, 12, { size: 17, bold: true, color: [255, 255, 255], align: 'right' });
  txt('CONFIRMATION', W - M, 18.5, { size: 11, bold: true, color: CYAN, align: 'right' });
  txt(orderLabel(o), W - M, 25, { size: 10.5, bold: true, color: [255, 255, 255], align: 'right' });
  txt(`Issued ${fmtDate(o.issued_on)}`, W - M, 29.8, { size: 9, color: [170, 200, 230], align: 'right' });

  let y = 44;
  const stamp = o.status === 'Superseded' ? 'SUPERSEDED' : o.status === 'Draft' || o.status === 'Revised' ? 'DRAFT - NOT YET SENT' : '';
  if (stamp) { doc.setFillColor(...(o.status === 'Superseded' ? [253, 235, 234] as [number, number, number] : [255, 243, 214] as [number, number, number])); doc.roundedRect(M, y - 5, W - 2 * M, 8, 1.5, 1.5, 'F'); txt(o.status === 'Superseded' ? 'SUPERSEDED - a newer version of this Job Order has been issued. Please use the latest version.' : 'DRAFT - not yet sent to the client', W / 2, y, { size: 9.5, bold: true, color: o.status === 'Superseded' ? [180, 35, 24] : [150, 95, 10], align: 'center' }); y += 9; }
  txt('This document confirms your scheduled service. It is not an invoice, an official receipt or a new quotation.', M, y, { size: 9.5, color: MUTED, max: W - 2 * M }); y += 9;

  // ---- parties ----
  const block = (x: number, w: number, head: string, lines: string[]) => {
    txt(head.toUpperCase(), x, y, { size: 8, bold: true, color: MUTED });
    let yy = y + 5.2; for (const l of lines.filter(Boolean)) { txt(l, x, yy, { size: 10.5, max: w }); yy += 5; } return yy;
  };
  const half = (W - 2 * M - 8) / 2;
  const y1 = block(M, half, 'Client', [c.client.name, c.client.contact_person ? `Attention: ${c.client.contact_person}` : '']);
  const y2 = block(M + half + 8, half, 'Service location', [c.location.name, c.location.address, c.location.contact_mobile ? `Contact number: ${c.location.contact_mobile}` : '', c.location.contact_person && c.location.contact_person !== c.client.contact_person ? `Site contact: ${c.location.contact_person}` : '']);
  y = Math.max(y1, y2) + 3;

  // ---- schedule ----
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'grid',
    head: [['Booking date', 'Service date', 'Arrival window', 'Estimated duration']],
    body: [[fmtDate(c.booking_date), fmtDate(c.service_date), `${t12(c.arrival_from)} - ${t12(c.arrival_to)}`, `about ${hoursText(c.duration_hours)}`]],
    styles: { fontSize: 10.5, cellPadding: 2.6, lineColor: [221, 228, 236], lineWidth: 0.1, textColor: INK }, headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ---- service & scope ----
  txt('SERVICE', M, y, { size: 8, bold: true, color: MUTED }); txt(c.service_types.join(', ') || '-', M, y + 5.2, { size: 11, bold: true, max: W - 2 * M }); y += 12;
  txt('APPROVED SCOPE OF WORK', M, y, { size: 8, bold: true, color: MUTED });
  const scope = doc.splitTextToSize(clean(c.scope || 'As per the approved quotation.'), W - 2 * M) as string[];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK); doc.text(scope, M, y + 5.2); y += 5.2 + scope.length * 4.9 + 4;

  // ---- priced services ----
  const money = (r: { qty: number; rate: number; amount: number }) => [r.qty.toLocaleString('en-PH'), pm(r.rate), pm(r.amount)];
  const itemTable = (title: string, rows: { description: string; qty: number; unit: string; rate: number; amount: number }[]) => {
    if (!rows.length) return;
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'grid',
      head: [[title, 'Qty / unit', 'Rate', 'Amount']],
      body: rows.map((r) => [clean(r.description), `${money(r)[0]} ${r.unit}`, money(r)[1], money(r)[2]]),
      styles: { fontSize: 10, cellPadding: 2.4, lineColor: [221, 228, 236], lineWidth: 0.1, textColor: INK }, headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 }, alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right', cellWidth: 30 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 34 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };
  itemTable('Approved services', c.items);
  for (const a of c.additions) itemTable(`Approved additional work ${a.number}${a.reason ? ` - ${a.reason}` : ''}`, a.items);

  // ---- totals ----
  const rows: [string, string, boolean][] = [...c.discounts.map((d) => [d.label, `- ${pm(d.amount)}`, false] as [string, string, boolean]), ['Subtotal (before VAT)', pm(c.subtotal), false], [c.vat_label, pm(c.vat), false], ['FINAL APPROVED TOTAL', pm(c.total), true]];
  if (y + rows.length * 7 + 10 > H - 26) { doc.addPage(); y = 20; }
  const bx = W - M - 92;
  for (const [l, v, strong] of rows) {
    if (strong) { doc.setFillColor(...NAVY); doc.rect(bx - 2, y - 5, 94, 8, 'F'); }
    txt(l, bx, y, { size: strong ? 10.5 : 10, bold: strong, color: strong ? [255, 255, 255] : INK }); txt(v, W - M - 1, y, { size: strong ? 11 : 10, bold: strong, color: strong ? [255, 255, 255] : INK, align: 'right' });
    y += strong ? 11 : 6.4;
  }
  y += 2;

  // ---- payment, team, notes ----
  const section = (head: string, lines: string[], bullet = false) => {
    const wrapped = lines.flatMap((l) => doc.splitTextToSize(clean((bullet ? '- ' : '') + l), W - 2 * M - (bullet ? 4 : 0)) as string[]);
    if (y + 6 + wrapped.length * 4.8 > H - 22) { doc.addPage(); y = 20; }
    txt(head.toUpperCase(), M, y, { size: 8, bold: true, color: MUTED }); y += 5.2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.2); doc.setTextColor(...INK); doc.text(wrapped, M, y); y += wrapped.length * 4.8 + 3.5;
  };
  section('Payment terms and payment status', [c.payment_terms, `Payment status: ${c.payment_status}`]);
  section('Your team', [c.team.leader ? `Team Leader: ${c.team.leader}` : 'Team assignment to follow.', ...(c.team.leader && c.team.crew.length ? [`Crew: ${c.team.crew.join(', ')}`] : [])]);
  if (c.access_notes.length) section('Safety and access notes / your requirements', c.access_notes);
  section('What to prepare', PREPARE, true);
  section('Please note', [CHANGE_NOTE, WEATHER_NOTE], true);
  txt(`Questions or changes? Call ${c.company.phone} or e-mail ${c.company.email}. Thank you for choosing ${c.company.name}`, M, y, { size: 9.5, color: MUTED, max: W - 2 * M });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setDrawColor(221, 228, 236); doc.line(M, H - 13, W - M, H - 13); txt(`${orderLabel(o)}  |  ${c.company.name}${opts.generatedBy ? '' : ''}`, M, H - 8, { size: 8, color: MUTED }); txt(`Page ${i} of ${n}`, W - M, H - 8, { size: 8, color: MUTED, align: 'right' }); }
  return doc.output('blob');
}
