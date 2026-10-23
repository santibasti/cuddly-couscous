import { addDays, isWeekend, todayIso } from './dates';
import { buildPhases, PACKAGES } from './logic';
import type { Attendance, BlockReason, Customer, Data, Mechanic, Part, PartKind, PartStatus, PhaseKey, Project, ServiceType, Task, Update } from './types';

/** Demo figures were drafted in USD; shop money is in pesos. */
const FX = 56;
const php = (usd: number) => Math.round((usd * FX) / 1000) * 1000;
const phpBudget = (usd: number) => Math.round((usd * FX) / 50000) * 50000;
const phpRate = (usd: number) => Math.round((usd * 25) / 50) * 50;

const mechanics: Mechanic[] = [
  { id: 'm1', name: 'Carlos Reyes', specialty: 'Engine & drivetrain', color: '#e5553d', hourlyRate: phpRate(65), dailyHours: 8, active: true },
  { id: 'm2', name: 'Jamie Brooks', specialty: 'Bodywork & metal', color: '#e8a33d', hourlyRate: phpRate(60), dailyHours: 8, active: true },
  { id: 'm3', name: 'Priya Nair', specialty: 'Paint & finish', color: '#2fb585', hourlyRate: phpRate(70), dailyHours: 8, active: true },
  { id: 'm4', name: 'Tom Walker', specialty: 'Electrical & assembly', color: '#4c8df0', hourlyRate: phpRate(58), dailyHours: 8, active: true },
  { id: 'm5', name: 'Luis Ortega', specialty: 'Upholstery & trim', color: '#9a6ee0', hourlyRate: phpRate(55), dailyHours: 6, active: true },
  { id: 'm6', name: 'Migs Dela Cruz', specialty: 'Detailing & coatings', color: '#3fb0c4', hourlyRate: phpRate(44), dailyHours: 8, active: true },
];

const customers: Customer[] = [
  { id: 'c1', name: 'Robert Hale', phone: '555-0142', email: 'rhale@example.com' },
  { id: 'c2', name: 'Maria Santos', phone: '555-0177', email: 'maria.s@example.com' },
  { id: 'c3', name: 'David Chen', phone: '555-0109', email: 'dchen@example.com' },
  { id: 'c4', name: 'Eleanor Voss', phone: '555-0198', email: 'evoss@example.com' },
  { id: 'c5', name: 'Jun Mercado', phone: '555-0211', email: 'jun.m@example.com' },
  { id: 'c6', name: 'Angela Cruz', phone: '555-0224', email: 'angela.c@example.com' },
  { id: 'c7', name: 'Paolo Lim', phone: '555-0236', email: 'paolo.l@example.com' },
];

type State = 'done' | 'doing' | 'todo';
/** [phase, title, mechanic, estHours, state, day offset from today, part ref, manual block] */
type TaskDef = [PhaseKey, string, string, number, State, number, string?, [BlockReason, string]?];
/** [ref, name, kind, supplier, cost, status, neededBy offset, eta offset, orderedOn offset, po, phase, note] */
type PartDef = [string, string, PartKind, string, number, PartStatus, number, number | null, number | null, string | null, PhaseKey, string?];

interface Def {
  id: string; code: string; customerId: string; title: string; year: number; make: string; model: string;
  color: string; vin: string; scope: string; start: number; length: number; current: number;
  budget: number; priority: Project['priority']; bay: string; status?: Project['status'];
  /** Defaults to restoration. */
  service?: ServiceType;
  packageName?: string;
  /** Coating record for ceramic jobs; cure and handover are day offsets from today. */
  coat?: { product?: string; batch?: string; glossBefore?: number; glossAfter?: number; thickness?: number; cure?: number; handover?: number; years?: number };
  /** Contract value in pesos, for jobs priced from a menu instead of the USD-drafted figures. */
  pesos?: number;
  tasks: TaskDef[]; parts: PartDef[]; notes: [number, PhaseKey | undefined, string][];
}

const defs: Def[] = [
  {
    id: 'p1', code: 'ACR-001', customerId: 'c1', title: 'Frame-off restoration', year: 1967, make: 'Ford', model: 'Mustang Fastback',
    color: 'Highland Green', vin: '7R02C123456', scope: 'Frame-off, 289 rebuild, repaint in original Highland Green, new interior.',
    start: -55, length: 150, current: 2, budget: 43000, priority: 'high', bay: 'Bay 1',
    tasks: [
      ['intake', 'Inspection & photo documentation', 'm1', 6, 'done', -54],
      ['teardown', 'Strip, tag & catalogue', 'm4', 8, 'done', -48], ['teardown', 'Frame & subframe media blast', 'm2', 8, 'done', -42],
      ['body', 'Rust repair – floors & rockers', 'm2', 8, 'done', -30], ['body', 'Quarter panel weld-in', 'm2', 8, 'done', -14],
      ['body', 'Door fit & gap alignment', 'm2', 6, 'doing', 0], ['body', 'Fender & hood alignment', 'm2', 6, 'todo', 2, 'fender'],
      ['body', 'Block sanding & primer', 'm2', 8, 'todo', 4], ['paint', 'Seal & colour coat', 'm3', 8, 'todo', 14], ['paint', 'Clear coat & cut/polish', 'm3', 8, 'todo', 20],
      ['mechanical', 'Rear axle install', 'm1', 6, 'todo', 20, 'axle'], ['mechanical', '289 engine rebuild', 'm1', 8, 'todo', 7, 'gasket'],
      ['interior', 'Carpet & headliner', 'm5', 6, 'todo', 40],
    ],
    parts: [
      ['fender', 'Fender pair (NOS)', 'part', 'Mustang Restoration Supply', 1850, 'backordered', 2, 12, -18, 'PO-2217', 'body', 'Supplier sourcing from NOS stock; customer informed.'],
      ['axle', 'Rear axle rebuild', 'sublet', 'Driveline Specialists', 1400, 'shipped', 18, 5, -10, 'PO-2231', 'mechanical'],
      ['gasket', 'Engine gasket & seal set', 'part', 'Speed Parts Direct', 380, 'received', 7, -3, -9, 'PO-2240', 'mechanical'],
      ['weather', 'Weatherstrip kit', 'part', 'Classic Fastener Co.', 620, 'ordered', 30, 20, -2, 'PO-2252', 'assembly'],
      ['glass', 'Door glass & regulators', 'part', 'Classic Glass Co.', 210, 'shipped', 12, 0, -6, 'PO-2260', 'assembly', 'Courier due this afternoon.'],
    ],
    notes: [[-6, 'body', 'Quarter panels welded and ground. Photos sent to Robert.'], [-1, 'body', 'Fender pair backordered — supplier found NOS stock, ETA ~12 days. Body work continues on doors meanwhile.']],
  },
  {
    id: 'p2', code: 'ACR-002', customerId: 'c2', title: 'Body & paint refresh', year: 1972, make: 'Porsche', model: '911T',
    color: 'Signal Orange', vin: '9112300456', scope: 'Rust repair and full respray in original Signal Orange; re-plate brightwork.',
    start: -40, length: 80, current: 3, budget: 18000, priority: 'normal', bay: 'Paint booth',
    tasks: [
      ['intake', 'Inspection & photo documentation', 'm1', 4, 'done', -39], ['teardown', 'Trim & glass removal', 'm4', 8, 'done', -33],
      ['body', 'Rust repair & panel work', 'm2', 8, 'done', -12], ['body', 'Final body prep', 'm2', 8, 'done', -5],
      ['paint', 'Panel prep & prime', 'm3', 8, 'done', -2],
      ['paint', 'Colour coat – Signal Orange', 'm3', 8, 'todo', 1, undefined, ['customer', 'Owner has not signed off the colour sample']],
      ['paint', 'Clear coat & cut/polish', 'm3', 8, 'todo', 4],
      ['assembly', 'Glass & seal fit', 'm4', 6, 'todo', 20, 'seals'], ['assembly', 'Brightwork refit', 'm4', 6, 'todo', 24, 'bumpers'],
      ['interior', 'Door cards & carpet', 'm5', 6, 'todo', 14],
    ],
    parts: [
      ['bumpers', 'Bumpers & trim re-plating', 'sublet', 'Precision Chrome', 2100, 'shipped', 24, 9, -12, 'PO-2209', 'assembly', 'At the plater; promised in 2 weeks.'],
      ['seals', 'Window seal set', 'part', 'Stuttgart Classics', 540, 'ordered', 20, -2, -20, 'PO-2198', 'assembly', 'Carrier says delayed in customs.'],
      ['clear', 'Clear coat & primer', 'part', 'PPG Distributor', 960, 'received', 3, -5, -9, 'PO-2244', 'paint'],
    ],
    notes: [[-2, 'paint', 'Primer done, car is in the booth. Waiting on owner to approve the colour spray-out card.'], [-1, 'paint', 'Called Maria — she will confirm colour after seeing the card on Friday.']],
  },
  {
    id: 'p3', code: 'ACR-003', customerId: 'c3', title: 'Engine rebuild & drivetrain', year: 1969, make: 'Chevrolet', model: 'Camaro SS',
    color: 'Hugger Orange', vin: '124379N500123', scope: '396 rebuild, Muncie 4-speed rebuild, rear end and brakes.',
    start: -95, length: 85, current: 4, budget: 11500, priority: 'high', bay: 'Bay 2',
    tasks: [
      ['intake', 'Inspection & photo documentation', 'm1', 4, 'done', -94], ['teardown', 'Engine & trans pull', 'm1', 8, 'done', -80],
      ['body', 'Engine bay clean-up & paint', 'm2', 8, 'done', -50],
      ['mechanical', 'Muncie 4-speed rebuild', 'm1', 8, 'done', -22], ['mechanical', 'Rear end rebuild', 'm1', 8, 'doing', 0],
      ['mechanical', 'Engine assembly', 'm1', 8, 'todo', 1, 'crank'], ['mechanical', 'Cam & lifter install', 'm1', 6, 'todo', 3, 'pistons'],
      ['mechanical', 'Brake lines & hardware', 'm4', 6, 'todo', 2],
      ['assembly', 'Engine & trans install', 'm4', 8, 'todo', 8], ['qc', 'Dyno & tune', 'm1', 6, 'todo', 12],
    ],
    parts: [
      ['crank', 'Crank grind & balance', 'sublet', 'Eastside Machine Shop', 780, 'shipped', 1, -3, -21, 'PO-2150', 'mechanical', 'Machine shop 3 days overdue. Calling daily.'],
      ['pistons', 'Piston & bearing set', 'part', 'Speed Parts Direct', 1450, 'shipped', 3, 5, -6, 'PO-2236', 'mechanical', 'Tracking shows regional hub.'],
      ['muncie', 'Muncie rebuild kit', 'part', 'Classic Drivetrain', 690, 'installed', -20, -24, -35, 'PO-2102', 'mechanical'],
      ['hoses', 'Brake hose & hardware kit', 'part', 'Inline Tube', 210, 'needed', 2, null, null, null, 'mechanical', 'Not ordered yet.'],
    ],
    notes: [[-9, 'mechanical', 'Trans rebuild finished and bench tested. Rear end in progress.'], [-3, 'mechanical', 'Crank still at the machine shop. They are running behind; customer told to expect a slip of about a week.'], [0, 'mechanical', 'Carlos called the machine shop at 9: crank promised for tomorrow morning. Rear end rebuild continues in the meantime.']],
  },
  {
    id: 'p4', code: 'ACR-004', customerId: 'c4', title: 'Interior & trim restoration', year: 1958, make: 'Mercedes-Benz', model: '190SL',
    color: 'Silver', vin: '121040850087', scope: 'Full teardown, leather, carpets, wood dash and chrome restoration.',
    start: -10, length: 120, current: 1, budget: 25000, priority: 'low', bay: 'Bay 3',
    tasks: [
      ['intake', 'Inspection & photo documentation', 'm1', 6, 'done', -9], ['teardown', 'Strip interior & trim', 'm4', 8, 'done', -4],
      ['teardown', 'Remove drivetrain', 'm4', 8, 'doing', 0], ['teardown', 'Bag & tag hardware', 'm4', 6, 'todo', 2],
      ['body', 'Rust assessment & repair plan', 'm2', 6, 'todo', 3],
      ['interior', 'Seat reupholstery', 'm5', 6, 'todo', 40, 'hides'], ['interior', 'Wood dash refinish – refit', 'm5', 6, 'todo', 5, 'dash'],
    ],
    parts: [
      ['hides', 'Leather hides (Germany)', 'part', 'Autoleder GmbH', 3200, 'ordered', 40, 24, -4, 'PO-2260', 'interior', 'Long lead time import.'],
      ['dash', 'Wood dash veneer refinish', 'sublet', 'Heritage Woodworks', 1100, 'needed', 6, null, null, null, 'interior', 'Needs to go out this week to hit the schedule.'],
    ],
    notes: [[-1, 'teardown', 'Drivetrain coming out tomorrow. Found original paint code tag under the glovebox — kept for reference.']],
  },
  {
    id: 'p6', code: 'ACR-006', customerId: 'c2', title: 'Mechanical recommission', year: 1963, make: 'Chevrolet', model: 'Corvette Sting Ray',
    color: 'Riverside Red', vin: '30837S108771', scope: 'Recommission after long storage; fuel, brakes, tune, detail and handover.',
    start: -120, length: 130, current: 7, budget: 5000, priority: 'normal', bay: 'Bay 4',
    tasks: [
      ['intake', 'Inspection', 'm1', 4, 'done', -118], ['teardown', 'Fuel system removal', 'm4', 8, 'done', -100],
      ['mechanical', 'Fuel, brakes & tune-up', 'm1', 8, 'done', -60], ['assembly', 'Reassembly & wiring', 'm4', 8, 'done', -20],
      ['qc', 'Road test & tune', 'm1', 6, 'doing', 0], ['qc', 'Final inspection', 'm1', 4, 'todo', 1],
      ['delivery', 'Detail & photoshoot', 'm4', 6, 'todo', 3], ['delivery', 'Customer handover', 'm4', 2, 'todo', 5],
    ],
    parts: [['wheels', 'Wheel & tyre set', 'part', 'Classic Rubber', 2400, 'installed', -25, -30, -45, 'PO-2060', 'assembly']],
    notes: [[-1, 'qc', 'Road test went well — small carb tweak left. Handover booked for next week.']],
  },
  {
    id: 'p5', code: 'ACR-005', customerId: 'c1', title: 'Pre-purchase assessment & quote', year: 1963, make: 'Jaguar', model: 'E-Type',
    color: 'British Racing Green', vin: '880456', scope: 'Assess condition and quote a full restoration.',
    start: 14, length: 150, current: -1, budget: 34000, priority: 'normal', bay: 'Unassigned', status: 'quote',
    tasks: [], parts: [], notes: [],
  },
  {
    id: 'p7', code: 'ACR-007', customerId: 'c5', service: 'paint', title: 'Full respray', year: 2019, make: 'Toyota', model: 'Fortuner',
    color: 'Pearl White', vin: 'MHFYZ59G9K0001234', scope: 'Dent repair, full repaint in factory pearl white, polish. Owner keeps the car in the shop for the week.',
    start: -4, length: 14, current: 1, budget: 0, pesos: 185000, priority: 'normal', bay: 'Prep bay',
    tasks: [
      ['inspect', 'Damage inspection & colour match', 'm3', 3, 'done', -4],
      ['prep', 'Dent repair – left side', 'm2', 8, 'done', -2], ['prep', 'Dent repair – right side', 'm2', 8, 'doing', 0],
      ['prep', 'Sand & feather all panels', 'm2', 8, 'todo', 1], ['prep', 'Mask, clean & degrease', 'm4', 4, 'todo', 2],
      ['prime', 'Prime & seal', 'm3', 6, 'todo', 3],
      ['paint', 'Base coat in the paint booth', 'm3', 8, 'todo', 4, 'paintmat'], ['paint', 'Clear coat', 'm3', 6, 'todo', 5],
      ['cure', 'Bake & cure', 'm3', 2, 'todo', 6], ['polish', 'Cut & polish', 'm6', 8, 'todo', 7],
      ['qc', 'Final inspection under lights', 'm1', 2, 'todo', 9], ['delivery', 'Handover to owner', 'm4', 1, 'todo', 10],
    ],
    parts: [
      ['sand', 'Abrasives & masking supplies', 'part', 'Autopro Supplies', 18, 'received', 0, -3, -5, 'PO-2266', 'prep'],
      ['paintmat', 'Pearl white base & clear coat (mixed)', 'part', 'PPG Distributor', 625, 'ordered', 4, 2, -3, 'PO-2271', 'paint', 'Mixed to the factory colour code.'],
    ],
    notes: [[-1, 'prep', 'Right-side dents are out. Customer confirmed the factory pearl white and the colour code was matched.']],
  },
  {
    id: 'p8', code: 'ACR-008', customerId: 'c6', service: 'detailing', packageName: 'Premium Detail', title: 'Premium Detail', year: 2021, make: 'Honda', model: 'Civic',
    color: 'Gunmetal', vin: 'MRHFC1630MP000123', scope: PACKAGES.detailing[3].scope,
    start: 0, length: 0, current: 1, budget: 0, pesos: 18000, priority: 'normal', bay: 'Detail bay',
    tasks: [
      ['checkin', 'Check-in & condition photos', 'm6', 0.5, 'done', 0],
      ['wash', 'Wash, clay & decontamination', 'm6', 1.5, 'doing', 0],
      ['interior', 'Interior deep clean', 'm5', 2, 'todo', 0],
      ['polish', 'Two-step polish & sealant', 'm3', 3, 'todo', 0],
      ['qc', 'Final check in daylight', 'm6', 0.5, 'todo', 0], ['delivery', 'Handover to owner', 'm6', 0.5, 'todo', 0],
    ],
    parts: [['pads', 'Polishing pads & compound', 'part', 'Autopro Supplies', 18, 'received', 0, -2, -4, 'PO-2268', 'polish']],
    notes: [[-2, 'checkin', 'Booked by phone. Drop-off at 8:00 AM, collection at 5:00 PM.']],
  },
  {
    id: 'p9', code: 'ACR-009', customerId: 'c7', service: 'ceramic', packageName: 'Ceramic Coating · 5 year', title: 'Ceramic Coating · 5 year', year: 2023, make: 'Mazda', model: 'CX-5',
    color: 'Soul Red Crystal', vin: 'JM3KFBDM0P0100456', scope: PACKAGES.ceramic[2].scope,
    start: -1, length: 3, current: 2, budget: 0, pesos: 58000, priority: 'normal', bay: 'Coating room',
    coat: { product: '9H ceramic coating, 5-year', batch: 'B24-0916', glossBefore: 82, thickness: 118, years: 5 },
    tasks: [
      ['inspect', 'Paint inspection & gloss readings', 'm3', 1, 'done', -1],
      ['wash', 'Wash & clay decontamination', 'm6', 2, 'done', -1],
      ['correction', 'Compound & polish – bonnet, roof, boot', 'm6', 5, 'doing', 0],
      ['coating', 'Apply ceramic coating, two layers', 'm6', 4, 'todo', 1, 'kit'],
      ['cure', 'Cure under lamps & check', 'm6', 1, 'todo', 1],
      ['qc', 'Final inspection & gloss readings', 'm3', 1, 'todo', 2], ['delivery', 'Handover, care guide & warranty card', 'm6', 1, 'todo', 2],
    ],
    parts: [
      ['kit', 'Ceramic coating kit, 5-year', 'part', 'Coatings Depot', 160, 'received', 1, -3, -6, 'PO-2270', 'coating', 'Batch number kept for the warranty record.'],
      ['pads', 'Correction pads & compounds', 'part', 'Autopro Supplies', 18, 'received', 0, -2, -4, 'PO-2269', 'correction'],
    ],
    notes: [[-1, 'inspect', 'Paint is in good shape, light swirls only. Owner chose the 5-year coating.']],
  },
  {
    id: 'p10', code: 'ACR-010', customerId: 'c5', service: 'ceramic', packageName: 'Ceramic Coating · 3 year', title: 'Ceramic Coating · 3 year', year: 2023, make: 'Ford', model: 'Ranger Raptor',
    color: 'Conquer Grey', vin: 'MNAUMFF50PW000789', scope: PACKAGES.ceramic[1].scope, status: 'delivered',
    start: -355, length: 3, current: 7, budget: 0, pesos: 38000, priority: 'normal', bay: 'Coating room',
    coat: { product: '9H ceramic coating, 3-year', batch: 'B23-1105', glossBefore: 78, glossAfter: 94, thickness: 124, cure: -353, handover: -352, years: 3 },
    tasks: [], parts: [], notes: [],
  },
  {
    id: 'p11', code: 'ACR-011', customerId: 'c6', service: 'ceramic', packageName: 'Ceramic Coating · 1 year', title: 'Ceramic Coating · 1 year', year: 2022, make: 'Hyundai', model: 'Tucson',
    color: 'Polar White', vin: 'KMHJ3814GNU000321', scope: PACKAGES.ceramic[0].scope, status: 'delivered',
    start: -6, length: 3, current: 7, budget: 0, pesos: 22000, priority: 'normal', bay: 'Coating room',
    coat: { product: '9H ceramic coating, 1-year', batch: 'B24-0908', glossBefore: 85, glossAfter: 96, thickness: 131, cure: -3, handover: -3, years: 1 },
    tasks: [], parts: [], notes: [],
  },
];

const PAYMENTS: Record<string, [number, number, string][]> = {
  p1: [[54, 0.3, 'Deposit'], [20, 0.15, 'Milestone: teardown complete']],
  p2: [[39, 0.4, 'Deposit'], [12, 0.2, 'Milestone: bodywork complete'], [0, 0.1, 'Progress payment']],
  p3: [[94, 0.4, 'Deposit'], [40, 0.3, 'Milestone: engine out and machined'], [8, 0.1, 'Progress payment']],
  p4: [[9, 0.3, 'Deposit']],
  p6: [[119, 0.35, 'Deposit'], [60, 0.35, 'Milestone: mechanical complete'], [18, 0.2, 'Progress payment']],
  p7: [[4, 0.4, 'Deposit']],
  p9: [[2, 0.3, 'Deposit']],
  p10: [[355, 0.3, 'Deposit'], [352, 0.7, 'Balance on handover']],
  p11: [[6, 0.3, 'Deposit'], [3, 0.7, 'Balance on handover']],
};

export function buildSeed(today = todayIso()): Data {
  const projects: Project[] = [];
  const tasks: Task[] = [];
  const parts: Part[] = [];
  const updates: Update[] = [];
  const load = new Map<string, number>();
  const leaveDays = new Set<string>(); // mechanic|date pairs a booking must avoid
  const cap = new Map(mechanics.map((m) => [m.id, m.dailyHours]));
  let tn = 1;
  let un = 1;

  // Book a mechanic on the first working day with room, so the demo isn't accidentally overbooked.
  const place = (mech: string, date: string, est: number, shortJob = false) => {
    let d = date;
    // Detailing and coating shops usually work Saturdays; longer jobs wait for Monday.
    const closed = (x: string) => (shortJob ? new Date(x + 'T00:00:00Z').getUTCDay() === 0 : isWeekend(x));
    while (closed(d) || leaveDays.has(`${mech}|${d}`) || (load.get(`${mech}|${d}`) ?? 0) + est > cap.get(mech)!) d = addDays(d, 1);
    load.set(`${mech}|${d}`, (load.get(`${mech}|${d}`) ?? 0) + est);
    return d;
  };

  for (const s of defs) {
    const start = addDays(today, s.start);
    const target = addDays(start, s.length);
    const contract = s.pesos ?? phpBudget(s.budget);
    const phases = buildPhases(start, target, s.service ?? 'restoration').map((ph, i) => ({
      ...ph,
      status: (s.current < 0 ? 'todo' : i < s.current ? 'done' : i === s.current ? 'in_progress' : 'todo') as 'todo' | 'done' | 'in_progress',
    }));
    projects.push({
      id: s.id, code: s.code, service: s.service ?? 'restoration', packageName: s.packageName, customerId: s.customerId, title: s.title, year: s.year, make: s.make, model: s.model,
      color: s.color, vin: s.vin, scope: s.scope, status: s.status ?? 'active', priority: s.priority, bay: s.bay,
      startDate: start, targetDate: target, budget: contract, phases,
      coating: s.coat ? { product: s.coat.product, batch: s.coat.batch, glossBefore: s.coat.glossBefore, glossAfter: s.coat.glossAfter, thicknessMicrons: s.coat.thickness, cureStarted: s.coat.cure === undefined ? undefined : addDays(today, s.coat.cure), handoverDate: s.coat.handover === undefined ? undefined : addDays(today, s.coat.handover), warrantyYears: s.coat.years } : undefined,
      payments: (PAYMENTS[s.id] ?? []).map(([ago, share, note], i) => ({ id: `${s.id}-pay${i + 1}`, date: addDays(today, -ago), amount: Math.round((contract * share) / 1000) * 1000, note })),
      leadMechanicId: s.tasks.find((t) => t[4] === 'doing')?.[2],
    });

    const partId = new Map<string, string>();
    s.parts.forEach((d, i) => partId.set(d[0], `${s.id}-pt${i + 1}`));
    s.parts.forEach(([ref, name, kind, supplier, cost, status, need, eta, ord, po, phaseKey, note]) => {
      parts.push({
        id: partId.get(ref)!, projectId: s.id, name, kind, supplier, cost: php(cost), status, phaseKey,
        neededBy: addDays(today, need), eta: eta == null ? undefined : addDays(today, eta),
        orderedOn: ord == null ? undefined : addDays(today, ord), po: po ?? undefined, note,
      });
    });

    for (const [phaseKey, title, mech, est, state, off, ref, block] of s.tasks) {
      const date = state === 'done' ? addDays(today, off) : place(mech, addDays(today, off), est, s.service === 'detailing' || s.service === 'ceramic');
      tasks.push({
        id: `t${tn++}`, projectId: s.id, phaseKey, title, mechanicId: mech, date, estHours: est,
        actualHours: state === 'done' ? Math.round(est * (0.9 + (tn % 4) * 0.1) * 2) / 2 : 0, // nearest half hour
        status: block ? 'blocked' : state === 'doing' ? 'in_progress' : state,
        partId: ref ? partId.get(ref) : undefined, blockReason: block?.[0], blockNote: block?.[1],
      });
    }
    const lt = tasks.find((t) => t.mechanicId === 'm2' && t.status !== 'done' && t.date > today && t.title === 'Block sanding & primer');
    if (lt) leaveDays.add(`m2|${lt.date}`);
    for (const [off, phaseKey, text] of s.notes) updates.push({ id: `u${un++}`, projectId: s.id, date: addDays(today, off), author: 'Alex', phaseKey, text });
  }
  // Attendance: three weeks of history, today's clock-ins, and one approved leave that collides with booked work.
  const attendance: Attendance[] = [];
  let an = 1;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  mechanics.forEach((m, mi) => {
    const shiftOut = m.dailyHours <= 6 ? 15 : 17;
    for (let back = 21; back >= 1; back--) {
      const date = addDays(today, -back);
      if (isWeekend(date)) continue;
      const r = (mi * 7 + back * 3) % 17;
      const base = { id: `a${an++}`, mechanicId: m.id, date };
      if (r === 0) attendance.push({ ...base, status: 'absent', note: 'Sick' });
      else if (r === 1) attendance.push({ ...base, status: 'late', timeIn: `08:${pad2(24 + (mi % 3) * 6)}`, timeOut: `${shiftOut}:${pad2(30 + (mi % 3) * 5)}` });
      else if (r === 2 && back > 14) attendance.push({ ...base, status: 'leave', note: 'Vacation' });
      else {
        const late = 50 + (r % 9); // 07:50 – 08:08, inside the grace period
        const timeIn = late < 60 ? `07:${pad2(late)}` : `08:${pad2(late - 60)}`;
        const ot = r % 6 === 3 ? 90 : r % 4;
        const outMin = ot + (back % 3) * 4;
        const timeOut = `${pad2(shiftOut + Math.floor(outMin / 60))}:${pad2(outMin % 60)}`;
        attendance.push({ ...base, status: 'present', timeIn, timeOut });
      }
    }
  });
  const clock = (mid: string, status: Attendance['status'], timeIn: string) => attendance.push({ id: `a${an++}`, mechanicId: mid, date: today, status, timeIn });
  if (!isWeekend(today)) {
    clock('m1', 'present', '07:52'); clock('m2', 'present', '07:58'); clock('m3', 'late', '08:24'); clock('m4', 'present', '08:03'); clock('m6', 'present', '07:55');
  }
  const leaveTask = tasks.find((t) => t.mechanicId === 'm2' && t.status !== 'done' && t.date > today && t.title === 'Block sanding & primer');
  if (leaveTask) attendance.push({ id: `a${an++}`, mechanicId: 'm2', date: leaveTask.date, status: 'leave', note: 'Approved leave' });

  return { mechanics, customers, projects, tasks, parts, updates, attendance };
}
