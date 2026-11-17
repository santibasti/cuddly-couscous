// GET /api/estimate-card?address=Pasay&service=window%20cleaning&qty=50  →  the estimate card as a PNG (Messenger cannot show SVG).
// The figures are computed here from the rate table (api/_cardcore.mjs is built from src/lib/cardserver.ts with `npm run build:card`); the address only carries the inputs.
import { Resvg } from '@resvg/resvg-js';
import { fileURLToPath } from 'node:url';
import { cardSvgFromQuery } from './_cardcore.mjs';

const fonts = ['Inter_400Regular.ttf', 'Inter_700Bold.ttf', 'Inter_800ExtraBold.ttf'].map((f) => fileURLToPath(new URL(`./fonts/${f}`, import.meta.url)));

export default function handler(req, res) {
  const r = cardSvgFromQuery(req.query ?? {});
  if ('error' in r) { res.status(404).json({ error: r.error }); return; }
  const png = new Resvg(r.svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'width', value: 1080 } }).render().asPng();
  res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); res.status(200).send(Buffer.from(png));
}
