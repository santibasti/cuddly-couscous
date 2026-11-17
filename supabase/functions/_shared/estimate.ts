// What the chat tells a customer about the price. Only starting rates and an ESTIMATE: the crew counts the real quantity on site and the final amount follows that count.
// All figures come from the approved rate table in rates.ts; the AI never calculates or invents a price.
import { EXTRA_PANEL, OTHER, findRate } from './rates.ts';

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
export type Kind = 'glass' | 'area' | 'solar' | 'unknown';
export interface Estimate { ok: boolean; kind: Kind; place?: string; package_price?: number; included?: number; extra_rate?: number; qty?: number; extra_qty?: number; estimate?: number; unit?: string; rates_en: string; rates_tl: string; rates_tglish: string; estimate_en: string; estimate_tl: string; estimate_tglish: string }
const NOTE_EN = 'This is only an estimate: our crew does the final count on site, and the final amount follows that count.';
const NOTE_TL = 'Estimate lang po ito: ang crew po namin ang gagawa ng final count sa site, at ang final na halaga ay base sa bilang na iyon.';
const NOTE_TG = 'Estimate lang po ito ha, kasi ang crew namin ang magbibilang ng final count sa site, at doon po ibabase ang final amount.';
const VERIFY = { en: 'Let me have our team verify the correct rate for your location po.', tl: 'Ipa-verify ko po sa aming team ang tamang rate para sa inyong lokasyon.', tg: 'Paki-verify ko po muna sa team namin ang tamang rate para sa location ninyo, para sigurado po tayo sa presyo.' };

/** The starting rates (and, when a quantity is given, the estimate) for a service at an address. `qty` = glass panels, solar panels or square metres. */
export function estimate(address: string, service: string, qty?: number): Estimate {
  const q = Number.isFinite(Number(qty)) && Number(qty) > 0 ? Math.round(Number(qty)) : undefined;
  const other = /glass|window|panel|salamin|bintana|^\s*$/i.test(service) && !/solar/i.test(service) ? undefined : OTHER.find((o) => o.match.test(service));
  if (other) {
    const billed = Math.max(q ?? other.min, other.min), total = billed * other.rate, kind: Kind = other.code === 'SOLAR' ? 'solar' : 'area';
    const rates_en = `${other.name} is ₱${other.rate} per ${other.unit}, with a minimum of ${other.min} ${other.unit} (${peso(other.rate * other.min)}).`;
    const rates_tl = `Ang ${other.name} po ay ₱${other.rate} bawat ${other.unit}, may minimum na ${other.min} ${other.unit} (${peso(other.rate * other.min)}).`;
    const rates_tglish = `Ang ${other.name} po namin ay ₱${other.rate} per ${other.unit}, may minimum na ${other.min} ${other.unit} (${peso(other.rate * other.min)}).`;
    if (!q) return { ok: true, kind, unit: other.unit, rates_en, rates_tl, rates_tglish, estimate_en: '', estimate_tl: '', estimate_tglish: '' };
    const under = q < other.min;
    return { ok: true, kind, unit: other.unit, qty: q, estimate: total, rates_en, rates_tl, rates_tglish,
      estimate_tglish: `Para sa ${q} ${other.unit}${under ? ` (below sa ${other.min} minimum, kaya minimum po ang singil)` : ''}, ang estimate po ay ${peso(total)}. ${NOTE_TG}`,
      estimate_en: `For ${q} ${other.unit}${under ? ` (below the ${other.min} minimum, so the minimum applies)` : ''}, the estimate is ${peso(total)}. ${NOTE_EN}`,
      estimate_tl: `Para sa ${q} ${other.unit}${under ? ` (mas mababa sa minimum na ${other.min}, kaya minimum ang sisingilin)` : ''}, ang estimate po ay ${peso(total)}. ${NOTE_TL}` };
  }
  const rate = findRate(address);
  if (!rate) return { ok: false, kind: 'unknown', rates_en: VERIFY.en, rates_tl: VERIFY.tl, rates_tglish: VERIFY.tg, estimate_en: VERIFY.en, estimate_tl: VERIFY.tl, estimate_tglish: VERIFY.tg };
  const extra = Math.max(0, (q ?? 0) - rate.panels), total = rate.price + extra * EXTRA_PANEL;
  const rates_en = `Our window cleaning package in ${rate.place} starts at ${peso(rate.price)}, covering up to ${rate.panels} glass panels. Additional panels are ${peso(EXTRA_PANEL)} each.`;
  const rates_tl = `Ang window cleaning package po namin sa ${rate.place} ay nagsisimula sa ${peso(rate.price)}, para sa hanggang ${rate.panels} glass panels. Ang karagdagang panel po ay ${peso(EXTRA_PANEL)} bawat isa.`;
  const rates_tglish = `Hi po! Sa ${rate.place}, ang window cleaning package namin ay nagsisimula sa ${peso(rate.price)} para sa hanggang ${rate.panels} glass panels. Ang additional panel ay ${peso(EXTRA_PANEL)} each po.`;
  const base = { ok: true, kind: 'glass' as Kind, place: rate.place, package_price: rate.price, included: rate.panels, extra_rate: EXTRA_PANEL, rates_en, rates_tl, rates_tglish };
  if (!q) return { ...base, estimate_en: '', estimate_tl: '', estimate_tglish: '' };
  const how_en = extra ? `the ${peso(rate.price)} package plus ${extra} additional panel${extra > 1 ? 's' : ''} at ${peso(EXTRA_PANEL)}` : `within the ${peso(rate.price)} package, with no additional panels`;
  const how_tl = extra ? `ang ${peso(rate.price)} na package at ${extra} karagdagang panel na ${peso(EXTRA_PANEL)} bawat isa` : `sakop ng ${peso(rate.price)} na package, walang karagdagang panel`;
  const tg = extra ? `Para sa around ${q} panels, ang estimated total po ay ${peso(total)} (${peso(rate.price)} package + ${extra} additional panel${extra > 1 ? 's' : ''} na ${peso(EXTRA_PANEL)} each). ${NOTE_TG}` : `Para sa ${q} panels ninyo, sakop pa po siya ng package, so ang estimate ay ${peso(total)}. ${NOTE_TG}`;
  return { ...base, qty: q, extra_qty: extra, estimate: total, estimate_tglish: tg, estimate_en: `For about ${q} panels, the estimated total is ${peso(total)} (${how_en}). ${NOTE_EN}`, estimate_tl: `Para sa humigit-kumulang ${q} panels, ang estimated total po ay ${peso(total)} (${how_tl}). ${NOTE_TL}` };
}
