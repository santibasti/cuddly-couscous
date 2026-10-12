// Ocular visits: a site inspection booked in the same calendar as jobs. After it is completed the estimator (or Admin) turns it into a quotation.
import { defaultCrew, defaultDisclaimer } from './quote-text';
import { store, RuleError } from './store';
import type { DB, Measurement, OcularCheck, OcularStatus, OcularVisit, PanelRow, Quotation, ServiceCode } from './types';
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
export interface OcularReportInput { report_surface: string; report_hazards: string; report_recommendation: string; report_services: ServiceCode[]; report_days?: number; report_crew?: string }
const reportOk = (v: OcularVisit) => { if (!['Completed', 'Converted to Quotation'].includes(v.status)) fail('Complete the ocular visit before preparing its report.'); if (!canWork(v)) fail('Only the assigned Team Leader / estimator or Admin / Operations can prepare the report.'); if (v.client_sig) fail('The report was signed by the client and is locked. Admin / Operations can reopen it.'); };
/** The estimator's part of the report: surface condition, hazards and access, recommended services, estimated days and crew. */
export function saveOcularReport(id: string, r: OcularReportInput) {
  const v = vOf(id); reportOk(v);
  if (!r.report_services.length) fail('Choose at least one recommended service.');
  if (r.report_days !== undefined && !(r.report_days >= 1)) fail('Estimated working days must be at least 1.');
  return store.update('ocular_visits', id, { ...r, report_surface: r.report_surface.trim(), report_hazards: r.report_hazards.trim(), report_recommendation: r.report_recommendation.trim(), report_crew: r.report_crew?.trim() || undefined, report_at: isoNow() } as never, 'update', `Ocular report ${v.number} saved`);
}
/** The client signs to acknowledge what was found and recommended; the report is then locked. */
export function signOcularReport(id: string, s: { name: string; client_sig: string; assessor_sig?: string }) {
  const v = vOf(id);
  if (!['Completed', 'Converted to Quotation'].includes(v.status)) fail('Complete the ocular visit first.');
  if (!canWork(v)) fail('Only the assigned Team Leader / estimator or Admin / Operations can take the client signature.');
  if (v.client_sig) fail('The report is already signed.');
  if (!v.report_at) fail('Save the report (recommended services and conditions) before the client signs.');
  if (!s.name.trim()) fail('Enter the client representative\'s printed name.');
  if (!s.client_sig) fail('The client has not signed yet.');
  const at = isoNow();
  return store.update('ocular_visits', id, { client_sig: s.client_sig, client_sig_name: s.name.trim(), client_sig_at: at, ...(s.assessor_sig ? { assessor_sig: s.assessor_sig, assessor_sig_at: at } : {}) } as never, 'update', `Ocular report ${v.number} signed by ${s.name.trim()}`);
}
/** Admin / Operations reopen a signed report (clears the signature) so it can be corrected and signed again. */
export function reopenOcularReport(id: string, reason: string) {
  store.require('ocular.schedule'); const v = vOf(id);
  if (!v.client_sig) fail('The report is not signed.'); if (!reason.trim()) fail('Give a reason for reopening the report.');
  return store.update('ocular_visits', id, { client_sig: undefined, client_sig_name: undefined, client_sig_at: undefined, assessor_sig: undefined, assessor_sig_at: undefined } as never, 'update', `Ocular report ${v.number} reopened: ${reason.trim()}`);
}
export interface OcularResult { panels: PanelRow[]; measurements: Measurement[]; findings: string; checklist?: OcularCheck[]; visit_sig?: string; visit_sig_name?: string }

/** Standard site checklist. `bad` = the answer that is a concern for the quotation (shown as a flag): "no" for good-to-have items, "yes" for problems. */
export interface CheckDef { key: string; label: string; bad: 'yes' | 'no'; group: 'general' | 'glass' | 'roof' | 'surface' | 'solar' }
export const OCULAR_CHECKLIST: CheckDef[] = [
  { key: 'access', label: 'Easy access for the crew and equipment (parking, gate, lift / stairs)', bad: 'no', group: 'general' },
  { key: 'permit', label: 'Building permit or security clearance required', bad: 'yes', group: 'general' },
  { key: 'water', label: 'Water supply available on site', bad: 'no', group: 'general' },
  { key: 'power', label: 'Power outlet available', bad: 'no', group: 'general' },
  { key: 'hours', label: 'Restricted working hours (building rules)', bad: 'yes', group: 'general' },
  { key: 'stains', label: 'Hard-water stains on the glass', bad: 'yes', group: 'glass' },
  { key: 'scratch', label: 'Scratched or damaged glass', bad: 'yes', group: 'glass' },
  { key: 'film', label: 'Tinted or film-covered glass', bad: 'yes', group: 'glass' },
  { key: 'reach', label: 'Glass out of reach of the water-fed pole (lift or rope access needed)', bad: 'yes', group: 'glass' },
  { key: 'obstruct', label: 'Plants, AC units or other obstructions near the windows', bad: 'yes', group: 'glass' },
  { key: 'steep', label: 'Roof too steep to walk on safely', bad: 'yes', group: 'roof' },
  { key: 'fragile', label: 'Fragile roofing (skylights, old sheets)', bad: 'yes', group: 'roof' },
  { key: 'rails', label: 'Safety rails or anchor points present', bad: 'no', group: 'roof' },
  { key: 'moss', label: 'Moss, algae or heavy dirt', bad: 'yes', group: 'roof' },
  { key: 'oil', label: 'Heavy oil, paint or stubborn stains', bad: 'yes', group: 'surface' },
  { key: 'mossS', label: 'Moss or algae on the surface', bad: 'yes', group: 'surface' },
  { key: 'drain', label: 'Drainage for the wash water available', bad: 'no', group: 'surface' },
  { key: 'solarReach', label: 'Solar panels reachable (ground or safe roof access)', bad: 'no', group: 'solar' },
  { key: 'solarDirt', label: 'Heavy dust, bird droppings or cracked panels', bad: 'yes', group: 'solar' },
];
export const CHECK_GROUP_LABEL: Record<CheckDef['group'], string> = { general: 'Access & site', glass: 'Glass', roof: 'Roof', surface: 'Floor / wall', solar: 'Solar panels' };
export const checkGroupsFor = (codes: string[]): CheckDef['group'][] => [
  'general', ...(codes.some((c) => c === 'GLASS_EXT' || c === 'GLASS_INT') ? ['glass' as const] : []), ...(codes.includes('ROOF') ? ['roof' as const] : []),
  ...(codes.some((c) => c === 'FLOOR' || c === 'WALL') ? ['surface' as const] : []), ...(codes.includes('SOLAR') ? ['solar' as const] : []),
];
/** The answers that are a concern (e.g. "Roof too steep: yes", "Water supply: no"). */
export const checklistConcerns = (list: OcularCheck[] | undefined) => (list ?? []).flatMap((c) => { const d = OCULAR_CHECKLIST.find((x) => x.key === c.key); return d && c.answer === d.bad ? [{ label: d.label, bad: d.bad, note: c.note }] : []; });
/** Mark the visit Completed and record what was found: panel count (floor, side, external, internal), measurements and notes. No photos, no odometer. */
export function completeOcularVisit(id: string, r: OcularResult) {
  const v = vOf(id);
  if (v.client_sig) fail('The report was signed by the client, so the findings are locked. Admin / Operations can reopen it.');
  if (!canWork(v)) fail('Only the assigned Team Leader / estimator or Admin / Operations can complete this visit.');
  if (v.status === 'Converted to Quotation') fail('A quotation was already created from this visit.');
  if (!['Scheduled', 'Confirmed', 'Completed'].includes(v.status)) fail(`A ${v.status.toLowerCase()} visit cannot be completed.`);
  if (v.start_at.slice(0, 10) > today()) fail('The visit has not happened yet.');
  const glass = v.service_codes.some((c) => c === 'GLASS_EXT' || c === 'GLASS_INT');
  if (glass && !r.panels.length && !r.measurements.length) fail('Record the glass panel count (floor, side, external, internal) or a measurement.');
  if (!glass && !r.measurements.length && !r.findings.trim()) fail('Record at least one measurement or a note.');
  if (r.measurements.some((m) => !m.label.trim() || !(m.qty > 0) || !m.unit.trim())) fail('Every measurement needs a label, a quantity above zero and a unit.');
  // the contact person signs on site to show the visit really took place (asked the first time the visit is completed)
  if (!v.visit_sig && v.status !== 'Completed') {
    if (!r.visit_sig) fail('Ask the contact person to sign to confirm the ocular visit took place.');
    if (!r.visit_sig_name?.trim()) fail("Type the contact person's printed name next to the signature.");
  }
  const sigPatch = r.visit_sig ? { visit_sig: r.visit_sig, visit_sig_name: (r.visit_sig_name ?? v.contact_person).trim(), visit_sig_at: isoNow() } : {};
  const res = store.update('ocular_visits', id, { ...sigPatch, status: 'Completed', panels: r.panels, measurements: r.measurements, findings: r.findings.trim(), checklist: r.checklist ?? v.checklist ?? [], completed_at: v.completed_at ?? nowLocal(), completed_by: v.completed_by ?? store.user?.id } as never, 'update', `Ocular visit ${v.number} ${v.status === 'Completed' ? 'findings updated' : 'completed'}${r.panels.length ? ` — ${panelTotals(r.panels).total} panels counted` : ''}`);
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
    v.report_surface && `Surface condition: ${v.report_surface}`, v.report_hazards && `Hazards / access requirements: ${v.report_hazards}`, v.report_recommendation && `Recommendation: ${v.report_recommendation}`,
    checklistConcerns(v.checklist).length ? `Site conditions to note: ${checklistConcerns(v.checklist).map((c) => `${c.label} (${c.bad === 'yes' ? 'yes' : 'no'})${c.note ? ` — ${c.note}` : ''}`).join('; ')}.` : '',
    v.findings && `Notes: ${v.findings}`, v.access_notes && `Access: ${v.access_notes}`, ...notes,
  ].filter(Boolean).join('\n');
  const q = store.insert('quotations', {
    number: store.nextNumber('QT'), client_id: v.client_id, site_id: site?.id ?? v.site_id, issue_date: today(), valid_until: addDays(today(), db().settings.quote_validity_days), scope, items,
    vat_mode: client.vat_status === 'VAT-registered' ? 'exclusive' : 'none', vat_rate: db().settings.vat_rate, discount: 0, terms: db().settings.default_terms, status: 'Draft', branch_id: v.branch_id,
    crew_size: v.report_crew?.trim() || defaultCrew(db().settings), safety_officer: true, work_days: v.report_days ?? 1, disclaimer: defaultDisclaimer(db().settings),
    ocular_visit_id: v.id, ocular_assignee_id: v.assignee_id, ocular_panels: v.panels, ocular_measurements: v.measurements,
  } as never, `Quotation created from ocular visit ${v.number}`) as Quotation;
  store.update('ocular_visits', id, { status: 'Converted to Quotation' as OcularStatus, quotation_id: q.id, converted_at: isoNow() } as never, 'update', `Ocular visit ${v.number} converted to quotation ${q.number}`);
  void docTotals;
  runAutomations();
  return q;
}
