// Domain model. Mirrors supabase/migrations/0001_schema.sql.
// Dates are 'YYYY-MM-DD' (Asia/Manila calendar dates); date-times are 'YYYY-MM-DDTHH:mm' Manila local time,
// except audit/created/updated stamps which are full ISO UTC strings.

export type Role = 'owner' | 'ops' | 'finance' | 'leader' | 'field' | 'viewer';

export interface Base {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by?: string;
  deleted_at?: string | null; // soft delete
  deleted_by?: string | null;
}

export interface UserAccount extends Base {
  name: string;
  email: string;
  role: Role;
  employee_id?: string | null;
  client_id?: string | null; // portal users
  pass_hash: string;
  active: boolean;
}

export interface Branch extends Base { name: string; address: string }

/* ---------- CRM ---------- */
export type ClientType =
  | 'Residential' | 'Commercial' | 'Property Management' | 'Government / LGU'
  | 'Auto Dealership' | 'Hospitality' | 'Church' | 'Industrial' | 'School / Institution';
export type ClientStatus = 'Active' | 'Prospect' | 'Inactive';

export interface Client extends Base {
  name: string;
  contact_person: string;
  mobile: string;
  email: string;
  address: string;
  billing_address: string;
  type: ClientType;
  status: ClientStatus;
  notes: string;
  access_instructions: string;
  tin: string;
  vat_status: 'VAT-registered' | 'Non-VAT' | 'VAT-exempt';
  withholding_rate: number; // % expected to be withheld by client on services (0 if none)
  withholding_notes: string;
  branch_id: string;
}

export interface Site extends Base {
  client_id: string;
  name: string;
  address: string;
  contact_person: string;
  contact_mobile: string;
  access_instructions: string;
  lat?: number;
  lng?: number;
}

export interface Communication extends Base {
  client_id: string;
  channel: 'Call' | 'Email' | 'Viber / WhatsApp' | 'Visit' | 'SMS' | 'Note';
  summary: string;
  follow_up_date?: string;
  follow_up_done?: boolean;
}

export interface Complaint extends Base {
  client_id: string;
  job_id?: string;
  summary: string;
  severity: 'Low' | 'Medium' | 'High';
  status: 'Open' | 'Investigating' | 'Resolved';
  resolution?: string;
}

/* ---------- Services & pricing ---------- */
export type ServiceCode =
  | 'GLASS_EXT' | 'GLASS_INT' | 'ROOF' | 'WALL' | 'SOLAR' | 'ACP' | 'FLOOR'
  | 'CEILING' | 'GUTTER' | 'OTHER';

export interface ServiceDef extends Base {
  code: ServiceCode;
  name: string;
  unit: string; // panel, sqm, lot
  rate: number;
  minimum_qty: number;
  package_price?: number; // glass starter package
  package_qty?: number;   // panels covered by the package
  excess_rate?: number;   // per panel beyond the package
  custom_quote: boolean;  // no standard rate – priced per quotation
  est_hours_per_unit: number;
}

/* ---------- Sales pipeline ---------- */
export type InquiryStage = 'Inquiry' | 'Ocular Visit' | 'Quotation' | 'Client Approval' | 'Booked' | 'Lost';
export interface Inquiry extends Base {
  client_id: string;
  site_id?: string;
  service_codes: ServiceCode[];
  stage: InquiryStage;
  source: string;
  details: string;
  ocular_date?: string;
  assigned_to?: string;
  lost_reason?: string;
}

export type QuoteStatus = 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Expired';
export interface QuoteItem {
  service_code: ServiceCode;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number; // peso amount off this line
}
export interface Quotation extends Base {
  number: string;
  client_id: string;
  site_id?: string;
  inquiry_id?: string;
  issue_date: string;
  valid_until: string;
  scope: string;
  items: QuoteItem[];
  vat_mode: 'exclusive' | 'inclusive' | 'none';
  vat_rate: number;
  discount: number; // overall peso discount
  terms: string;
  status: QuoteStatus;
  sent_at?: string;
  decided_at?: string;
  reject_reason?: string;
  branch_id: string;
}

/* ---------- Jobs ---------- */
export type JobStatus = 'Pending' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled' | 'Rescheduled';
export interface ChecklistItem { label: string; done: boolean }
export interface JobMaterial { item_id: string; planned_qty: number; used_qty?: number }
export interface JobPhoto { kind: 'before' | 'after' | 'damage' | 'signoff'; caption: string; data: string; taken_at: string }

export interface Job extends Base {
  number: string;
  client_id: string;
  site_id: string;
  quotation_id?: string;
  branch_id: string;
  service_codes: ServiceCode[];
  scope: string;
  start_at: string; // YYYY-MM-DDTHH:mm
  end_at: string;
  status: JobStatus;
  leader_id?: string;
  crew_ids: string[];
  vehicle_id?: string;
  equipment_ids: string[];
  materials: JobMaterial[];
  ppe: string[];
  checklist: ChecklistItem[];
  photos: JobPhoto[];
  findings: string;
  damage_report: string;
  equipment_condition_notes: string;
  signoff_name?: string;
  signoff_data?: string;
  signoff_at?: string;
  client_rating?: number; // 1-5
  completed_at?: string;
  contract_amount: number; // agreed price ex-VAT
  estimated_cost: number;
  reminder_sent?: boolean;
  rescheduled_from?: string;
}

/* ---------- HR ---------- */
export type PayrollType = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type EmploymentStatus = 'probationary' | 'regular' | 'contractual' | 'inactive';
export type EmployeeTier = 'Trainee' | 'Technician' | 'Senior Technician' | 'Team Leader' | 'Supervisor' | 'Office Staff';
export interface EmployeeDoc { name: string; number?: string; expires?: string; file?: string }
export interface Training { name: string; completed_on: string; expires?: string; hours: number }

export interface Employee extends Base {
  code: string;
  full_name: string;
  position: string;
  tier: EmployeeTier;
  department: 'Field Operations' | 'Operations' | 'Finance & Admin' | 'Management';
  branch_id: string;
  pay_basis: 'daily' | 'monthly';
  daily_rate: number;
  monthly_salary: number;
  payroll_type: PayrollType;
  hire_date: string;
  bank_name: string;
  bank_account: string;
  payout_method: 'Bank transfer' | 'GCash' | 'Cash';
  mobile: string;
  emergency_name: string;
  emergency_mobile: string;
  sss: string; philhealth: string; pagibig: string; tin: string;
  status: EmploymentStatus;
  documents: EmployeeDoc[];
  trainings: Training[];
  shift_start: string; // HH:mm
  shift_end: string;
  rest_day: number; // 0=Sun..6=Sat
}

export interface Attendance extends Base {
  employee_id: string;
  date: string;
  kind: 'Present' | 'Absent' | 'Leave' | 'Holiday' | 'Rest Day';
  clock_in?: string;  // YYYY-MM-DDTHH:mm
  clock_out?: string;
  job_id?: string;
  field_work: boolean;
  in_lat?: number; in_lng?: number; out_lat?: number; out_lng?: number;
  in_photo?: string; out_photo?: string;
  late_min: number;
  undertime_min: number;
  ot_min: number;
  worked_hours: number;
  paid_leave?: boolean;
  approval: 'Pending' | 'Approved' | 'Rejected';
  approved_by?: string;
  approved_at?: string;
  notes?: string;
}

export interface AttendanceCorrection extends Base {
  attendance_id?: string;
  employee_id: string;
  date: string;
  clock_in: string;
  clock_out: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  decided_by?: string;
  decided_at?: string;
  decision_note?: string;
}

export interface Holiday extends Base { date: string; name: string; kind: 'Regular' | 'Special' }

export interface PerfReview extends Base {
  employee_id: string;
  month: string; // YYYY-MM
  quality: number; safety: number; equipment_care: number; teamwork: number; supervisor: number; // 0-100
  training_completed: number; // count in month
  disciplinary: string;
  incentive: number;
  penalty: number;
  notes: string;
}

/* ---------- Payroll ---------- */
export interface PayrollAdjustment extends Base {
  employee_id: string;
  kind: 'Allowance' | 'Incentive' | 'Reimbursement' | 'Cash Advance' | 'Loan' | 'Other Deduction';
  amount: number;              // earnings: total; deductions: per-period amount
  balance?: number;            // remaining for advances / loans
  period_id?: string | null;   // one-off tied to a period; null = recurring until balance exhausted
  note: string;
  active: boolean;
}

export type PayrollStatus = 'Draft' | 'For Approval' | 'Approved' | 'Finalized';
export interface PayrollPeriod extends Base {
  label: string;
  start: string;
  end: string;
  type: PayrollType;
  status: PayrollStatus;
  submitted_by?: string;
  approved_by?: string;
  approved_at?: string;
  finalized_by?: string;
  finalized_at?: string;
  locked: boolean;
  expense_id?: string;
}

export interface PayrollLine {
  employee_id: string;
  days_worked: number;
  regular_pay: number;
  late_undertime_deduction: number;
  overtime_pay: number;
  holiday_pay: number;
  rest_day_pay: number;
  leave_pay: number;
  allowances: number;
  incentives: number;
  reimbursements: number;
  gross: number;
  sss: number; philhealth: number; pagibig: number; wtax: number;
  cash_advance: number; loan: number; other_deductions: number;
  total_deductions: number;
  net: number;
  adjustment_ids: string[];
  direct_labor_by_job: Record<string, number>;
}
export interface PayrollRun extends Base { period_id: string; lines: PayrollLine[] }

/* ---------- Inventory ---------- */
export type ItemCategory = 'Chemical' | 'Consumable' | 'Spare Part' | 'PPE' | 'Office Supply' | 'Cleaning Material';
export interface StorageLocation extends Base { name: string }
export interface InventoryItem extends Base {
  code: string;
  name: string;
  category: ItemCategory;
  uom: string;
  reorder_level: number;
  cost: number; // weighted average cost per unit
  supplier: string;
  location_id: string;
  expiry_date?: string;
  batch_no?: string;
  track_expiry: boolean;
}
export type StockTxType =
  | 'Opening' | 'Purchase' | 'Issue to Job' | 'Return from Job' | 'Damaged / Wasted'
  | 'Adjustment' | 'Transfer Out' | 'Transfer In' | 'Count Variance';
export interface StockTx extends Base {
  item_id: string;
  type: StockTxType;
  qty: number; // signed effect on on-hand at location_id
  unit_cost: number;
  location_id: string;
  job_id?: string;
  supplier?: string;
  reference?: string;
  batch_no?: string;
  expiry_date?: string;
  reason?: string;
  date: string;
  approval: 'Approved' | 'Pending' | 'Rejected'; // adjustments need approval
  approved_by?: string;
  reversal_of?: string;
  transfer_id?: string;
}
export interface MaterialRequest extends Base {
  job_id: string;
  requested_by: string;
  lines: { item_id: string; qty: number }[];
  status: 'Pending' | 'Issued' | 'Rejected';
  decided_by?: string;
  note?: string;
}

/* ---------- Assets ---------- */
export type AssetCategory =
  | 'RO/DI Pure-Water System' | 'Water-Fed Pole' | 'Pressure Washer' | 'Surface Cleaner'
  | 'Industrial Vacuum' | 'Pump' | 'Hose' | 'Ladder' | 'Safety Equipment' | 'Vehicle' | 'Other';
export type AssetStatus = 'Available' | 'Reserved' | 'Checked Out' | 'Under Maintenance' | 'Damaged' | 'Retired';
export type Condition = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Damaged';
export interface Asset extends Base {
  code: string;
  name: string;
  category: AssetCategory;
  brand: string;
  model: string;
  serial: string;
  purchase_date: string;
  purchase_cost: number;
  condition: Condition;
  location: string;
  maintenance_interval_days: number;
  last_maintenance?: string;
  custodian_id?: string;
  status: AssetStatus;
  meter_reading?: number;
  meter_unit?: string;
  daily_allocation: number; // cost allocated to jobs per day used
}
export type CheckoutStatus = 'Requested' | 'Rejected' | 'Released' | 'Returned';
export interface Checkout extends Base {
  asset_id: string;
  job_id: string;
  requested_by: string;
  responsible_id: string;
  status: CheckoutStatus;
  expected_return: string; // YYYY-MM-DDTHH:mm
  approved_by?: string;
  out_at?: string;
  out_condition?: Condition;
  out_meter?: number;
  out_photos: string[];
  in_at?: string;
  in_condition?: Condition;
  in_meter?: number;
  damage_notes?: string;
  missing_accessories?: string;
  in_photos: string[];
  note?: string;
}
export interface MaintenanceTicket extends Base {
  asset_id: string;
  source: 'Damage report' | 'Scheduled' | 'Manual';
  checkout_id?: string;
  description: string;
  status: 'Open' | 'In Repair' | 'Closed';
  opened_on: string;
  closed_on?: string;
  cost: number;
  vendor?: string;
}

/* ---------- Finance ---------- */
export type InvoiceStatus = 'Draft' | 'Approved' | 'Reversed';
export interface Invoice extends Base {
  number: string;
  client_id: string;
  site_id?: string;
  job_id?: string;
  quotation_id?: string;
  issue_date: string;
  due_date: string;
  items: QuoteItem[];
  vat_mode: 'exclusive' | 'inclusive' | 'none';
  vat_rate: number;
  discount: number;
  withholding_rate: number; // % withheld by client
  status: InvoiceStatus;
  approved_by?: string;
  approved_at?: string;
  reversal_reason?: string;
  reversed_at?: string;
  branch_id: string;
  notes?: string;
  last_reminder?: string;
}
export type PayMethod = 'Cash' | 'Bank Transfer' | 'Check' | 'GCash' | 'Credit Card' | 'Other';
export interface Payment extends Base {
  invoice_id: string;
  client_id: string;
  date: string;
  amount: number;        // cash received
  wht_amount: number;    // withholding tax certificate credited (2307)
  method: PayMethod;
  reference: string;
  receipt_no: string;
  reversed?: boolean;
  reversal_reason?: string;
}

export type ExpenseCategory =
  | 'Payroll' | 'Fuel' | 'Materials' | 'Equipment Repair' | 'Transportation' | 'Marketing'
  | 'Rent' | 'Utilities' | 'Government Fees' | 'Subcontractor' | 'Other';
export interface Expense extends Base {
  date: string;
  payee: string;
  category: ExpenseCategory;
  job_id?: string;
  branch_id: string;
  amount: number;      // gross amount incl. VAT
  vat: number;
  wht: number;
  method: PayMethod;
  receipt?: string;    // data URL
  approval: 'Pending' | 'Approved' | 'Rejected';
  approved_by?: string;
  paid: boolean;
  recurring?: 'monthly' | 'weekly' | null;
  petty_cash: boolean;
  notes?: string;
  source?: 'payroll' | 'maintenance';
  source_id?: string;
  reversed?: boolean;
}
export interface PettyCashEntry extends Base {
  date: string;
  kind: 'Replenishment' | 'Disbursement';
  amount: number;
  description: string;
  expense_id?: string;
}

/* ---------- System ---------- */
export interface Notification extends Base {
  key: string; // dedupe key
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'warn' | 'critical';
  link?: string;
  for_roles: Role[];
  read_by: string[];
  channels_queued: ('email' | 'sms' | 'whatsapp')[];
}
export interface AuditLog {
  id: string;
  at: string;
  user_id: string;
  user_name: string;
  action: 'create' | 'update' | 'delete' | 'restore' | 'approve' | 'reverse' | 'login' | 'logout' | 'lock' | 'export';
  table: string;
  record_id: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}
export interface StatutoryRate {
  key: 'sss' | 'philhealth' | 'pagibig' | 'wtax';
  label: string;
  mode: 'percent' | 'fixed';
  value: number;   // % of base pay or fixed peso amount per period
  min: number;     // minimum contribution per period
  max: number;     // maximum contribution per period (0 = no cap)
  threshold: number; // wtax: taxable pay per period below which none is withheld
}
export interface Settings {
  company: { name: string; tin: string; address: string; phone: string; email: string; tagline: string };
  vat_rate: number;
  default_terms: string;
  quote_validity_days: number;
  payment_terms_days: number;
  std_hours_per_day: number;
  monthly_divisor_days: number;
  multipliers: { overtime: number; regular_holiday: number; special_holiday: number; rest_day: number };
  grace_minutes: number;
  statutory: StatutoryRate[];
  channels: { email: boolean; sms: boolean; whatsapp: boolean };
  reminder_days: { quote_expiry: number; doc_expiry: number; chemical_expiry: number; invoice_due: number; maintenance: number };
  glass_group_size: number;
  access: Record<Role, string[]>; // permission overrides (editable by owner)
  counters: Record<string, number>;
}

export type TableName =
  | 'users' | 'branches' | 'clients' | 'sites' | 'communications' | 'complaints' | 'services' | 'inquiries'
  | 'quotations' | 'jobs' | 'employees' | 'attendance' | 'corrections' | 'holidays' | 'reviews'
  | 'adjustments' | 'periods' | 'runs' | 'locations' | 'items' | 'stock' | 'requests' | 'assets'
  | 'checkouts' | 'tickets' | 'invoices' | 'payments' | 'expenses' | 'petty' | 'notifications';

export interface DB {
  users: UserAccount[]; branches: Branch[]; clients: Client[]; sites: Site[]; communications: Communication[];
  complaints: Complaint[]; services: ServiceDef[]; inquiries: Inquiry[]; quotations: Quotation[]; jobs: Job[];
  employees: Employee[]; attendance: Attendance[]; corrections: AttendanceCorrection[]; holidays: Holiday[];
  reviews: PerfReview[]; adjustments: PayrollAdjustment[]; periods: PayrollPeriod[]; runs: PayrollRun[];
  locations: StorageLocation[]; items: InventoryItem[]; stock: StockTx[]; requests: MaterialRequest[];
  assets: Asset[]; checkouts: Checkout[]; tickets: MaintenanceTicket[]; invoices: Invoice[]; payments: Payment[];
  expenses: Expense[]; petty: PettyCashEntry[]; notifications: Notification[];
  audit: AuditLog[];
  settings: Settings;
  version: number;
}
