// The estimate card: a picture (SVG, 1080 x 1080) with the same figures as the estimate text, in the look of the TopMop free-estimate calculator. Pure: no network, no database.
// It only ever draws an estimate that the rate table produced; it never invents a number. A person-needed answer (unknown city, commercial) gets no card.
import type { Estimate } from './estimate.ts';
import { LOGO_DATA_URI } from './logoimg.ts';

const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-US');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Break a sentence into lines of at most `max` characters. */
export function wrapText(s: string, max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of s.split(/\s+/).filter(Boolean)) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur); return out;
}
export interface CardOpts { service?: string; property?: string; when?: string }
/** Lines of the calculation, in plain words, from the estimate figures. */
export function cardLines(e: Estimate): { title: string; lines: string[] } | null {
  if (!e.ok || e.estimate == null || e.qty == null) return null;
  if (e.kind === 'glass' && e.package_price != null && e.included != null && e.extra_rate != null) {
    const extra = e.extra_qty ?? Math.max(0, e.qty - e.included);
    return { title: 'Glass & window cleaning', lines: [`${peso(e.package_price)} package includes up to ${e.included} panels.`, extra > 0 ? `${extra} extra × ${peso(e.extra_rate)} = ${peso(extra * e.extra_rate)}.` : 'No extra panels.', `Total entered: ${e.qty} panels.`] };
  }
  if (e.kind === 'area' || e.kind === 'solar') {
    const unit = e.unit ?? (e.kind === 'solar' ? 'panel' : 'sqm'); const rate = e.extra_rate ?? e.package_price;
    return { title: e.kind === 'solar' ? 'Solar panel cleaning' : 'Exterior cleaning', lines: [`Rate ${rate != null ? peso(rate) : ''} per ${unit}.`, `Quantity: ${e.qty} ${unit}${e.qty === 1 ? '' : 's'}.`] };
  }
  return null;
}
export function estimateCardSvg(e: Estimate, o: CardOpts = {}): string | null {
  const c = cardLines(e); if (!c || e.estimate == null) return null;
  const where = [e.place, o.property ?? 'Residential'].filter(Boolean).join(' · ');
  const note = wrapText('An estimate is not a booking or final quotation. TopMop confirms panel counts, surface condition, access, travel charges and applicable taxes, and the complete total, before work is agreed.', 78);
  const f = 'font-family="Segoe UI, Helvetica, Arial, sans-serif"';
  let y = 470; const body = c.lines.flatMap((l) => wrapText(l, 56)).map((l) => { y += 42; return `<text x="90" y="${y}" ${f} font-size="31" fill="#dff2ea">${esc(l)}</text>`; }).join('');
  const afterBody = y + 62;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="TopMop estimate">
<rect width="1080" height="1080" fill="#eef3f0"/>
<rect x="40" y="40" width="1000" height="1000" rx="36" fill="#0d2a35"/>
<image href="${LOGO_DATA_URI}" x="72" y="64" width="92" height="92"/>
<text x="184" y="112" ${f} font-size="38" font-weight="800" fill="#fff" letter-spacing="1">TOPMOP</text>
<text x="184" y="140" ${f} font-size="16" fill="#9fd8bd" letter-spacing="1.5">WINDOW CLEANING · EXTERIOR AND PROPERTY CARE</text>
<text x="90" y="240" ${f} font-size="20" font-weight="700" fill="#8fd6b0" letter-spacing="3">YOUR ESTIMATE</text>
<text x="90" y="310" ${f} font-size="58" font-weight="800" fill="#fff">See your calculated total.</text>
<text x="90" y="368" ${f} font-size="28" fill="#bfe3d2">${esc(where)}</text>
<line x1="90" y1="400" x2="990" y2="400" stroke="#2c5160" stroke-width="2"/>
<text x="90" y="456" ${f} font-size="36" font-weight="800" fill="#fff">${esc(c.title)} — ${peso(e.estimate)}</text>
${body}
<line x1="90" y1="${afterBody - 24}" x2="990" y2="${afterBody - 24}" stroke="#2c5160" stroke-width="2"/>
<text x="90" y="${afterBody + 44}" ${f} font-size="28" font-weight="700" fill="#8fd6b0">Estimated total</text>
<text x="90" y="${afterBody + 134}" ${f} font-size="96" font-weight="800" fill="#fff">${peso(e.estimate)}</text>
<rect x="90" y="${afterBody + 168}" width="900" height="64" rx="12" fill="#b9d8a2"/>
<text x="540" y="${afterBody + 210}" text-anchor="middle" ${f} font-size="27" font-weight="800" fill="#0d2a35">The final amount follows the crew's count on site</text>
${note.map((l, i) => `<text x="90" y="${afterBody + 274 + i * 27}" ${f} font-size="19" fill="#b9d6c8">${esc(l)}</text>`).join('')}
<text x="540" y="1012" text-anchor="middle" ${f} font-size="22" font-weight="700" fill="#8fd6b0">www.topmop.ph</text>
</svg>`;
}
