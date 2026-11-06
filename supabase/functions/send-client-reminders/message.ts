// The client's reminder text. Pure (no imports) so the app's tests can run it too.
// Plain letters only (no peso sign, long dashes or emoji) so it stays in GSM-7: 160 characters per SMS, 153 each when it runs to two parts. No link: phone companies drop them.
export type SmsKind = 'day_before' | 'morning';
export type Salutation = 'Sir' | 'Mam';
export interface SmsJob {
  kind: SmsKind; date: string; time: string; etaTo?: string;
  /** who the text is for: the person's name as recorded (a title such as Mr. or Ms. is used), and the saved Sir / Mam choice when there is one */
  to?: string; salutation?: Salutation | null;
  leader?: string; crew?: string[]; vehicle?: string;
}

export const gsm = (s: string) => s.replace(/₱\s?/g, 'PHP ').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\n]/g, '');
const hm = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return { h12: h % 12 || 12, m: String(m).padStart(2, '0'), ap: h < 12 ? 'AM' : 'PM' }; };
/** "8:00 AM" */
export const nice = (hhmm: string) => { const t = hm(hhmm); return `${t.h12}:${t.m} ${t.ap}`; };
/** "8:00-8:30 AM", or "11:30 AM-12:30 PM" when the window crosses noon; just "8:00 AM" when there is no end. */
export function window(from: string, to?: string) {
  if (!to || to === from) return nice(from);
  const a = hm(from), b = hm(to);
  return a.ap === b.ap ? `${a.h12}:${a.m}-${b.h12}:${b.m} ${b.ap}` : `${nice(from)}-${nice(to)}`;
}
const day = (ymd: string) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const TITLE = /^(mr|mrs|ms|miss|mx|sir|mam|ma'am|maam|madam|engr|arch|atty|dr|prof|hon)\.?\s+/i;
/** First name only, without a title: the client does not need full names and it keeps the text short. */
export const first = (n: string) => n.replace(TITLE, '').trim().split(/\s+/)[0] ?? '';
const BUSINESS = /\b(project|corp|corporation|inc|enterprises?|trading|company|co|hotel|resort|school|church|bldg|building|village|residences?|properties|realty|association|hoa)\b/i;

/** "Sir" or "Mam" from an explicit title only (Mr. / Sir; Ms. / Mrs. / Miss / Mam / Madam). A first name is never used to guess: it is wrong too often. */
export function honorific(name?: string, saved?: Salutation | null): Salutation | null {
  if (saved === 'Sir' || saved === 'Mam') return saved;
  const t = /^(mr|sir)\b/i.test((name ?? '').trim()) ? 'Sir' : /^(mrs|ms|miss|mx|mam|ma'am|maam|madam)\b/i.test((name ?? '').trim()) ? 'Mam' : null;
  return t as Salutation | null;
}
/** "Sir Regulus", "Mam Pamela", "Tantan", or nothing for a company or when there is no name. */
export function callName(name?: string, saved?: Salutation | null): string {
  const n = (name ?? '').trim(); if (!n || BUSINESS.test(n)) return '';
  const f = first(n); if (!f) return '';
  const h = honorific(n, saved); return h ? `${h} ${f}` : f;
}

export function teamText(leader: string | undefined, crew: string[] | undefined, max: number): string {
  const names = [...(leader ? [`${first(leader)} (leader)`] : []), ...(crew ?? []).map(first)].filter(Boolean);
  if (!names.length) return '';
  const shown = names.slice(0, max); const more = names.length - shown.length;
  return shown.join(', ') + (more > 0 ? ` +${more}` : '');
}

const MAX = 306;   // two SMS of 153 characters
/** The reminder: a greeting by name, the day and arrival window (from the Job Order), who is coming and in what vehicle, that this number takes no replies, and where to ask questions. */
export function clientMessage(j: SmsJob): string {
  const build = (crewMax: number) => {
    const who = callName(j.to, j.salutation); const eta = window(j.time, j.etaTo);
    const team = teamText(j.leader, j.crew, crewMax); const veh = j.vehicle ? ` Vehicle: ${j.vehicle}.` : '';
    const body = j.kind === 'day_before'
      ? `Good day${who ? `, ${who}` : ''}! TopMop Window Cleaning: your service is tomorrow, ${day(j.date)}. ETA ${eta}.`
      : `Good morning${who ? `, ${who}` : ''}! TopMop Window Cleaning will arrive today. ETA ${eta}.`;
    const tail = `${j.kind === 'day_before' ? ' Please ensure access to the area.' : ''} Automated message, please do not reply here. Questions? Message us on Facebook Messenger. Thank you!`;
    return gsm(`${body}${team ? ` Team: ${team}.` : ''}${veh}${tail}`);
  };
  for (const crewMax of [6, 4, 3, 2]) { const m = build(crewMax); if (m.length <= MAX) return m; }
  return build(2).slice(0, MAX - 3).trimEnd() + '...';
}
