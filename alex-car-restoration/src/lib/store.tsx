import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { todayIso } from './dates';
import { buildPhases, nextProjectCode } from './logic';
import { buildSeed } from './seed';
import type { Data, Mechanic, Part, PartStatus, PhaseKey, PhaseStatus, Project, ProjectStatus, Task, TaskStatus } from './types';

const KEY = 'alex-car-restoration:v2';

export type Action =
  | { type: 'addProject'; project: Omit<Project, 'id' | 'code' | 'phases' | 'status'> & { status?: ProjectStatus } }
  | { type: 'setProjectStatus'; id: string; status: ProjectStatus }
  | { type: 'updateProject'; id: string; patch: Partial<Project> }
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
  | { type: 'reset' };

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function reducer(d: Data, a: Action): Data {
  switch (a.type) {
    case 'addProject': {
      const project: Project = {
        ...a.project,
        id: uid('p'),
        code: nextProjectCode(d.projects),
        status: a.project.status ?? 'quote',
        phases: buildPhases(a.project.startDate, a.project.targetDate),
      };
      return { ...d, projects: [...d.projects, project] };
    }
    case 'setProjectStatus':
      return { ...d, projects: d.projects.map((p) => (p.id === a.id ? { ...p, status: a.status } : p)) };
    case 'updateProject':
      return { ...d, projects: d.projects.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) };
    case 'setPhaseStatus':
      return {
        ...d,
        projects: d.projects.map((p) => {
          if (p.id !== a.projectId) return p;
          const phases = p.phases.map((ph) => (ph.key === a.key ? { ...ph, status: a.status } : ph));
          const allDone = phases.every((ph) => ph.status === 'done');
          let status = p.status;
          if (allDone && (status === 'active' || status === 'quote')) status = 'completed';
          else if (!allDone && status === 'completed') status = 'active';
          else if (status === 'quote' && a.status !== 'todo') status = 'active';
          return { ...p, phases, status };
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
    case 'reset':
      return buildSeed();
  }
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Data;
  } catch {
    /* storage unavailable or corrupt – fall through to seed */
  }
  return buildSeed();
}

const Ctx = createContext<{ data: Data; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data]);
  const value = useMemo(() => ({ data, dispatch }), [data]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}

export type { TaskStatus };
