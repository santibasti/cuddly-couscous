// What the chat tells a customer about the price. Only starting rates and an ESTIMATE: the crew counts the real quantity on site and the final amount follows that count.
// All figures come from the approved rate table in rates.ts; the AI never calculates or invents a price.
import { EXTRA_PANEL, OTHER, classify, findRate } from './rates.ts';

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
export type Kind = 'glass' | 'area' | 'solar' | 'unknown' | 'custom' | 'commercial' | 'bundle';
export interface BundleLine { service: string; role: 'first' | 'second'; qty?: number; unit?: string; rate?: number; amount?: number }
export interface Estimate { lines?: BundleLine[]; ok: boolean; kind: Kind; place?: string; package_price?: number; included?: number; extra_rate?: number; qty?: number; extra_qty?: number; estimate?: number; unit?: string; rates_en: string; rates_tl: string; rates_tglish: string; estimate_en: string; estimate_tl: string; estimate_tglish: string }
const NOTE_EN = 'The final amount is confirmed on site.';
const NOTE_TL = 'Estimate lang po ito: ang crew po namin ang gagawa ng final count sa site, at ang final na halaga ay base sa bilang na iyon.';
const NOTE_TG = 'Estimate lang po ito ha, kasi ang crew namin ang magbibilang ng final count sa site, at doon po ibabase ang final amount.';
const VERIFY = { en: 'Let me have our team verify the correct rate for your location po.', tl: 'Ipa-verify ko po sa aming team ang tamang rate para sa inyong lokasyon.', tg: 'Paki-verify ko po muna sa team namin ang tamang rate para sa location ninyo, para sigurado po tayo sa presyo.' };

/** The starting rates (and, when a quantity is given, the estimate) for a service at an address. `qty` = glass panels, solar panels or square metres. */
const ASSESS = {
  custom: { en: 'This service is priced after an assessment, so I do not have a fixed rate to quote. Our team will review the details and prepare a quotation po.', tl: 'Ang serbisyong ito po ay pini-presyuhan pagkatapos ng assessment, kaya wala po akong fixed na rate na masasabi. Susuriin po ng aming team ang detalye at maghahanda sila ng quotation.', tg: 'Ang service na ito po ay pini-presyuhan after ng assessment, kaya wala po akong fixed rate na masasabi. Ire-review po ng team namin ang details at gagawa sila ng quotation.' },
  commercial: { en: 'For commercial projects po, we can initially assess using your address on Google Maps; photos are optional. An onsite ocular inspection is ₱2,500, deductible when you proceed.', tl: '', tg: '' },
};
const needsPerson = (kind: 'custom' | 'commercial'): Estimate => ({ ok: false, kind, rates_en: ASSESS[kind].en, rates_tl: ASSESS[kind].tl, rates_tglish: ASSESS[kind].tg, estimate_en: ASSESS[kind].en, estimate_tl: ASSESS[kind].tl, estimate_tglish: ASSESS[kind].tg });
/** The rates only apply to what the rate table covers: residential glass packages and the roof / wall / floor / solar rates. Commercial properties and everything else are quoted by a person. */
/** Every language gets the same short English-first text (the Tagalog-heavy variants were retired in V2: they made the AI answer in Tagalog and too long). */
export function estimate(address: string, service: string, qty?: number, property: string = 'residential', withMain = false): Estimate {
  const e = estimateEn(address, service, qty, property, withMain); return { ...e, rates_tl: e.rates_en, rates_tglish: e.rates_en, estimate_tl: e.estimate_en, estimate_tglish: e.estimate_en };
}
function estimateEn(address: string, service: string, qty?: number, property: string = 'residential', withMain = false): Estimate {
  const q = Number.isFinite(Number(qty)) && Number(qty) > 0 ? Math.round(Number(qty)) : undefined;
  if (/commercial|business|office|store|company|building|condo(minium)? ?(corp|association)|hotel|school|hospital|warehouse|factory/i.test(property)) return needsPerson('commercial');
  const kindOf = classify(service); if (kindOf === 'custom') return needsPerson('custom');
  const other = kindOf === 'glass' ? undefined : OTHER.find((o) => o.code === kindOf);
  if (other) {
    const billed = withMain ? (q ?? 0) : Math.max(q ?? other.min, other.min), total = billed * other.rate, kind: Kind = other.code === 'SOLAR' ? 'solar' : 'area';
    const rates_en = withMain ? `${other.name} is ₱${other.rate} per ${other.unit}. Booked together with another main service (like a window cleaning package or roof cleaning), there is no minimum charge: you pay per ${other.unit} only for the quantity our crew counts.` : `${other.name} is ₱${other.rate} per ${other.unit}, with a minimum of ${other.min} ${other.unit}${other.unit === 'panel' && other.min > 1 ? 's' : ''} (${peso(other.rate * other.min)}).`;
    const rates_tl = withMain ? `Ang ${other.name} po ay ₱${other.rate} bawat ${other.unit}. Kapag isinabay sa isa pang main service (tulad ng window cleaning package o roof cleaning), walang minimum na singil: ang babayaran lang po ay ang dami na bibilangin ng aming crew, bawat ${other.unit}.` : `Ang ${other.name} po ay ₱${other.rate} bawat ${other.unit}, may minimum na ${other.min} ${other.unit} (${peso(other.rate * other.min)}).`;
    const rates_tglish = withMain ? `Ang ${other.name} po namin ay ₱${other.rate} per ${other.unit}. Kapag isinabay sa isa pang main service (like window cleaning package o roof cleaning), walang minimum charge po: ang babayaran lang ay ang quantity na bibilangin ng crew namin, per ${other.unit}.` : `Ang ${other.name} po namin ay ₱${other.rate} per ${other.unit}, may minimum na ${other.min} ${other.unit} (${peso(other.rate * other.min)}).`;
    if (!q) return { ok: true, kind, unit: other.unit, rates_en, rates_tl, rates_tglish, estimate_en: '', estimate_tl: '', estimate_tglish: '' };
    const under = !withMain && q < other.min; const u = other.unit === 'panel' && q > 1 ? 'panels' : other.unit;
    return { ok: true, kind, unit: other.unit, qty: q, estimate: total, rates_en, rates_tl, rates_tglish,
      estimate_tglish: `Para sa ${q} ${u}${under ? ` (below sa ${other.min} minimum, kaya minimum po ang singil)` : ''}, ang estimate po ay ${peso(total)}. ${NOTE_TG}`,
      estimate_en: `For ${q} ${u}${under ? ` (below the ${other.min} minimum, so the minimum applies)` : ''}, the estimate is ${peso(total)}. ${NOTE_EN}`,
      estimate_tl: `Para sa ${q} ${u}${under ? ` (mas mababa sa minimum na ${other.min}, kaya minimum ang sisingilin)` : ''}, ang estimate po ay ${peso(total)}. ${NOTE_TL}` };
  }
  const rate = findRate(address);
  if (!rate) return { ok: false, kind: 'unknown', rates_en: VERIFY.en, rates_tl: VERIFY.tl, rates_tglish: VERIFY.tg, estimate_en: VERIFY.en, estimate_tl: VERIFY.tl, estimate_tglish: VERIFY.tg };
  const extra = Math.max(0, (q ?? 0) - rate.panels), total = rate.price + extra * EXTRA_PANEL;
  const prov = rate.group === 'Province-level rate';   // Laguna and Batangas: a province-level reference rate; the municipality is verified by the team
  const PV = { en: prov ? ` This is our ${rate.place} province rate; our team will confirm your exact municipality and coverage.` : '', tl: prov ? ` Ito po ang province rate namin sa ${rate.place}; kokumpirmahin po ng aming team ang eksaktong munisipyo at coverage.` : '', tg: prov ? ` Ito ang province rate namin sa ${rate.place}; ico-confirm po ng team ang exact municipality at coverage.` : '' };
  const rates_en = `Our window cleaning package in ${rate.place} starts at ${peso(rate.price)}, covering up to ${rate.panels} glass panels. Additional panels are ${peso(EXTRA_PANEL)} each.${PV.en}`;
  const rates_tl = `Ang window cleaning package po namin sa ${rate.place} ay nagsisimula sa ${peso(rate.price)}, para sa hanggang ${rate.panels} glass panels. Ang karagdagang panel po ay ${peso(EXTRA_PANEL)} bawat isa.${PV.tl}`;
  const rates_tglish = `Hi po! Sa ${rate.place}, ang window cleaning package namin ay nagsisimula sa ${peso(rate.price)} para sa hanggang ${rate.panels} glass panels. Ang additional panel ay ${peso(EXTRA_PANEL)} each po.${PV.tg}`;
  const base = { ok: true, kind: 'glass' as Kind, place: rate.place, package_price: rate.price, included: rate.panels, extra_rate: EXTRA_PANEL, rates_en, rates_tl, rates_tglish };
  if (!q) return { ...base, estimate_en: '', estimate_tl: '', estimate_tglish: '' };
  const how_en = extra ? `the ${peso(rate.price)} package plus ${extra} additional panel${extra > 1 ? 's' : ''} at ${peso(EXTRA_PANEL)}` : `within the ${peso(rate.price)} package, with no additional panels`;
  const how_tl = extra ? `ang ${peso(rate.price)} na package at ${extra} karagdagang panel na ${peso(EXTRA_PANEL)} bawat isa` : `sakop ng ${peso(rate.price)} na package, walang karagdagang panel`;
  const tg = extra ? `Para sa around ${q} panels, ang estimated total po ay ${peso(total)} (${peso(rate.price)} package + ${extra} additional panel${extra > 1 ? 's' : ''} na ${peso(EXTRA_PANEL)} each). ${NOTE_TG}${PV.tg}` : `Para sa ${q} panels ninyo, sakop pa po siya ng package, so ang estimate ay ${peso(total)}. ${NOTE_TG}${PV.tg}`;
  return { ...base, qty: q, extra_qty: extra, estimate: total, estimate_tglish: tg, estimate_en: `For about ${q} panels, the estimated total is ${peso(total)} (${how_en}). ${NOTE_EN}${PV.en}`, estimate_tl: `Para sa humigit-kumulang ${q} panels, ang estimated total po ay ${peso(total)} (${how_tl}). ${NOTE_TL}${PV.tl}` };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// MINIMUM CHARGES AND BUNDLES (owner rule). Every package has a minimum charge: below the allowance the customer still pays the full minimum (never prorated).
// Two eligible services booked together: the FIRST keeps its full minimum, the SECOND has its minimum waived and is billed on the actual quantity at its unit rate (not free, not discounted).
// Special equipment or access charges can still apply. The AI never decides or adds this: the code does, from the approved rate table.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const BUNDLE_NOTE = 'The final amount is confirmed on site, and special equipment or access charges may apply.';
const BUNDLE_VERIFY = 'Our team will confirm the combined price for these services po.';
type EligibleKind = 'glass' | 'ROOF' | 'SOLAR' | 'FLOOR' | 'WALL';
/** Which services can be bundled: the residential glass package and the per-sqm / per-panel services of the rate table. Everything else is priced by a person. */
const eligibleKind = (service: string): EligibleKind | null => { if (!String(service ?? '').trim()) return null; const k = classify(service); return k === 'custom' ? null : (k as EligibleKind); };
const bundleNeedsPerson = (): Estimate => ({ ok: false, kind: 'custom', rates_en: BUNDLE_VERIFY, rates_tl: BUNDLE_VERIFY, rates_tglish: BUNDLE_VERIFY, estimate_en: BUNDLE_VERIFY, estimate_tl: BUNDLE_VERIFY, estimate_tglish: BUNDLE_VERIFY });
/**
 * True only when `service` may have its minimum waived in this conversation: it is a per-sqm / per-panel service, and ANOTHER eligible service is the first one: the glass package, or a service mentioned earlier.
 * The glass package and a customer's first service are never waived. `seen` = the services of the conversation in the order the customer mentioned them.
 */
export function bundleWaives(service: string, seen: readonly string[]): boolean {
  const k = eligibleKind(service); if (!k || k === 'glass') return false;
  const kinds = [...new Set(seen.map((x) => eligibleKind(x)).filter((x): x is EligibleKind => !!x))];
  const idx = kinds.indexOf(k); if (idx < 0) return false;                                       // the service itself must be one the customer is talking about
  return kinds.some((x, i) => x !== k && (x === 'glass' || i < idx));                          // a glass package, or an earlier service, is the first one
}
/** The combined estimate of TWO services booked together. `items` in the order the customer named them; the glass package, when there is one, is always the first. */
export function estimateBundle(address: string, items: { service: string; qty?: number }[], property: string = 'residential'): Estimate {
  if (/commercial|business|office|store|company|building|condo(minium)? ?(corp|association)|hotel|school|hospital|warehouse|factory/i.test(property)) return needsPerson('commercial');
  if (!Array.isArray(items) || items.length !== 2) return bundleNeedsPerson();
  const kinds = items.map((i) => eligibleKind(i.service)); if (kinds.some((k) => !k) || kinds[0] === kinds[1]) return bundleNeedsPerson();
  const order = kinds[1] === 'glass' ? [1, 0] : [0, 1]; const [first, second] = [items[order[0]], items[order[1]]];
  const e1 = estimate(address, first.service, first.qty, property, false); if (!e1.ok) return e1;                   // unknown city etc.: a person verifies
  const e2 = estimate(address, second.service, second.qty, property, true); if (!e2.ok) return e2;
  const o1 = OTHER.find((o) => o.code === kinds[order[0]]), o2 = OTHER.find((o) => o.code === kinds[order[1]]);
  const a1 = e1.estimate ?? (e1.kind === 'glass' ? e1.package_price : o1 ? o1.min * o1.rate : undefined);     // the first service never pays less than its minimum
  const a2 = e2.estimate;
  const lines: BundleLine[] = [{ service: first.service, role: 'first', qty: e1.qty, unit: e1.kind === 'glass' ? 'panel' : o1?.unit, rate: e1.kind === 'glass' ? e1.extra_rate : o1?.rate, amount: a1 }, { service: second.service, role: 'second', qty: e2.qty, unit: o2?.unit, rate: o2?.rate, amount: a2 }];
  const part1 = e1.kind === 'glass' ? `the ${e1.place} window package at ${peso(a1 ?? 0)} (up to ${e1.included} panels${e1.extra_qty ? `, plus ${e1.extra_qty} extra at ${peso(EXTRA_PANEL)}` : ''})` : `${o1!.name} at ${peso(a1 ?? 0)}${e1.qty && e1.qty < o1!.min ? ` (the ${o1!.min} ${o1!.unit} minimum applies)` : ''}`;
  const part2 = a2 !== undefined ? `${e2.qty} ${o2!.unit}${e2.qty! > 1 ? 's' : ''} of ${o2!.name} at ${peso(o2!.rate)} each, ${peso(a2)} (no minimum for the second service)` : `${o2!.name} at ${peso(o2!.rate)} per ${o2!.unit}, with no minimum for the second service`;
  const total = a1 !== undefined && a2 !== undefined ? a1 + a2 : undefined;
  const rates = `Booked together: ${part1}, plus ${part2}. ${BUNDLE_NOTE}`;
  const est = total !== undefined ? `For both services the estimate is ${peso(total)}: ${part1}, plus ${part2}. ${BUNDLE_NOTE}` : '';
  return { ok: true, kind: 'bundle', place: e1.place, estimate: total, lines, rates_en: rates, rates_tl: rates, rates_tglish: rates, estimate_en: est, estimate_tl: est, estimate_tglish: est };
}
