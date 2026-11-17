// The INTERNAL pre-approved quotation for a chat booking, priced like the app's Quick booking: the city's starting package (glass) or the minimum (roof, wall, floor, solar).
// The client never receives it: it exists so the Job Order and the invoice have something to work from. The real quantity is counted by the crew on site.
import { defaultCrew, defaultDisclaimer, defaultIntro, defaultMethodology, priceService, syncMethodSections } from './appcore.mjs';
import { EXTRA_PANEL, OTHER, classify, findRate } from './rates.ts';

/** The rate-table service for the text, or undefined for glass (a custom-quote service has no rate: see chatQuotation). */
export const isOther = (service: string) => { const k = classify(service); return k === 'glass' || k === 'custom' ? undefined : OTHER.find((o) => o.code === k); };
// deno-lint-ignore no-explicit-any
type Any = any;
export interface ChatQuote { code: string; scope: string; payload: Record<string, unknown> }
export function chatQuotation(a: { services: Any[]; settings: Any; address: string; service: string; today: string; property?: string; addDays: (d: string, n: number) => string }): ChatQuote | null {
  if (classify(a.service) === 'custom' || /commercial|business|office|store|company|building|hotel|school|hospital|warehouse|factory/i.test(a.property ?? '')) return null;     // priced by a person, never from the residential rate table
  const other = isOther(a.service); let items: Any[]; let code: string; let name: string;
  if (other) {
    const base = a.services.find((s: Any) => s.code === other.code) ?? { code: other.code, name: other.name, unit: other.unit, rate: other.rate, minimum_qty: other.min, custom_quote: false };
    items = priceService({ ...base, name: other.name, unit: other.unit, rate: other.rate, minimum_qty: other.min, custom_quote: false, package_price: undefined, package_qty: undefined }, other.min).lines; code = other.code; name = other.name;
  } else {
    const rate = findRate(a.address); if (!rate) return null;
    const def = a.services.find((s: Any) => s.code === 'GLASS_EXT') ?? { code: 'GLASS_EXT', name: 'Exterior Glass / Window Cleaning', unit: 'panel', rate: EXTRA_PANEL, minimum_qty: 1, custom_quote: false };
    items = priceService(def, rate.panels, { price: rate.price, qty: rate.panels, excess_rate: EXTRA_PANEL }).lines; code = 'GLASS_EXT'; name = 'Exterior glass / window cleaning';
  }
  const set = a.settings ?? {};
  const scope = `${name} at ${a.address.trim()}. Starting rates agreed with the client in the chat; the crew counts the real quantity on site and the final amount follows that count.`;
  return { code, scope, payload: {
    issue_date: a.today, valid_until: a.addDays(a.today, set.quote_validity_days ?? 30), scope, items, vat_mode: 'none', vat_rate: set.vat_rate ?? 0, terms: set.default_terms ?? '', payment_option: 'completion',
    crew_size: defaultCrew(set), safety_officer: true, work_days: 1, disclaimer: defaultDisclaimer(set), intro: defaultIntro(set), methodology: defaultMethodology(set), method_sections: syncMethodSections(a.services, [code], []),
  } };
}
