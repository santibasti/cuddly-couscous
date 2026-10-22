import { addDays, isWeekend, todayIso } from './dates';
import { buildPhases, PHASES } from './logic';
import type { BlockReason, Customer, Data, Mechanic, Part, PartKind, PartStatus, PhaseKey, Project, Task, Update } from './types';

const mechanics: Mechanic[] = [
  { id: 'm1', name: 'Carlos Reyes', specialty: 'Engine & drivetrain', color: '#e5553d', hourlyRate: 65, dailyHours: 8, active: true },
  { id: 'm2', name: 'Jamie Brooks', specialty: 'Bodywork & metal', color: '#e8a33d', hourlyRate: 60, dailyHours: 8, active: true },
  { id: 'm3', name: 'Priya Nair', specialty: 'Paint & finish', color: '#2fb585', hourlyRate: 70, dailyHours: 8, active: true },
  { id: 'm4', name: 'Tom Walker', specialty: 'Electrical & assembly', color: '#4c8df0', hourlyRate: 58, dailyHours: 8, active: true },
  { id: 'm5', name: 'Luis Ortega', specialty: 'Upholstery & trim', color: '#9a6ee0', hourlyRate: 55, dailyHours: 6, active: true },
];

const customers: Customer[] = [
  { id: 'c1', name: 'Robert Hale', phone: '555-0142', email: 'rhale@example.com' },
  { id: 'c2', name: 'Maria Santos', phone: '555-0177', email: 'maria.s@example.com' },
  { id: 'c3', name: 'David Chen', phone: '555-0109', email: 'dchen@example.com' },
  { id: 'c4', name: 'Eleanor Voss', phone: '555-0198', email: 'evoss@example.com' },
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
  tasks: TaskDef[]; parts: PartDef[]; notes: [number, PhaseKey | undefined, string][];
}

const defs: Def[] = [
  {
    id: 'p1', code: 'ACR-001', customerId: 'c1', title: 'Frame-off restoration', year: 1967, make: 'Ford', model: 'Mustang Fastback',
    color: 'Highland Green', vin: '7R02C123456', scope: 'Frame-off, 289 rebuild, repaint in original Highland Green, new interior.',
    start: -55, length: 150, current: 2, budget: 62000, priority: 'high', bay: 'Bay 1',
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
    ],
    notes: [[-6, 'body', 'Quarter panels welded and ground. Photos sent to Robert.'], [-1, 'body', 'Fender pair backordered — supplier found NOS stock, ETA ~12 days. Body work continues on doors meanwhile.']],
  },
  {
    id: 'p2', code: 'ACR-002', customerId: 'c2', title: 'Body & paint refresh', year: 1972, make: 'Porsche', model: '911T',
    color: 'Signal Orange', vin: '9112300456', scope: 'Rust repair and full respray in original Signal Orange; re-plate brightwork.',
    start: -40, length: 80, current: 3, budget: 28000, priority: 'normal', bay: 'Paint booth',
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
    start: -95, length: 85, current: 4, budget: 24000, priority: 'high', bay: 'Bay 2',
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
    notes: [[-9, 'mechanical', 'Trans rebuild finished and bench tested. Rear end in progress.'], [-3, 'mechanical', 'Crank still at the machine shop. They are running behind; customer told to expect a slip of about a week.']],
  },
  {
    id: 'p4', code: 'ACR-004', customerId: 'c4', title: 'Interior & trim restoration', year: 1958, make: 'Mercedes-Benz', model: '190SL',
    color: 'Silver', vin: '121040850087', scope: 'Full teardown, leather, carpets, wood dash and chrome restoration.',
    start: -10, length: 120, current: 1, budget: 38000, priority: 'low', bay: 'Bay 3',
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
    start: -120, length: 130, current: 7, budget: 21000, priority: 'normal', bay: 'Bay 4',
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
    start: 14, length: 150, current: -1, budget: 48000, priority: 'normal', bay: 'Unassigned', status: 'quote',
    tasks: [], parts: [], notes: [],
  },
];

export function buildSeed(today = todayIso()): Data {
  const projects: Project[] = [];
  const tasks: Task[] = [];
  const parts: Part[] = [];
  const updates: Update[] = [];
  const load = new Map<string, number>();
  const cap = new Map(mechanics.map((m) => [m.id, m.dailyHours]));
  let tn = 1;
  let un = 1;

  // Book a mechanic on the first working day with room, so the demo isn't accidentally overbooked.
  const place = (mech: string, date: string, est: number) => {
    let d = date;
    while (isWeekend(d) || (load.get(`${mech}|${d}`) ?? 0) + est > cap.get(mech)!) d = addDays(d, 1);
    load.set(`${mech}|${d}`, (load.get(`${mech}|${d}`) ?? 0) + est);
    return d;
  };

  for (const s of defs) {
    const start = addDays(today, s.start);
    const target = addDays(start, s.length);
    const phases = buildPhases(start, target).map((ph, i) => ({
      ...ph,
      status: (s.current < 0 ? 'todo' : i < s.current ? 'done' : i === s.current ? 'in_progress' : 'todo') as 'todo' | 'done' | 'in_progress',
    }));
    projects.push({
      id: s.id, code: s.code, customerId: s.customerId, title: s.title, year: s.year, make: s.make, model: s.model,
      color: s.color, vin: s.vin, scope: s.scope, status: s.status ?? 'active', priority: s.priority, bay: s.bay,
      startDate: start, targetDate: target, budget: s.budget, phases,
      leadMechanicId: s.tasks.find((t) => t[4] === 'doing')?.[2],
    });

    const partId = new Map<string, string>();
    s.parts.forEach((d, i) => partId.set(d[0], `${s.id}-pt${i + 1}`));
    s.parts.forEach(([ref, name, kind, supplier, cost, status, need, eta, ord, po, phaseKey, note]) => {
      parts.push({
        id: partId.get(ref)!, projectId: s.id, name, kind, supplier, cost, status, phaseKey,
        neededBy: addDays(today, need), eta: eta == null ? undefined : addDays(today, eta),
        orderedOn: ord == null ? undefined : addDays(today, ord), po: po ?? undefined, note,
      });
    });

    for (const [phaseKey, title, mech, est, state, off, ref, block] of s.tasks) {
      const date = state === 'done' ? addDays(today, off) : place(mech, addDays(today, off), est);
      tasks.push({
        id: `t${tn++}`, projectId: s.id, phaseKey, title, mechanicId: mech, date, estHours: est,
        actualHours: state === 'done' ? Math.round(est * (0.9 + (tn % 4) * 0.1)) : 0,
        status: block ? 'blocked' : state === 'doing' ? 'in_progress' : state,
        partId: ref ? partId.get(ref) : undefined, blockReason: block?.[0], blockNote: block?.[1],
      });
    }
    for (const [off, phaseKey, text] of s.notes) updates.push({ id: `u${un++}`, projectId: s.id, date: addDays(today, off), author: 'Alex', phaseKey, text });
  }
  void PHASES;
  return { mechanics, customers, projects, tasks, parts, updates };
}
