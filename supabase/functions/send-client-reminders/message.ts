// The client's reminder text. Pure (no imports) so the app's tests can run it too.
// Plain letters only (no peso sign, long dashes or emoji) so it stays in GSM-7: 160 characters per SMS, 153 each when it runs to two or three parts.
export type SmsKind = 'day_before' | 'morning';
export interface SmsJob { kind: SmsKind; date: string; time: string; etaTo?: string; site?: string; leader?: string; crew?: string[]; vehicle?: string; phone?: string }

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
/** First name only, without a title: the client does not need full names and it keeps the text short. */
export const first = (n: string) => n.replace(/^(mr|mrs|ms|engr|arch|dr)\.?\s+/i, '').trim().split(/\s+/)[0] ?? '';

export function teamText(leader: string | undefined, crew: string[] | undefined, max: number): string {
  const names = [...(leader ? [`${first(leader)} (leader)`] : []), ...(crew ?? []).map(first)].filter(Boolean);
  if (!names.length) return '';
  const shown = names.slice(0, max); const more = names.length - shown.length;
  return shown.join(', ') + (more > 0 ? ` +${more}` : '');
}

const MAX = 306;   // two SMS of 153 characters
/** The reminder: what day and time (the arrival window from the job order), who is coming and in what vehicle, and that this number does not take replies. */
export function clientMessage(j: SmsJob): string {
  const build = (crewMax: number, withSite: boolean) => {
    const eta = window(j.time, j.etaTo); const at = withSite && j.site ? ` at ${j.site}` : '';
    const team = teamText(j.leader, j.crew, crewMax); const veh = j.vehicle ? ` Vehicle: ${j.vehicle}.` : '';
    const head = j.kind === 'day_before'
      ? `TopMop Window Cleaning: reminder - your service${at} is tomorrow, ${day(j.date)}. ETA ${eta}.`
      : `TopMop Window Cleaning: good morning! Our team is coming today${at}. ETA ${eta}.`;
    const tail = ` Automated message, please do not reply here.${j.phone ? ` Questions? Call ${j.phone}.` : ''}`;
    return gsm(`${head}${team ? ` Team: ${team}.` : ''}${veh}${tail}`);
  };
  for (const [crewMax, withSite] of [[6, true], [4, true], [3, true], [3, false], [2, false]] as const) { const m = build(crewMax, withSite); if (m.length <= MAX) return m; }
  return build(2, false).slice(0, MAX - 3).trimEnd() + '...';
}
