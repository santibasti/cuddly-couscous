// The buttons of the Lead Flow. Each one does exactly what the existing screens do (same pricing list, same quotation and job rules, same double-booking check);
// they only save the clicks. Nothing here sends anything to a client by itself: sending a quotation or a job order stays a person's decision.
import { store } from './store';
import { addDays, today } from './util';
import { docTotals } from './business';
import { findRate, planQuote } from './quickbooking';
import { moveInquiry, saveJob, saveQuotation, setQuoteStatus } from './actions';
import { defaultCrew, defaultDisclaimer, defaultIntro, defaultMethodology, syncMethodSections } from './quote-text';
import { serviceWord } from './leadflow';
import type { Job, Quotation, ServiceCode } from './types';

const db = () => store.getDB();

/** A draft quotation for an inquiry from the price list (city package or the minimum of another service). It stays a draft until a person approves it. */
export function draftQuoteForInquiry(inquiryId: string): Quotation {
  store.require('sales.edit' as never);
  const d = db(); const inq = d.inquiries.find((i) => i.id === inquiryId && !i.deleted_at); if (!inq) throw new Error('Inquiry not found.');
  const client = d.clients.find((c) => c.id === inq.client_id); if (!client) throw new Error('The client of this inquiry was not found.');
  const site = inq.site_id ? d.sites.find((s) => s.id === inq.site_id) : undefined;
  const address = (site?.address || client.address || '').trim();
  if (!address) throw new Error('The inquiry has no address yet. Add the address, then prepare the quotation.');
  const plan = planQuote(d, { address, service: serviceWord(inq.service_codes) }, findRate(address));
  if (!plan.items.length) throw new Error('This place or service has no standard price. Open the quotation editor and price it by hand (or schedule an ocular visit).');
  const code: ServiceCode = plan.other?.code ?? (inq.service_codes[0] as ServiceCode) ?? 'GLASS_EXT';
  const set = d.settings;
  const q = saveQuotation({
    client_id: client.id, site_id: inq.site_id, inquiry_id: inq.id, issue_date: today(), valid_until: addDays(today(), set.quote_validity_days ?? 30),
    scope: `${plan.other?.name ?? 'Exterior glass / window cleaning'} at ${address}.`, items: plan.items, vat_mode: 'none', vat_rate: set.vat_rate, discount: 0, terms: set.default_terms, payment_option: 'completion', ocular_done: false,
    crew_size: defaultCrew(set), safety_officer: true, work_days: 1, disclaimer: defaultDisclaimer(set), intro: defaultIntro(set), methodology: defaultMethodology(set),
    method_sections: syncMethodSections(d.services, [code], []), status: 'Draft', branch_id: client.branch_id,
  } as never) as Quotation;
  if (inq.stage === 'Inquiry' || inq.stage === 'Ocular Visit') moveInquiry(inq.id, 'Quotation');
  return q;
}
export const sendQuote = (quoteId: string) => setQuoteStatus(quoteId, 'Sent');
export const recordClientDecision = (quoteId: string, accepted: boolean, reason?: string) => setQuoteStatus(quoteId, accepted ? 'Approved' : 'Rejected', accepted ? undefined : reason || 'Client declined');

const checklist = (names: string[]) => ['Site safety briefing & PPE check', 'Pre-work inspection & before photos', 'Cordon off / signage installed', ...names.map((n) => `Perform ${n}`), 'Post-work inspection with client rep', 'After photos & clean-up', 'Client sign-off'].map((label) => ({ label, done: false }));
export interface Team { leader?: string; crew: string[]; vehicle?: string }
/** Books the approved quotation as a job on the chosen day. With a team, the same double-booking check as the job form applies and refuses a clash. */
export function bookFromQuote(quoteId: string, date: string, time: string, team?: Team): Job {
  store.require('jobs.edit' as never);
  const d = db(); const q = d.quotations.find((x) => x.id === quoteId && !x.deleted_at); if (!q) throw new Error('Quotation not found.');
  if (q.status !== 'Approved') throw new Error('The quotation has to be approved by the client before it is booked.');
  if (d.jobs.some((j) => !j.deleted_at && j.quotation_id === q.id && !['Cancelled', 'Rescheduled'].includes(j.status))) throw new Error('This quotation is already booked.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a date.');
  const client = d.clients.find((c) => c.id === q.client_id)!; const codes = [...new Set(q.items.map((i) => i.service_code))] as ServiceCode[]; const names = codes.map((c) => d.services.find((s) => s.code === c)?.name ?? c);
  const start = `${date}T${time || '08:00'}`; const endH = Math.min(23, Number((time || '08:00').slice(0, 2)) + 9); const end = `${date}T${String(endH).padStart(2, '0')}:${(time || '08:00').slice(3)}`;
  return saveJob({
    booking_date: today(), client_id: q.client_id, site_id: q.site_id ?? '', quotation_id: q.id, branch_id: client.branch_id, service_codes: codes, scope: q.scope, start_at: start, end_at: end > start ? end : `${date}T23:59`, status: 'Confirmed',
    leader_id: team?.leader, crew_ids: team?.crew ?? [], vehicle_id: team?.vehicle, equipment_ids: [], materials: [], ppe: ['Hard hat', 'Safety boots', 'Gloves', 'Safety goggles'], checklist: checklist(names),
    findings: '', damage_report: '', equipment_condition_notes: '', contract_amount: docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).net, estimated_cost: 0,
  } as never);
}
/** Puts a team and vehicle on a booking (refused if any of them is already on another job at that time). */
export function assignTeam(jobId: string, team: Team): Job {
  store.require('jobs.edit' as never);
  const j = db().jobs.find((x) => x.id === jobId && !x.deleted_at); if (!j) throw new Error('Booking not found.');
  const { id: _id, created_at: _c, updated_at: _u, created_by: _b, ...rest } = j as Job & { created_by?: string };   // eslint-disable-line @typescript-eslint/no-unused-vars
  return saveJob({ ...rest, id: j.id, number: j.number, leader_id: team.leader, crew_ids: team.crew, vehicle_id: team.vehicle ?? j.vehicle_id } as never);
}
