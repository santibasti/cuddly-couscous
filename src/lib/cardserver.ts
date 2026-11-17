// What the picture address needs, bundled for the Vercel function (npm run build:card): turn the query of /api/estimate-card into the card, using the same rate table as the chat.
import { estimate } from '../../supabase/functions/_shared/estimate';
import { estimateCardSvg } from '../../supabase/functions/_shared/estimatecard';

type Q = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
export function cardSvgFromQuery(q: Q): { svg: string } | { error: string } {
  const address = one(q.address || q.city).trim().slice(0, 80), service = one(q.service).trim().slice(0, 60), qty = Number(one(q.qty || q.panels)), property = one(q.property).trim().slice(0, 20) || 'Residential';
  if (!address) return { error: 'address is required' };
  if (!Number.isFinite(qty) || qty < 1 || qty > 5000) return { error: 'qty must be between 1 and 5000' };
  const e = estimate(address, service || 'window cleaning', qty, property);
  const svg = estimateCardSvg(e, { property: /^commercial/i.test(property) ? 'Commercial' : 'Residential' });
  return svg ? { svg } : { error: 'no card: a person has to price this' };
}
