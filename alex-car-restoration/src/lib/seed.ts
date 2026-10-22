import { addDays, isWeekend, todayIso } from './dates';
import { buildPhases, PHASES } from './logic';
import type { Customer, Data, Mechanic, Part, PartStatus, Project, Task, Update } from './types';

const mechanics: Mechanic[] = [
  { id: 'm1', name: 'Carlos Reyes', specialty: 'Engine & drivetrain', color: '#d9534f', hourlyRate: 65, dailyHours: 8, active: true },
  { id: 'm2', name: 'Jamie Brooks', specialty: 'Bodywork & metal', color: '#e0933a', hourlyRate: 60, dailyHours: 8, active: true },
  { id: 'm3', name: 'Priya Nair', specialty: 'Paint & finish', color: '#3a9d7a', hourlyRate: 70, dailyHours: 8, active: true },
  { id: 'm4', name: 'Tom Walker', specialty: 'Electrical & assembly', color: '#4a7fd1', hourlyRate: 58, dailyHours: 8, active: true },
  { id: 'm5', name: 'Luis Ortega', specialty: 'Upholstery & trim', color: '#8e63c9', hourlyRate: 55, dailyHours: 6, active: true },
];

const customers: Customer[] = [
  { id: 'c1', name: 'Robert Hale', phone: '555-0142', email: 'rhale@example.com' },
  { id: 'c2', name: 'Maria Santos', phone: '555-0177', email: 'maria.s@example.com' },
  { id: 'c3', name: 'David Chen', phone: '555-0109', email: 'dchen@example.com' },
  { id: 'c4', name: 'Eleanor Voss', phone: '555-0198', email: 'evoss@example.com' },
];

// Which mechanic normally handles which phase.
const phaseOwner: Record<string, string> = {
  intake: 'm1', teardown: 'm4', body: 'm2', paint: 'm3', mechanical: 'm1',
  interior: 'm5', assembly: 'm4', qc: 'm1', delivery: 'm4',
};

const taskTitles: Record<string, string[]> = {
  intake: ['Inspection & photo documentation', 'Written restoration plan'],
  teardown: ['Strip interior & trim', 'Remove drivetrain', 'Bag & tag hardware'],
  body: ['Rust repair – floors & rockers', 'Panel fit & gaps', 'Body filler & block sanding'],
  paint: ['Prime & seal', 'Colour coat', 'Clear coat & cut/polish'],
  mechanical: ['Engine rebuild', 'Transmission service', 'Brakes & suspension overhaul'],
  interior: ['Seat reupholstery', 'Headliner & carpet', 'Dash & gauges'],
  assembly: ['Wiring harness install', 'Glass, chrome & trim fit', 'Final assembly'],
  qc: ['Road test & tune', 'Final inspection'],
  delivery: ['Detail & photoshoot', 'Handover with customer'],
};

interface Spec {
  id: string; code: string; customerId: string; title: string;
  year: number; make: string; model: string; color: string; vin: string; scope: string;
  startOffset: number; length: number; current: number; progressInPhase: number;
  budget: number; priority: Project['priority']; bay: string;
}

const specs: Spec[] = [
  { id: 'p1', code: 'ACR-001', customerId: 'c1', title: 'Full frame-off restoration', year: 1967, make: 'Ford', model: 'Mustang Fastback',
    color: 'Highland Green', vin: '7R02C123456', scope: 'Frame-off, 289 rebuild, repaint, new interior.',
    startOffset: -75, length: 150, current: 4, progressInPhase: 0.4, budget: 62000, priority: 'high', bay: 'Bay 1' },
  { id: 'p2', code: 'ACR-002', customerId: 'c2', title: 'Body & paint refresh', year: 1972, make: 'Porsche', model: '911T',
    color: 'Signal Orange', vin: '9112300456', scope: 'Rust repair and full respray, original colour.',
    startOffset: -40, length: 80, current: 3, progressInPhase: 0.5, budget: 28000, priority: 'normal', bay: 'Paint booth' },
  { id: 'p3', code: 'ACR-003', customerId: 'c3', title: 'Engine rebuild & drivetrain', year: 1969, make: 'Chevrolet', model: 'Camaro SS',
    color: 'Hugger Orange', vin: '124379N500123', scope: '396 rebuild, Muncie 4-speed, rear end.',
    startOffset: -95, length: 85, current: 4, progressInPhase: 0.8, budget: 24000, priority: 'high', bay: 'Bay 2' },
  { id: 'p4', code: 'ACR-004', customerId: 'c4', title: 'Interior & trim restoration', year: 1958, make: 'Mercedes-Benz', model: '190SL',
    color: 'Silver', vin: '121040850087', scope: 'Leather, carpets, wood and chrome restoration.',
    startOffset: -10, length: 70, current: 1, progressInPhase: 0.3, budget: 19000, priority: 'low', bay: 'Bay 3' },
  { id: 'p5', code: 'ACR-005', customerId: 'c1', title: 'Pre-purchase assessment & quote', year: 1963, make: 'Jaguar', model: 'E-Type',
    color: 'British Racing Green', vin: '880456', scope: 'Assess condition, quote a full restoration.',
    startOffset: 14, length: 120, current: -1, progressInPhase: 0, budget: 48000, priority: 'normal', bay: 'Unassigned' },
];

function seedPartStatus(phaseIdx: number, current: number): PartStatus {
  if (phaseIdx < current) return 'installed';
  if (phaseIdx === current) return 'received';
  return phaseIdx === current + 1 ? 'ordered' : 'needed';
}

export function buildSeed(today = todayIso()): Data {
  const projects: Project[] = [];
  const tasks: Task[] = [];
  const parts: Part[] = [];
  const updates: Update[] = [];
  let tn = 1;
  let pn = 1;
  let un = 1;

  for (const s of specs) {
    const start = addDays(today, s.startOffset);
    const target = addDays(start, s.length);
    const phases = buildPhases(start, target).map((ph, i) => ({
      ...ph,
      status: (s.current < 0 ? 'todo' : i < s.current ? 'done' : i === s.current ? 'in_progress' : 'todo') as Project['phases'][number]['status'],
    }));
    const status: Project['status'] = s.current < 0 ? 'quote' : 'active';
    projects.push({
      id: s.id, code: s.code, customerId: s.customerId, title: s.title, year: s.year, make: s.make, model: s.model,
      color: s.color, vin: s.vin, scope: s.scope, status, priority: s.priority, bay: s.bay,
      startDate: start, targetDate: target, budget: s.budget, phases, leadMechanicId: phaseOwner[phases[Math.max(0, s.current)].key],
    });
    if (s.current < 0) continue;

    phases.forEach((ph, i) => {
      const titles = taskTitles[ph.key];
      titles.forEach((title, j) => {
        let date = addDays(ph.start, j * Math.max(1, Math.floor((PHASES.length + 4) / 4)));
        if (date > ph.end) date = ph.end;
        while (isWeekend(date)) date = addDays(date, 1);
        const done = i < s.current || (i === s.current && j < Math.floor(titles.length * s.progressInPhase));
        const est = 3 + ((j + i) % 3) * 1.5;
        tasks.push({
          id: `t${tn++}`, projectId: s.id, phaseKey: ph.key, title, date,
          mechanicId: i === s.current + 1 && j === titles.length - 1 ? undefined : phaseOwner[ph.key],
          estHours: est, actualHours: done ? Math.round(est * (0.9 + ((tn % 4) * 0.08))) : 0,
          status: done ? 'done' : i === s.current && j === Math.floor(titles.length * s.progressInPhase) ? 'in_progress' : 'todo',
        });
      });
    });

    const partList: [number, string, string, number][] = [
      [1, 'Hardware & fastener kit', 'Classic Fastener Co.', 420],
      [2, 'Rocker panels & floor pans', 'Metal Works Supply', 2300],
      [3, 'Paint materials (primer, base, clear)', 'PPG Distributor', 3100],
      [4, 'Engine gasket & bearing set', 'Speed Parts Direct', 1450],
      [5, 'Upholstery kit', 'Heritage Interiors', 2700],
    ];
    for (const [idx, name, supplier, cost] of partList) {
      const status = seedPartStatus(idx, s.current);
      parts.push({
        id: `pt${pn++}`, projectId: s.id, name, supplier, cost: Math.round(cost * (s.budget / 40000)), status,
        eta: status === 'ordered' ? addDays(today, idx === s.current + 1 && s.id === 'p3' ? -3 : 5) : undefined,
      });
    }

    updates.push(
      { id: `u${un++}`, projectId: s.id, date: addDays(today, -7), author: 'Alex', phaseKey: phases[Math.max(0, s.current - 1)].key, text: 'Phase signed off after inspection. Photos sent to the customer.' },
      { id: `u${un++}`, projectId: s.id, date: addDays(today, -1), author: 'Alex', phaseKey: phases[s.current].key, text: 'Work continuing on schedule. Waiting on one supplier delivery.' },
    );
  }

  return { mechanics, customers, projects, tasks, parts, updates };
}
