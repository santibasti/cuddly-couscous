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
export type AdditionalCategory = 'glass' | 'solar' | 'floor' | 'wall' | 'roof' | 'other';
export interface QuoteItem {
  service_code: ServiceCode;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number; // peso amount off this line
  // additional-work lines (Client Final Quote Review) only:
  category?: AdditionalCategory;
  entered_qty?: number;      // what was counted / entered; qty is the billable quantity (minimum applied)
  linked_panels?: boolean;   // glass: quantity comes from the panel-counting table
  note?: string;             // reason for the additional work
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
  /** created from a completed ocular visit: what the estimator found is carried forward */
  ocular_visit_id?: string; ocular_assignee_id?: string; ocular_panels?: PanelRow[]; ocular_measurements?: Measurement[];
}

/* ---------- Jobs ---------- */
export type JobStatus =
  | 'Pending' | 'Confirmed' | 'Dispatch Checklist Pending' | 'Dispatched' | 'On Site' | 'In Progress'
  | 'Work Completed' | 'Leaving Site' | 'Arrived at HQ' | 'Closed'
  | 'Completed' // legacy terminal status, treated the same as Closed
  | 'Cancelled' | 'Rescheduled';
export interface ChecklistItem { label: string; done: boolean }
export interface JobMaterial { item_id: string; planned_qty: number; used_qty?: number }

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
  /** Back Job / Callback: this job is the linked follow-up of a finished job (the original is never reopened or changed). */
  back_job_id?: string; origin_job_id?: string;
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
  | 'Industrial Vacuum' | 'Pump' | 'Hose' | 'Ladder' | 'Extension Cord' | 'Safety Equipment' | 'Vehicle' | 'Other';
export type AssetStatus = 'Available' | 'Reserved' | 'In Use' | 'Under Maintenance' | 'Damaged' | 'Missing' | 'Retired';
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
  in_at?: string;
  in_condition?: Condition;
  in_meter?: number;
  damage_notes?: string;
  missing_accessories?: string;
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

/* ---------- Job workflow (lives inside each Job Card) ---------- */
// 1 Job Prep at HQ → 2 Dispatch → 3 Site Check-In → 4 Scope Approval → 5 Work in Progress → 6 Client Handover → 7 Close-Out.
// Every step stores its date/time (`*_at`) and user (`*_by`). Job photos live in TopMop's own file system, not in this app.
export type FuelLevel = 'Empty' | '1/4' | '1/2' | '3/4' | 'Full';
export type ItemCondition = 'Good' | 'Damaged' | 'Missing';
export type ContainerCondition = 'Good' | 'Damaged' | 'Leaking';
export interface CheckItem {
  key: string;
  kind: 'vehicle' | 'equipment' | 'tool' | 'ppe' | 'material';
  asset_id?: string;
  item_id?: string;
  label: string;
  code?: string;              // Asset ID / QR value, or inventory item code
  unit?: string;
  qty: number;                // required quantity
  extra?: boolean;            // added by the team leader
  responsible_id?: string;
  // step 1 – job prep checklist
  loaded_qty?: number;        // actual quantity loaded (materials: quantity issued)
  out_ok?: boolean;           // confirmed by scan, typed asset ID or manual tick
  out_by?: 'scan' | 'id' | 'manual';
  out_condition?: ItemCondition;
  out_container?: ContainerCondition; // chemicals / materials
  out_note?: string;
  // step 7 – close-out (return) check
  returned_qty?: number;
  ret_condition?: ItemCondition;
  ret_by?: 'scan' | 'id' | 'manual';
  ret_note?: string;
  repair_required?: boolean;
  used_qty?: number;          // materials: issued − returned (calculated)
}
export interface PanelRow {
  id: string;
  area: string;               // 1st Floor … Roof Deck / Other
  side: string;               // Front, Rear, Left Side, Right Side, Interior, Other
  external: number;
  internal: number;
  notes?: string;
  additional?: boolean;       // beyond the quoted scope → feeds a Variation
}
export interface JobWorkflow extends Base {
  job_id: string;
  items: CheckItem[];
  panels: PanelRow[];
  // 1 Job Prep at HQ
  hq_at?: string; hq_by?: string; hq_fuel?: FuelLevel; hq_notes?: string; hq_shortage_reason?: string;
  // 2 Dispatch (actual departure time + leader confirmation)
  disp_at?: string; disp_by?: string;
  // 3 Site Check-In (arrival + attendance)
  arr_at?: string; arr_by?: string; arr_contact_name?: string; arr_contact_mobile?: string; arr_notes?: string;
  arr_crew_present?: string[]; arr_crew_absent?: { id: string; reason: string }[];
  // 4 Scope Approval: 'approval' = quotation / conforme signed by the client, 'confirmed' = recurring job, scope unchanged
  scope_changed?: boolean;
  conf_mode?: 'approval' | 'confirmed' | 'declined';  // declined = the client turned the job down on site
  conf_at?: string; conf_by?: string; conf_quotation_id?: string; conf_original_total?: number; conf_name?: string; conf_signature?: string; conf_notes?: string;
  conf_variation_id?: string; conf_final_total?: number; conf_deposit?: number; conf_deposit_note?: string; conf_lat?: number; conf_lng?: number; conf_gps_note?: string; conf_device?: string;
  // 5 Work in Progress
  start_at?: string; start_by?: string; finish_at?: string; finish_by?: string; work_notes?: string;
  // 6 Client Handover (Service Accomplishment Report)
  rep_at?: string; rep_by?: string; rep_scope?: string; rep_method?: string; rep_findings?: string; rep_limits?: string; rep_recs?: string; rep_complimentary?: string;
  rep_client_name?: string; rep_client_sig?: string; rep_client_at?: string; rep_tm_name?: string; rep_tm_sig?: string; rep_rating?: number; rep_notes?: string;
  // 7 Close-Out (equipment return + leaving site + arrival at HQ + leader confirmation)
  rc_at?: string; rc_by?: string; rc_notes?: string;
  leave_at?: string; leave_by?: string;
  hqa_at?: string; hqa_by?: string; hqa_fuel?: FuelLevel;
  closed_at?: string; closed_by?: string; closed_notes?: string;
}
export type VariationStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';
export interface Variation extends Base {
  job_id: string;
  number: string;             // e.g. JOB-2026-0123-V1
  reason: string;
  items: QuoteItem[];
  discount: number;
  vat_mode: 'exclusive' | 'inclusive' | 'none';
  vat_rate: number;
  panel_row_ids: string[];    // additional glass panels linked from the panel-counting table
  status: VariationStatus;
  client_name?: string; client_signature?: string; signed_at?: string;
  decided_by?: string; notes?: string;
  // Client Final Quote Review (step 4): additions offered at the site before the conforme is signed
  source?: 'final_review';
  revision_open?: boolean; revision_note?: string; revision_at?: string;
  decided_at?: string;       // when the client approved / declined
  sign_lat?: number; sign_lng?: number; sign_gps_note?: string; sign_device?: string;
}
/* ---------- Quotation images / attachments (optional; kept apart from job & service photos) ---------- */
export type QuoteImageCategory = 'Scope Area' | 'Panel Count' | 'Additional Work' | 'Site Condition' | 'Access Limitation' | 'Exclusion' | 'Other';
export interface QuoteImage extends Base {
  quotation_id?: string;       // attached to a quotation …
  variation_id?: string;       // … or to a variation (additional work)
  job_id?: string;             // the job of a variation (used for the assigned Team Leader check)
  category: QuoteImageCategory;
  caption: string;
  item_index?: number;         // optional link to a quotation / variation line item (position + description kept for the record)
  item_label?: string;
  file: string;                // resized image (inline in the demo; a private Storage path in production)
  name: string; width: number; height: number;
  share_with_client: boolean;  // only these appear in the client-facing view and in the PDF
}

/* ---------- Ocular Visits (site inspections before a quotation) ---------- */
export type OcularStatus = 'Scheduled' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Converted to Quotation';
export interface Measurement { id: string; label: string; service_code?: ServiceCode; qty: number; unit: string; notes?: string }
export interface OcularVisit extends Base {
  number: string;                       // OV-2026-0001
  client_id: string; contact_person: string; contact_mobile?: string;
  site_id?: string; location: string;   // service location
  service_codes: ServiceCode[];         // requested service type(s)
  start_at: string;                     // proposed date and time (YYYY-MM-DDTHH:mm)
  duration_min: number;                 // expected duration
  assignee_id?: string;                 // assigned Team Leader / estimator
  concerns: string;                     // client concerns / requested scope
  access_notes: string;
  status: OcularStatus;
  branch_id: string;
  // recorded when the visit is completed (no photos, no odometer)
  panels: PanelRow[]; measurements: Measurement[]; findings: string;
  completed_at?: string; completed_by?: string; cancel_reason?: string;
  quotation_id?: string; converted_at?: string;
}

/* ---------- Back Jobs / Callbacks ---------- */
export type BackJobReason = 'Missed Area' | 'Quality Issue' | 'Client Complaint' | 'Damage' | 'Warranty/Touch-Up' | 'Other';
export type BackJobStatus = 'Reported' | 'Under Review' | 'Approved' | 'Scheduled' | 'In Progress' | 'Resolved' | 'Closed' | 'Rejected';
export type BackJobCharge = 'No Charge' | 'Chargeable Additional Work';
export interface BackJob extends Base {
  number: string;                      // BJ-2026-0001
  origin_job_id: string;               // the finished job (never changed)
  job_id: string;                      // the linked follow-up job: own number, schedule, attendance, checklist, service report and closure
  client_id: string; site_id: string;
  origin_workflow_id?: string;         // original service report
  origin_quotation_id?: string; origin_invoice_id?: string;
  origin_leader_id?: string; origin_crew_ids: string[];
  reason: BackJobReason; description: string;
  reported_on: string; reported_by: string; responsible: string;
  charge_type: BackJobCharge;
  status: BackJobStatus;
  reviewed_by?: string; reviewed_at?: string;
  approved_by?: string; approved_at?: string; approval_note?: string;
  quotation_id?: string;               // chargeable: the new quotation the client must approve before work starts
  resolved_at?: string; closed_at?: string;
}

/* ---------- Client Satisfaction Check (end of Client Handover) ---------- */
export type SatisfactionRating = 1 | 2 | 3;     // 1 Not Satisfied · 2 Satisfied · 3 Very Satisfied
export type IssueCategory = 'Quality' | 'Damage' | 'Delay' | 'Communication' | 'Scope' | 'Other';
export interface ClientFeedback extends Base {
  job_id: string; workflow_id?: string; client_id: string;
  leader_id?: string; crew_ids: string[]; service_codes: string[]; service_date: string;
  rating: SatisfactionRating;
  /** 1 Poor · 2 Fair · 3 Good · 4 Very Good · 5 Excellent (not recorded on feedback saved before these questions existed) */
  q_quality?: number; q_professionalism?: number; q_communication?: number;
  aspects: string[];                 // legacy ticked items (no longer asked)
  comment?: string;
  issue_category?: IssueCategory;    // required from the Team Leader when Not Satisfied
  follow_up: 'None' | 'Required' | 'Acknowledged';
  ack_note?: string; ack_by?: string; ack_at?: string;
  submitted_by?: string; submitted_at: string;
}

/* ---------- Controlled discounts ---------- */
export type DiscountStatus = 'Pending Admin Approval' | 'Approved' | 'Rejected' | 'Applied';
export type DiscountKind = 'percent' | 'fixed';
export interface DiscountRequest extends Base {
  number: string;                 // DR-2026-0001
  job_id: string;
  client_id: string;
  quotation_id?: string;
  /** VAT-inclusive totals at the time of the request. The original quotation and rates are never changed. */
  original_total: number;         // original quotation total
  additional_total: number;       // approved / presented additional work total
  base_total: number;             // original + additional, before this discount
  kind: DiscountKind;
  value: number;                  // % or peso amount as typed by the Team Leader
  requested_amount: number;       // peso value of the request
  proposed_final: number;         // base_total - requested_amount
  reason: string;                 // category
  reason_note?: string;
  client_notes?: string;          // client request / negotiation notes
  status: DiscountStatus;
  submitted_by?: string; submitted_at: string;
  // Admin decision (Owner / Admin only)
  approved_kind?: DiscountKind; approved_value?: number;
  approved_amount?: number;       // peso discount granted (may differ from the request)
  approved_final?: number;
  approved_base?: number;         // final-bill total before discount that the Admin approved against
  decision_note?: string; decided_by?: string; decided_at?: string;
  // snapshots shown to the Admin
  est_cost?: number; gp_before?: number; gp_after?: number; margin_after?: number;
  // applied to the final bill
  applied_at?: string; applied_by?: string;
  net_amount?: number;            // discount ex-VAT (what revenue is reduced by)
}
export type IncidentType = 'Missing asset' | 'Damaged asset' | 'Vehicle damage' | 'Material shortage' | 'Missing PPE' | 'Safety' | 'Other';
export interface IncidentReport extends Base {
  number: string;
  job_id?: string;
  workflow_id?: string;
  asset_id?: string;
  item_id?: string;
  type: IncidentType;
  severity: 'Low' | 'Medium' | 'High';
  description: string;
  status: 'Open' | 'Investigating' | 'Acknowledged' | 'Resolved';
  ticket_id?: string;
  resolution?: string;
  resolved_at?: string;
  auto: boolean;
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
  discount_request_id?: string; // management-approved discount (Discount Request) included in `discount`
  discount_granted?: number;    // that discount, VAT-inclusive
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
export type PayMethod = 'Cash' | 'Bank Transfer' | 'Cheque' | 'GCash';
/* ---------- Payment Method Confirmation (before Client Handover; separate from the service record) ---------- */
export type ConfirmMethod = 'Cash' | 'GCash' | 'Bank Transfer' | 'Cheque' | 'Terms / To Be Billed';
export interface PaymentConfirmation extends Base {
  job_id: string; workflow_id?: string; client_id: string;
  final_bill: number;            // final approved bill incl. approved additional work, VAT and any approved discount
  method: ConfirmMethod;
  collection: 'Received' | 'To Be Paid Later';
  expected_today: number;        // amount received / expected today
  balance_later: number;         // still to be billed / collected later
  note?: string;
  amount_received?: number;      // Cash
  gcash_ref?: string;
  bank_name?: string; transfer_ref?: string;                 // Bank Transfer (bank also for Cheque)
  cheque_no?: string; cheque_date?: string;
  terms?: string; due_date?: string;                         // Terms / To Be Billed
  confirmed_by?: string; confirmed_at: string;               // Team Leader confirmation
  payment_id?: string;           // the Pending Verification payment entry created when money was received
}
export type ExpenseMethod = 'Cash' | 'Bank Transfer' | 'Check' | 'GCash' | 'Credit Card' | 'Other';
export type PaymentStatus = 'Pending Verification' | 'Verified' | 'Rejected';
export type ChequeStatus = 'Pending Clearance' | 'Deposited' | 'Cleared' | 'Bounced';
export interface Payment extends Base {
  invoice_id: string;
  client_id: string;
  job_id?: string;
  confirmation_id?: string;   // created from the Team Leader's Payment Method Confirmation
  date: string;          // payment date (YYYY-MM-DD)
  paid_at?: string;      // payment date and time (YYYY-MM-DDTHH:mm)
  amount: number;        // amount received
  wht_amount: number;    // withholding tax certificate credited (2307)
  method: PayMethod;
  reference: string;     // method reference: transfer ref / cheque no. / GCash ref / OR no.
  receipt_no: string;    // payment number (official receipt)
  received_by: string;   // name of the person who received the money
  notes?: string;
  status: PaymentStatus; // only Verified payments (and Cleared cheques) count towards the invoice, statement, aging, revenue and profitability
  verified_by?: string; verified_at?: string; reject_reason?: string;
  bank_name?: string; transfer_date?: string;                 // Bank Transfer / Cheque
  cheque_no?: string; cheque_date?: string; cheque_status?: ChequeStatus; cleared_at?: string;   // Cheque
  gcash_ref?: string; sender?: string;                        // GCash (sender name or mobile)
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
  method: ExpenseMethod;
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
/* ---------- Client Lifetime Value & Maintenance Follow-Up ---------- */
/** 'short' = the first reminder (default 6 months after the last completed service), 'long' = the second (default 1 year). */
export type FollowUpSlot = 'short' | 'long';
export type FollowUpState = 'Open' | 'Contacted' | 'Follow-Up Scheduled' | 'Quotation Sent' | 'Booked' | 'Not Interested' | 'Snoozed' | 'Superseded';
export interface FollowUp extends Base {
  client_id: string;
  slot: FollowUpSlot;
  months: number;                 // interval used when it was scheduled (default 6 / 12)
  reference_job_id: string;       // the completed service the dates are counted from
  reference_date: string;         // that service's completion date (YYYY-MM-DD)
  service_codes: ServiceCode[];   // last service type at that time
  due_date: string;               // reference_date + months
  status: FollowUpState;          // Superseded = replaced by a newer completed service (kept as history)
  snoozed_until?: string;
  note?: string;
  booked_job_id?: string;         // the booking this follow-up produced
  superseded_by_job_id?: string;
  actioned_by?: string; actioned_at?: string;
  history: { at: string; by: string; status: FollowUpState; note?: string }[];
}
/** Admin-set custom interval for one client, or for every client whose last service was of this type. A client rule wins over a service rule. */
export interface FollowUpRule extends Base {
  client_id?: string;
  service_code?: ServiceCode;
  short_months: number;
  long_months: number;
  note?: string;
}

export interface AuditLog {
  id: string;
  at: string;
  user_id: string;
  user_name: string;
  reason?: string;
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
  | 'checkouts' | 'tickets' | 'invoices' | 'payments' | 'expenses' | 'petty' | 'notifications' | 'workflows' | 'variations' | 'incidents' | 'discount_requests' | 'client_feedback' | 'back_jobs' | 'payment_confirmations' | 'ocular_visits' | 'quote_images' | 'followups' | 'followup_rules';

export interface DB {
  users: UserAccount[]; branches: Branch[]; clients: Client[]; sites: Site[]; communications: Communication[];
  complaints: Complaint[]; services: ServiceDef[]; inquiries: Inquiry[]; quotations: Quotation[]; jobs: Job[];
  employees: Employee[]; attendance: Attendance[]; corrections: AttendanceCorrection[]; holidays: Holiday[];
  reviews: PerfReview[]; adjustments: PayrollAdjustment[]; periods: PayrollPeriod[]; runs: PayrollRun[];
  locations: StorageLocation[]; items: InventoryItem[]; stock: StockTx[]; requests: MaterialRequest[];
  assets: Asset[]; checkouts: Checkout[]; tickets: MaintenanceTicket[]; invoices: Invoice[]; payments: Payment[];
  expenses: Expense[]; petty: PettyCashEntry[]; notifications: Notification[]; workflows: JobWorkflow[]; variations: Variation[]; incidents: IncidentReport[]; discount_requests: DiscountRequest[]; client_feedback: ClientFeedback[]; back_jobs: BackJob[]; payment_confirmations: PaymentConfirmation[]; ocular_visits: OcularVisit[]; quote_images: QuoteImage[]; followups: FollowUp[]; followup_rules: FollowUpRule[];
  audit: AuditLog[];
  settings: Settings;
  version: number;
}
