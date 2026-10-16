// Service Accomplishment Report PDF (A4): simplified sections, photos laid out automatically (Before / After pairs, then a grid).
import { logoDataUrl } from './logo';
import { arrangePhotos, parseBody, serviceDatesText } from './servicereport';
import { fmtDate } from './util';
import type { ReportPhoto, ServiceReport, Settings } from './types';

type RGB = [number, number, number];
const NAVY: RGB = [11, 37, 69]; const CYAN: RGB = [34, 193, 195]; const INK: RGB = [20, 36, 58]; const MUTED: RGB = [91, 107, 128]; const SOFT: RGB = [243, 247, 250]; const WHITE: RGB = [255, 255, 255]; const PALE: RGB = [170, 200, 230]; const TEAL: RGB = [14, 154, 167];
const clean = (t: string) => String(t ?? '').replace(/₱/g, 'PHP ').replace(/→/g, '->').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\n]/g, '');

export const serviceReportFilename = (r: Pick<ServiceReport, 'number'>) => `TopMop-${r.number}.pdf`;

const imageSize = (url: string) => new Promise<{ w: number; h: number }>((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth || 4, h: i.naturalHeight || 3 }); i.onerror = () => res({ w: 4, h: 3 }); i.src = url; });

export async function buildServiceReportPdf(r: ServiceReport, o: { company: Settings['company']; clientName: string; images: Record<string, string> }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14, CW = W - 2 * M; const c = o.company;
  const txt = (s: string, x: number, y: number, p: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center'; max?: number } = {}) => { doc.setFont('helvetica', p.bold ? 'bold' : 'normal'); doc.setFontSize(p.size ?? 10); doc.setTextColor(...(p.color ?? INK)); doc.text(clean(s), x, y, { align: p.align ?? 'left', maxWidth: p.max }); };
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 34, 'F'); doc.setFillColor(...CYAN); doc.rect(0, 34, W, 1.4, 'F');
  const logo = await logoDataUrl(); if (logo) { try { doc.addImage(logo, 'PNG', M - 1, 5, 22, 22); } catch { /* without the logo */ } }
  txt(c.name, M + 24, 13, { size: 14, bold: true, color: WHITE }); txt(c.tagline, M + 24, 18.2, { size: 8.5, color: PALE });
  txt(c.address, M + 24, 22.6, { size: 8.5, color: PALE, max: 100 }); txt(`${c.phone}  |  ${c.email}`, M + 24, 27, { size: 8.5, color: PALE, max: 110 });
  txt('SERVICE ACCOMPLISHMENT', W - M, 12, { size: 12, bold: true, color: WHITE, align: 'right' }); txt('REPORT', W - M, 18.5, { size: 11, bold: true, color: CYAN, align: 'right' });
  txt(r.number, W - M, 25, { size: 10.5, bold: true, color: WHITE, align: 'right' }); txt(`Report date ${fmtDate(r.report_date)}`, W - M, 29.8, { size: 9, color: PALE, align: 'right' });

  let y = 43; let n = 0;
  const page = () => { doc.addPage(); doc.setFillColor(...NAVY); doc.rect(0, 0, W, 11, 'F'); doc.setFillColor(...CYAN); doc.rect(0, 11, W, 0.8, 'F'); txt(c.name, M, 7.2, { size: 8.5, bold: true, color: WHITE }); txt(r.number, W - M, 7.2, { size: 8.5, bold: true, color: WHITE, align: 'right' }); y = 20; };
  const need = (h: number) => { if (y + h > H - 18) page(); };
  const section = (title: string) => { need(22); n += 1; doc.setFillColor(...SOFT); doc.rect(M, y, CW, 8, 'F'); doc.setFillColor(...TEAL); doc.rect(M, y, 1.4, 8, 'F'); txt(`${n}. ${title.toUpperCase()}`, M + 4, y + 5.6, { size: 10, bold: true, color: NAVY }); y += 12; };
  const lines = (s: string, w: number, size: number) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); return doc.splitTextToSize(clean(s), w) as string[]; };
  const para = (s: string, x: number, w: number, size = 10, lh = 4.8, color: RGB = INK) => { for (const l of lines(s, w, size)) { need(lh + 1); txt(l, x, y, { size, color }); y += lh; } };

  // 1. project information
  section('Project information');
  const info: [string, string][] = [['Client', o.clientName], ['Project', r.title], ['Location', r.location], ['Service date', serviceDatesText(r)], ['Team assigned', r.team], ['Frequency', r.frequency]];
  for (const [k, v] of info) { if (!v) continue; const l = lines(v, CW - 38, 10); need(l.length * 4.8 + 2); txt(k, M + 2, y, { size: 9, bold: true, color: MUTED }); l.forEach((x, i) => txt(x, M + 36, y + i * 4.8, { size: 10 })); y += l.length * 4.8 + 1.6; }
  y += 3;

  const body = (b: string) => {
    for (const blk of parseBody(b)) {
      if (blk.kind === 'p') { para(blk.text, M, CW); y += 1.6; }
      else { for (const it of blk.items) { const l = lines(it, CW - 8, 10); need(l.length * 4.8 + 1); doc.setFillColor(...TEAL); doc.circle(M + 3, y - 1.2, 0.8, 'F'); l.forEach((x, i) => txt(x, M + 7, y + i * 4.8, { size: 10 })); y += l.length * 4.8 + 0.8; } y += 1.6; }
    }
  };
  const sec = (key: string) => r.sections.find((s) => s.key === key);
  const photosBlock = async () => {
    if (!r.photos.length) return;
    section('Photo documentation');
    const { pairs, rest } = arrangePhotos(r.photos); const gap = 5; const cw = (CW - gap) / 2; const maxH = 62;
    const draw = async (p: ReportPhoto, x: number, w: number, top: number, label?: string) => {
      const url = o.images[p.id]; if (!url) return 0;
      const sz = await imageSize(url); const s = Math.min(w / sz.w, maxH / sz.h); const iw = sz.w * s, ih = sz.h * s;
      doc.setFillColor(...SOFT); doc.roundedRect(x, top, w, maxH, 1.5, 1.5, 'F'); // every photo sits in the same frame, so rows line up
      try { doc.addImage(url, 'JPEG', x + (w - iw) / 2, top + (maxH - ih) / 2, iw, ih); } catch { return maxH; }
      if (label) { doc.setFillColor(...NAVY); doc.roundedRect(x + 1.5, top + 1.5, 17, 5, 1, 1, 'F'); txt(label, x + 10, top + 5, { size: 7.5, bold: true, color: WHITE, align: 'center' }); }
      return maxH;
    };
    const row = async (a: ReportPhoto, b: ReportPhoto | undefined, labels: boolean) => {
      need(maxH + 14); const top = y;
      const h1 = await draw(a, M, cw, top, labels ? a.group.toUpperCase() : undefined); const h2 = b ? await draw(b, M + cw + gap, cw, top, labels ? b.group.toUpperCase() : undefined) : 0;
      let yy = top + Math.max(h1, h2) + 4;
      for (const [p, x] of [[a, M], [b, M + cw + gap]] as [ReportPhoto | undefined, number][]) if (p?.caption) { const l = lines(p.caption, cw, 8.5).slice(0, 2); l.forEach((t, i) => txt(t, x + cw / 2, yy + i * 3.8, { size: 8.5, color: MUTED, align: 'center' })); }
      y = yy + (a.caption || b?.caption ? 9 : 2);
    };
    for (const [b, a] of pairs) await row(b, a, true);
    for (let i = 0; i < rest.length; i += 2) await row(rest[i], rest[i + 1], false);
    y += 3;
  };

  const order: [string, string][] = [['scope', 'Scope of work'], ['prework', 'Pre-work assessment'], ['method', 'Cleaning methodology'], ['findings', 'Post-cleaning findings & observations'], ['limits', 'Limitations of service'], ['recs', 'Recommendations'], ['equipment', 'Equipment utilized'], ['safety', 'Safety measures']];
  for (const [key, title] of order) { const s = sec(key); if (!s?.body.trim()) continue; section(s.title || title); body(s.body); }
  await photosBlock();
  const done = sec('completion'); if (done?.body.trim()) { section(done.title || 'Completion confirmation'); body(done.body); }
  need(34); y += 4;
  if (r.signature) { try { doc.addImage(r.signature, 'PNG', M, y - 2, 46, 14); } catch { /* unsigned look */ } }
  doc.setDrawColor(...MUTED); doc.line(M, y + 12, M + 70, y + 12); txt('Prepared by TopMop', M, y + 17, { size: 9, color: MUTED });
  if (r.signed_at) txt(`Signed ${fmtDate(r.signed_at)}`, M, y + 21.5, { size: 8, color: MUTED });
  txt(`${c.name}  |  ${c.phone}  |  ${c.email}`, W / 2, H - 8, { size: 8, color: MUTED, align: 'center' });
  return doc.output('blob');
}
