// Pure helpers for the Telegram photo bot (no network, so they can be tested).
export interface TgJob { id: string; number: string; client_id: string; start_at: string; end_at: string; status: string; leader_id: string | null; crew_ids: unknown }

export const JOB_NO = /\bJOB-[A-Z0-9-]+\b/i;
export type Kind = 'Before' | 'After' | 'During' | 'Site' | 'Other';

/** Reads a caption like "JOB-2026-0012 before" → the job number, the kind of photo, and the remaining text. */
export function parseCaption(text: string | undefined | null): { jobNumber?: string; kind: Kind; caption: string } {
  const t = (text ?? '').trim();
  const m = t.match(JOB_NO);
  const rest = t.replace(JOB_NO, '').replace(/\s+/g, ' ').trim();
  const k = /\bbefore\b/i.test(rest) ? 'Before' : /\bafter\b/i.test(rest) ? 'After' : /\b(during|ongoing|habang)\b/i.test(rest) ? 'During' : /\b(site|area)\b/i.test(rest) ? 'Site' : 'Other';
  return { jobNumber: m ? m[0].toUpperCase() : undefined, kind: k, caption: rest.slice(0, 200) };
}

/** Manila calendar date (YYYY-MM-DD) for a moment. */
export const manilaDay = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);

const crewOf = (j: TgJob): string[] => (Array.isArray(j.crew_ids) ? (j.crew_ids as unknown[]).map(String) : []);
export const onJob = (j: TgJob, emp: string) => j.leader_id === emp || crewOf(j).includes(emp);

/** The jobs this person is on today (not cancelled), earliest first. Falls back to a job that started yesterday and is still in progress. */
export function jobsFor(jobs: TgJob[], emp: string, nowMs: number): TgJob[] {
  const today = manilaDay(nowMs), yest = manilaDay(nowMs - 86400_000);
  const mine = jobs.filter((j) => onJob(j, emp) && !['Cancelled', 'Rescheduled'].includes(j.status));
  const t = mine.filter((j) => j.start_at.slice(0, 10) === today).sort((a, b) => a.start_at.localeCompare(b.start_at));
  if (t.length) return t;
  return mine.filter((j) => j.start_at.slice(0, 10) === yest && j.status === 'In Progress');
}

export type Decision =
  | { kind: 'job'; job: TgJob; via: 'caption' | 'context' | 'today' }
  | { kind: 'ask'; options: TgJob[] }
  | { kind: 'unsorted'; reason: string };

/** Which job a photo goes to: the job number in the caption, else the job the person chose lately, else their one job today; several → ask; none → Unsorted. */
export function decide(opts: { captionJob?: TgJob | null; captionNumber?: string; contextJob?: TgJob | null; today: TgJob[] }): Decision {
  if (opts.captionJob) return { kind: 'job', job: opts.captionJob, via: 'caption' };
  if (opts.captionNumber) return { kind: 'unsorted', reason: `I could not find ${opts.captionNumber}` };
  if (opts.contextJob) return { kind: 'job', job: opts.contextJob, via: 'context' };
  if (opts.today.length === 1) return { kind: 'job', job: opts.today[0], via: 'today' };
  if (opts.today.length > 1) return { kind: 'ask', options: opts.today.slice(0, 6) };
  return { kind: 'unsorted', reason: 'You are not on a job today' };
}

export const extFor = (mime: string, fallback: string) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' } as Record<string, string>)[mime] ?? fallback;

/** First name only, for short chat replies. */
export const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || 'there';
