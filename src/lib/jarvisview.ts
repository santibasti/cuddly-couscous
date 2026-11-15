// What the Jarvis screen shows, from the figures the jarvis function sends (all read-only). Missing parts arrive as { unavailable } and show as empty.
export interface JarvisJob { number: string; client: string; day: string; start: string; status: string; leader: string; crew: number }
export interface JarvisPanel {
  at: string; today: string; voice: boolean; ai: boolean;
  jobsToday: unknown; jobsTomorrow: unknown; attendanceToday: unknown; attendanceYesterday: unknown; pending: unknown; leads: unknown;
  receivables: unknown; moneyToday: unknown; quotes: unknown; handovers: unknown; alerts: unknown;
}
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = <T = Record<string, unknown>>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

export interface Summary {
  decisions: { label: string; value: string; tone: 'warn' | 'plain' }[];
  jobs: { time: string; number: string; client: string; note: string; tone: 'ok' | 'warn' | 'plain' }[]; tomorrow: number;
  crew: { present: number; late: { name: string; minutes: number }[]; absent: string[] };
  cash: { outstanding: number; overdue: number; overdueCount: number; today: number };
  pipeline: { total: number; stages: [string, number][]; approvedWeek: number; approvedValue: number };
  alerts: { when: string; title: string }[];
  tomorrowJobs: { time: string; number: string; note: string }[];
  handovers: { job: string; client: string; day: string }[];
  attention: number;                                   // how many things need the owner
}

export function summarize(p: JarvisPanel): Summary {
  const pend = obj(p.pending); const disc = arr(pend.discount_requests_waiting); const old = arr(pend.quotations_sent_over_3_days_ago_without_answer);
  const waitingHand = arr(obj(p.handovers).waiting);
  const jobs = arr<JarvisJob>(p.jobsToday);
  const noLeader = jobs.filter((j) => j.leader === 'NOT ASSIGNED' && !['Cancelled', 'Rescheduled'].includes(j.status)).length;
  const decisions: Summary['decisions'] = [
    ...disc.slice(0, 3).map((d) => ({ label: `Discount request ${String(d.number ?? '')}`, value: `₱${num(d.amount_off).toLocaleString('en-PH')} off`, tone: 'warn' as const })),
    ...(waitingHand.length ? [{ label: 'Handovers not yet signed', value: String(waitingHand.length), tone: 'warn' as const }] : []),
    ...(noLeader ? [{ label: 'Jobs today without a leader', value: String(noLeader), tone: 'warn' as const }] : []),
    { label: 'Payments to verify', value: String(num(pend.payments_awaiting_verification)), tone: 'plain' },
    { label: 'Expenses to approve', value: String(num(pend.expenses_awaiting_approval)), tone: 'plain' },
    { label: 'Quotes unanswered 3 days+', value: String(old.length), tone: 'plain' }];
  const att = obj(p.attendanceToday);
  const rec = obj(p.receivables); const money = obj(p.moneyToday); const leads = obj(p.leads); const qs = obj(p.quotes);
  return {
    decisions,
    jobs: jobs.map((j) => ({ time: j.start, number: j.number, client: j.client, note: j.leader === 'NOT ASSIGNED' ? 'No leader' : j.status, tone: j.leader === 'NOT ASSIGNED' ? 'warn' : ['Cancelled', 'Rescheduled'].includes(j.status) ? 'plain' : 'ok' })),
    tomorrow: arr(p.jobsTomorrow).length,
    crew: { present: num(att.present), late: arr<{ name: string; minutes: number }>(att.late), absent: arr<string>(att.absent) },
    cash: { outstanding: num(rec.outstanding_total), overdue: num(rec.overdue_total), overdueCount: num(rec.overdue_count), today: num(money.received) },
    pipeline: { total: num(leads.total), stages: Object.entries(obj(leads.by_stage)).map(([k, v]) => [k, num(v)] as [string, number]), approvedWeek: num(qs.approved), approvedValue: num(qs.approved_value) },
    alerts: arr<{ title: string; created_at: string }>(p.alerts).map((a) => ({ when: a.created_at, title: a.title })),
    tomorrowJobs: arr<JarvisJob>(p.jobsTomorrow).filter((j) => j && j.number).map((j) => ({ time: j.start, number: j.number, note: j.leader === 'NOT ASSIGNED' ? 'No leader' : j.status })),
    handovers: waitingHand.map((w) => ({ job: String(w.job ?? ''), client: String(w.client ?? ''), day: String(w.day ?? '') })),
    attention: disc.length + waitingHand.length + noLeader,
  };
}

/** "7:02 AM" for a time of day from a timestamp in Manila, and a short "x min ago" for the alert log. */
export const manilaClock = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 1 ? 'now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

/** Sample figures for the demo build (no live system behind it). */
export const DEMO_PANEL: JarvisPanel = {
  at: new Date().toISOString(), today: '', voice: false, ai: false,
  jobsToday: [{ number: 'JOB-0142', client: 'Sample Client A', day: '', start: '08:00', status: 'Confirmed', leader: 'Team Leader', crew: 3 }, { number: 'JOB-0143', client: 'Sample Client B', day: '', start: '09:30', status: 'Confirmed', leader: 'Team Leader', crew: 2 }, { number: 'JOB-0144', client: 'Sample Client C', day: '', start: '13:00', status: 'Confirmed', leader: 'NOT ASSIGNED', crew: 0 }],
  jobsTomorrow: [{ number: 'JOB-0145', client: 'Sample Client D', day: '', start: '08:00', status: 'Confirmed', leader: 'Team Leader', crew: 3 }, { number: 'JOB-0146', client: 'Sample Client E', day: '', start: '10:30', status: 'Confirmed', leader: 'Team Leader', crew: 2 }, { number: 'JOB-0147', client: 'Sample Client F', day: '', start: '14:00', status: 'Pending', leader: 'NOT ASSIGNED', crew: 0 }], attendanceToday: { present: 11, late: [{ name: 'Sample Crew', minutes: 12 }], absent: [] }, attendanceYesterday: {},
  pending: { discount_requests_waiting: [{ number: 'DR-0031', amount_off: 500 }], expenses_awaiting_approval: 1, payments_awaiting_verification: 2, quotations_sent_over_3_days_ago_without_answer: [{}] },
  leads: { total: 5, by_stage: { Inquiry: 4, Quotation: 1 } }, receivables: { outstanding_total: 62000, overdue_total: 38000, overdue_count: 2 }, moneyToday: { received: 18400 },
  quotes: { approved: 2, approved_value: 41000 }, handovers: { waiting: [{ job: 'JOB-0139' }] },
  alerts: [{ title: 'Discount requested', created_at: new Date(Date.now() - 22 * 60000).toISOString() }, { title: 'Quotation approved', created_at: new Date(Date.now() - 5 * 3600000).toISOString() }],
};
