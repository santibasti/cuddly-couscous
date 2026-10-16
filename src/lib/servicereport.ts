// Service Accomplishment Report: a simplified, per-service report tagged to a booking. The sections are filled from a template for each
// service on the booking, the crew edits them, adds photos (before / after / detail) and the PDF lays everything out automatically.
import { fmtDate } from './util';
import { store, RuleError } from './store';
import type { DB, Job, ReportPhoto, ReportSection, ServiceReport } from './types';

const db = (): DB => store.getDB();
const fail = (m: string): never => { throw new RuleError(m); };

export const FREQUENCIES = ['One-time', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'] as const;
export const SECTION_TITLES: Record<string, string> = { scope: 'Scope of work', prework: 'Pre-work assessment', method: 'Cleaning methodology', findings: 'Post-cleaning findings & observations', limits: 'Limitations of service', recs: 'Recommendations', equipment: 'Equipment utilized', safety: 'Safety measures', completion: 'Completion confirmation' };
export const SECTION_ORDER = ['scope', 'prework', 'method', 'findings', 'limits', 'recs', 'equipment', 'safety', 'completion'];

interface Tpl { label: string; scope: string; prework: string[]; method: string[]; findings: string[]; limits: string[]; recs: string[]; equipment: string[]; safety: string[]; done: string }
const COMMON_SAFETY = ['Appropriate PPE was utilized by the cleaning personnel.', 'Equipment was inspected and properly positioned prior to use.', 'Cleaning was done with consideration for the surrounding property, landscaping, frames, seals and adjacent surfaces.', 'The work area was cleared following completion.'];
const TEMPLATES: Record<string, Tpl> = {
  GLASS_EXT: {
    label: 'External glass cleaning',
    scope: 'The scheduled external glass cleaning covered the designated exterior glass panels and accessible glass surfaces within the agreed service areas. The objective is to remove accumulated dust, dirt, environmental contaminants and other removable surface deposits while maintaining the overall cleanliness and appearance of the exterior glass.',
    prework: ['Normal accumulation of dust and environmental contaminants', 'Light surface dirt consistent with regular exterior exposure', 'No significant watermark buildup observed on the exterior glass panels'],
    method: ['Initial inspection of the designated glass panels', 'Agitation of the glass surfaces using soft cleaning brushes', 'Removal of accumulated dust, dirt and environmental contaminants', 'Final rinse using ultra-pure deionized (DI) water', 'Natural spot-free drying, with no chemical residue on the glass'],
    findings: ['All designated exterior glass panels were successfully cleaned.', 'Dust, dirt and removable environmental contaminants were effectively removed.', 'The glass surfaces were left clean and clear.', 'No significant watermarks were observed after cleaning.'],
    limits: ['Standard cleaning removes removable contaminants such as dust, dirt, light environmental buildup and surface grime.', 'It does not include glass restoration, polishing, mineral-deposit restoration, scratch removal or other corrective treatment for permanent or deeply bonded glass conditions.'],
    recs: ['Continue the regular glass cleaning schedule to prevent excessive buildup and to monitor the glass condition.', 'Any watermarks or marks that remain should be evaluated separately to find out whether they are removable mineral deposits or have affected the glass surface.'],
    equipment: ['TopMop Infinity Series Water-Fed Pole System', 'Ultra-pure deionized water system', 'Carbon fiber water-fed poles', 'Soft nylon glass cleaning brushes', 'Professional glass cleaning tools', 'Appropriate PPE and safety equipment'],
    safety: [...COMMON_SAFETY, 'Telescopic water-fed poles were used for elevated glass where applicable, reducing unnecessary work at height.'],
    done: 'All designated exterior glass surfaces were cleaned and removable dirt and environmental contaminants were addressed.',
  },
  GLASS_INT: {
    label: 'Interior glass cleaning',
    scope: 'The service covered the designated interior glass surfaces, frames and sills within the agreed areas, cleaned by hand with the floors and furniture protected.',
    prework: ['Dust and fingerprints on the interior glass', 'Furniture and fixtures near the windows were moved or protected where needed'],
    method: ['Drop sheets placed to protect floors and furniture', 'Glass washed with a neutral cleaner and microfiber applicator', 'Squeegee finish and detailing of frames and sills', 'Work area wiped and cleared'],
    findings: ['All designated interior glass was cleaned.', 'Fingerprints, dust and surface marks were removed.', 'The glass was left streak-free.'],
    limits: ['Standard cleaning does not include the removal of etching, scratches or permanent staining on the glass.'],
    recs: ['Keep items clear of the windows before the next scheduled cleaning.'],
    equipment: ['Microfiber cloths and applicators', 'Squeegees', 'Neutral glass cleaner', 'Drop sheets', 'Appropriate PPE'],
    safety: COMMON_SAFETY,
    done: 'All designated interior glass surfaces were cleaned to a clear, streak-free finish.',
  },
  ROOF: {
    label: 'Roof cleaning',
    scope: 'The service covered the designated roof areas, cleaned with a low-pressure rinse and soft brushing, without damaging the roofing material.',
    prework: ['Roof condition inspected before work, including moss, algae, dirt and debris', 'Anchor points, access and edge protection were checked before the crew went up'],
    method: ['Safety setup: anchor points, harnesses and barricades', 'Removal of loose debris and leaves', 'Soft-brush scrubbing and low-pressure rinse of moss, algae and stains', 'Final rinse of the roof and gutters'],
    findings: ['The designated roof areas were cleaned.', 'Loose debris, moss and removable stains were removed.', 'The roof surface was left clean and the gutters rinsed clear.'],
    limits: ['Cleaning does not repair roofing, remove permanent discoloration or treat leaks.', 'Roofs that are too steep or fragile may need extra safety measures and a separate quotation.'],
    recs: ['Repeat roof cleaning periodically to limit moss and algae regrowth.', 'Have any damaged or loose roofing checked by a roofing contractor.'],
    equipment: ['Low-pressure rinse equipment', 'Soft brushes', 'Eco-safe roof cleaner (where needed)', 'Fall-protection harnesses and anchor lines', 'Appropriate PPE'],
    safety: [...COMMON_SAFETY, 'Work at height was done with certified fall-protection equipment.'],
    done: 'The designated roof areas were cleaned and the work area was cleared.',
  },
  WALL: {
    label: 'Wall cleaning',
    scope: 'The service covered the designated wall surfaces, cleaned with a low-pressure wash and soft brushing to protect the paint and finish.',
    prework: ['Dust, dirt, moss or stains on the wall surface', 'Condition of the paint and finish checked before cleaning'],
    method: ['Pre-wetting of the surface', 'Soft-brush scrubbing with eco-safe cleaner where needed', 'Rinse of the area, with the wash water directed away'],
    findings: ['The designated wall surfaces were cleaned.', 'Dirt, moss and removable stains were removed.'],
    limits: ['Cleaning does not include repainting, paint-peeling repair or removal of permanent stains and oil or paint marks.'],
    recs: ['Repeat cleaning periodically to keep the walls free of moss and dirt buildup.'],
    equipment: ['Low-pressure washer', 'Soft brushes', 'Eco-safe cleaner', 'Appropriate PPE'],
    safety: COMMON_SAFETY,
    done: 'The designated wall surfaces were cleaned and the work area was cleared.',
  },
  FLOOR: {
    label: 'Floor / hardscape cleaning',
    scope: 'The service covered the designated floor and hardscape areas, cleaned with a surface cleaner and low-pressure wash.',
    prework: ['Dirt, moss, algae or stains on the surface', 'Drainage for the wash water was checked'],
    method: ['Sweeping of loose dirt and debris', 'Washing with a surface cleaner and degreaser where needed', 'Rinse, with the wash water rinsed away or collected'],
    findings: ['The designated floor and hardscape areas were cleaned.', 'Dirt, moss and removable stains were removed.'],
    limits: ['Cleaning does not include sealing, polishing, repair or removal of permanent stains and deeply bonded oil.'],
    recs: ['Repeat cleaning periodically to prevent slippery moss and algae buildup.'],
    equipment: ['Surface cleaner', 'Low-pressure washer', 'Stiff brushes', 'Eco-safe degreaser', 'Appropriate PPE'],
    safety: COMMON_SAFETY,
    done: 'The designated floor and hardscape areas were cleaned and the work area was cleared.',
  },
  SOLAR: {
    label: 'Solar panel cleaning',
    scope: 'The service covered the designated solar panels, cleaned with deionized water and a soft brush only, with no chemicals and no pressure washer, to protect the panel coating.',
    prework: ['Panels were inspected for dust, bird droppings and visible cracks before cleaning', 'Panel temperature and access conditions were checked'],
    method: ['Inspection of the panels and mounting', 'Brushing with a soft brush and deionized water', 'Final rinse for a spot-free finish'],
    findings: ['All designated solar panels were cleaned.', 'Dust and bird droppings were removed.', 'No new damage was found during cleaning.'],
    limits: ['Cleaning does not include electrical testing, repair or performance guarantees.', 'Cracked or damaged panels should be referred to the system installer.'],
    recs: ['Repeat cleaning every 3 to 6 months, or sooner in dusty areas, to maintain performance.'],
    equipment: ['Water-fed pole system', 'Deionized water', 'Soft-bristle brushes', 'Appropriate PPE and fall protection'],
    safety: [...COMMON_SAFETY, 'Panels were cleaned when cool, and no chemicals or pressure washers were used.'],
    done: 'All designated solar panels were cleaned and the work area was cleared.',
  },
  ACP: {
    label: 'ACP / cladding cleaning',
    scope: 'The service covered the designated ACP and cladding panels, cleaned with a pH-neutral cleaner and a soft brush to keep the finish intact.',
    prework: ['Dirt, streaking and weathering on the panels', 'Condition of the panel finish and joints'],
    method: ['Top-down rinse of loose dirt', 'Washing with pH-neutral cleaner and soft brush', 'Final rinse and natural drying'],
    findings: ['The designated panels were cleaned.', 'Dirt and streaking were removed and the finish was left intact.'],
    limits: ['Cleaning does not include repair or refinishing of faded or damaged cladding.'],
    recs: ['Clean periodically to prevent buildup that can stain the panels.'],
    equipment: ['Soft brushes', 'pH-neutral cleaner', 'Low-pressure rinse', 'Work-at-height equipment', 'Appropriate PPE'],
    safety: [...COMMON_SAFETY, 'Work at height was done with certified equipment.'],
    done: 'The designated ACP / cladding panels were cleaned and the work area was cleared.',
  },
  CEILING: {
    label: 'Ceiling cleaning',
    scope: 'The service covered the designated ceilings, cleaned dry or damp depending on the material, with drop sheets protecting everything below.',
    prework: ['Dust, cobwebs and marks on the ceiling', 'Ceiling material checked to choose dry or damp cleaning'],
    method: ['Floors and furniture covered', 'Dust and cobwebs removed with microfiber tools and a vacuum', 'Spot cleaning with a damp cloth where the material allows'],
    findings: ['The designated ceilings were cleaned.', 'Dust, cobwebs and removable marks were removed.'],
    limits: ['Cleaning does not include repainting or repair of stained or water-damaged ceilings.'],
    recs: ['Repeat periodic cleaning; have water-damaged areas repaired separately.'],
    equipment: ['Microfiber tools', 'Dry sponge', 'Vacuum', 'Drop sheets', 'Appropriate PPE'],
    safety: COMMON_SAFETY,
    done: 'The designated ceilings were cleaned and the work area was cleared.',
  },
  GUTTER: {
    label: 'Gutter cleaning',
    scope: 'The service covered the designated gutters and downpipes, cleared by hand and flushed so that rainwater flows freely.',
    prework: ['Leaves and debris blocking the gutters', 'Condition of joints and outlets'],
    method: ['Removal of leaves and debris by hand', 'Flushing of the gutters and downpipes', 'Check of joints and outlets for blockages and leaks'],
    findings: ['The designated gutters were cleared.', 'Water flows freely through the gutters and downpipes.'],
    limits: ['Cleaning does not include repair or replacement of damaged gutters.'],
    recs: ['Clear the gutters before every rainy season, or more often near trees.'],
    equipment: ['Gloves and scoops', 'Hose', 'Work-at-height equipment', 'Appropriate PPE'],
    safety: [...COMMON_SAFETY, 'Work at height was done with certified equipment.'],
    done: 'The designated gutters were cleared and the work area was cleaned.',
  },
  OTHER: {
    label: 'Property-care service',
    scope: 'The scheduled property-care service was carried out in the agreed service areas.',
    prework: ['A visual inspection of the designated areas was done before work started'],
    method: ['The service was carried out following TopMop procedures'],
    findings: ['The service was completed in the designated areas.'],
    limits: ['The service covers the agreed scope only.'],
    recs: ['Continue regular maintenance to keep the property in good condition.'],
    equipment: ['Professional cleaning tools', 'Appropriate PPE and safety equipment'],
    safety: COMMON_SAFETY,
    done: 'The scheduled service was completed in the designated areas.',
  },
};
export const SERVICE_TEMPLATE_CODES = Object.keys(TEMPLATES);
const tplOf = (code: string): Tpl => TEMPLATES[code] ?? TEMPLATES.OTHER;
const dedupe = (a: string[]) => [...new Set(a)];
const bullets = (a: string[]) => dedupe(a).map((x) => `- ${x}`).join('\n');

/** Section texts for the services of a report (one service: plain; several: each service gets its own sub-heading). */
export function buildSections(codes: string[], freq = 'One-time'): ReportSection[] {
  const list = codes.length ? codes : ['OTHER'];
  const multi = list.length > 1; const t = list.map(tplOf);
  const per = (f: (x: Tpl) => string) => t.map((x) => (multi ? `${x.label}:\n` : '') + f(x)).join('\n\n');
  const names = t.map((x) => x.label.toLowerCase()).join(', ');
  const recur = freq !== 'One-time' ? `\n\nThe property is on a ${freq.toLowerCase()} maintenance schedule, which helps prevent excessive buildup. It is recommended to continue it.` : '';
  const body: Record<string, string> = {
    scope: t.map((x) => x.scope).join('\n\n'),
    prework: per((x) => bullets(x.prework)),
    method: per((x) => bullets(x.method)),
    findings: per((x) => bullets(x.findings)),
    limits: per((x) => bullets(x.limits)),
    recs: per((x) => bullets(x.recs)) + recur,
    equipment: bullets(t.flatMap((x) => x.equipment)),
    safety: bullets(t.flatMap((x) => x.safety)),
    completion: `TopMop Window Cleaning Solutions Corp. confirms that the scheduled ${names} service was completed.\n\n${dedupe(t.map((x) => x.done)).join(' ')}`,
  };
  return SECTION_ORDER.map((key) => ({ key, title: SECTION_TITLES[key], body: body[key] }));
}

/** Splits a section body into paragraphs and bullet lists for display / PDF. */
export function parseBody(body: string): ({ kind: 'p'; text: string } | { kind: 'ul'; items: string[] })[] {
  const out: ({ kind: 'p'; text: string } | { kind: 'ul'; items: string[] })[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim(); if (!t) continue;
    const m = t.match(/^[-•*]\s+(.*)$/);
    if (m) { const last = out[out.length - 1]; if (last?.kind === 'ul') last.items.push(m[1]); else out.push({ kind: 'ul', items: [m[1]] }); }
    else out.push({ kind: 'p', text: t });
  }
  return out;
}

/** Auto-arrangement of the photos: Before / After pairs side by side first, then the remaining photos in a 2-column grid. */
export function arrangePhotos(photos: ReportPhoto[]): { pairs: [ReportPhoto, ReportPhoto][]; rest: ReportPhoto[] } {
  const before = photos.filter((p) => p.group === 'Before'); const after = photos.filter((p) => p.group === 'After');
  const n = Math.min(before.length, after.length);
  const pairs = Array.from({ length: n }, (_, i) => [before[i], after[i]] as [ReportPhoto, ReportPhoto]);
  return { pairs, rest: [...before.slice(n), ...after.slice(n), ...photos.filter((p) => p.group === 'Detail')] };
}

const teamOf = (d: DB, job: Job) => [job.leader_id, ...job.crew_ids].filter(Boolean).map((id) => d.employees.find((e) => e.id === id)?.full_name).filter(Boolean).join(', ');
const canWork = (job: Job) => store.can('jobs.all') || (store.can('dispatch.run') && !!store.user?.employee_id && (job.leader_id === store.user.employee_id || job.crew_ids.includes(store.user.employee_id)));

/** Number of calendar days a project runs (start and end both count); 1 when there is no end date. */
export const serviceDays = (r: Pick<ServiceReport, 'service_date' | 'service_end_date'>) => (r.service_date && r.service_end_date && r.service_end_date > r.service_date ? Math.round((Date.parse(r.service_end_date) - Date.parse(r.service_date)) / 86400000) + 1 : 1);
/** "5 Nov 2026" or "5 Nov 2026 – 7 Nov 2026 (3 days)" */
export const serviceDatesText = (r: Pick<ServiceReport, 'service_date' | 'service_end_date'>) => (!r.service_date ? '' : serviceDays(r) > 1 ? `${fmtDate(r.service_date)} – ${fmtDate(r.service_end_date!)} (${serviceDays(r)} days)` : fmtDate(r.service_date));

// SR-<booking number>, e.g. SR-JOB-2026-0007; a second report on the same booking gets -2, -3 …
export const reportNumber = (d: Pick<DB, 'service_reports'>, jobNumber: string) => {
  const base = `SR-${jobNumber}`; const n = (d.service_reports ?? []).filter((r) => r.number === base || /^-\d+$/.test(r.number.slice(base.length)) && r.number.startsWith(base)).length;
  return n ? `${base}-${n + 1}` : base;
};

export function createServiceReport(jobId: string): ServiceReport {
  const d = db(); const job = d.jobs.find((j) => j.id === jobId && !j.deleted_at) ?? fail('Booking not found.');
  if (!canWork(job)) fail('Only the assigned Team Leader or Admin / Operations can make a service report for this booking.');
  const site = d.sites.find((s) => s.id === job.site_id); const client = d.clients.find((c) => c.id === job.client_id);
  const codes = job.service_codes.length ? job.service_codes : ['OTHER'];
  const names = codes.map((c) => d.services.find((s) => s.code === c)?.name ?? c).join(', ');
  return store.insert('service_reports', {
    number: reportNumber(d, job.number), job_id: job.id, client_id: job.client_id, title: names, location: [site?.name, site?.address].filter(Boolean).join(', ') || client?.address || '',
    team: teamOf(d, job), service_date: job.start_at.slice(0, 10), service_end_date: job.end_at && job.end_at.slice(0, 10) > job.start_at.slice(0, 10) ? job.end_at.slice(0, 10) : undefined, report_date: new Date().toISOString().slice(0, 10), frequency: 'One-time',
    service_codes: codes, sections: buildSections(codes), photos: [], prepared_by: store.user?.name, status: 'Draft',
  } as never, `Service report started for ${job.number}`) as ServiceReport;
}
export function updateServiceReport(id: string, patch: Partial<Pick<ServiceReport, 'title' | 'location' | 'team' | 'service_date' | 'service_end_date' | 'frequency' | 'service_codes' | 'sections' | 'photos'>>) {
  const r = db().service_reports.find((x) => x.id === id && !x.deleted_at) ?? fail('Service report not found.');
  const job = db().jobs.find((j) => j.id === r.job_id); if (!job || !canWork(job)) fail('Only the assigned Team Leader or Admin / Operations can edit this report.');
  if (r.status === 'Final') fail('A final report is locked. Reopen it first.');
  if ((patch.photos?.length ?? 0) > 40) fail('A report can hold up to 40 photos.');
  return store.update('service_reports', id, patch as never, 'update', `Service report ${r.number} updated`);
}
export function setReportStatus(id: string, status: 'Draft' | 'Final') {
  const r = db().service_reports.find((x) => x.id === id && !x.deleted_at) ?? fail('Service report not found.');
  const job = db().jobs.find((j) => j.id === r.job_id); if (!job || !canWork(job)) fail('Only the assigned Team Leader or Admin / Operations can change this report.');
  if (status === 'Final' && !r.sections.some((s) => s.body.trim())) fail('The report is empty.');
  if (status === 'Draft' && !store.can('jobs.all')) fail('Only Admin / Operations can reopen a final report.');
  return store.update('service_reports', id, { status, finalized_at: status === 'Final' ? new Date().toISOString() : undefined, ...(status === 'Draft' ? { signature: undefined, signed_by: undefined, signed_at: undefined } : {}) } as never, 'approve', `Service report ${r.number} marked ${status}`);
}
export function signServiceReport(id: string, signature: string) {
  const r = db().service_reports.find((x) => x.id === id && !x.deleted_at) ?? fail('Service report not found.');
  if (!store.can('jobs.all')) fail('Only Admin / Operations can sign a service report for TopMop.');
  if (!signature) fail('Please sign first.');
  if (!r.sections.some((s) => s.body.trim())) fail('The report is empty.');
  const now = new Date().toISOString();
  return store.update('service_reports', id, { status: 'Final', finalized_at: r.finalized_at ?? now, signature, signed_by: store.user?.name, signed_at: now } as never, 'approve', `Service report ${r.number} signed by TopMop`);
}
export function deleteServiceReport(id: string) {
  const r = db().service_reports.find((x) => x.id === id && !x.deleted_at) ?? fail('Service report not found.');
  const job = db().jobs.find((j) => j.id === r.job_id); if (!job || !canWork(job)) fail('Only the assigned Team Leader or Admin / Operations can delete this report.');
  if ((r.status === 'Final' || r.signature) && !store.can('jobs.all')) fail('Only Admin / Operations can delete a final or signed report.');
  return store.remove('service_reports', id);
}
export const reportsOfJob = (d: Pick<DB, 'service_reports'>, jobId: string) => (d.service_reports ?? []).filter((r) => r.job_id === jobId && !r.deleted_at);
