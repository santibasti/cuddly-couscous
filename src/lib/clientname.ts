// Client lists are sorted by surname so a client is easy to find: "Wooster, Krishna" sits under W. Businesses keep their own name ("The Henry Glass House" sorts under H).
const TITLE = /^(?:mr|ms|mrs|miss|dr|engr|atty|arch|sir|mam|madam|hon)\.?\s+/i;
const BUSINESS = /\b(store|stores|corp|corporation|inc|co|company|ltd|house|shop|restaurant|hotel|mall|school|church|bank|clinic|hospital|building|condo|condominium|tower|towers|enterprises|trading|services?|center|centre|cafe|dealership|motors?|association|residences|village|homeowners|properties|realty|group|studio|salon|spa|market|warehouse|factory|plant|client|test|demo)\b/i;
const PARTICLE = /^(?:de|del|dela|delos|dela|la|los|las|san|santa|van|von|der|di|da|mac|mc)$/i;
type C = { name: string; type?: string };
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
/** [surname, given names, the part in brackets] of a person's name; undefined for a business. */
function person(c: C): { surname: string; given: string; extra: string } | undefined {
  const raw = tidy(c.name ?? ''); if (!raw) return undefined;
  const extra = (/\(([^)]*)\)/.exec(raw)?.[1] ?? '').trim();
  const base = tidy(raw.replace(/\([^)]*\)/g, ' ')); const titled = TITLE.test(base);
  const words = tidy(base.replace(TITLE, '')).split(' ').filter(Boolean);
  if (words.length < 2 || (!titled && (c.type && c.type !== 'Residential')) || BUSINESS.test(base)) return undefined;
  let n = 1; while (words.length - n - 1 >= 1 && PARTICLE.test(words[words.length - n - 1])) n++;   // De Leon, Dela Cruz, De la Cruz, Van Der Berg: the particle belongs to the surname
  return { surname: words.slice(-n).join(' '), given: words.slice(0, -n).join(' '), extra };
}
/** What a dropdown shows: "Surname, Given (note)" for a person, the name as typed for a business. */
export function clientLabel(c: C): string { const p = person(c); return p ? `${p.surname}, ${p.given}${p.extra ? ` (${p.extra})` : ''}` : tidy(c.name ?? ''); }
const key = (c: C) => { const p = person(c); return (p ? `${p.surname} ${p.given}` : tidy(c.name ?? '').replace(/^the\s+/i, '')).toLowerCase(); };
export const sortedClients = <T extends C>(list: T[]): T[] => [...list].sort((a, b) => key(a).localeCompare(key(b), 'en', { sensitivity: 'base', numeric: true }));
