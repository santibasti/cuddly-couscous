// Realistic demo data for TopMop Window Cleaning Solutions Corp. Everything is generated relative to today (Manila),
// so the dashboard always shows current activity. Names, TINs and amounts are fictional sample data.
import type {
  Asset, Attendance, FollowUp, FollowUpRule, BackJob, Checkout, OcularVisit, QuoteImage, PanelRow, Client, ClientFeedback, DB, PaymentConfirmation, DiscountRequest, IncidentReport, JobWorkflow, Variation, Employee, Expense, Holiday, Inquiry, InventoryItem, Invoice, Job, MaintenanceTicket,
  PayrollAdjustment, PayrollPeriod, PayrollRun, Payment, PerfReview, PettyCashEntry, Quotation, QuoteItem, ServiceDef,
  Settings, Site, StockTx, StorageLocation, UserAccount, Communication, Complaint, Role, ServiceCode, Condition, PayrollType,
} from './types';
import { DEFAULT_ACCESS } from './rbac';
import { geoPatch } from './geo-ph';
import { DEFAULT_DISCLAIMER } from './quote-text';
import { seedMaintenance } from './maint-seed';
import { employeeRating } from './rating-core';
import { findConflicts, buildChecklistItems, buildPayrollLines, computeTimes, docTotals, invoiceTotals, jobDays, priceService, dailyEquivalent } from './business';
import { addDays, clone, diffDays, dow, eachDay, monthEnd, monthStart, round2, sum, today } from './util';
import { planFollowUps } from './followup-core';

/* Precomputed sha256("topmop:topmop123") – demo password for all seeded accounts. */
export const DEMO_PASS_HASH = '31472fd57adb88f745afdec821538558171d7c892e8efa4432d2955e59520d40';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const svgPhoto = (label: string, tone = '#0B2545') =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="${tone}"/><g stroke="#22C1C3" stroke-width="2" opacity=".5" fill="none"><rect x="60" y="50" width="160" height="110"/><rect x="240" y="50" width="160" height="110"/><rect x="60" y="180" width="160" height="90"/><rect x="240" y="180" width="160" height="90"/></g><text x="24" y="300" fill="#fff" font-family="sans-serif" font-size="20">${label}</text></svg>`);

export function seedDB(): DB {
  const R = rng(20260930);
  const pick = <T,>(a: T[]): T => a[Math.floor(R() * a.length)];
  const between = (a: number, b: number) => Math.round(a + R() * (b - a));
  const T = today();
  const T0 = new Date().toISOString();
  const stamp = (d: string, h = 8) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
  let n = 0;
  const id = (p: string) => `${p}-${String(++n).padStart(4, '0')}`;
  const OWNER = 'u-owner';
  const base = (p: string, d?: string) => ({ id: id(p), created_at: d ? stamp(d) : T0, updated_at: d ? stamp(d) : T0, created_by: OWNER });

  const settings: Settings = {
    company: {
      name: 'TopMop Window Cleaning Solutions Corp.', tin: '000-000-000-000',
      address: 'Metro Manila, Philippines', phone: '+63 900 000 0000', email: 'hello@topmop.example',
      tagline: 'Specialized exterior cleaning & property care',
    },
    vat_rate: 12, quote_validity_days: 30, payment_terms_days: 30, std_hours_per_day: 8, monthly_divisor_days: 26, grace_minutes: 5,
    default_terms: '1. Prices are in Philippine Peso (₱). 2. 50% downpayment upon approval for jobs above ₱50,000; balance upon completion. 3. Client to provide safe access, water and power source at the site. 4. Work is subject to favorable weather for exterior work. 5. Pre-existing damage, scratches or defects are not covered. 6. Quotation is valid until the date indicated.',
    multipliers: { overtime: 1.25, regular_holiday: 2, special_holiday: 1.3, rest_day: 1.3 },
    statutory: [
      { key: 'sss', label: 'SSS (employee share)', mode: 'percent', value: 5, min: 0, max: 875, threshold: 0 },
      { key: 'philhealth', label: 'PhilHealth (employee share)', mode: 'percent', value: 2.5, min: 0, max: 1250, threshold: 0 },
      { key: 'pagibig', label: 'Pag-IBIG (employee share)', mode: 'percent', value: 2, min: 0, max: 100, threshold: 0 },
      { key: 'wtax', label: 'Withholding tax on compensation', mode: 'percent', value: 10, min: 0, max: 0, threshold: 10417 },
    ],
    channels: { email: true, sms: false, whatsapp: true },
    reminder_days: { quote_expiry: 5, doc_expiry: 30, chemical_expiry: 30, invoice_due: 5, maintenance: 7 },
    glass_group_size: 4,
    access: clone(DEFAULT_ACCESS) as Record<Role, string[]>,
    counters: {},
  };

  /* ---- branches ---- */
  const branches = [
    { ...base('br'), name: 'Main Office – Metro Manila', address: 'Quezon City, Metro Manila' },
    { ...base('br'), name: 'Calabarzon Satellite', address: 'Santa Rosa, Laguna' },
  ];
  const BR1 = branches[0].id, BR2 = branches[1].id;

  /* ---- services (pricing defaults per TopMop) ---- */
  const svc = (code: ServiceCode, name: string, unit: string, rate: number, min: number, extra: Partial<ServiceDef> = {}): ServiceDef => ({
    ...base('sv'), code, name, unit, rate, minimum_qty: min, custom_quote: false, est_hours_per_unit: 0.25, ...extra,
  });
  const services: ServiceDef[] = [
    svc('GLASS_EXT', 'Exterior Glass / Window Cleaning', 'panel', 140, 1, { package_price: 4799, package_qty: 31, excess_rate: 140, est_hours_per_unit: 0.35 }),
    svc('GLASS_INT', 'Interior Glass Cleaning', 'panel', 0, 1, { custom_quote: true }),
    svc('ROOF', 'Roof Cleaning', 'sqm', 145, 100, { est_hours_per_unit: 0.06 }),
    svc('WALL', 'Wall / Floor Cleaning', 'sqm', 125, 50, { est_hours_per_unit: 0.05 }),
    svc('SOLAR', 'Solar Panel Cleaning', 'panel', 245, 20, { est_hours_per_unit: 0.15 }),
    svc('ACP', 'ACP / Cladding Cleaning', 'sqm', 0, 1, { custom_quote: true }),
    svc('FLOOR', 'Hardscape / Floor Cleaning', 'sqm', 125, 50, { est_hours_per_unit: 0.05 }),
    svc('CEILING', 'Ceiling Cleaning', 'sqm', 0, 1, { custom_quote: true }),
    svc('GUTTER', 'Gutter Cleaning', 'lm', 0, 1, { custom_quote: true }),
    svc('OTHER', 'Other Property-Care Service', 'lot', 0, 1, { custom_quote: true }),
  ];
  const S = (c: ServiceCode) => services.find((s) => s.code === c)!;

  /* ---- employees ---- */
  let ecount = 0;
  const emp = (full_name: string, position: string, tier: Employee['tier'], department: Employee['department'], basis: 'daily' | 'monthly', pay: number, ptype: PayrollType, status: Employee['status'], hire: string, extra: Partial<Employee> = {}): Employee => {
    ecount++;
    const code = `TM-${String(ecount).padStart(3, '0')}`;
    return {
      ...base('emp', hire), code, full_name, position, tier, department, branch_id: BR1, pay_basis: basis,
      daily_rate: basis === 'daily' ? pay : 0, monthly_salary: basis === 'monthly' ? pay : 0, payroll_type: ptype, hire_date: hire,
      bank_name: pick(['BDO', 'BPI', 'Metrobank', 'UnionBank', 'GCash']), bank_account: String(between(1000, 9999)) + '-' + String(between(1000, 9999)) + '-' + String(between(10, 99)),
      payout_method: 'Bank transfer', mobile: `+63 9${between(10, 99)} ${between(100, 999)} ${between(1000, 9999)}`,
      emergency_name: pick(['Maria', 'Jose', 'Ana', 'Ramon', 'Liza']) + ' ' + full_name.split(' ').slice(-1)[0], emergency_mobile: `+63 9${between(10, 99)} ${between(100, 999)} ${between(1000, 9999)}`,
      sss: `34-${between(1000000, 9999999)}-${between(1, 9)}`, philhealth: `12-${between(100000000, 999999999)}-${between(1, 9)}`, pagibig: `${between(1000, 9999)}-${between(1000, 9999)}-${between(1000, 9999)}`, tin: `${between(100, 999)}-${between(100, 999)}-${between(100, 999)}-000`,
      status, documents: [], trainings: [], shift_start: '08:00', shift_end: '17:00', rest_day: 0, ...extra,
    };
  };
  const yrs = (y: number) => addDays(T, -Math.round(365 * y));
  const dueSoon = addDays(T, 18), dueLater = addDays(T, 200), expired = addDays(T, -12);
  const fieldDocs = (nbi: string, med: string) => [
    { name: 'NBI Clearance', number: 'NBI-' + between(100000, 999999), expires: nbi },
    { name: 'Medical Certificate', expires: med },
    { name: 'Signed Employment Contract' },
  ];
  const wah = (exp: string) => ({ name: 'Working-at-Heights Safety Training', completed_on: addDays(exp, -365), expires: exp, hours: 8 });
  const employees: Employee[] = [
    emp('Ricardo M. Villareal', 'Owner / General Manager', 'Supervisor', 'Management', 'monthly', 85000, 'monthly', 'regular', yrs(9)),
    emp('Angelica P. Santos', 'Operations Manager', 'Supervisor', 'Operations', 'monthly', 45000, 'monthly', 'regular', yrs(5)),
    emp('Marites C. Bautista', 'Finance & Admin Officer', 'Office Staff', 'Finance & Admin', 'monthly', 32000, 'monthly', 'regular', yrs(4)),
    emp('Jonathan D. Ramos', 'Team Leader – Crew Alpha', 'Team Leader', 'Field Operations', 'daily', 950, 'biweekly', 'regular', yrs(6), { documents: fieldDocs(dueLater, dueLater), trainings: [wah(dueLater)] }),
    emp('Eduardo S. Navarro', 'Team Leader – Crew Bravo', 'Team Leader', 'Field Operations', 'daily', 950, 'biweekly', 'regular', yrs(5), { documents: fieldDocs(dueLater, dueSoon), trainings: [wah(dueLater)] }),
    emp('Kevin L. Dizon', 'Senior Technician', 'Senior Technician', 'Field Operations', 'daily', 780, 'biweekly', 'regular', yrs(3), { documents: fieldDocs(dueLater, dueLater), trainings: [wah(dueSoon)] }),
    emp('Mark Anthony T. Cruz', 'Senior Technician', 'Senior Technician', 'Field Operations', 'daily', 780, 'biweekly', 'regular', yrs(3), { documents: fieldDocs(dueLater, dueLater), trainings: [wah(dueLater)] }),
    emp('Joel R. Mercado', 'Technician', 'Technician', 'Field Operations', 'daily', 700, 'biweekly', 'regular', yrs(2), { documents: fieldDocs(dueLater, dueLater), trainings: [wah(dueLater)] }),
    emp('Renato G. Aquino', 'Technician', 'Technician', 'Field Operations', 'daily', 700, 'biweekly', 'regular', yrs(2), { documents: fieldDocs(expired, dueLater), trainings: [wah(dueLater)] }),
    emp('Dennis B. Padilla', 'Technician', 'Technician', 'Field Operations', 'daily', 700, 'biweekly', 'regular', yrs(1.5), { documents: fieldDocs(dueLater, dueLater), trainings: [wah(dueLater)] }),
    emp('Rommel A. Castillo', 'Technician', 'Technician', 'Field Operations', 'daily', 700, 'biweekly', 'regular', yrs(1.2), { documents: fieldDocs(dueLater, dueLater), trainings: [wah(dueLater)] }),
    emp('Christian V. Lim', 'Technician', 'Technician', 'Field Operations', 'daily', 680, 'biweekly', 'probationary', addDays(T, -140), { documents: fieldDocs(dueLater, dueLater), trainings: [] }),
    emp('Gilbert N. Soriano', 'Technician', 'Technician', 'Field Operations', 'daily', 680, 'biweekly', 'probationary', addDays(T, -110), { documents: fieldDocs(dueLater, dueLater), trainings: [] }),
    emp('Paolo E. Fernandez', 'Trainee', 'Trainee', 'Field Operations', 'daily', 610, 'biweekly', 'contractual', addDays(T, -70), { documents: fieldDocs(dueLater, dueLater), trainings: [] }),
    emp('Vincent J. Ocampo', 'Trainee', 'Trainee', 'Field Operations', 'daily', 610, 'biweekly', 'contractual', addDays(T, -55), { documents: fieldDocs(dueLater, dueLater), trainings: [] }),
    emp('Arnel H. Salazar', 'Technician', 'Technician', 'Field Operations', 'daily', 700, 'biweekly', 'inactive', yrs(2.5)),
  ];
  const [E_OWN, E_OPS, E_FIN, E_L1, E_L2, ...FIELD] = employees;
  const active = employees.filter((e) => e.status !== 'inactive');
  const teamA = { leader: E_L1, crew: [FIELD[0], FIELD[2], FIELD[4], FIELD[6]] };
  const teamB = { leader: E_L2, crew: [FIELD[1], FIELD[3], FIELD[5], FIELD[7]] };

  /* ---- users ---- */
  const mkUser = (uid: string, name: string, email: string, role: Role, emp?: Employee): UserAccount => ({
    id: uid, created_at: T0, updated_at: T0, created_by: OWNER, name, email, role, employee_id: emp?.id ?? null, pass_hash: DEMO_PASS_HASH, active: true,
  });
  const users: UserAccount[] = [
    mkUser('u-owner', E_OWN.full_name, 'owner@topmop.ph', 'owner', E_OWN),
    mkUser('u-ops', E_OPS.full_name, 'ops@topmop.ph', 'ops', E_OPS),
    mkUser('u-fin', E_FIN.full_name, 'finance@topmop.ph', 'finance', E_FIN),
    mkUser('u-lead', E_L1.full_name, 'leader@topmop.ph', 'leader', E_L1),
    mkUser('u-field', FIELD[0].full_name, 'field@topmop.ph', 'field', FIELD[0]),
    mkUser('u-view', 'External Accountant', 'accountant@topmop.ph', 'viewer'),
  ];

  /* ---- holidays (sample list — verify against official proclamations) ---- */
  const yr = +T.slice(0, 4);
  const holidays: Holiday[] = ([
    [`${yr}-01-01`, "New Year's Day", 'Regular'], [`${yr}-04-09`, 'Araw ng Kagitingan', 'Regular'], [`${yr}-05-01`, 'Labor Day', 'Regular'],
    [`${yr}-06-12`, 'Independence Day', 'Regular'], [`${yr}-08-21`, 'Ninoy Aquino Day', 'Special'], [`${yr}-08-31`, 'National Heroes Day', 'Regular'],
    [`${yr}-11-01`, "All Saints' Day", 'Special'], [`${yr}-11-30`, 'Bonifacio Day', 'Regular'], [`${yr}-12-08`, 'Feast of the Immaculate Conception', 'Special'],
    [`${yr}-12-25`, 'Christmas Day', 'Regular'], [`${yr}-12-30`, 'Rizal Day', 'Regular'], [`${yr}-12-31`, 'Last Day of the Year', 'Special'],
  ] as [string, string, 'Regular' | 'Special'][]).map(([date, name, kind]) => ({ ...base('hol'), date, name, kind }));

  /* ---- clients & sites ---- */
  const cl = (name: string, contact: string, type: Client['type'], status: Client['status'], addr: string, vat: Client['vat_status'], wht: number, sites: [string, string][], extra: Partial<Client> = {}) => {
    const c: Client = {
      ...base('cl', addDays(T, -between(60, 400))), name, contact_person: contact, mobile: `+63 9${between(10, 99)} ${between(100, 999)} ${between(1000, 9999)}`,
      email: contact.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '') + '@' + name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14) + '.example',
      address: addr, billing_address: addr, type, status, notes: '', access_instructions: '', tin: `${between(100, 999)}-${between(100, 999)}-${between(100, 999)}-000`,
      vat_status: vat, withholding_rate: wht, withholding_notes: wht ? 'Client issues BIR Form 2307 quarterly.' : '', branch_id: BR1, ...extra,
    };
    const ss: Site[] = sites.map(([sname, saddr]) => ({
      ...base('st', c.created_at.slice(0, 10)), client_id: c.id, name: sname, address: saddr, contact_person: contact, contact_mobile: c.mobile,
      access_instructions: pick(['Register at security desk; present valid ID.', 'Coordinate with building admin 1 day prior. Service elevator only.', 'Gate pass required; crew to wear IDs and full PPE.', 'Call contact person on arrival.', 'Water source available at basement pump room.']),
    }));
    return { c, ss };
  };
  const cdefs = [
    cl('Bayview Suites & Hospitality Inc.', 'Carla Mendoza', 'Hospitality', 'Active', 'Roxas Blvd., Pasay City', 'VAT-registered', 2, [['Bayview Suites – Main Tower', 'Roxas Blvd., Pasay City'], ['Bayview Annex', 'Macapagal Ave., Pasay City']]),
    cl('Metro Grand Property Management Corp.', 'Ferdinand Uy', 'Property Management', 'Active', 'Ayala Ave., Makati City', 'VAT-registered', 2, [['Metro Grand Tower 1', 'Ayala Ave., Makati'], ['Metro Grand Tower 2', 'Ayala Ave., Makati'], ['Metro Grand Retail Podium', 'Ayala Ave., Makati']]),
    cl('Marquez Motors – Ortigas', 'Bianca Marquez', 'Auto Dealership', 'Active', 'Ortigas Ave., Pasig City', 'VAT-registered', 2, [['Marquez Showroom & Service Center', 'Ortigas Ave., Pasig']], { notes: 'Prefers service outside showroom hours (before 9AM).' }),
    cl('City Government of San Rafael', 'Engr. Luis Tolentino', 'Government / LGU', 'Active', 'Poblacion, San Rafael, Bulacan', 'VAT-exempt', 5, [['San Rafael City Hall', 'Poblacion, San Rafael'], ['San Rafael Public Market', 'Poblacion, San Rafael']], { withholding_notes: '5% withholding per LGU; 2307 issued upon payment.', notes: 'Requires signed accomplishment report and photo documentation for every job.' }),
    cl('Parish of the Holy Family', 'Fr. Emmanuel Robles', 'Church', 'Active', 'Cainta, Rizal', 'Non-VAT', 0, [['Holy Family Church & Belfry', 'Cainta, Rizal']]),
    cl('Greenfield Industrial Park Locators Assn.', 'Nelson Pineda', 'Industrial', 'Active', 'Sta. Rosa, Laguna', 'VAT-registered', 2, [['Greenfield Plant 3 – Roof', 'Sta. Rosa, Laguna'], ['Greenfield Admin Building', 'Sta. Rosa, Laguna']], { branch_id: BR2 }),
    cl('Sunrise Solar Farm Corp.', 'Engr. Patricia Gomez', 'Commercial', 'Active', 'Tanauan, Batangas', 'VAT-registered', 2, [['Sunrise Solar – Array A', 'Tanauan, Batangas'], ['Sunrise Solar – Array B', 'Tanauan, Batangas']], { branch_id: BR2, access_instructions: 'Safety induction required each visit.' }),
    cl('Dela Cruz Residence', 'Teresita Dela Cruz', 'Residential', 'Active', 'BF Homes, Parañaque City', 'Non-VAT', 0, [['Dela Cruz Home', 'BF Homes, Parañaque']]),
    cl('Pacific Tower Condominium Corp.', 'Ma. Elena Ilagan', 'Property Management', 'Active', 'Ortigas Center, Pasig City', 'VAT-registered', 2, [['Pacific Tower – Exterior Façade', 'Ortigas Center, Pasig']]),
    cl('Northgate Corporate Center', 'Raymond Villanueva', 'Commercial', 'Active', 'Alabang, Muntinlupa City', 'VAT-registered', 2, [['Northgate Building A', 'Alabang, Muntinlupa'], ['Northgate Building B', 'Alabang, Muntinlupa']]),
    cl('Santos Family Residence', 'Carlos Santos', 'Residential', 'Prospect', 'Vista Verde, Cainta, Rizal', 'Non-VAT', 0, [['Santos Home', 'Vista Verde, Cainta']]),
    cl('St. Andrew Academy', 'Sr. Josefina Tan', 'School / Institution', 'Prospect', 'Las Piñas City', 'Non-VAT', 0, [['St. Andrew Main Campus', 'Las Piñas City']]),
    cl('Lakeshore Mall Inc.', 'Gerard Sy', 'Commercial', 'Inactive', 'Laguna Lakeshore, Laguna', 'VAT-registered', 2, [['Lakeshore Mall Atrium', 'Laguna']], { notes: 'Contract ended; re-engage next year.' }),
  ];
  const clients = cdefs.map((x) => x.c);
  const sites = cdefs.flatMap((x) => x.ss);
  const activeClients = clients.filter((c) => c.status === 'Active');

  /* ---- storage & inventory ---- */
  const locations: StorageLocation[] = ['Main Warehouse', 'Service Van 1', 'Service Van 2', 'Calabarzon Stockroom'].map((name) => ({ ...base('loc'), name }));
  const WH = locations[0].id;
  const itemDefs: [string, string, InventoryItem['category'], string, number, number, string, Partial<InventoryItem>?][] = [
    ['CHM-001', 'Glass Cleaning Concentrate', 'Chemical', 'L', 20, 380, 'CleanChem Supply Co.', { track_expiry: true, expiry_date: addDays(T, 300), batch_no: 'GC-2604' }],
    ['CHM-002', 'Roof Biocide / Moss Remover', 'Chemical', 'L', 80, 290, 'CleanChem Supply Co.', { track_expiry: true, expiry_date: addDays(T, 150), batch_no: 'RB-2603' }],
    ['CHM-003', 'Heavy-Duty Degreaser', 'Chemical', 'L', 25, 260, 'CleanChem Supply Co.', { track_expiry: true, expiry_date: addDays(T, 210), batch_no: 'DG-2602' }],
    ['CHM-004', 'Descaler / Mineral Remover', 'Chemical', 'L', 15, 420, 'Pinnacle Industrial Chem', { track_expiry: true, expiry_date: addDays(T, 21), batch_no: 'DS-2510' }],
    ['CHM-005', 'Solar Panel Cleaning Solution', 'Chemical', 'L', 15, 350, 'Pinnacle Industrial Chem', { track_expiry: true, expiry_date: addDays(T, 260), batch_no: 'SP-2605' }],
    ['CON-001', 'Microfiber Cloth (40×40cm)', 'Consumable', 'pc', 100, 38, 'Manila Janitorial Depot'],
    ['CON-002', 'Squeegee Rubber Blade (14")', 'Consumable', 'pc', 30, 95, 'Manila Janitorial Depot'],
    ['CON-003', 'Scrubber Sleeve', 'Consumable', 'pc', 20, 210, 'Manila Janitorial Depot'],
    ['CON-004', 'Heavy Trash Bags (roll)', 'Consumable', 'roll', 25, 145, 'Manila Janitorial Depot'],
    ['CON-005', 'Masking Tape 2"', 'Consumable', 'roll', 24, 55, 'Manila Janitorial Depot'],
    ['SPR-001', 'Water-Fed Pole Brush Head', 'Spare Part', 'pc', 8, 1250, 'AquaPole Trading'],
    ['SPR-002', 'RO Membrane Element', 'Spare Part', 'pc', 4, 6800, 'AquaPole Trading'],
    ['SPR-003', 'DI Resin (25L bag)', 'Spare Part', 'bag', 10, 3400, 'AquaPole Trading', { track_expiry: true, expiry_date: addDays(T, 400) }],
    ['SPR-004', 'Pressure Washer Nozzle Set', 'Spare Part', 'set', 6, 1450, 'HydroTools PH'],
    ['SPR-005', 'Pump Seal Kit', 'Spare Part', 'kit', 5, 2300, 'HydroTools PH'],
    ['PPE-001', 'Full-Body Safety Harness', 'PPE', 'pc', 10, 3200, 'SafeWorks Industrial', { track_expiry: true, expiry_date: addDays(T, 26), batch_no: 'H-2410' }],
    ['PPE-002', 'Hard Hat', 'PPE', 'pc', 14, 320, 'SafeWorks Industrial'],
    ['PPE-003', 'Rubber Gloves (pair)', 'PPE', 'pair', 40, 85, 'SafeWorks Industrial'],
    ['PPE-004', 'Safety Goggles', 'PPE', 'pc', 15, 180, 'SafeWorks Industrial'],
    ['PPE-005', 'Non-Slip Safety Boots', 'PPE', 'pair', 8, 1650, 'SafeWorks Industrial'],
    ['OFF-001', 'Bond Paper A4', 'Office Supply', 'ream', 12, 240, 'National Book Store Corp.'],
    ['OFF-002', 'Printer Ink Set', 'Office Supply', 'set', 3, 1800, 'National Book Store Corp.'],
    ['CLN-001', 'Shop Towels (pack)', 'Cleaning Material', 'pack', 20, 165, 'Manila Janitorial Depot'],
    ['CLN-002', 'Detergent Powder (kg)', 'Cleaning Material', 'kg', 30, 110, 'Manila Janitorial Depot'],
  ];
  const reorder: Record<string, number> = { 'CHM-001': 10, 'CHM-002': 40, 'CHM-003': 10, 'CHM-004': 8, 'CHM-005': 8, 'CON-001': 40, 'CON-002': 12, 'CON-003': 8, 'CON-004': 8, 'CON-005': 8, 'SPR-001': 3, 'SPR-002': 1, 'SPR-003': 3, 'SPR-004': 2, 'SPR-005': 2, 'PPE-001': 4, 'PPE-002': 6, 'PPE-003': 15, 'PPE-004': 5, 'PPE-005': 3, 'OFF-001': 4, 'OFF-002': 1, 'CLN-001': 8, 'CLN-002': 10 };
  const items: InventoryItem[] = itemDefs.map(([code, name, category, uom, , cost, supplier, extra]) => ({
    ...base('itm', addDays(T, -120)), code, name, category, uom, reorder_level: reorder[code], cost, supplier, location_id: WH, track_expiry: false, ...extra,
  }));
  const item = (code: string) => items.find((i) => i.code === code)!;
  const stock: StockTx[] = [];
  const running: Record<string, number> = {};
  const tx = (it: InventoryItem, type: StockTx['type'], qty: number, date: string, extra: Partial<StockTx> = {}) => {
    running[it.id] = (running[it.id] || 0) + qty;
    stock.push({ ...base('stx', date), item_id: it.id, type, qty, unit_cost: it.cost, location_id: WH, date, approval: 'Approved', ...extra });
  };
  const openDate = addDays(T, -85);
  itemDefs.forEach(([code, , , , opening]) => tx(item(code), 'Opening', opening, openDate, { reason: 'Beginning balance' }));

  /* ---- assets ---- */
  const ast = (code: string, name: string, category: Asset['category'], brand: string, model: string, cost: number, yrsOld: number, extra: Partial<Asset> = {}): Asset => ({
    ...base('ast', addDays(T, -Math.round(yrsOld * 365))), code, name, category, brand, model, serial: `${brand.slice(0, 3).toUpperCase()}-${between(100000, 999999)}`,
    purchase_date: addDays(T, -Math.round(yrsOld * 365)), purchase_cost: cost, condition: 'Good', location: 'Main Warehouse',
    maintenance_interval_days: 90, last_maintenance: addDays(T, -between(10, 70)), status: 'Available', daily_allocation: Math.round(cost / 1300), ...extra,
  });
  const assets: Asset[] = [
    ast('VEH-001', 'Service Van 1 (L300)', 'Vehicle', 'Mitsubishi', 'L300 FB', 1150000, 3, { location: 'Yard', maintenance_interval_days: 90, meter_reading: 48210, meter_unit: 'km', daily_allocation: 900 }),
    ast('VEH-002', 'Service Van 2 (Hiace)', 'Vehicle', 'Toyota', 'Hiace Commuter', 1850000, 2, { location: 'Yard', meter_reading: 31940, meter_unit: 'km', daily_allocation: 1100 }),
    ast('VEH-003', 'Service Van 3 (Hilux)', 'Vehicle', 'Toyota', 'Hilux FX', 1450000, 1, { location: 'Yard', meter_reading: 12480, meter_unit: 'km', daily_allocation: 1000 }),
    ast('ROD-001', 'RO/DI Pure-Water System #1', 'RO/DI Pure-Water System', 'Aquaflex', 'RO-2000', 185000, 2.5, { meter_reading: 1420, meter_unit: 'hrs', daily_allocation: 250 }),
    ast('ROD-002', 'RO/DI Pure-Water System #2', 'RO/DI Pure-Water System', 'Aquaflex', 'RO-2000', 185000, 2, { meter_reading: 980, meter_unit: 'hrs', daily_allocation: 250 }),
    ast('WFP-001', 'Water-Fed Pole 45ft (A)', 'Water-Fed Pole', 'Ionic Systems', 'Carbon 45', 68000, 2.5),
    ast('WFP-002', 'Water-Fed Pole 45ft (B)', 'Water-Fed Pole', 'Ionic Systems', 'Carbon 45', 68000, 2.5),
    ast('WFP-003', 'Water-Fed Pole 60ft', 'Water-Fed Pole', 'Ionic Systems', 'Carbon 60', 92000, 1.5),
    ast('PWR-001', 'Pressure Washer 4000 PSI (A)', 'Pressure Washer', 'Karcher', 'HD 10/25', 86000, 2, { meter_reading: 640, meter_unit: 'hrs' }),
    ast('PWR-002', 'Pressure Washer 4000 PSI (B)', 'Pressure Washer', 'Karcher', 'HD 10/25', 86000, 1.8, { meter_reading: 512, meter_unit: 'hrs' }),
    ast('SFC-001', 'Surface Cleaner 20"', 'Surface Cleaner', 'Whirlaway', 'WA-20', 24000, 1.5),
    ast('SFC-002', 'Surface Cleaner 24"', 'Surface Cleaner', 'Whirlaway', 'WA-24', 28000, 1, { status: 'Under Maintenance', condition: 'Fair', location: 'Workshop' }),
    ast('VAC-001', 'Industrial Telescopic Vacuum', 'Industrial Vacuum', 'Nilfisk', 'Attix 50', 64000, 2, { meter_reading: 300, meter_unit: 'hrs' }),
    ast('PMP-001', 'Transfer Pump 2"', 'Pump', 'Honda', 'WB20', 32000, 3),
    ast('HSE-001', 'High-Pressure Hose Set 50m', 'Hose', 'Gates', 'HP-50', 18000, 1),
    ast('LAD-001', 'Extension Ladder 24ft', 'Ladder', 'Louisville', 'FE3224', 21000, 2),
    ast('LAD-002', 'Extension Ladder 32ft', 'Ladder', 'Louisville', 'FE3232', 29000, 2, { condition: 'Damaged', status: 'Damaged', location: 'Workshop', last_maintenance: addDays(T, -200) }),
    ast('EXC-001', 'Extension Cord 50m (A)', 'Extension Cord', 'Pacific Cable', 'EC-50', 4800, 1.5, { maintenance_interval_days: 180 }),
    ast('EXC-002', 'Extension Cord 50m (B)', 'Extension Cord', 'Pacific Cable', 'EC-50', 4800, 1.5, { maintenance_interval_days: 180 }),
    ast('SAF-001', 'Roof Fall-Arrest Kit (A)', 'Safety Equipment', '3M', 'Protecta Pro', 42000, 1.5, { maintenance_interval_days: 180 }),
    ast('SAF-002', 'Roof Fall-Arrest Kit (B)', 'Safety Equipment', '3M', 'Protecta Pro', 42000, 1.5, { maintenance_interval_days: 180 }),
  ];
  const A = (code: string) => assets.find((a) => a.code === code)!;
  const tickets: MaintenanceTicket[] = [
    { ...base('tk', addDays(T, -9)), asset_id: A('SFC-002').id, source: 'Damage report', description: 'Bearing noise and cracked skirt reported on return. Needs replacement parts.', status: 'In Repair', opened_on: addDays(T, -9), cost: 0, vendor: 'HydroTools PH' },
    { ...base('tk', addDays(T, -20)), asset_id: A('LAD-002').id, source: 'Damage report', description: 'Bent rail on 32ft extension ladder – unsafe for use.', status: 'Open', opened_on: addDays(T, -20), cost: 0 },
    { ...base('tk', addDays(T, -150)), asset_id: A('PWR-001').id, source: 'Scheduled', description: 'Pump service and oil change – 500hr.', status: 'Closed', opened_on: addDays(T, -150), closed_on: addDays(T, -147), cost: 4200, vendor: 'HydroTools PH' },
  ];

  /* ---- jobs, quotations, invoices, payments, attendance, stock usage ---- */
  const quotations: Quotation[] = [];
  const invoices: Invoice[] = [];
  const discountRequests: DiscountRequest[] = [];
  let discSeq = 0;
  const payments: Payment[] = [];
  const expenses: Expense[] = [];
  const attendance: Attendance[] = [];
  const checkouts: Checkout[] = [];
  const jobs: Job[] = [];
  const counters: Record<string, number> = { QT: 0, JOB: 0, INV: 0, OR: 0, EMP: employees.length, INC: 0, DR: 0, BJ: 0, OV: 0, MT: 0 };
  const nn = (k: string) => { counters[k] += 1; return `${k}-${yr}-${String(counters[k]).padStart(4, '0')}`; };

  const teamAssets = { A: ['VEH-001', 'ROD-001', 'WFP-001', 'WFP-003', 'PWR-001', 'EXC-001', 'SAF-001'], B: ['VEH-002', 'ROD-002', 'WFP-002', 'PWR-002', 'SFC-001', 'EXC-002', 'SAF-002'] };
  const matMap: Record<string, [string, number][]> = {
    GLASS_EXT: [['CHM-001', 2], ['CON-002', 2], ['CON-001', 6]], ROOF: [['CHM-002', 10], ['CON-004', 1], ['PPE-003', 3]],
    WALL: [['CHM-003', 4], ['CON-003', 2], ['CON-001', 4]], SOLAR: [['CHM-005', 2], ['CON-001', 8]], ACP: [['CHM-003', 3], ['CON-001', 6]],
    FLOOR: [['CHM-003', 5], ['CON-003', 2]], GLASS_INT: [['CHM-001', 1], ['CON-001', 6]], CEILING: [['CON-001', 8]], GUTTER: [['CON-004', 1], ['PPE-003', 2]], OTHER: [['CON-001', 4]],
  };
  const checklistFor = (codes: ServiceCode[]): Job['checklist'] => [
    'Site safety briefing & PPE check', 'Pre-work inspection & before photos', 'Cordon off / signage installed', ...codes.map((c) => `Perform ${S(c).name}`),
    'Post-work inspection with client rep', 'After photos & clean-up', 'Client sign-off',
  ].map((label) => ({ label, done: false }));
  const ppeFor = (codes: ServiceCode[]) => ['Hard hat', 'Safety boots', 'Gloves', 'Safety goggles', ...(codes.some((c) => ['ROOF', 'GLASS_EXT', 'ACP', 'GUTTER'].includes(c)) ? ['Full-body harness & lanyard'] : [])];

  const qtyFor = (c: ServiceCode) => c === 'GLASS_EXT' ? between(18, 80) : c === 'ROOF' ? between(100, 380) : c === 'WALL' || c === 'FLOOR' ? between(50, 260) : c === 'SOLAR' ? between(20, 110) : between(1, 3);
  const customRate: Partial<Record<ServiceCode, number>> = { GLASS_INT: 95, ACP: 210, CEILING: 160, GUTTER: 185, OTHER: 6500 };

  const makeQuote = (client: Client, site: Site, codes: ServiceCode[], date: string, status: Quotation['status'], branch: string, force?: number[]): Quotation => {
    const items: QuoteItem[] = codes.flatMap((c, i) => {
      const def = S(c);
      const q = force?.[i] ?? qtyFor(c);
      if (def.custom_quote) return [{ service_code: c, description: def.name, qty: q, unit: def.unit, rate: customRate[c] ?? 1000, discount: 0 }];
      return priceService(def, q).lines;
    });
    const vat_mode = client.vat_status === 'VAT-registered' ? 'exclusive' : 'none';
    return {
      ...base('qt', date), number: nn('QT'), client_id: client.id, site_id: site.id, issue_date: date, valid_until: addDays(date, settings.quote_validity_days),
      scope: `${codes.map((c) => S(c).name).join(', ')} at ${site.name}.`, items, vat_mode, vat_rate: 12, discount: 0, terms: settings.default_terms, crew_size: '6-7', safety_officer: true, work_days: between(1, 3), disclaimer: DEFAULT_DISCLAIMER, status, branch_id: branch,
      sent_at: status !== 'Draft' ? stamp(date) : undefined, decided_at: status === 'Approved' || status === 'Rejected' ? stamp(addDays(date, 3)) : undefined,
    };
  };

  const days = eachDay(addDays(T, -78), addDays(T, 20)).filter((d) => dow(d) !== 0);
  const busy: Record<string, Set<string>> = {};
  const codeMix: ServiceCode[][] = [['GLASS_EXT'], ['GLASS_EXT'], ['GLASS_EXT'], ['GLASS_EXT', 'WALL'], ['ROOF'], ['ROOF', 'WALL'], ['SOLAR'], ['WALL'], ['FLOOR'], ['ACP', 'GLASS_EXT'], ['GLASS_EXT', 'GLASS_INT']];
  const jobMeta: { job: Job; team: 'A' | 'B' }[] = [];

  for (const d of days) {
    for (const [tk, team] of [['A', teamA], ['B', teamB]] as const) {
      const isToday = d === T;
      if (!isToday && R() > (d < T ? 0.62 : 0.55)) continue;
      const client = pick(activeClients);
      const csites = sites.filter((s) => s.client_id === client.id);
      const site = pick(csites);
      const codes = client.type === 'Residential' ? pick([['GLASS_EXT'], ['WALL'], ['ROOF']] as ServiceCode[][]) : client.name.includes('Solar') ? ['SOLAR' as ServiceCode] : pick(codeMix);
      const qd = addDays(d, -between(6, 14));
      const quote = makeQuote(client, site, codes, qd > T ? addDays(T, -between(1, 6)) : qd, 'Approved', client.branch_id);
      quotations.push(quote);
      const totals = docTotals(quote.items, quote.discount, quote.vat_mode, quote.vat_rate);
      const status: Job['status'] = isToday ? 'In Progress' : d < T ? 'Completed' : d <= addDays(T, 7) ? 'Confirmed' : 'Pending';
      const crew = team.crew.slice(0, between(3, 4));
      const start = `${d}T08:00`, end = `${d}T17:00`;
      const jobId = id('job');
      const est = round2(totals.net * 0.58);
      const job: Job = {
        ...base('job', addDays(d, -5)), id: jobId, number: nn('JOB'), client_id: client.id, site_id: site.id, quotation_id: quote.id, branch_id: client.branch_id,
        service_codes: codes, scope: quote.scope, start_at: start, end_at: end, status, leader_id: team.leader.id, crew_ids: crew.map((c) => c.id),
        vehicle_id: A(teamAssets[tk][0]).id, equipment_ids: teamAssets[tk].slice(1).filter((c) => (codes.includes('SOLAR') || codes.includes('GLASS_EXT') || codes.includes('GLASS_INT') ? !c.startsWith('PWR') && !c.startsWith('SFC') : !c.startsWith('WFP') && !c.startsWith('ROD'))).map((c) => A(c).id),
        materials: (codes.flatMap((c) => matMap[c] || []) as [string, number][]).reduce<Job['materials']>((acc, [code, q]) => {
          const it = item(code); const ex = acc.find((m) => m.item_id === it.id);
          if (ex) ex.planned_qty += q; else acc.push({ item_id: it.id, planned_qty: q });
          return acc;
        }, []),
        ppe: ppeFor(codes), checklist: checklistFor(codes), findings: '', damage_report: '', equipment_condition_notes: '',
        contract_amount: totals.net, estimated_cost: est,
      };
      jobs.push(job); jobMeta.push({ job, team: tk });
      (busy[d] ||= new Set()).add(job.id);
    }
  }
  // Sample cancelled / rescheduled bookings (no resource conflicts: they hold no capacity)
  for (const [i, d] of [addDays(T, -20), addDays(T, 5)].entries()) {
    const client = pick(activeClients); const site = sites.find((s) => s.client_id === client.id)!;
    const q = makeQuote(client, site, ['GLASS_EXT'], addDays(d, -8) > T ? addDays(T, -3) : addDays(d, -8), 'Approved', client.branch_id);
    quotations.push(q);
    jobs.push({
      ...base('job', addDays(d, -6)), number: nn('JOB'), client_id: client.id, site_id: site.id, quotation_id: q.id, branch_id: client.branch_id, service_codes: ['GLASS_EXT'],
      scope: q.scope, start_at: `${d}T08:00`, end_at: `${d}T17:00`, status: i === 0 ? 'Cancelled' : 'Rescheduled', leader_id: E_L1.id, crew_ids: [], equipment_ids: [], materials: [],
      ppe: [], checklist: [], findings: '', damage_report: i === 0 ? 'Cancelled by client – building maintenance conflict.' : '', equipment_condition_notes: '', contract_amount: 0, estimated_cost: 0,
    });
  }
  jobs.sort((a, b) => a.start_at.localeCompare(b.start_at));

  /* completed-job side effects: stock issue, checkout records, invoices, payments, expenses */
  const ensure = (it: InventoryItem, need: number, date: string) => {
    if ((running[it.id] || 0) < need + it.reorder_level * 0.6) {
      const buy = Math.ceil(it.reorder_level * 2.4 + need);
      tx(it, 'Purchase', buy, date, { supplier: it.supplier, reference: `PO-${date.replace(/-/g, '').slice(2)}-${between(10, 99)}`, batch_no: it.batch_no });
    }
  };
  let recentPurchaseSkipped = false;
  // payments: verified by Finance, with the details each method needs
  const mkPay = (inv: Invoice, who: string, date: string, amount: number, wht: number, method: Payment['method'], ref: string, over: Partial<Payment> = {}): Payment => ({
    ...base('pay', date), invoice_id: inv.id, client_id: inv.client_id, job_id: inv.job_id, date, paid_at: `${date}T10:30`, amount, wht_amount: wht, method, reference: ref, receipt_no: nn('OR'),
    received_by: method === 'Cash' ? 'Finance Officer' : 'Finance Officer', status: 'Verified', verified_by: 'u-fin', verified_at: stamp(date, 11),
    ...(method === 'Bank Transfer' ? { bank_name: 'BDO Unibank', transfer_date: date } : method === 'Cheque' ? { bank_name: 'BPI', cheque_no: ref.replace(/\D/g, '').slice(0, 7), cheque_date: date, cheque_status: 'Cleared' as const, cleared_at: stamp(addDays(date, 2), 9), reference: ref.replace(/\D/g, '').slice(0, 7) } : method === 'GCash' ? { gcash_ref: ref, sender: who } : {}),
    ...over,
  });
  for (const { job, team } of jobMeta) {
    const d = job.start_at.slice(0, 10);
    const client = clients.find((c) => c.id === job.client_id)!;
    if (job.status === 'Completed') {
      job.completed_at = `${d}T${between(14, 16)}:${pick(['00', '15', '30', '45'])}`;
      job.client_rating = pick([5, 5, 5, 4, 4, 3, 5]);
      job.signoff_name = client.contact_person; job.signoff_at = job.completed_at; job.signoff_data = svgPhoto('Signature', '#123A63');
      job.checklist = job.checklist.map((c) => ({ ...c, done: true }));
      job.findings = pick(['Heavy mineral deposits on lower panels; recommended quarterly maintenance.', 'Moss growth on north-facing surfaces removed. No structural concerns.', 'Work completed without issues.', 'Minor sealant deterioration noted at two window frames – reported to client.']);
      job.materials = job.materials.map((m) => ({ ...m, used_qty: m.planned_qty }));
      // stock issue (skip the very recent ones to keep some reservations live)
      for (const m of job.materials) {
        const it = items.find((i) => i.id === m.item_id)!;
        ensure(it, m.planned_qty, addDays(d, -1));
        tx(it, 'Issue to Job', -m.planned_qty, d, { job_id: job.id, reason: 'Job materials' });
        if (R() < 0.05) tx(it, 'Damaged / Wasted', -1, d, { job_id: job.id, reason: 'Spillage during transfer' });
      }
      // equipment out/in for the job
      for (const aid of [job.vehicle_id!, ...job.equipment_ids]) {
        const a = assets.find((x) => x.id === aid)!;
        const dmg = a.code === 'SFC-002' || a.code === 'LAD-002';
        checkouts.push({
          ...base('co', d), asset_id: aid, job_id: job.id, requested_by: job.leader_id!, responsible_id: job.leader_id!, status: 'Returned', expected_return: `${d}T18:00`, approved_by: 'u-ops',
          out_at: `${d}T07:30`, out_condition: 'Good', out_meter: a.meter_reading ? a.meter_reading - between(20, 400) : undefined, in_at: `${d}T${between(16, 18)}:20`,
          in_condition: dmg ? 'Fair' : 'Good', in_meter: a.meter_reading ? a.meter_reading - between(1, 20) : undefined, damage_notes: '', missing_accessories: '',
        });
      }
      // labor attendance handled below; invoice
      const quote = quotations.find((q) => q.id === job.quotation_id)!;
      const issue = addDays(d, between(1, 3));
      if (issue <= T && d < addDays(T, -2)) {
        const inv: Invoice = {
          ...base('inv', issue), number: nn('INV'), client_id: client.id, site_id: job.site_id, job_id: job.id, quotation_id: quote.id, issue_date: issue,
          due_date: addDays(issue, settings.payment_terms_days), items: quote.items, vat_mode: quote.vat_mode, vat_rate: 12, discount: 0, withholding_rate: client.withholding_rate,
          status: 'Approved', approved_by: 'u-fin', approved_at: stamp(issue), branch_id: job.branch_id,
        };
        // a few closed jobs carry a management-approved discount (Team Leader request → Admin approval → applied before the client signed)
        const dk = discSeq++;
        if (dk % 6 === 2 || dk % 11 === 5) {
          const bt = docTotals(quote.items, quote.discount, quote.vat_mode, 12).total;
          const fixed = dk % 12 === 8, pctv = [3, 5, 7.5][dk % 3], reason = ['Repeat client', 'Volume work', 'Competitor price', 'Client request'][dk % 4];
          const rejected = dk % 6 !== 2;
          const amt = fixed ? Math.round(bt * 0.04 / 100) * 100 : round2(bt * pctv / 100);
          const kind = fixed ? 'fixed' as const : 'percent' as const, val = fixed ? amt : pctv;
          const gnet = quote.vat_mode === 'exclusive' ? round2(amt / 1.12) : amt;
          const rq: DiscountRequest = {
            ...base('dr', d), number: nn('DR'), job_id: job.id, client_id: client.id, quotation_id: quote.id, original_total: bt, additional_total: 0, base_total: bt, kind, value: val, requested_amount: amt, proposed_final: round2(bt - amt),
            reason, client_notes: rejected ? 'Client asked for a larger discount on the next quarterly service.' : 'Client asked for a repeat-client rate at the site.', status: rejected ? 'Rejected' : 'Applied', submitted_by: 'u-lead', submitted_at: `${d}T08:40:00.000Z`,
            decision_note: rejected ? 'Rates already at the contract minimum. Not approved.' : 'Approved for the repeat contract — one time only.', decided_by: 'u-owner', decided_at: `${d}T09:10:00.000Z`,
            ...(rejected ? {} : { approved_kind: kind, approved_value: val, approved_amount: amt, approved_final: round2(bt - amt), approved_base: bt, applied_at: `${d}T09:30:00.000Z`, applied_by: 'u-lead', net_amount: gnet }),
          };
          discountRequests.push(rq);
          if (!rejected) Object.assign(inv, { discount: round2(quote.discount + gnet), discount_request_id: rq.id, discount_granted: amt });
        }
        invoices.push(inv);
        const tot = invoiceTotals(inv);
        const roll = R();
        const payDate = addDays(issue, between(4, 36));
        if (roll < 0.62 && payDate <= T) {
          const wht = tot.wht;
          payments.push(mkPay(inv, client.name, payDate, round2(tot.total - wht), wht, pick(['Bank Transfer', 'Bank Transfer', 'Cheque', 'GCash']), `REF${between(100000, 999999)}`));
        } else if (roll < 0.76 && payDate <= T) {
          payments.push(mkPay(inv, client.name, payDate, round2(tot.total * 0.5), 0, 'Bank Transfer', `DP${between(100000, 999999)}`));
        }
      }
      // job expenses
      if (R() < 0.7) expenses.push({ ...base('exp', d), date: d, payee: 'Shell / Petron Fuel', category: 'Fuel', job_id: job.id, branch_id: job.branch_id, amount: between(9, 22) * 100, vat: 0, wht: 0, method: 'Cash', approval: 'Approved', approved_by: 'u-fin', paid: true, petty_cash: true, notes: 'Service van fuel' } as Expense);
      if (R() < 0.5) expenses.push({ ...base('exp', d), date: d, payee: 'Toll / Parking', category: 'Transportation', job_id: job.id, branch_id: job.branch_id, amount: between(3, 9) * 100, vat: 0, wht: 0, method: 'Cash', approval: 'Approved', approved_by: 'u-fin', paid: true, petty_cash: true } as Expense);
      if (job.service_codes.includes('ROOF') && R() < 0.4) expenses.push({ ...base('exp', d), date: d, payee: 'Scaffolding Rentals Co.', category: 'Subcontractor', job_id: job.id, branch_id: job.branch_id, amount: 6720, vat: 720, wht: 120, method: 'Bank Transfer', approval: 'Approved', approved_by: 'u-fin', paid: true, petty_cash: false, notes: 'Scaffold rental' } as Expense);
    } else if (job.status === 'In Progress') {
      job.checklist = job.checklist.map((c, i) => ({ ...c, done: i < 3 }));
      job.materials.forEach((m) => tx(items.find((i) => i.id === m.item_id)!, 'Issue to Job', -Math.min(m.planned_qty, Math.max(0, running[m.item_id] || 0)), d, { job_id: job.id, reason: 'Job materials (issued at dispatch)' }));
      for (const aid of [job.vehicle_id!, ...job.equipment_ids]) {
        const a = assets.find((x) => x.id === aid)!;
        checkouts.push({ ...base('co', d), asset_id: aid, job_id: job.id, requested_by: job.leader_id!, responsible_id: job.leader_id!, status: 'Released', expected_return: `${addDays(d, 1)}T08:00`, approved_by: 'u-ops', out_at: `${d}T07:30`, out_condition: 'Good', out_meter: a.meter_reading });
        a.status = 'In Use'; a.custodian_id = job.leader_id!; a.location = 'On site';
      }
    } else if (job.status === 'Confirmed' && d <= addDays(T, 2) && !recentPurchaseSkipped) {
      // one pending equipment request for the next job
      const a = A('LAD-001');
      if (!checkouts.some((c) => c.asset_id === a.id && c.job_id === job.id)) {
        checkouts.push({ ...base('co'), asset_id: a.id, job_id: job.id, requested_by: job.leader_id!, responsible_id: job.leader_id!, status: 'Requested', expected_return: `${d}T18:00`, note: 'Needed for upper floors.' });
        recentPurchaseSkipped = true;
      }
    }
  }
  // Overdue equipment return: SFC-001 released yesterday, never returned (idle asset, no job conflict) – attach to the latest completed job
  const lastDone = [...jobs].reverse().find((j) => j.status === 'Completed')!;
  const overdueAsset = A('VAC-001');
  checkouts.push({ ...base('co', addDays(T, -3)), asset_id: overdueAsset.id, job_id: lastDone.id, requested_by: E_L2.id, responsible_id: FIELD[3].id, status: 'Released', expected_return: `${addDays(T, -2)}T18:00`, approved_by: 'u-ops', out_at: `${addDays(T, -3)}T07:45`, out_condition: 'Good', out_meter: 296, note: 'Borrowed for post-job debris cleanup.' });
  overdueAsset.status = 'In Use'; overdueAsset.custodian_id = FIELD[3].id; overdueAsset.location = 'With employee';
  // damaged returns → tickets already seeded; add a returned-with-damage record
  const dmgJob = jobs.find((j) => j.status === 'Completed' && j.equipment_ids.includes(A('SFC-001').id));
  void dmgJob;
  // Reserved assets for upcoming confirmed jobs
  for (const j of jobs.filter((x) => x.status === 'Confirmed').slice(0, 2)) {
    for (const aid of j.equipment_ids.slice(0, 1)) {
      const a = assets.find((x) => x.id === aid)!;
      if (a.status === 'Available' && !checkouts.some((c) => c.asset_id === aid && c.status === 'Released')) a.status = 'Reserved';
    }
  }
  // final purchase near today so stock is realistic; deliberately leave a few items low
  for (const it of items) if (!['CHM-002', 'PPE-002', 'CON-002', 'CHM-004'].includes(it.code)) tx(it, 'Purchase', Math.ceil(it.reorder_level * 3), addDays(T, -6), { supplier: it.supplier, reference: `PO-${T.replace(/-/g, '').slice(2)}-${between(10, 99)}`, batch_no: it.batch_no });
  const lowTargets: [string, number][] = [['CHM-002', 3], ['PPE-002', 1], ['CON-002', 1], ['CHM-004', 2]];
  for (const [code, left] of lowTargets) {
    const it = item(code); const cur = running[it.id] || 0;
    if (cur > left) tx(it, 'Adjustment', -(cur - left), addDays(T, -2), { reason: 'Physical count variance – approved', approved_by: 'u-ops' });
  }
  // A pending adjustment awaiting approval
  stock.push({ ...base('stx', addDays(T, -1)), item_id: item('CON-005').id, type: 'Adjustment', qty: -3, unit_cost: item('CON-005').cost, location_id: WH, date: addDays(T, -1), approval: 'Pending', reason: 'Damp storage – rolls unusable' });
  // Transfer to van
  const tv = locations[1].id;
  const transferId = id('trf');
  tx(item('CON-001'), 'Transfer Out', -20, addDays(T, -4), { transfer_id: transferId, reason: 'Restock Van 1' });
  stock.push({ ...base('stx', addDays(T, -4)), item_id: item('CON-001').id, type: 'Transfer In', qty: 20, unit_cost: item('CON-001').cost, location_id: tv, date: addDays(T, -4), approval: 'Approved', transfer_id: transferId, reason: 'Restock Van 1' });

  /* pipeline: extra quotations + inquiries */
  const pipeClients = [clients[10], clients[11], clients[0], clients[9], clients[3], clients[7]];
  const qs: [Client, ServiceCode[], number, Quotation['status'], number[]?][] = [
    [pipeClients[0], ['GLASS_EXT'], 4, 'Sent', [44]], [pipeClients[1], ['GLASS_EXT', 'WALL'], 9, 'Sent', [120, 300]], [pipeClients[2], ['ROOF'], 2, 'Draft', [260]],
    [pipeClients[3], ['GLASS_EXT'], 40, 'Expired', [58]], [pipeClients[4], ['FLOOR'], 16, 'Rejected', [420]], [pipeClients[5], ['GLASS_EXT'], 3, 'Sent', [30]],
    [clients[8], ['ACP', 'GLASS_EXT'], 6, 'Sent', [180, 96]],
  ];
  for (const [c, codes, ago, st, force] of qs) {
    const site = sites.find((s) => s.client_id === c.id)!;
    const q = makeQuote(c, site, codes, addDays(T, -ago), st, c.branch_id, force);
    if (st === 'Rejected') q.reject_reason = 'Went with a cheaper provider';
    quotations.push(q);
  }
  const inq = (c: Client, codes: ServiceCode[], stage: Inquiry['stage'], details: string, source: string, ocular?: string): Inquiry => ({
    ...base('inq', addDays(T, -between(1, 12))), client_id: c.id, site_id: sites.find((s) => s.client_id === c.id)?.id, service_codes: codes, stage, source, details, ocular_date: ocular, assigned_to: E_OPS.id,
  });
  const inquiries: Inquiry[] = [
    inq(clients[10], ['GLASS_EXT'], 'Inquiry', 'Two-storey house, approx. 40 glass panels. Wants price by email.', 'Facebook Page'),
    inq(clients[11], ['GLASS_EXT', 'WALL'], 'Ocular Visit', 'Campus glass façade and covered-court wall cleaning before school opening.', 'Referral', addDays(T, 2)),
    inq(clients[8], ['ACP', 'GLASS_EXT'], 'Quotation', 'Quarterly façade cleaning contract.', 'Repeat client'),
    inq(clients[0], ['GLASS_EXT'], 'Client Approval', 'Annex windows, quotation sent and being reviewed by finance.', 'Repeat client'),
    inq(clients[9], ['ROOF'], 'Booked', 'Building B roof; booked for next week.', 'Website'),
    inq(clients[12], ['GLASS_EXT'], 'Lost', 'Signed with in-house janitorial.', 'Walk-in'),
  ];
  inquiries[5].lost_reason = 'In-house janitorial';

  /* ---- attendance ---- */
  const attDays = eachDay(addDays(T, -100), T);
  const jobsByDay = new Map<string, Job[]>();
  for (const j of jobs.filter((x) => ['Completed', 'In Progress'].includes(x.status))) (jobsByDay.get(j.start_at.slice(0, 10)) || jobsByDay.set(j.start_at.slice(0, 10), []).get(j.start_at.slice(0, 10))!).push(j);
  const holMap = new Map(holidays.map((h) => [h.date, h]));
  const gps = { lat: 14.5547, lng: 121.0244 };
  for (const e of active) {
    if (e.hire_date > T) continue;
    for (const d of attDays) {
      if (d < e.hire_date || dow(d) === e.rest_day) continue;
      const mk = (a: Partial<Attendance>): Attendance => ({
        ...base('att', d), employee_id: e.id, date: d, kind: 'Present', field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0,
        approval: d <= addDays(T, -3) ? 'Approved' : 'Pending', approved_by: d <= addDays(T, -3) ? (e.tier === 'Office Staff' || e.tier === 'Supervisor' ? 'u-owner' : 'u-lead') : undefined, ...a,
      });
      if (holMap.has(d) && R() > 0.15) { attendance.push(mk({ kind: 'Holiday', notes: holMap.get(d)!.name })); continue; }
      const job = (jobsByDay.get(d) || []).find((j) => j.crew_ids.includes(e.id) || j.leader_id === e.id);
      const roll = R();
      if (d < T && roll < 0.025 && e.tier !== 'Supervisor') { attendance.push(mk({ kind: 'Absent', notes: 'No call / no show' })); continue; }
      if (d < T && roll < 0.05 && e.tier !== 'Supervisor') { attendance.push(mk({ kind: 'Leave', paid_leave: R() < 0.7, notes: 'Sick leave' })); continue; }
      const isLate = R() < 0.1, isOT = R() < (job ? 0.22 : 0.05);
      const inM = isLate ? between(8, 40) : between(-15, 3); // minutes relative to shift start
      const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      const inAt = `${d}T${hhmm(8 * 60 + inM)}`;
      const outAt = d === T ? undefined : `${d}T${hhmm(isOT ? 17 * 60 + between(0, 4) * 30 : 17 * 60 + between(0, 12))}`;
      if (d === T && !job && e.tier !== 'Office Staff' && e.tier !== 'Supervisor' && R() < 0.5) continue; // standby crew not yet in
      const t = computeTimes(e, inAt, outAt, settings.grace_minutes);
      attendance.push(mk({
        clock_in: inAt, clock_out: outAt, job_id: job?.id, field_work: !!job, in_lat: gps.lat + (R() - 0.5) * 0.02, in_lng: gps.lng + (R() - 0.5) * 0.02,
        out_lat: outAt ? gps.lat + (R() - 0.5) * 0.02 : undefined, out_lng: outAt ? gps.lng + (R() - 0.5) * 0.02 : undefined, ...t,
      }));
    }
  }

  /* ---- recurring & monthly expenses, petty cash ---- */
  const months: string[] = [];
  for (let k = 3; k >= 0; k--) { const d = addDays(monthStart(T), -k * 28); const m = monthStart(d); if (!months.includes(m)) months.push(m); }
  for (const m of months) {
    const isCur = m.slice(0, 7) === T.slice(0, 7);
    const last = isCur && m === months[months.length - 1];
    const ex = (date: string, payee: string, category: Expense['category'], amount: number, vat: number, extra: Partial<Expense> = {}) => {
      if (date > T) return;
      expenses.push({ ...base('exp', date), date, payee, category, branch_id: BR1, amount, vat, wht: 0, method: 'Bank Transfer', approval: 'Approved', approved_by: 'u-fin', paid: true, petty_cash: false, recurring: last ? 'monthly' : null, ...extra } as Expense);
    };
    ex(addDays(m, 4), 'Office & Warehouse Lessor', 'Rent', 52000, 5571.43, { wht: 1040, notes: 'Monthly rent' });
    ex(addDays(m, 9), 'Meralco', 'Utilities', between(9000, 13500), 0);
    ex(addDays(m, 9), 'PLDT / Converge', 'Utilities', 3400, 364.29);
    ex(addDays(m, 14), 'Meta Ads / Print Collaterals', 'Marketing', between(4500, 9000), 0, { method: 'Credit Card' });
    ex(addDays(m, 20), 'LTO / Vehicle Registration & Insurance', 'Government Fees', between(1500, 6000), 0, { recurring: null });
    ex(addDays(m, 17), 'HydroTools PH', 'Equipment Repair', between(2500, 9000), 0, { recurring: null });
  }
  expenses.push({ ...base('exp'), date: addDays(T, -1), payee: 'Office Snacks & Supplies', category: 'Other', branch_id: BR1, amount: 1380, vat: 0, wht: 0, method: 'Cash', approval: 'Pending', paid: true, petty_cash: true } as Expense);
  expenses.push({ ...base('exp'), date: T, payee: 'Scaffolding Rentals Co.', category: 'Subcontractor', branch_id: BR1, amount: 14560, vat: 1560, wht: 260, method: 'Bank Transfer', approval: 'Pending', paid: false, petty_cash: false, notes: 'Awaiting Owner approval' } as Expense);
  const petty: PettyCashEntry[] = [
    { ...base('pc', addDays(T, -30)), date: addDays(T, -30), kind: 'Replenishment', amount: 20000, description: 'Petty cash fund replenishment' },
    { ...base('pc', addDays(T, -12)), date: addDays(T, -12), kind: 'Replenishment', amount: 10000, description: 'Replenishment' },
  ];
  for (const e of expenses.filter((x) => x.petty_cash && x.approval === 'Approved')) petty.push({ ...base('pc', e.date), date: e.date, kind: 'Disbursement', amount: e.amount, description: `${e.category} – ${e.payee}`, expense_id: e.id });

  /* ---- payroll ---- */
  const adjustments: PayrollAdjustment[] = [];
  const adj = (e: Employee, kind: PayrollAdjustment['kind'], amount: number, note: string, extra: Partial<PayrollAdjustment> = {}) =>
    adjustments.push({ ...base('adj'), employee_id: e.id, kind, amount, note, period_id: null, active: true, ...extra });
  adj(E_L1, 'Allowance', 300, 'Team leader allowance (per period)');
  adj(E_L2, 'Allowance', 300, 'Team leader allowance (per period)');
  adj(FIELD[2], 'Cash Advance', 500, 'Cash advance – repay ₱500 per period', { balance: 1500 });
  adj(FIELD[4], 'Loan', 750, 'Company loan – emergency', { balance: 4500 });
  adj(FIELD[6], 'Other Deduction', 150, 'Uniform deduction', { balance: 300 });

  const biweekly: { start: string; end: string }[] = [];
  for (let d = addDays(T, -75); d <= T; d = addDays(d, 1)) {
    const dd = +d.slice(8, 10);
    if (dd === 1) biweekly.push({ start: d, end: addDays(d, 14) });
    if (dd === 16) biweekly.push({ start: d, end: monthEnd(d) });
  }
  const periods: PayrollPeriod[] = [];
  const runs: PayrollRun[] = [];
  const draftDB = { employees, attendance, holidays, adjustments, settings } as unknown as DB;
  const mkPeriod = (label: string, start: string, end: string, type: PayrollType, status: PayrollPeriod['status']): PayrollPeriod => ({
    ...base('per', addDays(end, 1)), label, start, end, type, status, locked: status === 'Finalized',
    approved_by: status === 'Approved' || status === 'Finalized' ? 'u-owner' : undefined, approved_at: status === 'Approved' || status === 'Finalized' ? stamp(addDays(end, 2)) : undefined,
    finalized_by: status === 'Finalized' ? 'u-owner' : undefined, finalized_at: status === 'Finalized' ? stamp(addDays(end, 4)) : undefined, submitted_by: status !== 'Draft' ? 'u-fin' : undefined,
  });
  const completedBW = biweekly.filter((p) => p.end < T);
  const process = (p: PayrollPeriod, statusFinal: PayrollPeriod['status']) => {
    const { lines } = buildPayrollLines({ ...draftDB, adjustments } as DB, p, p.end);
    runs.push({ ...base('run', p.end), period_id: p.id, lines });
    if (statusFinal === 'Approved' || statusFinal === 'Finalized') {
      const gross = sum(lines, (l) => l.gross);
      expenses.push({ ...base('exp', p.end), date: p.end, payee: 'Payroll – ' + p.label, category: 'Payroll', branch_id: BR1, amount: round2(gross), vat: 0, wht: 0, method: 'Bank Transfer', approval: 'Approved', approved_by: 'u-owner', paid: statusFinal === 'Finalized', petty_cash: false, source: 'payroll', source_id: p.id } as Expense);
      p.expense_id = expenses[expenses.length - 1].id;
    }
    if (statusFinal === 'Finalized') {
      for (const l of lines) for (const aid of l.adjustment_ids) {
        const a = adjustments.find((x) => x.id === aid)!;
        if (a.balance !== undefined) a.balance = Math.max(0, round2(a.balance - Math.min(a.amount, a.balance)));
      }
    }
  };
  completedBW.forEach((b, i) => {
    const fromEnd = completedBW.length - 1 - i;
    const status: PayrollPeriod['status'] = fromEnd === 0 ? 'For Approval' : fromEnd === 1 ? 'Approved' : 'Finalized';
    const p = mkPeriod(`${b.start.slice(0, 7)} ${+b.start.slice(8) === 1 ? '1st' : '2nd'} half (biweekly)`, b.start, b.end, 'biweekly', status);
    periods.push(p); process(p, status);
  });
  const curBW = biweekly.find((p) => p.end >= T);
  if (curBW) periods.push(mkPeriod(`${curBW.start.slice(0, 7)} ${+curBW.start.slice(8) === 1 ? '1st' : '2nd'} half (biweekly)`, curBW.start, curBW.end, 'biweekly', 'Draft'));
  for (let k = 3; k >= 1; k--) {
    const ref = addDays(monthStart(T), -k * 28 + 3); const s = monthStart(ref), e = monthEnd(ref);
    if (e >= monthStart(T) || periods.some((p) => p.type === 'monthly' && p.start === s)) continue;
    const p = mkPeriod(`${s.slice(0, 7)} monthly (office)`, s, e, 'monthly', 'Finalized'); periods.push(p); process(p, 'Finalized');
  }
  // fix numbering: expense for recent runs must not be double counted with earlier month-loop payroll (none generated there)

  /* ---- performance reviews ---- */
  const reviews: PerfReview[] = [];
  const mths = [T.slice(0, 7), addDays(monthStart(T), -1).slice(0, 7)];
  for (const e of active.filter((x) => x.department === 'Field Operations')) for (const m of mths) {
    reviews.push({
      ...base('rev'), employee_id: e.id, month: m, quality: between(72, 98), safety: between(78, 100), equipment_care: between(68, 98), teamwork: between(70, 98), supervisor: between(70, 98),
      training_completed: R() < 0.3 ? 1 : 0, disciplinary: R() < 0.06 ? 'Verbal warning – repeated late arrival' : '', incentive: R() < 0.3 ? 500 : 0, penalty: 0, notes: '',
    });
  }

  /* ---- communications & complaints ---- */
  const communications: Communication[] = [
    { ...base('com', addDays(T, -6)), client_id: clients[1].id, channel: 'Call', summary: 'Confirmed schedule for Tower 2 façade; client requested early start.', follow_up_date: addDays(T, -1), follow_up_done: false },
    { ...base('com', addDays(T, -3)), client_id: clients[3].id, channel: 'Email', summary: 'Sent accomplishment report and photo documentation for last job.', follow_up_date: addDays(T, 3), follow_up_done: false },
    { ...base('com', addDays(T, -12)), client_id: clients[0].id, channel: 'Visit', summary: 'Ocular for Annex glazing; measured 44 panels.', follow_up_done: true },
    { ...base('com', addDays(T, -2)), client_id: clients[10].id, channel: 'Viber / WhatsApp', summary: 'Prospect asked for a rough estimate; sent price guide.', follow_up_date: addDays(T, 2), follow_up_done: false },
  ];
  const complaints: Complaint[] = [
    { ...base('cmp', addDays(T, -25)), client_id: clients[2].id, job_id: jobs.find((j) => j.client_id === clients[2].id && j.status === 'Completed')?.id, summary: 'Water spots left on showroom entrance glass.', severity: 'Medium', status: 'Resolved', resolution: 'Return visit, re-cleaned at no charge.' },
    { ...base('cmp', addDays(T, -4)), client_id: clients[8].id, summary: 'Crew arrived 45 minutes late.', severity: 'Low', status: 'Investigating' },
  ];


  const items0 = items; // inventory items (workflow builder below uses its own local `items`)
  /* ---- job workflows (11-step tracker inside each job card), variations & incidents ---- */
  const workflows: JobWorkflow[] = [];
  const variations: Variation[] = [];
  const incidents: IncidentReport[] = [];
  type Stage = 'hq' | 'disp' | 'arr' | 'conf' | 'start' | 'finish' | 'rep' | 'closed';
  const ORDER: Stage[] = ['hq', 'disp', 'arr', 'conf', 'start', 'finish', 'rep', 'closed'];
  const mkWorkflow = (job: Job, upTo: Stage | 'draft'): JobWorkflow => {
    const d = job.start_at.slice(0, 10);
    const site = sites.find((x) => x.id === job.site_id)!;
    const q = quotations.find((x) => x.id === job.quotation_id);
    const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
    const lvl = upTo === 'draft' ? -1 : ORDER.indexOf(upTo);
    const has = (s: Stage) => lvl >= ORDER.indexOf(s);
    const closed = upTo === 'closed';
    const its = buildChecklistItems({ assets, items: items0 }, job).map((i) => ({
      ...i, out_ok: true, out_by: (R() < 0.8 ? 'scan' : 'id') as 'scan' | 'id', loaded_qty: i.qty,
      ...(i.kind === 'material' ? { out_container: 'Good' as const } : { out_condition: 'Good' as const }),
      ...(closed ? { returned_qty: i.kind === 'material' ? 0 : i.qty, ret_condition: 'Good' as const, ret_by: 'scan' as const, ...(i.kind === 'material' ? { used_qty: i.qty } : {}) } : {}),
    }));
    const at = (h: number, m = between(0, 55)) => `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const wf: JobWorkflow = { ...base('wf', d), job_id: job.id, items: its, panels: [] };
    if (has('hq')) Object.assign(wf, { hq_at: at(7, 5), hq_by: 'u-lead', hq_fuel: pick(['Full', '3/4', '3/4']) });
    if (has('disp')) Object.assign(wf, { disp_at: at(7, between(20, 45)), disp_by: 'u-lead' });
    if (has('arr')) Object.assign(wf, { arr_at: at(8, between(10, 40)), arr_by: 'u-lead', arr_contact_name: site.contact_person, arr_contact_mobile: site.contact_mobile, arr_notes: 'Access via service entrance.', arr_crew_present: crew, arr_crew_absent: [] });
    if (has('conf')) {
      const total = q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total : job.contract_amount;
      const recurring = R() < 0.6;   // returning client, unchanged scope → confirmed by the Team Leader, no new signature
      Object.assign(wf, { conf_at: at(8, between(41, 55)), conf_by: 'u-lead', conf_quotation_id: q?.id, conf_original_total: total, conf_final_total: total, ...(recurring ? { conf_mode: 'confirmed' } : { conf_mode: 'approval', conf_name: site.contact_person, conf_signature: svgPhoto('Conforme', '#123A63') }) });
    }
    if (has('start')) Object.assign(wf, { start_at: at(9, between(0, 20)), start_by: 'u-lead' });
    if (has('finish')) Object.assign(wf, { finish_at: at(15, between(0, 40)), finish_by: 'u-lead' });
    if (has('rep')) Object.assign(wf, {
      rep_at: at(15, between(41, 50)), rep_by: 'u-lead', rep_scope: job.scope, rep_findings: job.findings || 'Work completed without issues.', rep_limits: 'Areas beyond reach excluded.', rep_recs: 'Quarterly maintenance cleaning recommended.',
      rep_complimentary: 'Entrance door glass wiped at no charge.', rep_client_name: site.contact_person, rep_client_sig: svgPhoto('Signature', '#123A63'), rep_client_at: at(15, 55),
      rep_tm_name: employees.find((e) => e.id === job.leader_id)?.full_name ?? 'Team Leader', rep_tm_sig: svgPhoto('TopMop', '#0B2545'), rep_rating: 5,
    });
    if (closed) Object.assign(wf, { rc_at: at(17, 40), rc_by: 'u-lead', leave_at: at(16, between(10, 30)), leave_by: 'u-lead', hqa_at: at(17, between(5, 35)), hqa_by: 'u-lead', hqa_fuel: pick(['1/2', '1/2', '1/4', '3/4']), closed_at: at(17, 40), closed_by: 'u-lead' });
    workflows.push(wf);
    return wf;
  };
  const mkInc = (wf: JobWorkflow, type: IncidentReport['type'], severity: IncidentReport['severity'], description: string, status: IncidentReport['status'], extra: Partial<IncidentReport> = {}) => {
    incidents.push({ ...base('inc', wf.created_at.slice(0, 10)), number: nn('INC'), job_id: wf.job_id, workflow_id: wf.id, type, severity, description, status, auto: true, ...(status === 'Resolved' ? { resolution: 'Recounted at the warehouse; adjusted and closed.', resolved_at: wf.created_at } : {}), ...extra });
  };
  const recentDone = jobs.filter((j) => j.status === 'Completed' && j.start_at.slice(0, 10) >= addDays(T, -21) && j.vehicle_id);
  recentDone.forEach((job, idx) => {
    const openHardHat = idx === recentDone.length - 2 && idx > 3;
    const wf = mkWorkflow(job, 'closed');
    job.status = 'Closed';
    if (idx === 0) { const m = wf.items.find((i) => i.kind === 'material'); if (m) { m.ret_condition = 'Missing'; m.ret_note = 'Container not on the truck'; m.used_qty = m.qty; mkInc(wf, 'Material shortage', 'Medium', `${m.label}: container reported missing on return check. Container not on the truck`, 'Resolved', { item_id: m.item_id }); } }
    if (idx === 1) { const g = wf.items.find((i) => i.kind === 'ppe' && i.label === 'Gloves'); if (g) { g.returned_qty = g.qty - 1; g.ret_note = 'One pair left on site roof'; mkInc(wf, 'Missing PPE', 'Medium', `Gloves: 1 of ${g.qty} not returned. One pair left on site roof`, 'Resolved'); } }
    if (idx === 2) mkInc(wf, 'Damaged asset', 'Medium', 'LAD-002 Extension Ladder 32ft returned with a bent rail. Taken out of service.', 'Investigating', { asset_id: A('LAD-002').id, ticket_id: tickets[1].id });
    if (idx === 3) mkInc(wf, 'Damaged asset', 'Medium', 'SFC-002 Surface Cleaner 24" - bearing noise and cracked skirt on return.', 'Acknowledged', { asset_id: A('SFC-002').id, ticket_id: tickets[0].id, resolution: 'Acknowledged by Operations; repair in progress under ticket.' });
    if (openHardHat) { const g = wf.items.find((i) => i.kind === 'ppe' && i.label === 'Hard hat'); if (g) { g.returned_qty = g.qty - 1; g.ret_condition = 'Good'; g.ret_note = 'Not on the truck at unloading'; mkInc(wf, 'Missing PPE', 'Medium', `Hard hat: 1 of ${g.qty} not returned. Not on the truck at unloading`, 'Open'); } }
  });
  // Payments waiting for Finance: a cash payment recorded by a Team Leader, and a verified cheque that has not cleared yet
  {
    const open = invoices.filter((i) => i.status === 'Approved' && invoiceTotals(i).total > 2000 && !payments.some((p) => p.invoice_id === i.id)).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
    const [a, b] = open;
    if (a) payments.push(mkPay(a, '', T, round2(invoiceTotals(a).total * 0.3), 0, 'Cash', '', { status: 'Pending Verification', verified_by: undefined, verified_at: undefined, received_by: 'Jonathan D. Ramos (Team Leader)', notes: 'Collected on site after the service.', created_by: 'u-lead' }));
    if (b) payments.push(mkPay(b, '', addDays(T, -1), round2(invoiceTotals(b).total * 0.5), 0, 'Cheque', 'CHQ0045821', { cheque_status: 'Deposited', cleared_at: undefined }));
  }

  // Client Satisfaction Check results for finished jobs (mostly happy; a few unhappy; the latest unhappy one still waits for the Admin)
  const feedback: ClientFeedback[] = [];
  const finished = jobs.filter((j) => ['Completed', 'Closed'].includes(j.status) && j.leader_id && j.start_at.slice(0, 10) <= T).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const negIdx = finished.map((_, i) => i).filter((i) => i % 9 === 4);
  const lastRecentNeg = [...negIdx].reverse().find((i) => recentDone.includes(finished[i]));
  finished.forEach((j, i) => {
    const rating = (negIdx.includes(i) ? 1 : i % 3 === 0 ? 2 : 3) as 1 | 2 | 3;
    // three 1–5 questions: quality of cleaning, crew professionalism, communication
    const q: [number, number, number] = rating === 3 ? [5, i % 4 === 0 ? 4 : 5, i % 5 === 0 ? 4 : 5] : rating === 2 ? [4, 4, i % 7 === 3 ? 2 : 3] : [2, 3, 1];
    const low = rating === 1 || q.some((n) => n <= 2);
    const cat = rating === 1 ? (['Quality', 'Delay', 'Communication', 'Scope', 'Damage'] as const)[i % 5] : 'Communication' as const;
    const open = i === lastRecentNeg;
    const d0 = j.start_at.slice(0, 10);
    feedback.push({
      ...base('fb', d0), job_id: j.id, workflow_id: workflows.find((w) => w.job_id === j.id)?.id, client_id: j.client_id, leader_id: j.leader_id, crew_ids: [...j.crew_ids], service_codes: [...j.service_codes], service_date: d0,
      rating, q_quality: q[0], q_professionalism: q[1], q_communication: q[2], aspects: [],
      comment: rating === 1 ? 'Streaks left on a few panels and the crew arrived late.' : low ? 'Nobody told us when the crew would finish.' : undefined, issue_category: low ? cat : undefined,
      follow_up: !low ? 'None' : open ? 'Required' : 'Acknowledged',
      ...(low && !open ? { ack_note: 'Called the client, re-cleaned the affected area free of charge.', ack_by: 'u-owner', ack_at: `${addDays(d0, 1)}T09:00:00.000Z` } : {}),
      submitted_by: 'u-lead', submitted_at: `${d0}T16:00:00.000Z`,
    });
    if (open) j.status = 'Work Completed';
  });

  // Back jobs / callbacks: linked follow-up jobs (own number, schedule, workflow); the original jobs are untouched
  const backJobs: BackJob[] = [];
  {
    const origins = recentDone.filter((j) => j.leader_id).sort((a, b) => a.start_at.localeCompare(b.start_at));
    const mkLink = (origin: Job, dayOffset: number, status: Job['status'], noCharge: boolean, reason: BackJob['reason'], desc: string, extra: Partial<Job> = {}) => {
      const d0 = addDays(origin.start_at.slice(0, 10), dayOffset);
      const jid = id('job'); const bjid = id('bj');
      const link: Job = { ...origin, id: jid, number: nn('JOB'), status, start_at: `${d0}T08:00`, end_at: `${d0}T14:00`, scope: `BACK JOB (${reason}) for ${origin.number}: ${desc}`, quotation_id: undefined, contract_amount: 0, back_job_id: bjid, origin_job_id: origin.id,
        findings: '', damage_report: '', equipment_condition_notes: '', completed_at: undefined, signoff_name: undefined, signoff_at: undefined, signoff_data: undefined, client_rating: undefined, checklist: origin.checklist.map((c) => ({ ...c, done: false })), ...extra, created_at: stamp(d0), updated_at: stamp(d0) };
      // open follow-ups start with no vehicle / equipment (assigned when scheduled) so they never double-book the original crew's gear
      if (status !== 'Closed') { link.vehicle_id = undefined; link.equipment_ids = []; link.materials = []; if (status !== 'Confirmed') { link.leader_id = undefined; link.crew_ids = []; } }
      jobs.push(link);
      void noCharge;
      return { link, d0, bjid };
    };
    const mkBj = (origin: Job, link: Job, bjid: string, d0: string, reason: BackJob['reason'], desc: string, charge: BackJob['charge_type'], status: BackJob['status'], responsible: string, extra: Partial<BackJob> = {}): BackJob => {
      const rep = addDays(d0, -1) > origin.start_at.slice(0, 10) ? addDays(d0, -1) : origin.start_at.slice(0, 10);
      const bj: BackJob = {
        ...base('bj', rep), id: bjid, number: nn('BJ'), origin_job_id: origin.id, job_id: link.id, client_id: origin.client_id, site_id: origin.site_id, origin_workflow_id: workflows.find((w) => w.job_id === origin.id)?.id,
        origin_quotation_id: origin.quotation_id, origin_invoice_id: invoices.find((i) => i.job_id === origin.id)?.id, origin_leader_id: origin.leader_id, origin_crew_ids: [...origin.crew_ids],
        reason, description: desc, reported_on: rep, reported_by: 'Operations Manager', responsible, charge_type: charge, status,
        ...(status !== 'Reported' ? { reviewed_by: 'u-ops', reviewed_at: stamp(rep, 10) } : {}),
        ...(['Approved', 'Scheduled', 'In Progress', 'Resolved', 'Closed'].includes(status) ? { approved_by: 'u-ops', approved_at: stamp(rep, 11), approval_note: charge === 'No Charge' ? 'Our miss — redo at no charge.' : 'Client agreed to a paid add-on; quotation sent.' } : {}),
        ...(['Resolved', 'Closed'].includes(status) ? { resolved_at: stamp(d0, 15) } : {}), ...(status === 'Closed' ? { closed_at: stamp(d0, 17) } : {}), ...extra,
      };
      backJobs.push(bj);
      return bj;
    };
    const [o1, o2, o3] = [origins[origins.length - 5], origins[origins.length - 3], origins[origins.length - 1]];
    if (o1) {
      const a = mkLink(o1, 3, 'Closed', true, 'Missed Area', 'Two roof-deck panels were missed on the first visit.');
      const wfl = mkWorkflow(a.link, 'closed');
      mkBj(o1, a.link, a.bjid, a.d0, 'Missed Area', 'Two roof-deck panels were missed on the first visit.', 'No Charge', 'Closed', 'Field crew');
      feedback.push({ ...base('fb', a.d0), job_id: a.link.id, workflow_id: wfl.id, client_id: a.link.client_id, leader_id: a.link.leader_id, crew_ids: [...a.link.crew_ids], service_codes: [...a.link.service_codes], service_date: a.d0, rating: 3, q_quality: 5, q_professionalism: 5, q_communication: 5, aspects: [], follow_up: 'None', submitted_by: 'u-lead', submitted_at: `${a.d0}T15:00:00.000Z` });
      const b = mkLink(o1, 8, 'Confirmed', true, 'Quality Issue', 'Streaks returned on the east wall after rain; redo the wash.', { start_at: `${addDays(T, 1)}T08:00`, end_at: `${addDays(T, 1)}T13:00` });
      mkBj(o1, b.link, b.bjid, addDays(T, 1), 'Quality Issue', 'Streaks returned on the east wall after rain; redo the wash.', 'No Charge', 'Scheduled', 'Team Leader', { reported_on: addDays(T, -2) });
    }
    if (o2) {
      const c = mkLink(o2, 6, 'Pending', false, 'Client Complaint', 'Client wants the carport glass cleaned as well; not in the original scope.', { start_at: `${addDays(T, 3)}T08:00`, end_at: `${addDays(T, 3)}T14:00` });
      const qd = quotations.find((x) => x.id === o2.quotation_id);
      const quote: Quotation | undefined = qd ? { ...qd, id: id('qt'), number: nn('QT'), issue_date: addDays(T, -1), valid_until: addDays(T, 29), status: 'Sent', sent_at: stamp(addDays(T, -1)), decided_at: undefined, scope: c.link.scope, items: [{ service_code: o2.service_codes[0], description: 'Additional work after ' + o2.number + ' (Client Complaint): carport glass', qty: 1, unit: 'lot', rate: 6800, discount: 0 }], discount: 0, created_at: stamp(addDays(T, -1)), updated_at: stamp(addDays(T, -1)) } : undefined;
      if (quote) { quotations.push(quote); c.link.quotation_id = quote.id; c.link.contract_amount = docTotals(quote.items, 0, quote.vat_mode, quote.vat_rate).net; }
      mkBj(o2, c.link, c.bjid, addDays(T, 3), 'Client Complaint', 'Client wants the carport glass cleaned as well; not in the original scope.', 'Chargeable Additional Work', 'Approved', 'Sales / quotation', { reported_on: addDays(T, -1), quotation_id: quote?.id });
    }
    if (o3) {
      const d = mkLink(o3, 7, 'Pending', true, 'Damage', 'Client reports a scuffed aluminium frame near the entrance.', { start_at: `${addDays(T, 4)}T08:00`, end_at: `${addDays(T, 4)}T12:00` });
      mkBj(o3, d.link, d.bjid, addDays(T, 4), 'Damage', 'Client reports a scuffed aluminium frame near the entrance.', 'No Charge', 'Reported', 'Field crew', { reported_on: today() });
    }
  }

  // Ocular visits (site inspections) shown in the same calendar as jobs
  const ocularVisits: OcularVisit[] = [];
  {
    const leaders = employees.filter((e) => e.tier === 'Team Leader');
    const withSite = clients.filter((c) => sites.some((x) => x.client_id === c.id));
    const mk = (n: number, dayOff: number, hhmm: string, codes: ServiceCode[], status: OcularVisit['status'], concerns: string, extra: Partial<OcularVisit> = {}) => {
      const c = withSite[(n * 3 + 1) % withSite.length]; const site = sites.find((x) => x.client_id === c.id)!;
      const d0 = addDays(T, dayOff);
      const v: OcularVisit = { ...base('ov', addDays(d0, -3)), number: nn('OV'), client_id: c.id, contact_person: site.contact_person, contact_mobile: site.contact_mobile, site_id: site.id, location: site.address, service_codes: codes,
        start_at: `${d0}T${hhmm}`, duration_min: 60, assignee_id: leaders[n % leaders.length]?.id, concerns, access_notes: site.access_instructions || 'Register at the guard house and ask for the facilities office.', status, branch_id: c.branch_id, panels: [], measurements: [], findings: '', ...extra };
      ocularVisits.push(v); return { v, c, site };
    };
    const panels = (a: number, b: number): PanelRow[] => [
      { id: id('pnl'), area: '1st Floor', side: 'Front', external: a, internal: Math.round(a / 2), notes: 'Storefront glass' },
      { id: id('pnl'), area: '2nd Floor', side: 'Front', external: b, internal: b },
      { id: id('pnl'), area: 'Roof Deck', side: 'Rear', external: Math.round(b / 2), internal: 0 },
    ];
    mk(0, 0, '10:00', ['GLASS_EXT'], 'Confirmed', 'Wants a price for quarterly glass cleaning of the whole façade.');
    mk(1, 1, '14:00', ['ROOF'], 'Scheduled', 'Roof leaks near the skylight; check access and condition before quoting.');
    mk(2, 3, '09:00', ['GLASS_EXT', 'WALL'], 'Scheduled', 'Glass façade and covered-court wall before school opening.');
    mk(3, 6, '13:30', ['SOLAR'], 'Confirmed', 'About 60 solar panels on the carport roof.');
    mk(4, -1, '09:30', ['GLASS_EXT'], 'Completed', 'Two-storey office; wants interior and exterior glass.', { panels: panels(14, 12), measurements: [{ id: id('ms'), label: 'Lobby curtain wall height', qty: 4.5, unit: 'm', service_code: 'GLASS_EXT' }], findings: 'Hard-water stains on the 2nd floor front; lift available on weekdays only.', completed_at: `${addDays(T, -1)}T10:45`, completed_by: 'u-lead' });
    mk(5, -3, '15:00', ['FLOOR', 'WALL'], 'Completed', 'Hardscape and boundary wall cleaning.', { measurements: [{ id: id('ms'), label: 'Driveway', qty: 320, unit: 'sqm', service_code: 'FLOOR' }, { id: id('ms'), label: 'Boundary wall', qty: 180, unit: 'sqm', service_code: 'WALL' }], findings: 'Moss on the north wall; water source available on site.', completed_at: `${addDays(T, -3)}T16:10`, completed_by: 'u-lead' });
    for (const [n, off, hh, codes] of [[6, -6, '10:00', ['GLASS_EXT']], [7, -9, '11:00', ['ROOF']]] as const) {
      const { v, c, site } = mk(n, off, hh, [...codes] as ServiceCode[], 'Converted to Quotation', 'Site check before quoting.', codes[0] === 'GLASS_EXT' ? { panels: panels(10, 8), findings: 'Standard storefront; no special access needed.' } : { measurements: [{ id: id('ms'), label: 'Main roof', qty: 420, unit: 'sqm', service_code: 'ROOF' }], findings: 'Walkable roof; safety rails needed.' });
      v.completed_at = `${addDays(T, off)}T12:00`; v.completed_by = 'u-lead';
      const qt = makeQuote(c, site, [...codes] as ServiceCode[], addDays(T, off + 1), off < -7 ? 'Approved' : 'Sent', c.branch_id, [codes[0] === 'GLASS_EXT' ? 18 : 420]);
      Object.assign(qt, { ocular_visit_id: v.id, ocular_assignee_id: v.assignee_id, ocular_panels: v.panels, ocular_measurements: v.measurements });
      quotations.push(qt); v.quotation_id = qt.id; v.converted_at = stamp(addDays(T, off + 1));
    }
    mk(8, -2, '09:00', ['WALL'], 'Cancelled', 'Client postponed the inspection.', { cancel_reason: 'Client postponed — building maintenance that week.' });
  }

  // A few optional quotation images (kept apart from job photos): one Draft/Sent quotation with a mix of shared and internal images, and one approved variation
  const quoteImages: QuoteImage[] = [];
  {
    const mkImg = (target: { quotation_id?: string; variation_id?: string; job_id?: string }, category: QuoteImage['category'], caption: string, tone: string, share: boolean, item?: number, items?: QuoteItem[], at = T): QuoteImage => ({
      ...base('qi', at), ...target, category, caption, item_index: item, item_label: item !== undefined ? items?.[item]?.description : undefined, file: svgPhoto(category, tone), name: `${category.toLowerCase().replace(/\W+/g, '-')}.svg`, width: 640, height: 480, share_with_client: share,
    });
    const open = quotations.filter((x) => ['Sent', 'Draft'].includes(x.status) && x.items.length).sort((a, b) => b.issue_date.localeCompare(a.issue_date))[0];
    if (open) {
      quoteImages.push(mkImg({ quotation_id: open.id }, 'Scope Area', 'Front façade — all glass included', '#12a1a7', true, 0, open.items, open.issue_date));
      quoteImages.push(mkImg({ quotation_id: open.id }, 'Panel Count', 'Second-floor panels counted from this side', '#0B2545', true, 0, open.items, open.issue_date));
      quoteImages.push(mkImg({ quotation_id: open.id }, 'Access Limitation', 'Narrow service lane — ladder only, no lift', '#c9a227', false, undefined, undefined, open.issue_date));
    }
    const av = variations.find((x) => x.status === 'Approved');
    if (av) quoteImages.push(mkImg({ variation_id: av.id, job_id: av.job_id }, 'Additional Work', 'Roof-deck panels found on site', '#e0782b', true, 0, av.items, av.created_at.slice(0, 10)));
  }

  // Payment Method Confirmation recorded by the Team Leader on recent jobs (what the client said they would do)
  const confirmations: PaymentConfirmation[] = [];
  for (const j of recentDone.slice(0, 9)) {
    const inv = invoices.find((i) => i.job_id === j.id && i.status === 'Approved'); if (!inv) continue;
    const total = invoiceTotals(inv).total; const d0 = j.start_at.slice(0, 10);
    const p = payments.find((x) => x.invoice_id === inv.id);
    const id0 = id('pc');
    const c: PaymentConfirmation = p
      ? { ...base('pc', d0), id: id0, job_id: j.id, workflow_id: workflows.find((w) => w.job_id === j.id)?.id, client_id: j.client_id, final_bill: total, method: p.method, collection: 'Received', expected_today: p.amount, balance_later: Math.max(0, round2(total - p.amount)), note: 'Client paid before the crew left the site.', confirmed_by: 'u-lead', confirmed_at: `${d0}T16:20`, payment_id: p.id,
          ...(p.method === 'GCash' ? { gcash_ref: p.gcash_ref } : p.method === 'Bank Transfer' ? { bank_name: p.bank_name, transfer_ref: p.reference } : p.method === 'Cheque' ? { bank_name: p.bank_name, cheque_no: p.cheque_no, cheque_date: p.cheque_date } : { amount_received: p.amount }) }
      : { ...base('pc', d0), id: id0, job_id: j.id, workflow_id: workflows.find((w) => w.job_id === j.id)?.id, client_id: j.client_id, final_bill: total, method: 'Terms / To Be Billed', collection: 'To Be Paid Later', expected_today: 0, balance_later: total, note: 'Accounts payable processes invoices every Friday.', terms: 'Net 30 — bill to accounts payable', due_date: inv.due_date, confirmed_by: 'u-lead', confirmed_at: `${d0}T16:20` };
    confirmations.push(c);
    if (p) p.confirmation_id = id0;
  }

  // today's jobs spread across the tracker so every dashboard status has data
  const live1 = jobs.filter((j) => j.status === 'In Progress');
  const liveStage: Stage[] = ['rep', 'start', 'arr', 'disp', 'start', 'start'];
  const liveStatus: Job['status'][] = ['Work Completed', 'In Progress', 'On Site', 'Dispatched', 'In Progress', 'In Progress'];
  live1.forEach((j, i) => {
    const k = Math.min(i, liveStage.length - 1);
    const wf = mkWorkflow(j, liveStage[k]);
    j.status = liveStatus[k];
    const d0 = j.start_at.slice(0, 10);
    if (k === 0) {
      Object.assign(j, {
        completed_at: `${d0}T15:30`, checklist: j.checklist.map((c) => ({ ...c, done: true })), findings: 'Work completed without issues.', signoff_name: sites.find((x) => x.id === j.site_id)!.contact_person,
        signoff_at: `${d0}T15:30`, signoff_data: svgPhoto('Signature', '#123A63'), client_rating: 5,
      });
    }
    if (k === 1 && j.service_codes.includes('GLASS_EXT')) {
      // glass panel count with extra panels found on site → approved variation
      wf.panels = [
        { id: id('pnl'), area: '1st Floor', side: 'Front', external: 14, internal: 6, notes: 'Storefront glass' },
        { id: id('pnl'), area: '2nd Floor', side: 'Front', external: 12, internal: 8 },
        { id: id('pnl'), area: '2nd Floor', side: 'Rear', external: 6, internal: 4, notes: 'Small sections grouped' },
        { id: id('pnl'), area: 'Roof Deck', side: 'Left Side', external: 8, internal: 0, additional: true, notes: 'Not in original scope' },
      ];
      const v: Variation = {
        ...base('var', d0), job_id: j.id, number: `${j.number}-V1`, reason: 'Eight additional external glass panels on the roof deck found on site.',
        items: [{ service_code: 'GLASS_EXT', description: 'Additional external glass panels – roof deck (8)', qty: 8, unit: 'panel', rate: 140, discount: 0 }],
        discount: 0, vat_mode: quotations.find((x) => x.id === j.quotation_id)?.vat_mode ?? 'exclusive', vat_rate: quotations.find((x) => x.id === j.quotation_id)?.vat_rate ?? 12,
        panel_row_ids: [wf.panels[3].id], status: 'Approved', client_name: sites.find((x) => x.id === j.site_id)!.contact_person, client_signature: svgPhoto('Signature', '#123A63'), signed_at: `${d0}T10:30:00.000Z`, decided_by: 'u-lead',
      };
      variations.push(v);
      // an extra the client turned down at the conforme: kept on record, not in the final amount
      variations.push({
        ...base('var', d0), job_id: j.id, number: `${j.number}-V2`, reason: 'Solar panel cleaning offered at the site', source: 'final_review', status: 'Rejected', discount: 0,
        items: [{ service_code: 'SOLAR', category: 'solar', description: 'Solar panels – carport roof', qty: 20, entered_qty: 14, unit: 'panel', rate: 245, discount: 0, note: 'Client requested a price at the site' }],
        vat_mode: v.vat_mode, vat_rate: v.vat_rate, panel_row_ids: [], client_name: v.client_name, notes: 'Will arrange separately', decided_by: 'u-lead', decided_at: `${d0}T08:50:00.000Z`,
      });
      j.contract_amount = round2(j.contract_amount + docTotals(v.items, v.discount, v.vat_mode, v.vat_rate).net);
    }
  });
  // (no open discount requests are seeded: a request only exists after the quotation has been presented to the client on site)
  // tomorrow's first confirmed job: HQ checklist started but not finished
  const inUseNow = (aid?: string) => !!aid && checkouts.some((c) => c.asset_id === aid && c.status === 'Released');
  // the crew is still out with vans 1 & 2 today, so tomorrow's first job is booked on the spare van and free equipment
  const next = jobs.find((j) => j.status === 'Confirmed' && j.start_at.slice(0, 10) > T);
  if (next) { next.vehicle_id = A('VEH-003').id; next.equipment_ids = [A('HSE-001').id, A('PMP-001').id, A('LAD-001').id, ...next.equipment_ids.filter((e) => !inUseNow(e))].filter((e, i, a) => a.indexOf(e) === i); }
  if (next) {
    const wf = mkWorkflow(next, 'draft');
    wf.items = wf.items.map((i, k) => (k < 3 ? { ...i, out_ok: true, loaded_qty: i.qty, out_condition: i.kind === 'material' ? undefined : ('Good' as const), out_container: i.kind === 'material' ? ('Good' as const) : undefined } : { ...i, out_ok: false, out_by: undefined, loaded_qty: undefined, out_condition: undefined, out_container: undefined }));
    next.status = 'Dispatch Checklist Pending';
  }

  // a scheduled follow-up goes on the first day its team is free (checked once every other booking is final)
  for (const bj of backJobs) {
    const link = jobs.find((j) => j.id === bj.job_id);
    if (!link || link.status !== 'Confirmed') continue;
    for (let k = 0; k < 30 && findConflicts({ jobs: jobs.filter((x) => x.id !== link.id) }, link).length; k++) { const nd = addDays(link.start_at.slice(0, 10), 1); link.start_at = `${nd}T08:00`; link.end_at = `${nd}T13:00`; }
  }

  // client follow-ups: 6-month and 1-year dates from each client's newest completed service (a few custom intervals so the demo has due / overdue items)
  const byName = (n: string) => clients.find((c) => c.name.startsWith(n));
  const followupRules: FollowUpRule[] = [
    ...(byName('Parish') ? [{ ...base('fr'), client_id: byName('Parish')!.id, short_months: 1, long_months: 3, note: 'Church asked for monthly walkway and glass maintenance' }] : []),
    ...(byName('Greenfield') ? [{ ...base('fr'), client_id: byName('Greenfield')!.id, short_months: 1, long_months: 2, note: 'Monthly plant wash-down' }] : []),
    { ...base('fr'), service_code: 'SOLAR' as ServiceCode, short_months: 3, long_months: 6, note: 'Solar panels: clean every 3 months' },
  ];
  const followups: FollowUp[] = planFollowUps({ clients, jobs, followups: [], followup_rules: followupRules } as unknown as DB, T).inserts.map((x) => ({ ...base('fu', x.reference_date), ...x }) as FollowUp);
  const fuOf = (name: string) => followups.find((f) => f.client_id === byName(name)?.id && f.slot === 'short');
  const gf = fuOf('Greenfield');
  if (gf) Object.assign(gf, { status: 'Contacted', note: 'Spoke with the plant manager; will confirm a schedule.', actioned_by: 'u-owner', actioned_at: stamp(addDays(T, -1)), history: [{ at: stamp(addDays(T, -1)), by: 'Owner / Admin', status: 'Contacted', note: 'Spoke with the plant manager; will confirm a schedule.' }] });
  const dc = fuOf('Dela Cruz'); const booking = dc && jobs.find((j) => j.client_id === dc.client_id && ['Confirmed', 'Pending'].includes(j.status) && j.start_at.slice(0, 10) > T);
  if (dc && booking) Object.assign(dc, { status: 'Booked', booked_job_id: booking.id, note: 'Booked after our call.', actioned_by: 'u-owner', actioned_at: stamp(addDays(T, -4)), history: [{ at: stamp(addDays(T, -4)), by: 'Owner / Admin', status: 'Booked', note: 'Booked after our call.' }] });

  for (const row of [...clients, ...sites] as { address: string }[]) Object.assign(row, geoPatch(row.address));
  for (const row of ocularVisits) Object.assign(row, geoPatch(row.location));

  const maint = seedMaintenance({ assets, items, T, opsId: E_OPS.id, leaderId: E_L1.id, ownerUser: OWNER, base, nn });

  const out: DB = {
    users, branches, clients, sites, communications, complaints, services, inquiries, quotations, jobs, employees, attendance, corrections: [
      { ...base('cor'), employee_id: FIELD[1].id, date: addDays(T, -2), clock_in: `${addDays(T, -2)}T08:00`, clock_out: `${addDays(T, -2)}T17:00`, reason: 'Forgot to clock out; was on site until 5PM per team leader.', status: 'Pending' },
    ], holidays, reviews, adjustments, periods, runs, locations, items, stock, requests: [
      { ...base('mr'), job_id: jobs.find((j) => j.status === 'Confirmed')?.id ?? jobs[0].id, requested_by: E_L1.id, lines: [{ item_id: item('CHM-001').id, qty: 4 }, { item_id: item('PPE-002').id, qty: 2 }], status: 'Pending', note: 'Extra chemical for large glass job.' },
    ], assets, checkouts, tickets, invoices, payments, expenses, petty, notifications: [], workflows, variations, incidents, discount_requests: discountRequests, client_feedback: feedback, back_jobs: backJobs, payment_confirmations: confirmations, ocular_visits: ocularVisits, quote_images: quoteImages, followups, followup_rules: followupRules, job_orders: [], ...maint, audit: [], settings: { ...settings, counters }, version: 1,
  };
  for (const e of out.employees) { const r = employeeRating(out, e, T); if (r) Object.assign(e, { rating: r.rating, rating_parts: r.parts, rating_at: T }); }
  return out;
}

void jobDays; void diffDays; void dailyEquivalent; void ({} as Condition);
