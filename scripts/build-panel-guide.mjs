// Draws public/panel-guide.png: the "how we count glass panels" reference picture for customers (by SIDE, never by size). Run: node scripts/build-panel-guide.mjs
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
const logo = 'data:image/png;base64,' + readFileSync('public/logo-256.png').toString('base64');
const f = 'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif"';
const win = (x, y, label, tone) => `<g transform="translate(${x} ${y}) scale(.8)">
  <rect x="0" y="0" width="230" height="290" rx="10" fill="${tone}" stroke="#e8f3ee" stroke-width="10"/>
  <rect x="14" y="14" width="202" height="262" rx="4" fill="#8fd0e8" opacity=".95"/><path d="M115 14V276M14 145H216" stroke="#e8f3ee" stroke-width="8"/>
  <path d="M30 40L90 30M130 180L200 168" stroke="#fff" stroke-width="6" opacity=".5" stroke-linecap="round"/>
  <text x="115" y="340" text-anchor="middle" ${f} font-size="30" font-weight="800" fill="#fff" letter-spacing="2">${label}</text>
  <rect x="35" y="364" width="160" height="62" rx="31" fill="#b9d8a2"/><text x="115" y="406" text-anchor="middle" ${f} font-size="30" font-weight="800" fill="#0d2a35">1 PANEL</text></g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<rect width="1080" height="1350" fill="#eef3f0"/><rect x="40" y="40" width="1000" height="1270" rx="36" fill="#0d2a35"/>
<image href="${logo}" x="72" y="64" width="92" height="92"/>
<text x="184" y="112" ${f} font-size="38" font-weight="800" fill="#fff" letter-spacing="1">TOPMOP</text>
<text x="184" y="140" ${f} font-size="16" fill="#9fd8bd" letter-spacing="1.5">WINDOW CLEANING · EXTERIOR AND PROPERTY CARE</text>
<text x="90" y="236" ${f} font-size="20" font-weight="700" fill="#8fd6b0" letter-spacing="3">HOW WE COUNT GLASS PANELS</text>
<text x="90" y="312" ${f} font-size="62" font-weight="800" fill="#fff">Counted by side,</text><text x="90" y="384" ${f} font-size="62" font-weight="800" fill="#fff">not by size.</text>
<text x="90" y="438" ${f} font-size="30" fill="#bfe3d2">Each side of a window counts as one panel.</text>
${win(90, 510, 'OUTSIDE', '#1f7a4a')}
<text x="304" y="665" text-anchor="middle" ${f} font-size="80" font-weight="800" fill="#8fd6b0">+</text>
${win(335, 510, 'INSIDE', '#1f6f9a')}
<text x="550" y="665" text-anchor="middle" ${f} font-size="80" font-weight="800" fill="#8fd6b0">=</text>
<rect x="590" y="560" width="400" height="190" rx="22" fill="#b9d8a2"/><text x="790" y="650" text-anchor="middle" ${f} font-size="46" font-weight="800" fill="#0d2a35">1 WINDOW</text><text x="790" y="712" text-anchor="middle" ${f} font-size="46" font-weight="800" fill="#0d2a35">2 PANELS</text>
<text x="790" y="790" text-anchor="middle" ${f} font-size="24" fill="#b9d6c8">cleaned inside and outside</text>
<line x1="90" y1="960" x2="990" y2="960" stroke="#2c5160" stroke-width="2"/>
<text x="90" y="1020" ${f} font-size="34" font-weight="800" fill="#fff">To estimate</text>
<text x="90" y="1072" ${f} font-size="30" fill="#dff2ea">Count your windows. Double it if you want</text><text x="90" y="1112" ${f} font-size="30" fill="#dff2ea">both sides cleaned. Example: 10 windows,</text><text x="90" y="1152" ${f} font-size="30" fill="#dff2ea">both sides = 20 panels.</text>
<rect x="90" y="1190" width="900" height="64" rx="12" fill="#b9d8a2"/><text x="540" y="1233" text-anchor="middle" ${f} font-size="26" font-weight="800" fill="#0d2a35">The crew does the final count on site</text>
<text x="540" y="1286" text-anchor="middle" ${f} font-size="21" fill="#b9d6c8">Not sure? Send photos of your windows and our team will review them.   www.topmop.ph</text>
</svg>`;
const fonts = ['400Regular', '700Bold', '800ExtraBold'].map((w) => `api/fonts/Inter_${w}.ttf`);
writeFileSync('public/panel-guide.png', new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'width', value: 1080 } }).render().asPng());
console.log('public/panel-guide.png written');
