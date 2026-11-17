// What the chat tells a customer about the price. Only starting rates and an ESTIMATE: the crew counts the real quantity on site and the final amount follows that count.
// All figures come from the approved rate table in rates.ts; the AI never calculates or invents a price.
import { EXTRA_PANEL, OTHER, classify, findRate } from './rates.ts';

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;
export type Kind = 'glass' | 'area' | 'solar' | 'unknown' | 'custom' | 'commercial';
export interface Estimate { ok: boolean; kind: Kind; place?: string; package_price?: number; included?: number; extra_rate?: number; qty?: number; extra_qty?: number; estimate?: number; unit?: string; rates_en: string; rates_tl: string; rates_tglish: string; estimate_en: string; estimate_tl: string; estimate_tglish: string }
const NOTE_EN = 'This is only an estimate: our crew does the final count on site, and the final amount follows that count.';
const NOTE_TL = 'Estimate lang po ito: ang crew po namin ang gagawa ng final count sa site, at ang final na halaga ay base sa bilang na iyon.';
const NOTE_TG = 'Estimate lang po ito ha, kasi ang crew namin ang magbibilang ng final count sa site, at doon po ibabase ang final amount.';
const VERIFY = { en: 'Let me have our team verify the correct rate for your location po.', tl: 'Ipa-verify ko po sa aming team ang tamang rate para sa inyong lokasyon.', tg: 'Paki-verify ko po muna sa team namin ang tamang rate para sa location ninyo, para sigurado po tayo sa presyo.' };

/** The starting rates (and, when a quantity is given, the estimate) for a service at an address. `qty` = glass panels, solar panels or square metres. */
const ASSESS = {
  custom: { en: 'This service is priced after an assessment, so I do not have a fixed rate to quote. Our team will review the details (photos help) and prepare a quotation po.', tl: 'Ang serbisyong ito po ay pini-presyuhan pagkatapos ng assessment, kaya wala po akong fixed na rate na masasabi. Susuriin po ng aming team ang detalye (nakakatulong ang mga litrato) at maghahanda sila ng quotation.', tg: 'Ang service na ito po ay pini-presyuhan after ng assessment, kaya wala po akong fixed rate na masasabi. Ire-review po ng team namin ang details (nakakatulong po ang photos) at gagawa sila ng quotation.' },
  commercial: { en: 'Commercial properties are quoted after a short assessment, sometimes with an ocular visit, so I cannot give a package price here. May I have the company name, location, building height or floors, and photos if you have them po? Our team will prepare the quotation.', tl: 'Ang mga commercial na property po ay kino-quote pagkatapos ng maikling assessment, minsan may ocular visit, kaya hindi po ako makapagbibigay ng package price dito. Pakibigay po ang pangalan ng kumpanya, lokasyon, taas o bilang ng palapag ng gusali, at mga litrato kung mayroon. Maghahanda po ang team ng quotation.', tg: 'Ang commercial properties po ay kino-quote after ng short assessment, minsan may ocular visit, kaya hindi po ako makakapagbigay ng package price dito. Paki-send po ang company name, location, taas o number of floors ng building, at photos kung meron. Gagawa po ang team namin ng quotation.' },
};
const needsPerson = (kind: 'custom' | 'commercial'): Estimate => ({ ok: false, kind, rates_en: ASSESS[kind].en, rates_tl: ASSESS[kind].tl, rates_tglish: ASSESS[kind].tg, estimate_en: ASSESS[kind].en, estimate_tl: ASSESS[kind].tl, estimate_tglish: ASSESS[kind].tg });
/** The rates only apply to what the rate table covers: residential glass packages and the roof / wall / floor / solar rates. Commercial properties and everything else are quoted by a person. */
export function estimate(address: string, service: string, qty?: number, property: string = 'residential', withMain = false): Estimate {
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
