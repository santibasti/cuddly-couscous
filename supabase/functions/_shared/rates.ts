// The approved starting rates, in one place for the app (quick booking) and the chat functions, so they can never quote different prices.
// Pure TypeScript with no imports (it also runs on the server).
export interface Rate { place: string; group: string; price: number; panels: number }
const P = (price: number, panels: number) => ({ price, panels });
const A = P(4799, 31), B = P(5799, 41), C = P(12799, 51);
const mk = (group: string, entries: [string, { price: number; panels: number }][]): Rate[] => entries.map(([place, r]) => ({ place, group, ...r }));
/** Package rate by location (extra panels beyond the package are ₱140 each everywhere). */
export const RATES: Rate[] = [
  ...mk('Metro Manila', [['Caloocan', A], ['Las Piñas', B], ['Makati', A], ['Malabon', A], ['Mandaluyong', A], ['Manila', A], ['Marikina', A], ['Muntinlupa', B], ['Navotas', A], ['Parañaque', B], ['Pasay', A], ['Pasig', A], ['Pateros', A], ['Quezon City', A], ['San Juan', A], ['Taguig', A], ['Valenzuela', A]]),
  ...mk('Cavite', [['Alfonso', C], ['Amadeo', C], ['Bacoor', B], ['Carmona', C], ['Cavite City', B], ['Dasmariñas', B], ['General Trias', P(6799, 41)], ['Imus', B], ['Silang', C], ['Tagaytay', C]]),
  ...mk('Bulacan', [['Bocaue', B], ['Marilao', B], ['San Jose del Monte', B], ['Santa Maria', B]]),
  ...mk('Rizal', [['Antipolo', B], ['Cainta', B], ['Rodriguez (Montalban)', B]]),
  ...mk('Province-level rate', [['Laguna', C], ['Batangas', C]]),
];
export const EXTRA_PANEL = 140;
/** Other services: rate, unit and minimum quantity (billed at the minimum until measured). */
export const OTHER: { match: RegExp; code: 'ROOF' | 'SOLAR' | 'FLOOR' | 'WALL'; name: string; rate: number; unit: string; min: number }[] = [
  { match: /roof/i, code: 'ROOF', name: 'Roof Cleaning', rate: 145, unit: 'sqm', min: 100 },
  { match: /solar/i, code: 'SOLAR', name: 'Solar Panel Cleaning', rate: 245, unit: 'panel', min: 20 },
  { match: /floor|driveway|hardscape/i, code: 'FLOOR', name: 'Floor / Driveway Cleaning', rate: 125, unit: 'sqm', min: 50 },
  { match: /wall/i, code: 'WALL', name: 'Exterior Wall Cleaning', rate: 125, unit: 'sqm', min: 50 },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ñ/g, 'n');
const ALIASES: Record<string, string[]> = { 'Rodriguez (Montalban)': ['rodriguez', 'montalban'], 'Quezon City': ['quezon city', 'qc'], 'Cavite City': ['cavite city'], 'Parañaque': ['paranaque'], 'Las Piñas': ['las pinas'], 'Dasmariñas': ['dasmarinas', 'dasma'], 'San Jose del Monte': ['san jose del monte', 'sjdm'],
  // districts of the City of Manila are charged the Manila rate
  'Manila': ['manila', 'binondo', 'intramuros', 'ermita', 'malate', 'paco', 'pandacan', 'quiapo', 'sampaloc', 'san miguel manila', 'san nicolas', 'santa cruz manila', 'santa ana manila', 'tondo', 'port area', 'sta mesa', 'santa mesa'] };
/** Finds the city (or province) in an address; the longest name wins and "Metro Manila" is never mistaken for the city of Manila. */
export function findRate(address: string): Rate | undefined {
  const t = ' ' + norm(address).replace(/metro manila|ncr|national capital region/g, ' ').replace(/[^a-z0-9]+/g, ' ') + ' ';
  const names = RATES.flatMap((r) => (ALIASES[r.place] ?? [norm(r.place)]).map((n) => ({ r, n: norm(n) }))).sort((a, b) => b.n.length - a.n.length);
  for (const { r, n } of names) if (t.includes(' ' + n + ' ') || (r.group !== 'Province-level rate' && t.includes(' ' + n + ' city '))) return r;
  return undefined;
}


/** What kind of service the customer means. Only these are priced from the rate table; everything else needs an assessment and a person's quotation. */
export type Kind = 'glass' | 'ROOF' | 'SOLAR' | 'FLOOR' | 'WALL' | 'custom';
export function classify(service: string): Kind {
  const t = String(service ?? '').trim();
  if (/solar/i.test(t)) return 'SOLAR';
  if (/gutter|acp|cladding|ceiling|interior|indoor|post[- ]?construction|facade|façade|curtain\s*wall|rope|high[- ]?rise|pool/i.test(t)) return 'custom';
  if (/^\s*$|glass|window|salamin|bintana|panel/i.test(t)) return 'glass';
  const o = OTHER.find((x) => x.match.test(t)); return o ? o.code : 'custom';
}
