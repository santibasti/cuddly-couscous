import { addDays, diffDays, isWeekend } from './dates';
import { SERVICES } from './logic';
import { customerStats, isPaidInFull, paidTotal } from './crm';
import type { Data, ServiceType } from './types';

export type Verdict = 'go' | 'conditions' | 'wait';
export interface Reason { tone: 'good' | 'warn' | 'bad'; text: string }
export interface Advice {
  verdict: Verdict;
  headline: string;
  reasons: Reason[];
  /** Suggested deposit, as a share of the price. */
  deposit: number;
  /** A later start date when the team is too booked to begin on time. */
  suggestedStart?: string;
}

export interface JobIdea { customerId: string; service: ServiceType; budget: number; start: string; target: string; excludeId?: string }

const workdays = (a: string, b: string) => { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (!isWeekend(d)) n += 1; return n; };

/** Average hours and contract value of finished jobs, by service, from the shop's own history. */
export function serviceNorms(d: Data, service: ServiceType) {
  const done = d.projects.filter((p) => p.service === service && p.status === 'delivered' && !p.backjobOf && p.budget > 0);
  const hours = done.map((p) => d.tasks.filter((t) => t.projectId === p.id).reduce((s, t) => s + (t.actualHours || t.estHours), 0)).filter((h) => h > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return { jobs: done.length, hours: hours.length ? avg(hours) : SERVICES[service].typicalDays * 4, avgPrice: avg(done.map((p) => p.budget)) };
}

/** Hours the team has free in the first stretch of the job, after what is already booked. */
function freeHours(d: Data, from: string, to: string, excludeId?: string) {
  const team = d.mechanics.filter((m) => m.active);
  const cap = team.reduce((s, m) => s + m.dailyHours, 0) * workdays(from, to);
  const active = new Set(d.projects.filter((p) => p.status === 'active' && p.id !== excludeId).map((p) => p.id));
  const booked = d.tasks.filter((t) => t.status !== 'done' && active.has(t.projectId) && t.date >= from && t.date <= to).reduce((s, t) => s + t.estHours, 0);
  return cap - booked;
}

/** Should the shop take this job? Plain rules, each with a reason the owner can read. */
export function adviseJob(d: Data, job: JobIdea): Advice {
  const reasons: Reason[] = [];
  const norms = serviceNorms(d, job.service);
  const customer = d.customers.find((c) => c.id === job.customerId);
  const span = Math.max(1, diffDays(job.start, job.target) + 1);
  let suggestedStart: string | undefined;
  let deposit = SERVICES[job.service].pricing === 'package' ? 0.5 : 0.3;

  // 1. Is there room in the shop?
  const days = Math.min(span, 14);
  const need = norms.hours * (days / span);
  const horizonEnd = addDays(job.start, days - 1);
  const free = freeHours(d, job.start, horizonEnd, job.excludeId);
  if (free >= need * 1.2) reasons.push({ tone: 'good', text: `The team has room: about ${Math.round(free)}h free in the first ${days} day${days === 1 ? '' : 's'}, and the job needs about ${Math.round(need)}h.` });
  else {
    const tone = free < need * 0.5 ? 'bad' : 'warn';
    reasons.push({ tone, text: `The team is busy: about ${Math.max(0, Math.round(free))}h free in the first ${days} day${days === 1 ? '' : 's'}, and the job needs about ${Math.round(need)}h.` });
    for (let i = 1; i <= 45; i += 1) {
      const s = addDays(job.start, i);
      if (freeHours(d, s, addDays(s, days - 1), job.excludeId) >= need * 1.2) { suggestedStart = s; break; }
    }
    if (suggestedStart) reasons.push({ tone: 'warn', text: `The first date with enough room is ${suggestedStart}. Promise that date, not the one asked for.` });
  }

  // 2. Is the deadline realistic?
  const typical = SERVICES[job.service].typicalDays;
  if (span < typical * 0.6) reasons.push({ tone: 'bad', text: `Only ${span} day${span === 1 ? '' : 's'} is asked for. This kind of job usually takes about ${typical}.` });
  else if (span >= typical * 0.6 && span < typical * 0.85) reasons.push({ tone: 'warn', text: `The deadline is tight: ${span} days, against about ${typical} usually.` });
  else reasons.push({ tone: 'good', text: `The deadline is realistic (${span} day${span === 1 ? '' : 's'}, usually about ${typical}).` });

  // 3. Is the price right?
  if (!job.budget) reasons.push({ tone: 'bad', text: 'There is no price yet. Quote the job before agreeing to start.' });
  else if (norms.jobs >= 3 && SERVICES[job.service].pricing === 'estimate') {
    const ratio = job.budget / norms.avgPrice;
    if (ratio < 0.7) reasons.push({ tone: 'bad', text: `The price is well under your usual: ₱${Math.round(job.budget).toLocaleString('en-PH')} against about ₱${Math.round(norms.avgPrice).toLocaleString('en-PH')} on ${norms.jobs} past ${SERVICES[job.service].label.toLowerCase()} jobs.` });
    else if (ratio < 0.9) reasons.push({ tone: 'warn', text: `The price is a little under your usual of about ₱${Math.round(norms.avgPrice).toLocaleString('en-PH')}.` });
    else reasons.push({ tone: 'good', text: `The price is in line with ${norms.jobs} past ${SERVICES[job.service].label.toLowerCase()} jobs.` });
  } else if (SERVICES[job.service].pricing === 'package') reasons.push({ tone: 'good', text: 'The price comes from your price list.' });

  // 4. What do we know about the client?
  if (customer) {
    const st = customerStats(d, customer);
    const finished = st.jobs.filter((p) => p.status === 'delivered');
    const owing = st.jobs.filter((p) => p.status !== 'delivered' && p.id !== job.excludeId && p.budget > paidTotal(p) && !isPaidInFull(p)).reduce((s, p) => s + (p.budget - paidTotal(p)), 0);
    const backjobs = st.jobs.filter((p) => p.backjobOf).length;
    if (st.kind === 'new') {
      deposit = Math.max(deposit, 0.5);
      reasons.push({ tone: 'warn', text: 'New client with no history. Ask for a deposit of at least half before any work starts.' });
    } else {
      reasons.push({ tone: 'good', text: `Past client: ${finished.length} finished job${finished.length === 1 ? '' : 's'}, ₱${Math.round(st.ltv).toLocaleString('en-PH')} paid so far.` });
      if (backjobs > 0) reasons.push({ tone: 'warn', text: `${backjobs} earlier job${backjobs === 1 ? ' was a' : 's were'} back job${backjobs === 1 ? '' : 's'} for this client. Agree clearly what is included.` });
    }
    if (owing > 0) { deposit = Math.max(deposit, 0.5); reasons.push({ tone: 'warn', text: `They still owe about ₱${Math.round(owing).toLocaleString('en-PH')} on a job in the shop. Settle it, or take a bigger deposit.` }); }
  }

  const bad = reasons.filter((r) => r.tone === 'bad').length;
  const warn = reasons.filter((r) => r.tone === 'warn').length;
  const verdict: Verdict = bad > 0 ? 'wait' : warn > 0 ? 'conditions' : 'go';
  const headline = verdict === 'go' ? 'Go ahead' : verdict === 'conditions' ? 'Go ahead, with conditions' : 'Not yet';
  return { verdict, headline, reasons, deposit, suggestedStart };
}
