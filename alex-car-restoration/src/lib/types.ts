export type ServiceType = 'restoration' | 'paint' | 'detailing' | 'ceramic';

export type PhaseKey =
  | 'intake' | 'teardown' | 'body' | 'paint' | 'mechanical' | 'interior' | 'assembly' | 'qc' | 'delivery'
  | 'inspect' | 'prep' | 'prime' | 'cure' | 'polish'
  | 'checkin' | 'wash' | 'correction' | 'coating';

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

export type LeadSource = 'organic' | 'ads' | 'sms' | 'social' | 'referral';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** Date of birth, "YYYY-MM-DD". Only the month and day are used for greetings. */
  birthday?: string;
  /** Where the customer first heard of the shop. */
  source?: LeadSource;
}

export interface Phase {
  key: PhaseKey;
  status: PhaseStatus;
  start: string;
  end: string;
  /** Who approved this stage and when. */
  approvedBy?: string;
  approvedOn?: string;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  note?: string;
}

/** What was used and measured on a ceramic coating job, kept for the warranty. */
export interface CoatingRecord {
  product?: string;
  batch?: string;
  /** Gloss readings in gloss units, before and after. */
  glossBefore?: number;
  glossAfter?: number;
  /** Paint thickness in microns, checked before polishing. */
  thicknessMicrons?: number;
  /** Date the coating went on and started curing. */
  cureStarted?: string;
  /** The owner should not wash the car before this date. */
  washAfter?: string;
  /** Date the car was handed over; the warranty and the maintenance check count from here. */
  handoverDate?: string;
  warrantyYears?: number;
  /** Set once the free maintenance check has been done. */
  maintenanceDone?: boolean;
}

export interface ChecklistItem {
  label: string;
  /** True when the item came in with the car. */
  present: boolean;
}

/** What came in with the car, checked at drop-off. */
export interface Intake {
  /** Copy of the OR/CR (registration papers) received. */
  orcr: boolean;
  items: ChecklistItem[];
  notes?: string;
}

/** Release of the car: gatepass issued, then out the gate. */
export interface Gatepass {
  issuedOn?: string;
  outOn?: string;
  /** Date the follow-up check-up with the client was done. */
  checkupDone?: string;
}

export interface Project {
  id: string;
  code: string;
  service: ServiceType;
  /** Package sold for fixed-price services (detailing, ceramic coating). */
  packageName?: string;
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
  /** Coating record, for ceramic jobs. */
  coating?: CoatingRecord;
  /** Optional real photo of the car, stored as a small data URL. */
  photo?: string;
  /** Money received from the customer (deposit, progress payments). */
  payments: Payment[];
  /** Day the car came into the shop. Falls back to the start date. */
  receivedOn?: string;
  /** Day the car left the shop. */
  releasedOn?: string;
  intake?: Intake;
  gatepass?: Gatepass;
  /** Set when this job is a back job: a return for a fault in an earlier job. */
  backjobOf?: string;
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

export type SmsKind = 'ready' | 'payment' | 'checkup' | 'birthday' | 'approval' | 'custom';

/** A text message. Demo only: nothing is really sent, it is kept in the outbox. */
export interface Sms {
  id: string;
  customerId: string;
  projectId?: string;
  date: string;
  kind: SmsKind;
  text: string;
}

export interface Data {
  mechanics: Mechanic[];
  customers: Customer[];
  projects: Project[];
  tasks: Task[];
  parts: Part[];
  updates: Update[];
  attendance: Attendance[];
  messages: Sms[];
}
