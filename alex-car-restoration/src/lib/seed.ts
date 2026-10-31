import { addDays, addMonths, isWeekend, todayIso } from './dates';
import { DEFAULT_CHECKLIST, smsText } from './crm';
import { buildPhases, PACKAGES, PHASE_DEFS, SERVICES } from './logic';
import type { Attendance, BlockReason, Customer, Data, Sms, Mechanic, PhaseKey, Project, ServiceType, Task, Update } from './types';

/** Demo figures were drafted in USD; shop money is in pesos. */
const FX = 56;
const phpBudget = (usd: number) => Math.round((usd * FX) / 50000) * 50000;

const mechanics: Mechanic[] = [
  { id: 'm1', name: 'Carlos Reyes', specialty: 'Engine & drivetrain', color: '#e5553d', dailyHours: 8, active: true },
  { id: 'm2', name: 'Jamie Brooks', specialty: 'Bodywork & metal', color: '#e8a33d', dailyHours: 8, active: true },
  { id: 'm3', name: 'Priya Nair', specialty: 'Paint & finish', color: '#2fb585', dailyHours: 8, active: true },
  { id: 'm4', name: 'Tom Walker', specialty: 'Electrical & assembly', color: '#4c8df0', dailyHours: 8, active: true },
  { id: 'm5', name: 'Luis Ortega', specialty: 'Upholstery & trim', color: '#9a6ee0', dailyHours: 6, active: true },
  { id: 'm6', name: 'Migs Dela Cruz', specialty: 'Detailing & coatings', color: '#3fb0c4', dailyHours: 8, active: true },
];

/** A birthday that falls `inDays` from today, in a made-up birth year. */
const bday = (today: string, inDays: number, year: number) => `${year}${addDays(today, inDays).slice(4)}`;

function makeCustomers(today: string): Customer[] {
  return [
    { id: 'c1', name: 'Robert Hale', phone: '555-0142', email: 'rhale@example.com', source: 'referral', birthday: bday(today, 150, 1961) },
    { id: 'c2', name: 'Maria Santos', phone: '555-0177', email: 'maria.s@example.com', source: 'organic', birthday: bday(today, 3, 1984) },
    { id: 'c3', name: 'David Chen', phone: '555-0109', email: 'dchen@example.com', source: 'ads', birthday: bday(today, -100, 1975) },
    { id: 'c4', name: 'Eleanor Voss', phone: '555-0198', email: 'evoss@example.com', source: 'referral', birthday: bday(today, 40, 1958) },
    { id: 'c5', name: 'Jun Mercado', phone: '555-0211', email: 'jun.m@example.com', source: 'social', birthday: bday(today, -20, 1988) },
    { id: 'c6', name: 'Angela Cruz', phone: '555-0224', email: 'angela.c@example.com', source: 'sms', birthday: bday(today, 12, 1992) },
    { id: 'c7', name: 'Paolo Lim', phone: '555-0236', email: 'paolo.l@example.com', source: 'organic', birthday: bday(today, 200, 1990) },
    { id: 'c8', name: 'Rico Tan', phone: '555-0301', email: 'rico.t@example.com', source: 'referral', birthday: bday(today, 75, 1985) },
    { id: 'c9', name: 'Lara Gomez', phone: '555-0312', email: 'lara.g@example.com', source: 'social', birthday: bday(today, 260, 1993) },
    { id: 'c10', name: 'Ben Ocampo', phone: '555-0323', email: 'ben.o@example.com', source: 'ads', birthday: bday(today, 33, 1980) },
    { id: 'c11', name: 'Tessa Uy', phone: '555-0334', email: 'tessa.u@example.com', source: 'organic', birthday: bday(today, 300, 1987) },
    { id: 'c12', name: 'Marco Bautista', phone: '555-0345', email: 'marco.b@example.com', source: 'sms', birthday: bday(today, 110, 1991) },
  ];
}

/** [id, customer, service, year, make, model, colour, days ago received, days in shop, days late, price in pesos, lead mechanic, back job of] */
type PastDef = [string, string, ServiceType, number, string, string, string, number, number, number, number, string, string?];
const PAST: PastDef[] = [
  ['h1', 'c3', 'restoration', 1971, 'Datsun', '510', 'Bright Yellow', 430, 140, 12, 1500000, 'm2'],
  ['h2', 'c8', 'paint', 2017, 'Toyota', 'Vios', 'Silver', 400, 9, 0, 48000, 'm3'],
  ['h3', 'c9', 'detailing', 2020, 'Honda', 'City', 'Modern Steel', 390, 1, 0, 9500, 'm6'],
  ['h4', 'c10', 'ceramic', 2022, 'Mitsubishi', 'Montero Sport', 'Black', 370, 3, 1, 38000, 'm6'],
  ['h5', 'c2', 'paint', 2015, 'Nissan', 'Navara', 'White', 340, 12, 3, 85000, 'm3'],
  ['h6', 'c11', 'detailing', 2019, 'Toyota', 'Hilux', 'Grey', 320, 1, 0, 5500, 'm6'],
  ['h7', 'c12', 'ceramic', 2023, 'Honda', 'CR-V', 'Platinum White', 300, 3, 0, 58000, 'm6'],
  ['h8', 'c8', 'detailing', 2017, 'Toyota', 'Vios', 'Silver', 280, 1, 0, 2500, 'm6'],
  ['h9', 'c5', 'paint', 2020, 'Ford', 'Everest', 'Blue', 255, 10, 4, 98000, 'm3'],
  ['h10', 'c9', 'ceramic', 2020, 'Honda', 'City', 'Modern Steel', 230, 3, 0, 22000, 'm6'],
  ['h11', 'c4', 'restoration', 1965, 'Volkswagen', 'Beetle', 'Sea Blue', 225, 100, 20, 1100000, 'm2'],
  ['h12', 'c10', 'detailing', 2022, 'Mitsubishi', 'Montero Sport', 'Black', 200, 1, 0, 9500, 'm6'],
  ['h13', 'c11', 'paint', 2019, 'Toyota', 'Hilux', 'Grey', 180, 8, 0, 62000, 'm3'],
  ['h14', 'c2', 'paint', 2015, 'Nissan', 'Navara', 'White', 165, 2, 0, 0, 'm3', 'h5'],
  ['h15', 'c12', 'detailing', 2023, 'Honda', 'CR-V', 'Platinum White', 150, 1, 0, 5500, 'm6'],
  ['h16', 'c6', 'detailing', 2021, 'Honda', 'Civic', 'Rallye Red', 140, 1, 0, 5500, 'm6'],
  ['h17', 'c3', 'paint', 1971, 'Datsun', '510', 'Bright Yellow', 120, 7, 2, 55000, 'm3'],
  ['h18', 'c7', 'detailing', 2023, 'Mazda', 'CX-5', 'Soul Red Crystal', 100, 1, 0, 18000, 'm6'],
  ['h19', 'c8', 'ceramic', 2017, 'Toyota', 'Vios', 'Silver', 85, 3, 0, 22000, 'm6'],
  ['h20', 'c9', 'paint', 2020, 'Honda', 'City', 'Modern Steel', 70, 9, 5, 72000, 'm3'],
  ['h21', 'c10', 'detailing', 2022, 'Mitsubishi', 'Montero Sport', 'Black', 55, 1, 0, 5500, 'm6'],
  ['h22', 'c11', 'ceramic', 2019, 'Toyota', 'Hilux', 'Grey', 45, 3, 2, 38000, 'm6'],
  ['h23', 'c9', 'paint', 2020, 'Honda', 'City', 'Modern Steel', 40, 2, 0, 0, 'm3', 'h20'],
  ['h24', 'c5', 'detailing', 2023, 'Ford', 'Ranger Raptor', 'Conquer Grey', 30, 1, 0, 9500, 'm6'],
  ['h25', 'c12', 'paint', 2023, 'Honda', 'CR-V', 'Platinum White', 22, 8, 0, 68000, 'm3'],
  ['h26', 'c4', 'detailing', 1958, 'Mercedes-Benz', '190SL', 'Ivory', 14, 1, 0, 18000, 'm6'],
  ['h27', 'c8', 'detailing', 2017, 'Toyota', 'Vios', 'Silver', 9, 1, 0, 2500, 'm6'],
  ['h28', 'c10', 'paint', 2022, 'Mitsubishi', 'Montero Sport', 'Black', 8, 5, 0, 52000, 'm3'],
];
/** Who does each stage on a long restoration; short jobs stay with their lead. */
const STAGE_MECH: Partial<Record<PhaseKey, string>> = { teardown: 'm4', body: 'm2', prep: 'm2', mechanical: 'm1', interior: 'm5', assembly: 'm4' };

type State = 'done' | 'doing' | 'todo';
/** [phase, title, mechanic, estHours, state, day offset from today, manual block] */
type TaskDef = [PhaseKey, string, string, number, State, number, [BlockReason, string]?];

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
  tasks: TaskDef[]; notes: [number, PhaseKey | undefined, string][];
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
      ['body', 'Door fit & gap alignment', 'm2', 6, 'doing', 0], ['body', 'Fender & hood alignment', 'm2', 6, 'todo', 2, ['other', 'Waiting for the fender pair']],
      ['body', 'Block sanding & primer', 'm2', 8, 'todo', 4], ['paint', 'Seal & colour coat', 'm3', 8, 'todo', 14], ['paint', 'Clear coat & cut/polish', 'm3', 8, 'todo', 20],
      ['mechanical', 'Rear axle install', 'm1', 6, 'todo', 20], ['mechanical', '289 engine rebuild', 'm1', 8, 'todo', 7],
      ['interior', 'Carpet & headliner', 'm5', 6, 'todo', 40],
    ],
    notes: [[-6, 'body', 'Quarter panels welded and ground. Photos sent to Robert.'], [-1, 'body', 'Fender pair is late. Body work continues on doors meanwhile.']],
  },
  {
    id: 'p2', code: 'ACR-002', customerId: 'c2', title: 'Body & paint refresh', year: 1972, make: 'Porsche', model: '911T',
    color: 'Signal Orange', vin: '9112300456', scope: 'Rust repair and full respray in original Signal Orange; re-plate brightwork.',
    start: -40, length: 80, current: 3, budget: 18000, priority: 'normal', bay: 'Paint booth',
    tasks: [
      ['intake', 'Inspection & photo documentation', 'm1', 4, 'done', -39], ['teardown', 'Trim & glass removal', 'm4', 8, 'done', -33],
      ['body', 'Rust repair & panel work', 'm2', 8, 'done', -12], ['body', 'Final body prep', 'm2', 8, 'done', -5],
      ['paint', 'Panel prep & prime', 'm3', 8, 'done', -2],
      ['paint', 'Colour coat – Signal Orange', 'm3', 8, 'todo', 1, ['customer', 'Owner has not signed off the colour sample']],
      ['paint', 'Clear coat & cut/polish', 'm3', 8, 'todo', 4],
      ['assembly', 'Glass & seal fit', 'm4', 6, 'todo', 20], ['assembly', 'Brightwork refit', 'm4', 6, 'todo', 24],
      ['interior', 'Door cards & carpet', 'm5', 6, 'todo', 14],
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
      ['mechanical', 'Engine assembly', 'm1', 8, 'todo', 1, ['other', 'Waiting for the crank grind and balance']], ['mechanical', 'Cam & lifter install', 'm1', 6, 'todo', 3, ['other', 'Waiting for the piston and bearing set']],
      ['mechanical', 'Brake lines & hardware', 'm4', 6, 'todo', 2],
      ['assembly', 'Engine & trans install', 'm4', 8, 'todo', 8], ['qc', 'Dyno & tune', 'm1', 6, 'todo', 12],
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
      ['interior', 'Seat reupholstery', 'm5', 6, 'todo', 40], ['interior', 'Wood dash refinish – refit', 'm5', 6, 'todo', 5, ['other', 'Waiting for the dash veneer refinish']],
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
    notes: [[-1, 'qc', 'Road test went well — small carb tweak left. Handover booked for next week.']],
  },
  {
    id: 'p5', code: 'ACR-005', customerId: 'c1', title: 'Pre-purchase assessment & quote', year: 1963, make: 'Jaguar', model: 'E-Type',
    color: 'British Racing Green', vin: '880456', scope: 'Assess condition and quote a full restoration.',
    start: 14, length: 150, current: -1, budget: 34000, priority: 'normal', bay: 'Unassigned', status: 'quote',
    tasks: [], notes: [],
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
      ['paint', 'Base coat in the paint booth', 'm3', 8, 'todo', 4, ['other', 'Waiting for the paint materials']], ['paint', 'Clear coat', 'm3', 6, 'todo', 5],
      ['cure', 'Bake & cure', 'm3', 2, 'todo', 6], ['polish', 'Cut & polish', 'm6', 8, 'todo', 7],
      ['qc', 'Final inspection under lights', 'm1', 2, 'todo', 9], ['delivery', 'Handover to owner', 'm4', 1, 'todo', 10],
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
      ['coating', 'Apply ceramic coating, two layers', 'm6', 4, 'todo', 1],
      ['cure', 'Cure under lamps & check', 'm6', 1, 'todo', 1],
      ['qc', 'Final inspection & gloss readings', 'm3', 1, 'todo', 2], ['delivery', 'Handover, care guide & warranty card', 'm6', 1, 'todo', 2],
    ],
    notes: [[-1, 'inspect', 'Paint is in good shape, light swirls only. Owner chose the 5-year coating.']],
  },
  {
    id: 'p10', code: 'ACR-010', customerId: 'c5', service: 'ceramic', packageName: 'Ceramic Coating · 3 year', title: 'Ceramic Coating · 3 year', year: 2023, make: 'Ford', model: 'Ranger Raptor',
    color: 'Conquer Grey', vin: 'MNAUMFF50PW000789', scope: PACKAGES.ceramic[1].scope, status: 'delivered',
    start: -355, length: 3, current: 7, budget: 0, pesos: 38000, priority: 'normal', bay: 'Coating room',
    coat: { product: '9H ceramic coating, 3-year', batch: 'B23-1105', glossBefore: 78, glossAfter: 94, thickness: 124, cure: -353, handover: -352, years: 3 },
    tasks: [], notes: [],
  },
  {
    id: 'p11', code: 'ACR-011', customerId: 'c6', service: 'ceramic', packageName: 'Ceramic Coating · 1 year', title: 'Ceramic Coating · 1 year', year: 2022, make: 'Hyundai', model: 'Tucson',
    color: 'Polar White', vin: 'KMHJ3814GNU000321', scope: PACKAGES.ceramic[0].scope, status: 'delivered',
    start: -6, length: 3, current: 7, budget: 0, pesos: 22000, priority: 'normal', bay: 'Coating room',
    coat: { product: '9H ceramic coating, 1-year', batch: 'B24-0908', glossBefore: 85, glossAfter: 96, thickness: 131, cure: -3, handover: -3, years: 1 },
    tasks: [], notes: [],
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
  const updates: Update[] = [];
  const customers = makeCustomers(today);
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
      payments: (PAYMENTS[s.id] ?? []).map(([ago, share, note], i) => ({ id: `${s.id}-pay${i + 1}`, date: addDays(today, -ago), amount: Math.round((contract * share) / 1000) * 1000, kind: /deposit/i.test(note) ? ('deposit' as const) : /balance/i.test(note) ? ('full' as const) : i % 2 ? ('cheque' as const) : ('cash' as const), note })),
      leadMechanicId: s.tasks.find((t) => t[4] === 'doing')?.[2],
    });

    for (const [phaseKey, title, mech, est, state, off, block] of s.tasks) {
      const date = state === 'done' ? addDays(today, off) : place(mech, addDays(today, off), est, s.service === 'detailing' || s.service === 'ceramic');
      tasks.push({
        id: `t${tn++}`, projectId: s.id, phaseKey, title, mechanicId: mech, date, estHours: est,
        actualHours: state === 'done' ? Math.round(est * (0.9 + (tn % 4) * 0.1) * 2) / 2 : 0, // nearest half hour
        status: block ? 'blocked' : state === 'doing' ? 'in_progress' : state,
        blockReason: block?.[0], blockNote: block?.[1],
      });
    }
    const lt = tasks.find((t) => t.mechanicId === 'm2' && t.status !== 'done' && t.date > today && t.title === 'Block sanding & primer');
    if (lt) leaveDays.add(`m2|${lt.date}`);
    for (const [off, phaseKey, text] of s.notes) updates.push({ id: `u${un++}`, projectId: s.id, date: addDays(today, off), author: 'Alex', phaseKey, text });
  }
  // Past jobs, so the date-range views have something to compare.
  for (const [id, customerId, service, year, make, model, color, ago, days, late, pesos, lead, backOf] of PAST) {
    const received = addDays(today, -ago);
    const target = addDays(received, days);
    const released = addDays(target, late);
    const phases = buildPhases(received, target, service).map((ph) => ({ ...ph, status: 'done' as const, approvedBy: 'Alex', approvedOn: ph.end }));
    const perStage = Math.max(1, Math.round(((days * 4) / phases.length) * 2) / 2);
    phases.forEach((ph, i) => {
      const mech = service === 'restoration' || service === 'paint' ? (STAGE_MECH[ph.key] ?? lead) : lead;
      tasks.push({ id: `t${tn++}`, projectId: id, phaseKey: ph.key, title: PHASE_DEFS[ph.key].label, mechanicId: mech, date: ph.start, estHours: perStage, actualHours: Math.round(perStage * (0.9 + (i % 4) * 0.1) * (late ? 1.15 : 1) * 2) / 2, status: 'done' });
    });
    const pkg = service === 'detailing' || service === 'ceramic' ? PACKAGES[service].find((x) => x.price === pesos) : undefined;
    projects.push({
      id, code: `ACR-${id.toUpperCase()}`, service, packageName: pkg?.name, customerId, title: pkg?.name ?? (backOf ? 'Back job: touch-up' : SERVICES[service].label), year, make, model, color, vin: '', scope: backOf ? 'Return visit to fix a fault from the earlier job, at no charge.' : (pkg?.scope ?? SERVICES[service].hint),
      status: 'delivered', priority: 'normal', bay: 'Unassigned', startDate: received, targetDate: target, budget: pesos, phases, leadMechanicId: lead,
      receivedOn: received, releasedOn: released, backjobOf: backOf,
      coating: service === 'ceramic' ? { product: `9H ceramic coating, ${pkg?.warrantyYears ?? 1}-year`, batch: `B${received.slice(2, 4)}-${received.slice(5, 7)}${received.slice(8, 10)}`, glossBefore: 80 + (days % 5), glossAfter: 94 + (late % 3), thicknessMicrons: 120 + ((ago * 7) % 15), cureStarted: addDays(released, -1), handoverDate: released, warrantyYears: pkg?.warrantyYears, maintenanceDone: addMonths(released, 12) <= today } : undefined,
      gatepass: { issuedOn: released, outOn: released, checkupDone: addDays(released, 7) <= today ? addDays(released, 7) : undefined },
      payments: pesos ? [{ id: `${id}-pay1`, date: received, amount: Math.round(pesos * 0.3), kind: 'deposit', note: 'Deposit' }, { id: `${id}-pay2`, date: released, amount: pesos - Math.round(pesos * 0.3), kind: 'full', note: 'Balance on handover' }] : [],
    });
  }
  for (const p of projects) {
    if (p.status === 'quote') continue;
    p.receivedOn = p.receivedOn ?? p.startDate;
    // Cars that are in the shop carry a drop-off checklist; two have something missing.
    if (!p.intake && p.status !== 'delivered') {
      p.intake = { orcr: p.id !== 'p7', items: DEFAULT_CHECKLIST.map((label) => ({ label, present: !(p.id === 'p3' && label === 'Spare key') && !(p.id === 'p1' && label === 'Head unit / stereo') })), notes: p.id === 'p7' ? 'Owner will bring the OR/CR copy tomorrow.' : undefined };
    }
    // A stage that is done has been approved, except the latest one on a few jobs.
    p.phases.forEach((ph) => {
      if (ph.status === 'done' && !ph.approvedBy) {
        const lastDone = [...p.phases].reverse().find((x) => x.status === 'done');
        if (!(['p2', 'p4'].includes(p.id) && lastDone?.key === ph.key)) { ph.approvedBy = 'Alex'; ph.approvedOn = ph.end; }
      }
    });
    if (p.status === 'delivered' && !p.releasedOn && p.coating?.handoverDate) {
      p.releasedOn = p.coating.handoverDate;
      p.gatepass = { issuedOn: p.releasedOn, outOn: p.releasedOn, checkupDone: addDays(p.releasedOn, 7) <= today ? addDays(p.releasedOn, 7) : undefined };
    }
  }
  // A couple of texts already sent, so the outbox is not empty.
  const messages: Sms[] = [
    { id: 'sms1', customerId: 'c6', projectId: 'p11', date: addDays(today, -3), kind: 'ready', text: smsText('ready', customers[5], projects.find((p) => p.id === 'p11')) },
    { id: 'sms2', customerId: 'c5', date: addDays(today, -20), kind: 'birthday', text: smsText('birthday', customers[4]) },
  ];

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

  return { mechanics, customers, projects, tasks, updates, attendance, messages };
}
