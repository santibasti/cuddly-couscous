export type PhaseKey =
  | 'intake'
  | 'teardown'
  | 'body'
  | 'paint'
  | 'mechanical'
  | 'interior'
  | 'assembly'
  | 'qc'
  | 'delivery';

export type PhaseStatus = 'todo' | 'in_progress' | 'done';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type BlockReason = 'customer' | 'vendor' | 'other';
export type PartKind = 'part' | 'sublet';
export type ProjectStatus = 'quote' | 'active' | 'on_hold' | 'completed' | 'delivered';
export type PartStatus = 'needed' | 'ordered' | 'shipped' | 'backordered' | 'received' | 'installed';
export type Priority = 'low' | 'normal' | 'high';
export type AttendanceStatus = 'present' | 'late' | 'half' | 'absent' | 'leave' | 'off';

export interface Mechanic {
  id: string;
  name: string;
  specialty: string;
  color: string;
  hourlyRate: number;
  dailyHours: number;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface Phase {
  key: PhaseKey;
  status: PhaseStatus;
  start: string;
  end: string;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  note?: string;
}

export interface Project {
  id: string;
  code: string;
  customerId: string;
  title: string;
  year: number;
  make: string;
  model: string;
  color: string;
  vin: string;
  scope: string;
  status: ProjectStatus;
  priority: Priority;
  bay: string;
  startDate: string;
  targetDate: string;
  budget: number;
  phases: Phase[];
  leadMechanicId?: string;
  /** Optional real photo of the car, stored as a small data URL. */
  photo?: string;
  /** Money received from the customer (deposit, progress payments). */
  payments: Payment[];
}

export interface Task {
  id: string;
  projectId: string;
  phaseKey: PhaseKey;
  title: string;
  mechanicId?: string;
  date: string;
  estHours: number;
  actualHours: number;
  status: TaskStatus;
  /** Task cannot proceed until this part / sublet job is back in the shop. */
  partId?: string;
  /** Manual block (customer approval, vendor, other) when not driven by a part. */
  blockReason?: BlockReason;
  blockNote?: string;
}

export interface Part {
  id: string;
  projectId: string;
  name: string;
  kind: PartKind;
  supplier: string;
  cost: number;
  status: PartStatus;
  phaseKey?: PhaseKey;
  po?: string;
  orderedOn?: string;
  eta?: string;
  /** Date the work needs it by. */
  neededBy: string;
  note?: string;
}

export interface Update {
  id: string;
  projectId: string;
  phaseKey?: PhaseKey;
  date: string;
  author: string;
  text: string;
}

export interface Attendance {
  id: string;
  mechanicId: string;
  date: string;
  status: AttendanceStatus;
  /** 24h "HH:MM" */
  timeIn?: string;
  timeOut?: string;
  note?: string;
}

export interface Data {
  mechanics: Mechanic[];
  customers: Customer[];
  projects: Project[];
  tasks: Task[];
  parts: Part[];
  updates: Update[];
  attendance: Attendance[];
}
