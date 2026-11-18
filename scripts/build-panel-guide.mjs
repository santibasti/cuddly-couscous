// Draws public/panel-guide.png: the "how we count glass panels" reference picture for customers (by SIDE, never by size). Run: node scripts/build-panel-guide.mjs
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
const logo = 'data:image/png;base64,' + readFileSync('public/logo-256.png').toString('base64');
const f = 'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif"';
const pane = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#8fd0e8" stroke="#e8f3ee" stroke-width="6"/><path d="M${x + 10} ${y + h * 0.3}L${x + w * 0.45} ${y + h * 0.2}" stroke="#fff" stroke-width="4" opacity=".55" stroke-linecap="round"/>`;
const col = (x, title, note, glyph, result) => `<g transform="translate(${x} 470)">
  <rect width="280" height="400" rx="20" fill="#143c4a" stroke="#2c5160" stroke-width="2"/>
  <text x="140" y="46" text-anchor="middle" ${f} font-size="26" font-weight="800" fill="#8fd6b0" letter-spacing="2">${title}</text>
  <text x="140" y="80" text-anchor="middle" ${f} font-size="22" fill="#cfe9dd">${note}</text>
  <g transform="translate(0 100)">${glyph}</g>
  <rect x="20" y="318" width="240" height="64" rx="32" fill="#b9d8a2"/><text x="140" y="361" text-anchor="middle" ${f} font-size="24" font-weight="800" fill="#0d2a35">${result}</text></g>`;
const std = pane(80, 20, 100, 190, 0) ;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<rect width="1080" height="1350" fill="#eef3f0"/><rect x="40" y="40" width="1000" height="1270" rx="36" fill="#0d2a35"/>
<image href="${logo}" x="72" y="64" width="92" height="92"/>
<text x="184" y="112" ${f} font-size="38" font-weight="800" fill="#fff" letter-spacing="1">TOPMOP</text>
<text x="184" y="140" ${f} font-size="16" fill="#9fd8bd" letter-spacing="1.5">WINDOW CLEANING · EXTERIOR AND PROPERTY CARE</text>
<text x="90" y="236" ${f} font-size="20" font-weight="700" fill="#8fd6b0" letter-spacing="3">HOW GLASS PANELS ARE COUNTED</text>
<text x="90" y="312" ${f} font-size="56" font-weight="800" fill="#fff">One side of a panel</text><text x="90" y="378" ${f} font-size="56" font-weight="800" fill="#fff">= one billable panel.</text>
<text x="90" y="432" ${f} font-size="28" fill="#bfe3d2">Cleaning both inside and outside counts as two.</text>
${col(90, 'STANDARD', '2 m × 1 m or smaller', pane(95, 10, 90, 180), '1 PANEL / SIDE')}
${col(400, 'LARGER', 'more than 2 m × 1 m', pane(60, 10, 160, 180), '2 PANELS / SIDE')}
${col(710, 'SMALL PANES', 'e.g. toilet windows', pane(35, 70, 60, 60) + pane(110, 70, 60, 60) + pane(185, 70, 60, 60), 'MAY BE GROUPED')}
<rect x="90" y="905" width="900" height="132" rx="20" fill="#b9d8a2"/>
<text x="540" y="945" text-anchor="middle" ${f} font-size="24" font-weight="700" fill="#0d2a35">EXAMPLE</text>
<text x="540" y="985" text-anchor="middle" ${f} font-size="33" font-weight="800" fill="#0d2a35">20 standard panels cleaned on both sides</text>
<text x="540" y="1022" text-anchor="middle" ${f} font-size="33" font-weight="800" fill="#0d2a35">= 40 billable panels</text>
<text x="90" y="1096" ${f} font-size="28" fill="#dff2ea">Tell us the total billable sides. The package covers the</text><text x="90" y="1136" ${f} font-size="28" fill="#dff2ea">included panels; each extra panel is charged per panel.</text>
<text x="90" y="1196" ${f} font-size="28" font-weight="800" fill="#8fd6b0">Our crew confirms the final count and the bill</text><text x="90" y="1236" ${f} font-size="28" font-weight="800" fill="#8fd6b0">before cleaning starts.</text>
<text x="540" y="1286" text-anchor="middle" ${f} font-size="21" fill="#b9d6c8">Questions? Message us anytime and our team will gladly help.   www.topmop.ph</text>
</svg>`;
const fonts = ['400Regular', '700Bold', '800ExtraBold'].map((w) => `api/fonts/Inter_${w}.ttf`);
writeFileSync('public/panel-guide.png', new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'width', value: 1080 } }).render().asPng());
console.log('public/panel-guide.png written');
