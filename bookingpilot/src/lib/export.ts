import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ConfirmationDoc } from '@/domain/confirmation';

export type Cell = string | number | null | undefined;

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const esc = (v: Cell) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function downloadCsv(name: string, columns: string[], rows: Cell[][]) {
  const text = [columns, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  download(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
}

const NAVY: [number, number, number] = [11, 27, 58];
const BLUE: [number, number, number] = [37, 99, 235];
const pdfSafe = (v: Cell) => String(v ?? '').replace(/₱/g, 'PHP ').replace(/[→]/g, '->').replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '|');

export function downloadTablePdf(name: string, title: string, subtitle: string, columns: string[], rows: Cell[][]) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 56, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('BookingPilot', 36, 34);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(pdfSafe(subtitle), w - 36, 34, { align: 'right' });
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(pdfSafe(title), 36, 86);
  autoTable(doc, { startY: 100, head: [columns.map(pdfSafe)], body: rows.map((r) => r.map(pdfSafe)), styles: { fontSize: 8.5, cellPadding: 5 }, headStyles: { fillColor: BLUE }, alternateRowStyles: { fillColor: [243, 246, 251] }, margin: { left: 36, right: 36 } });
  doc.save(`${name}.pdf`);
}

export function downloadConfirmationPdf(orgName: string, d: ConfirmationDoc, fileName: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 90, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(pdfSafe(orgName), 40, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text('Booking Confirmation', 40, 68);
  autoTable(doc, { startY: 116, body: d.rows.map(([k, v]) => [pdfSafe(k), pdfSafe(v)]), theme: 'plain', styles: { fontSize: 10.5, cellPadding: 6 }, columnStyles: { 0: { fontStyle: 'bold', textColor: [74, 91, 120], cellWidth: 150 } }, margin: { left: 40, right: 40 } });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  const section = (t: string, body: string) => {
    doc.setTextColor(...BLUE); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(t, 40, y); y += 14;
    doc.setTextColor(15, 29, 58); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const lines = doc.splitTextToSize(pdfSafe(body), w - 80); doc.text(lines, 40, y); y += lines.length * 13 + 14;
  };
  section('PAYMENT INSTRUCTIONS', d.paymentInstructions);
  section('CHECK-IN / SERVICE INSTRUCTIONS', d.checkInInstructions);
  section('CANCELLATION POLICY', d.cancellationPolicy);
  section('CONTACT', d.contact);
  doc.save(`${fileName}.pdf`);
}
