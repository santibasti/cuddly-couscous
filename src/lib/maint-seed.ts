// Demo maintenance data: reusable checklists, a profile + plans for the main assets, and a few work records in different states.
import type { Asset, InventoryItem, MaintPlan, MaintProfile, MaintRecord, MaintTaskDef, MaintTemplate } from './types';
import { checklistFrom, mcatOf, nextAfter, partsFrom } from './maintenance-core';
import { addDays } from './util';

type T = MaintTaskDef;
const task = (task_name: string, task_type: T['task_type'], description: string, freq_kind: T['freq_kind'], interval: number, est_cost: number, extra: Partial<T> = {}): T =>
  ({ task_name, task_type, description, freq_kind, ...(freq_kind === 'date' || freq_kind === 'custom' ? { interval_days: interval } : { interval_reading: interval }), est_minutes: 30, est_cost, priority: 'Normal', parts: [], ...extra });

export const TEMPLATES: Omit<MaintTemplate, 'id' | 'created_at' | 'updated_at' | 'created_by'>[] = [
  { name: 'Vehicle — van / pickup / car', mcategory: 'Vehicle', tasks: [
    task('Change engine oil', 'Service', 'Drain and replace engine oil and oil filter.', 'mileage', 5000, 3500, { est_minutes: 60 }),
    task('Check tires and tire pressure', 'Inspect', 'Check tread, damage and pressure on all four tires and the spare.', 'date', 30, 0, { est_minutes: 15 }),
    task('Brake inspection', 'Inspect', 'Inspect pads, discs, brake fluid and handbrake.', 'date', 180, 500, { est_minutes: 45 }),
    task('Battery inspection', 'Inspect', 'Check terminals, charge and water level.', 'date', 365, 0, { est_minutes: 20 }),
    task('Air-conditioning inspection', 'Inspect', 'Check cooling, filter and compressor.', 'date', 365, 800, { est_minutes: 45 }),
    task('Registration renewal reminder', 'Service', 'Renew LTO registration and keep the new OR/CR in the vehicle file.', 'date', 365, 2500, { priority: 'High', est_minutes: 120 }),
    task('Insurance renewal reminder', 'Service', 'Renew comprehensive insurance and file the policy.', 'date', 365, 18000, { priority: 'High', est_minutes: 60 }),
  ] },
  { name: 'RO/DI water system', mcategory: 'Water System', tasks: [
    task('Record input and output TDS', 'Inspect', 'Measure TDS in and out and note the readings.', 'date', 7, 0, { est_minutes: 10 }),
    task('Flush or replace filters', 'Replace', 'Flush sediment and carbon filters; replace if clogged.', 'date', 90, 1800, { est_minutes: 40 }),
    task('Check pump pressure and fittings', 'Inspect', 'Check pump pressure, fittings and connections for leaks.', 'date', 30, 0, { est_minutes: 20 }),
    task('Check hoses, reels, valves, and leaks', 'Inspect', 'Inspect hoses, reels and valves.', 'date', 30, 0, { est_minutes: 20 }),
    task('Check RO membrane performance', 'Calibrate', 'Compare rejection rate with the last test; replace the membrane if it has dropped.', 'date', 180, 6800, { est_minutes: 45, parts: [{ name: 'RO Membrane Element', category: 'Replacement Part', qty: 1, est_cost: 6800, supplier: 'AquaPole Trading' }] }),
    task('Refill or replace DI resin', 'Refill', 'Replace the DI resin when output TDS rises above 5 ppm.', 'hours', 300, 3400, { est_minutes: 60, parts: [{ name: 'DI Resin (25L bag)', category: 'Consumable', qty: 1, est_cost: 3400, supplier: 'AquaPole Trading' }] }),
    task('Clean tanks', 'Clean', 'Drain, scrub and rinse the storage tanks.', 'date', 90, 300, { est_minutes: 60 }),
  ] },
  { name: 'Pressure washer / vacuum', mcategory: 'Pressure Washer', tasks: [
    task('Check oil and fuel system', 'Inspect', 'Check engine / pump oil level and the fuel lines.', 'hours', 50, 600, { est_minutes: 20 }),
    task('Clean filters', 'Clean', 'Clean the water inlet and air filters.', 'date', 30, 0, { est_minutes: 15 }),
    task('Inspect hoses, seals, nozzles, and connections', 'Inspect', 'Look for cracks, leaks and worn nozzles.', 'date', 60, 0, { est_minutes: 20 }),
    task('Test pressure / suction performance', 'Calibrate', 'Run the machine and compare pressure / suction with the rating.', 'date', 90, 0, { est_minutes: 20 }),
  ] },
  { name: 'Safety equipment — inspection', mcategory: 'Safety Equipment', tasks: [
    task('Inspect harness, lanyards and anchors', 'Inspect', 'Check stitching, hardware and labels; retire damaged gear.', 'date', 180, 0, { priority: 'High', est_minutes: 30 }),
  ] },
];

export function seedMaintenance(c: {
  assets: Asset[]; items: InventoryItem[]; T: string; opsId: string; leaderId: string; ownerUser: string;
  base: (p: string, d?: string) => { id: string; created_at: string; updated_at: string; created_by: string }; nn: (k: string) => string;
}) {
  const { assets, items, T, base } = c;
  const A = (code: string) => assets.find((a) => a.code === code)!; const I = (code: string) => items.find((i) => i.code === code);
  const templates: MaintTemplate[] = TEMPLATES.map((t) => ({ ...base('mtt', addDays(T, -60)), ...t }));
  const tpl = (m: string) => TEMPLATES.find((t) => t.mcategory === m)!;
  const profiles: MaintProfile[] = []; const plans: MaintPlan[] = []; const records: MaintRecord[] = [];
  const track = (code: string, template: string, extra: Partial<MaintProfile> = {}) => {
    const a = A(code); const tp = TEMPLATES.find((t) => t.name === template)!;
    profiles.push({ ...base('mtp', addDays(T, -60)), asset_id: a.id, mcategory: tp.mcategory === 'Pressure Washer' ? mcatOf(a) : tp.mcategory, assigned_to: a.location, responsible_id: c.opsId,
      reading_unit: a.meter_unit === 'km' ? 'km' : a.meter_unit ? 'hours' : undefined, last_reading: a.meter_reading, reading_at: addDays(T, -3), ...extra });
    for (const d of tp.tasks) {
      const last = addDays(T, -((a.code.charCodeAt(a.code.length - 1) * 7 + d.task_name.length * 3) % Math.max(20, Math.min(d.interval_days ?? 60, 80))));
      const n = nextAfter(d, last, d.freq_kind === 'mileage' || d.freq_kind === 'hours' ? (a.meter_reading ?? 0) - (d.interval_reading ?? 0) * 0.6 : undefined);
      plans.push({ ...base('mtq', addDays(T, -60)), ...d, asset_id: a.id, responsible_id: c.opsId, active: true, template_name: tp.name, last_done: last, ...n });
    }
  };
  track('VEH-001', 'Vehicle — van / pickup / car', { registration_due: addDays(T, 9), insurance_due: addDays(T, 120) });
  track('VEH-002', 'Vehicle — van / pickup / car', { registration_due: addDays(T, 200), insurance_due: addDays(T, 40) });
  track('VEH-003', 'Vehicle — van / pickup / car', { registration_due: addDays(T, 250), insurance_due: addDays(T, 300) });
  track('ROD-001', 'RO/DI water system'); track('ROD-002', 'RO/DI water system');
  track('PWR-001', 'Pressure washer / vacuum'); track('PWR-002', 'Pressure washer / vacuum'); track('VAC-001', 'Pressure washer / vacuum', { mcategory: 'Vacuum' });
  track('SAF-001', 'Safety equipment — inspection'); track('SAF-002', 'Safety equipment — inspection');
  track('SFC-002', 'Pressure washer / vacuum', { mcategory: 'Pressure Washer' });

  const rec = (asset: Asset, plan: MaintPlan | undefined, f: Partial<MaintRecord> & { title: string }): MaintRecord => ({
    ...base('mtr', addDays(T, -5)), number: c.nn('MT'), asset_id: asset.id, plan_id: plan?.id, task_type: plan?.task_type ?? 'Repair', description: plan?.description ?? '', priority: plan?.priority ?? 'Normal',
    status: 'Scheduled', due_date: plan?.next_due, responsible_id: c.opsId, est_cost: plan?.est_cost ?? 0, approval: 'Not needed',
    parts: plan ? partsFrom(plan.parts) : [], checklist: plan ? checklistFrom(plan) : [{ label: f.title, done: false }], history: [{ at: `${addDays(T, -5)}T08:00:00.000Z`, by: 'System', action: 'Created' }], ...f,
  });
  const P = (code: string, name: string) => plans.find((p) => p.asset_id === A(code).id && p.task_name === name)!;
  // overdue, due soon, in progress, requested by a Team Leader, completed
  const oil = P('VEH-001', 'Change engine oil'); oil.next_due_reading = (A('VEH-001').meter_reading ?? 0) - 120; oil.next_due = addDays(T, -6);
  records.push(rec(A('VEH-001'), oil, { title: `${A('VEH-001').name}: Change engine oil`, due_date: oil.next_due, due_reading: oil.next_due_reading, priority: 'High' }));
  const filt = P('ROD-001', 'Flush or replace filters'); filt.next_due = addDays(T, 5);
  records.push(rec(A('ROD-001'), filt, { title: `${A('ROD-001').name}: Flush or replace filters`, due_date: filt.next_due }));
  const resin = P('ROD-002', 'Refill or replace DI resin'); const resinItem = I('SPR-003');
  records.push(rec(A('ROD-002'), resin, { title: `${A('ROD-002').name}: Refill or replace DI resin`, due_date: addDays(T, 12), parts: partsFrom(resin.parts).map((p) => ({ ...p, item_id: resinItem?.id })) }));
  const sfc = A('SFC-002');
  records.push(rec(sfc, undefined, { title: `${sfc.name}: replace bearing and skirt`, task_type: 'Repair', status: 'In Progress', started_at: `${addDays(T, -2)}T09:00:00.000Z`, due_date: addDays(T, 3), est_cost: 4200, priority: 'High', approval: 'Approved', approved_by: c.ownerUser,
    parts: [{ id: 'mp-sfc-1', name: 'Bearing set', category: 'Replacement Part', qty: 1, est_cost: 2600, supplier: 'HydroTools PH', status: 'Ordered', required_by: addDays(T, 2) }, { id: 'mp-sfc-2', name: 'Skirt brush ring', category: 'Replacement Part', qty: 1, est_cost: 1600, supplier: 'HydroTools PH', status: 'Needed' }] }));
  const pw2 = A('PWR-002');
  records.push(rec(pw2, undefined, { title: `${pw2.name}: hose leaking at the gun`, task_type: 'Repair', status: 'Requested', requested_by: c.leaderId, request_note: 'Hose leaks at the coupling when under pressure.', approval: 'Pending', priority: 'Urgent', due_date: addDays(T, 1), est_cost: 0 }));
  const hose = P('PWR-001', 'Check oil and fuel system'); hose.last_done = addDays(T, -26); hose.last_done_reading = (A('PWR-001').meter_reading ?? 0) - 12;
  records.push(rec(A('PWR-001'), hose, { title: `${A('PWR-001').name}: Check oil and fuel system`, status: 'Completed', due_date: addDays(T, -26), completed_at: `${addDays(T, -26)}T10:30:00.000Z`, completed_by: c.opsId, actual_cost: 650, provider: 'In-house', before_notes: 'Oil dark, level low.', after_notes: 'Oil changed, fuel line OK.', next_due_reading: (A('PWR-001').meter_reading ?? 0) + 38,
    checklist: [{ label: 'Check oil and fuel system', done: true }], history: [{ at: `${addDays(T, -26)}T10:30:00.000Z`, by: 'Angelica P. Santos', action: 'Completed' }] }));
  // the profile of the asset under repair
  assets.find((a) => a.id === sfc.id)!.status = 'Under Maintenance';
  return { maint_templates: templates, maint_profiles: profiles, maint_plans: plans, maint_records: records };
}
