import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { todayIso } from './dates';
import { buildPhases, isLateIn, nextProjectCode, OUT_STATUSES, PACKAGES } from './logic';
import { canEdit } from './role';
import { buildSeed } from './seed';
import { DEFAULT_CHECKLIST, defaultQc } from './crm';
import type { AttendanceStatus, CoatingRecord, Customer, Data, Gatepass, Intake, Mechanic, Part, PartStatus, PhaseKey, PhaseStatus, Project, ProjectStatus, QcRecord, SmsKind, Task, TaskStatus } from './types';

const KEY = 'alex-car-restoration:v7';

export type Action =
  | { type: 'addProject'; project: Omit<Project, 'id' | 'code' | 'phases' | 'status' | 'payments'> & { id?: string; status?: ProjectStatus; payments?: Project['payments'] } }
  | { type: 'setProjectStatus'; id: string; status: ProjectStatus }
  | { type: 'updateProject'; id: string; patch: Partial<Project> }
  | { type: 'updateCoating'; projectId: string; patch: Partial<CoatingRecord> }
  | { type: 'setPhaseStatus'; projectId: string; key: PhaseKey; status: PhaseStatus }
  | { type: 'addTask'; task: Omit<Task, 'id' | 'actualHours' | 'status'> }
  | { type: 'updateTask'; id: string; patch: Partial<Task> }
  | { type: 'deleteTask'; id: string }
  | { type: 'addPart'; part: Omit<Part, 'id'> }
  | { type: 'setPartStatus'; id: string; status: PartStatus }
  | { type: 'updatePart'; id: string; patch: Partial<Part> }
  | { type: 'addUpdate'; projectId: string; text: string; phaseKey?: PhaseKey; author: string }
  | { type: 'addMechanic'; mechanic: Omit<Mechanic, 'id' | 'active'> }
  | { type: 'toggleMechanic'; id: string }
  | { type: 'updateMechanic'; id: string; patch: Partial<Mechanic> }
  | { type: 'clockIn'; mechanicId: string; date: string; time: string }
  | { type: 'clockOut'; mechanicId: string; date: string; time: string }
  | { type: 'setAttendance'; mechanicId: string; date: string; status: AttendanceStatus; timeIn?: string; timeOut?: string; note?: string }
  | { type: 'clearAttendance'; mechanicId: string; date: string }
  | { type: 'addPayment'; projectId: string; date: string; amount: number; note?: string }
  | { type: 'removePayment'; projectId: string; id: string }
  | { type: 'addCustomer'; customer: Omit<Customer, 'id'> & { id?: string } }
  | { type: 'updateCustomer'; id: string; patch: Partial<Customer> }
  | { type: 'updateIntake'; projectId: string; patch: Partial<Intake> }
  | { type: 'updateQc'; projectId: string; patch: Partial<QcRecord> }
  | { type: 'approvePhase'; projectId: string; key: PhaseKey; by: string }
  | { type: 'updateGatepass'; projectId: string; patch: Partial<Gatepass> }
  | { type: 'markOut'; projectId: string; date: string }
  | { type: 'sendSms'; customerId: string; projectId?: string; kind: SmsKind; text: string }
  | { type: 'reset' };

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function reducer(d: Data, a: Action): Data {
  switch (a.type) {
    case 'addProject': {
      const project: Project = {
        ...a.project,
        id: a.project.id ?? uid('p'),
        code: nextProjectCode(d.projects),
        status: a.project.status ?? 'quote',
        phases: buildPhases(a.project.startDate, a.project.targetDate, a.project.service),
        payments: a.project.payments ?? [],
      };
      return { ...d, projects: [...d.projects, project] };
    }
    case 'setProjectStatus':
      return { ...d, projects: d.projects.map((p) => (p.id === a.id ? { ...p, status: a.status, releasedOn: a.status === 'delivered' ? p.releasedOn ?? todayIso() : p.releasedOn } : p)) };
    case 'updateProject':
      return { ...d, projects: d.projects.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) };
    case 'updateCoating':
      return {
        ...d,
        projects: d.projects.map((p) => {
          if (p.id !== a.projectId) return p;
          return { ...p, coating: { ...p.coating, ...a.patch } };
        }),
      };
    case 'setPhaseStatus':
      return {
        ...d,
        projects: d.projects.map((p) => {
          if (p.id !== a.projectId) return p;
          // Reopening a stage takes its approval away.
          const phases = p.phases.map((ph) => (ph.key === a.key ? { ...ph, status: a.status, ...(a.status === 'done' ? {} : { approvedBy: undefined, approvedOn: undefined }) } : ph));
          const allDone = phases.every((ph) => ph.status === 'done');
          let status = p.status;
          if (allDone && (status === 'active' || status === 'quote')) status = 'completed';
          else if (!allDone && status === 'completed') status = 'active';
          else if (status === 'quote' && a.status !== 'todo') status = 'active';
          // Ceramic jobs: the cure starting and the car leaving set the dates the warranty depends on.
          let coating = p.coating;
          if (p.service === 'ceramic') {
            if (a.key === 'cure' && a.status === 'in_progress' && !coating?.cureStarted) coating = { ...coating, cureStarted: todayIso() };
            if (a.key === 'delivery' && a.status === 'done' && !coating?.handoverDate) {
              const years = PACKAGES.ceramic.find((x) => x.name === p.packageName)?.warrantyYears;
              coating = { ...coating, handoverDate: todayIso(), warrantyYears: coating?.warrantyYears ?? years };
            }
          }
          return { ...p, phases, status, coating };
        }),
      };
    case 'addTask':
      return { ...d, tasks: [...d.tasks, { ...a.task, id: uid('t'), actualHours: 0, status: 'todo' }] };
    case 'updateTask':
      return {
        ...d,
        tasks: d.tasks.map((t) => {
          if (t.id !== a.id) return t;
          const next = { ...t, ...a.patch };
          // Completing a task without logging hours books the estimate.
          if (next.status === 'done' && t.status !== 'done' && !next.actualHours) next.actualHours = next.estHours;
          return next;
        }),
      };
    case 'deleteTask':
      return { ...d, tasks: d.tasks.filter((t) => t.id !== a.id) };
    case 'addPart':
      return { ...d, parts: [...d.parts, { ...a.part, id: uid('pt') }] };
    case 'setPartStatus':
      return {
        ...d,
        parts: d.parts.map((p) => {
          if (p.id !== a.id) return p;
          const next = { ...p, status: a.status };
          // Moving past "to order" stamps the order date; arrival clears the ETA.
          if (a.status !== 'needed' && !p.orderedOn) next.orderedOn = todayIso();
          if (a.status === 'received') next.eta = todayIso();
          return next;
        }),
      };
    case 'updatePart':
      return { ...d, parts: d.parts.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) };
    case 'addUpdate':
      return {
        ...d,
        updates: [
          { id: uid('u'), projectId: a.projectId, phaseKey: a.phaseKey, author: a.author, text: a.text, date: todayIso() },
          ...d.updates,
        ],
      };
    case 'addMechanic':
      return { ...d, mechanics: [...d.mechanics, { ...a.mechanic, id: uid('m'), active: true }] };
    case 'toggleMechanic':
      return { ...d, mechanics: d.mechanics.map((m) => (m.id === a.id ? { ...m, active: !m.active } : m)) };
    case 'updateMechanic':
      return { ...d, mechanics: d.mechanics.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)) };
    case 'clockIn': {
      const existing = d.attendance.find((r) => r.mechanicId === a.mechanicId && r.date === a.date);
      if (existing?.timeIn) return d; // already clocked in today
      const rec = { id: existing?.id ?? uid('a'), mechanicId: a.mechanicId, date: a.date, status: isLateIn(a.time) ? ('late' as const) : ('present' as const), timeIn: a.time, note: existing?.note };
      return { ...d, attendance: [...d.attendance.filter((r) => r !== existing), rec] };
    }
    case 'clockOut':
      return { ...d, attendance: d.attendance.map((r) => (r.mechanicId === a.mechanicId && r.date === a.date && r.timeIn && !r.timeOut ? { ...r, timeOut: a.time } : r)) };
    case 'setAttendance': {
      const existing = d.attendance.find((r) => r.mechanicId === a.mechanicId && r.date === a.date);
      const out = OUT_STATUSES.includes(a.status);
      let status = a.status;
      if ((status === 'present' || status === 'late') && a.timeIn) status = isLateIn(a.timeIn) ? 'late' : 'present';
      const rec = { id: existing?.id ?? uid('a'), mechanicId: a.mechanicId, date: a.date, status, timeIn: out ? undefined : a.timeIn || undefined, timeOut: out ? undefined : a.timeOut || undefined, note: a.note || undefined };
      return { ...d, attendance: [...d.attendance.filter((r) => r !== existing), rec] };
    }
    case 'clearAttendance':
      return { ...d, attendance: d.attendance.filter((r) => !(r.mechanicId === a.mechanicId && r.date === a.date)) };
    case 'addPayment':
      return { ...d, projects: d.projects.map((p) => (p.id === a.projectId ? { ...p, payments: [...p.payments, { id: uid('pay'), date: a.date, amount: a.amount, note: a.note }] } : p)) };
    case 'removePayment':
      return { ...d, projects: d.projects.map((p) => (p.id === a.projectId ? { ...p, payments: p.payments.filter((x) => x.id !== a.id) } : p)) };
    case 'addCustomer':
      return { ...d, customers: [...d.customers, { ...a.customer, id: a.customer.id ?? uid('c') }] };
    case 'updateCustomer':
      return { ...d, customers: d.customers.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c)) };
    case 'updateIntake':
      return {
        ...d,
        projects: d.projects.map((p) => (p.id === a.projectId ? { ...p, intake: { orcr: false, items: DEFAULT_CHECKLIST.map((label) => ({ label, present: true })), ...p.intake, ...a.patch } } : p)),
      };
    case 'updateQc':
      return { ...d, projects: d.projects.map((p) => (p.id === a.projectId ? { ...p, qc: { items: defaultQc(p.service), ...p.qc, ...a.patch } } : p)) };
    case 'approvePhase':
      return {
        ...d,
        projects: d.projects.map((p) => (p.id === a.projectId ? { ...p, phases: p.phases.map((ph) => (ph.key === a.key ? { ...ph, approvedBy: a.by, approvedOn: todayIso() } : ph)) } : p)),
      };
    case 'updateGatepass':
      return { ...d, projects: d.projects.map((p) => (p.id === a.projectId ? { ...p, gatepass: { ...p.gatepass, ...a.patch } } : p)) };
    case 'markOut':
      return {
        ...d,
        projects: d.projects.map((p) => (p.id === a.projectId ? { ...p, status: 'delivered', releasedOn: a.date, gatepass: { ...p.gatepass, issuedOn: p.gatepass?.issuedOn ?? a.date, outOn: a.date } } : p)),
      };
    case 'sendSms':
      return { ...d, messages: [{ id: uid('sms'), customerId: a.customerId, projectId: a.projectId, date: todayIso(), kind: a.kind, text: a.text }, ...d.messages] };
    case 'reset':
      return buildSeed();
  }
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Data;
      return { ...saved, messages: saved.messages ?? [] };
    }
  } catch {
    /* storage unavailable or corrupt – fall through to seed */
  }
  return buildSeed();
}

const Ctx = createContext<{ data: Data; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, rawDispatch] = useReducer(reducer, undefined, load);
  // A monitoring-only view can look but not change anything.
  const dispatch = useMemo<Dispatch<Action>>(() => (a) => { if (canEdit()) rawDispatch(a); }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data]);
  const value = useMemo(() => ({ data, dispatch }), [data, dispatch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}

export type { TaskStatus };
