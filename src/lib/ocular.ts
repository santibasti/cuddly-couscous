// Ocular visits: a site inspection booked in the same calendar as jobs. After it is completed the estimator (or Admin) turns it into a quotation.
import { store, RuleError } from './store';
import type { DB, Measurement, OcularStatus, OcularVisit, PanelRow, Quotation, ServiceCode } from './types';
import { docTotals, ocularConflicts, quotationLinesFromOcular, panelTotals } from './business';
import { runAutomations } from './actions';
import { addDays, isoNow, nowLocal, today } from './util';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };
const vOf = (id: string) => db().ocular_visits.find((v) => v.id === id) ?? fail('Ocular visit not found.');
const me = () => store.user?.employee_id;
/** Admin/Operations manage every visit; a Team Leader works on the visits assigned to them. */
const canWork = (v: OcularVisit) => store.can('ocular.schedule') || (store.can('ocular.complete') && !!me() && v.assignee_id === me());

export interface OcularForm {
  client_id: string; contact_person: string; contact_mobile?: string; site_id?: string; location: string; service_codes: ServiceCode[];
  start_at: string; duration_min: number; assignee_id?: string; concerns: string; access_notes: string;
}
function check(f: OcularForm, id?: string) {
  if (!f.client_id) fail('Choose the client.');
  if (!f.contact_person.trim()) fail('Enter the contact person.');
  if (!f.location.trim()) fail('Enter the service location.');
  if (!f.service_codes.length) fail('Choose the requested service type.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.start_at)) fail('Enter the proposed date and time.');
  if (f.start_at.slice(0, 10) < today()) fail('The proposed date cannot be in the past.');
  if (!(f.duration_min >= 15 && f.duration_min <= 600)) fail('Enter the expected duration (15 minutes to 10 hours).');
  if (!f.assignee_id) fail('Assign a Team Leader / estimator.');
  const clash = ocularConflicts(db(), { ...f, id });
  if (clash.length) fail(`The estimator is already booked then (${[...new Set(clash)].join(', ')}).`);
}
export function scheduleOcularVisit(f: OcularForm): OcularVisit {
  store.require('ocular.schedule');
  check(f);
  const client = db().clients.find((c) => c.id === f.client_id);
  const v = store.insert('ocular_visits', { ...f, number: store.nextNumber('OV'), contact_person: f.contact_person.trim(), location: f.location.trim(), concerns: f.concerns.trim(), access_notes: f.access_notes.trim(), status: 'Scheduled', branch_id: client?.branch_id ?? db().branches[0].id, panels: [], measurements: [], findings: '' } as never,
    `Ocular visit scheduled for ${client?.name}`) as OcularVisit;
  runAutomations();
  return v;
}
export function updateOcularVisit(id: string, f: OcularForm) {
  store.require('ocular.schedule');
  const v = vOf(id);
  if (!['Scheduled', 'Confirmed'].includes(v.status)) fail(`A ${v.status.toLowerCase()} visit cannot be changed.`);
  check(f, id);
  const r = store.update('ocular_visits', id, { ...f, contact_person: f.contact_person.trim(), location: f.location.trim(), concerns: f.concerns.trim(), access_notes: f.access_notes.trim() } as never, 'update', `Ocular visit ${v.number} updated${f.start_at !== v.start_at ? ` (rescheduled ${v.start_at} → ${f.start_at})` : ''}`);
  runAutomations();
  return r;
}
export function confirmOcularVisit(id: string) {
  store.require('ocular.schedule');
  const v = vOf(id);
  if (v.status !== 'Scheduled') fail('Only a scheduled visit can be confirmed.');
  const r = store.update('ocular_visits', id, { status: 'Confirmed' } as never, 'update', `Ocular visit ${v.number} confirmed with the client`);
  runAutomations();
  return r;
}
export function cancelOcularVisit(id: string, reason: string) {
  store.require('ocular.schedule');
  const v = vOf(id);
  if (!['Scheduled', 'Confirmed'].includes(v.status)) fail(`A ${v.status.toLowerCase()} visit cannot be cancelled.`);
  if (!reason.trim()) fail('Enter the reason for cancelling.');
  const r = store.update('ocular_visits', id, { status: 'Cancelled', cancel_reason: reason.trim() } as never, 'update', `Ocular visit ${v.number} cancelled: ${reason.trim()}`);
  runAutomations();
  return r;
}
export interface OcularResult { panels: PanelRow[]; measurements: Measurement[]; findings: string }
/** Mark the visit Completed and record what was found: panel count (floor, side, external, internal), measurements and notes. No photos, no odometer. */
export function completeOcularVisit(id: string, r: OcularResult) {
  const v = vOf(id);
  if (!canWork(v)) fail('Only the assigned Team Leader / estimator or Admin / Operations can complete this visit.');
  if (v.status === 'Converted to Quotation') fail('A quotation was already created from this visit.');
  if (!['Scheduled', 'Confirmed', 'Completed'].includes(v.status)) fail(`A ${v.status.toLowerCase()} visit cannot be completed.`);
  if (v.start_at.slice(0, 10) > today()) fail('The visit has not happened yet.');
  const glass = v.service_codes.some((c) => c === 'GLASS_EXT' || c === 'GLASS_INT');
  if (glass && !r.panels.length && !r.measurements.length) fail('Record the glass panel count (floor, side, external, internal) or a measurement.');
  if (!glass && !r.measurements.length && !r.findings.trim()) fail('Record at least one measurement or a note.');
  if (r.measurements.some((m) => !m.label.trim() || !(m.qty > 0) || !m.unit.trim())) fail('Every measurement needs a label, a quantity above zero and a unit.');
  const res = store.update('ocular_visits', id, { status: 'Completed', panels: r.panels, measurements: r.measurements, findings: r.findings.trim(), completed_at: v.completed_at ?? nowLocal(), completed_by: v.completed_by ?? store.user?.id } as never, 'update', `Ocular visit ${v.number} ${v.status === 'Completed' ? 'findings updated' : 'completed'}${r.panels.length ? ` — ${panelTotals(r.panels).total} panels counted` : ''}`);
  runAutomations();
  return res;
}
/** Create a Draft quotation from a completed visit, carrying client, location, requested services, panel count, measurements, notes and the assigned person. */
export function createQuotationFromOcular(id: string): Quotation {
  const v = vOf(id);
  if (!canWork(v)) fail('Only the assigned Team Leader / estimator or Admin / Operations can create the quotation.');
  if (v.status === 'Converted to Quotation') fail('A quotation was already created from this visit.');
  if (v.status !== 'Completed') fail('Complete the ocular visit first.');
  const client = db().clients.find((c) => c.id === v.client_id)!; const site = db().sites.find((s) => s.id === v.site_id);
  const { items, notes } = quotationLinesFromOcular(db(), v);
  if (!items.length) fail('There is nothing to quote: add the requested services.');
  const emp = db().employees.find((e) => e.id === v.assignee_id)?.full_name;
  const pt = panelTotals(v.panels);
  const scope = [
    `${v.service_codes.map((c) => db().services.find((s) => s.code === c)?.name).join(', ')} at ${v.location}.`,
    `Based on the ocular visit ${v.number} on ${v.start_at.slice(0, 10)}${emp ? ` by ${emp}` : ''}.`,
    v.concerns && `Client concerns / requested scope: ${v.concerns}`,
    v.panels.length ? `Glass panels counted: ${pt.external} external, ${pt.internal} internal (${pt.total} total) across ${v.panels.length} area(s): ${v.panels.map((p) => `${p.area} ${p.side} ${p.external}/${p.internal}`).join('; ')}.` : '',
    v.measurements.length ? `Measurements: ${v.measurements.map((m) => `${m.label} ${m.qty} ${m.unit}`).join('; ')}.` : '',
    v.findings && `Notes: ${v.findings}`, v.access_notes && `Access: ${v.access_notes}`, ...notes,
  ].filter(Boolean).join('\n');
  const q = store.insert('quotations', {
    number: store.nextNumber('QT'), client_id: v.client_id, site_id: site?.id ?? v.site_id, issue_date: today(), valid_until: addDays(today(), db().settings.quote_validity_days), scope, items,
    vat_mode: client.vat_status === 'VAT-registered' ? 'exclusive' : 'none', vat_rate: db().settings.vat_rate, discount: 0, terms: db().settings.default_terms, status: 'Draft', branch_id: v.branch_id,
    ocular_visit_id: v.id, ocular_assignee_id: v.assignee_id, ocular_panels: v.panels, ocular_measurements: v.measurements,
  } as never, `Quotation created from ocular visit ${v.number}`) as Quotation;
  store.update('ocular_visits', id, { status: 'Converted to Quotation' as OcularStatus, quotation_id: q.id, converted_at: isoNow() } as never, 'update', `Ocular visit ${v.number} converted to quotation ${q.number}`);
  void docTotals;
  runAutomations();
  return q;
}
