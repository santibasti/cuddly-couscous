// Pure helpers for Jarvis (no network, so they can be tested).

/** Manila calendar date (YYYY-MM-DD) for a moment, and shifted by whole days. */
export const manilaDay = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Telegram ids (user = private chat id) allowed to talk to Jarvis: "123,456" → [123, 456]. */
export const ownerIds = (v: string | undefined): number[] => (v ?? '').split(/[,\s]+/).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);

/** Alerts spoken right away; everything else waits for the morning brief. */
export const INSTANT_ALERT_KINDS = ['discount', 'quotation'];
export const alertIsInstant = (kind: string) => INSTANT_ALERT_KINDS.includes(kind);

/** Text for the voice: no markdown, links or long digit strings (phone numbers), pesos spelled out. */
export function speakable(s: string, max = 1500): string {
  let t = (s ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/₱\s?([\d,]+(?:\.\d+)?)/g, (_m, n: string) => `${n} pesos`)
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > max) { t = t.slice(0, max); const i = Math.max(t.lastIndexOf('. '), t.lastIndexOf('\n')); if (i > max * 0.6) t = t.slice(0, i + 1); }
  return t;
}

/** Telegram messages are limited to 4096 characters. */
export function chunks(s: string, n = 3800): string[] {
  const out: string[] = []; let rest = s.trim();
  while (rest.length > n) { let i = rest.lastIndexOf('\n', n); if (i < n * 0.5) i = rest.lastIndexOf(' ', n); if (i < 1) i = n; out.push(rest.slice(0, i).trim()); rest = rest.slice(i).trim(); }
  if (rest) out.push(rest);
  return out;
}

interface Line { qty: number; rate: number; discount?: number; measure?: boolean }
interface Inv { items: Line[] | null; discount: number | null; vat_mode: string; vat_rate: number | null }
/** Same arithmetic as the app's docTotals: billed lines minus discounts, VAT added in 'exclusive' mode. */
export function invoiceTotal(i: Inv): number {
  const billed = (i.items ?? []).filter((x) => !x.measure);
  const gross = billed.reduce((s, x) => s + (x.qty || 0) * (x.rate || 0), 0);
  const lineDisc = billed.reduce((s, x) => s + (x.discount || 0), 0);
  const after = Math.max(0, gross - lineDisc - (i.discount || 0));
  return round2(i.vat_mode === 'exclusive' ? after * (1 + (i.vat_rate ?? 0) / 100) : after);
}
interface Pay { amount: number; wht_amount: number | null; status: string | null; reversed: boolean | null; method: string | null; cheque_status: string | null; deleted_at?: string | null }
/** A payment counts only when verified (and a cheque only when cleared), like the app. */
export const paymentCounts = (p: Pay) => !p.deleted_at && !p.reversed && (p.status ?? 'Verified') === 'Verified' && (p.method !== 'Cheque' || (p.cheque_status ?? 'Cleared') === 'Cleared');
export const invoiceBalance = (i: Inv, pays: Pay[]) => round2(invoiceTotal(i) - pays.filter(paymentCounts).reduce((s, p) => s + (p.amount || 0) + (p.wht_amount || 0), 0));

/** One short spoken line for an instant alert. */
export function alertLine(a: { kind: string; title: string; body: string }): string {
  const body = (a.body ?? '').replace(/\s+/g, ' ').trim();
  return speakable(`${a.title}. ${body}`, 400);
}

export const personaPrompt = (address: string, speakNames: boolean) => `You are JARVIS, the calm, dry-witted private business assistant of the owner of TopMop Window Cleaning Solutions Corp. (a Philippine window / glass / roof / solar-panel cleaning company). You talk to ONE person: the owner${address ? `, whom you address as "${address}"` : ''}.
Style: brief, precise and warm, like a trusted chief of staff. Plain spoken English the owner can listen to in a car: short sentences, no bullet points, no markdown, no emojis, no URLs. Say amounts as pesos (for example "twelve thousand pesos") and times as "9 AM".
Rules:
- Use ONLY facts in the data you are given or in tool results. Never invent a number, a name or a status. If something is missing or a tool failed, say so in a few words.
- Lead with what needs the owner's attention or a decision, then the facts. Skip anything routine unless asked.
- Never read out phone numbers, e-mail addresses, street addresses or any password, key or token.${speakNames ? '' : '\n- Do not say client names; say "a client" or the job number instead.'}
- You can only read information. If asked to change, send, approve or pay anything, say you cannot do that from here and name where in the app it is done.
- Keep a spoken answer under about 120 words unless asked for detail.`;
