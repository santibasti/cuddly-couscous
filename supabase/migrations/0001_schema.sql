-- TopMop Operations — PostgreSQL / Supabase schema
-- Column names mirror src/lib/types.ts so the demo dataset can be exported 1:1 (see scripts/export-seed-sql.ts).
-- Conventions
--   * every business table has id, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by (soft delete)
--   * dates are `date`; Manila wall-clock times are `timestamp` (no zone); system stamps are `timestamptz`
--   * money is numeric(14,2); PHP (₱); reporting timezone Asia/Manila
--   * hard DELETE is blocked everywhere; finalized payroll, approved invoices, stock and completed asset out/in are immutable
--   * row-level security is driven by public.role_permissions (editable by the Owner in the app)

create schema if not exists app;

create type public.app_role as enum ('owner', 'ops', 'finance', 'leader', 'field', 'viewer');

/* ------------------------------------------------------------------ */
/* Template for standard audit columns                                 */
/* ------------------------------------------------------------------ */
create table app.base_columns (
  id          text primary key default gen_random_uuid()::text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text default auth.uid()::text,
  updated_by  text,
  deleted_at  timestamptz,
  deleted_by  text
);

/* ------------------------------------------------------------------ */
/* Identity & permissions                                              */
/* ------------------------------------------------------------------ */
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        public.app_role not null default 'field',
  employee_id text,
  client_id   text,               -- set for client-portal users
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  updated_by  text,
  deleted_at  timestamptz,
  deleted_by  text
);

create table public.role_permissions (
  role       public.app_role not null,
  permission text not null,
  primary key (role, permission)
);

create function app.user_role() returns public.app_role
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and active and deleted_at is null $$;

create function app.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(app.user_role() = 'owner', false)
       or exists (select 1 from public.role_permissions rp where rp.role = app.user_role() and rp.permission = p) $$;

create function app.my_employee() returns text
language sql stable security definer set search_path = public as
$$ select employee_id from public.profiles where id = auth.uid() and active $$;

create function app.my_client() returns text
language sql stable security definer set search_path = public as
$$ select client_id from public.profiles where id = auth.uid() and active $$;

/* ------------------------------------------------------------------ */
/* Organisation & CRM                                                  */
/* ------------------------------------------------------------------ */
create table public.branches (like app.base_columns including all, name text not null, address text);

create table public.clients (
  like app.base_columns including all,
  name text not null, contact_person text not null, mobile text, email text, address text, billing_address text,
  type text not null check (type in ('Residential','Commercial','Property Management','Government / LGU','Auto Dealership','Hospitality','Church','Industrial','School / Institution')),
  status text not null default 'Prospect' check (status in ('Active','Prospect','Inactive')),
  notes text, access_instructions text,
  tin text, vat_status text check (vat_status in ('VAT-registered','Non-VAT','VAT-exempt')),
  withholding_rate numeric(5,2) not null default 0, withholding_notes text,
  branch_id text references public.branches (id)
);
create index on public.clients (status) where deleted_at is null;

create table public.sites (
  like app.base_columns including all,
  client_id text not null references public.clients (id), name text not null, address text not null,
  contact_person text, contact_mobile text, access_instructions text, lat double precision, lng double precision
);
create index on public.sites (client_id);

create table public.communications (
  like app.base_columns including all,
  client_id text not null references public.clients (id),
  channel text not null, summary text not null, follow_up_date date, follow_up_done boolean default false
);
create table public.complaints (
  like app.base_columns including all,
  client_id text not null references public.clients (id), job_id text, summary text not null,
  severity text check (severity in ('Low','Medium','High')), status text check (status in ('Open','Investigating','Resolved')), resolution text
);

create table public.services (
  like app.base_columns including all,
  code text not null unique, name text not null, unit text not null,
  rate numeric(12,2) not null default 0, minimum_qty numeric(12,2) not null default 1,
  package_price numeric(12,2), package_qty numeric(12,2), excess_rate numeric(12,2),
  custom_quote boolean not null default false, est_hours_per_unit numeric(8,3) default 0.25
);

/* ------------------------------------------------------------------ */
/* Sales                                                               */
/* ------------------------------------------------------------------ */
create table public.inquiries (
  like app.base_columns including all,
  client_id text not null references public.clients (id), site_id text, service_codes jsonb not null default '[]',
  stage text not null check (stage in ('Inquiry','Ocular Visit','Quotation','Client Approval','Booked','Lost')),
  source text, details text, ocular_date date, assigned_to text, lost_reason text
);

create table public.quotations (
  like app.base_columns including all,
  number text not null unique, client_id text not null references public.clients (id), site_id text, inquiry_id text,
  issue_date date not null, valid_until date not null, scope text, items jsonb not null default '[]',
  vat_mode text not null check (vat_mode in ('exclusive','inclusive','none')), vat_rate numeric(5,2) not null default 12,
  discount numeric(14,2) not null default 0, terms text,
  status text not null default 'Draft' check (status in ('Draft','Sent','Approved','Rejected','Expired')),
  sent_at timestamptz, decided_at timestamptz, reject_reason text, branch_id text references public.branches (id),
  check (valid_until >= issue_date)
);
create index on public.quotations (client_id);
create index on public.quotations (status) where deleted_at is null;

/* ------------------------------------------------------------------ */
/* Employees, attendance, performance                                  */
/* ------------------------------------------------------------------ */
create table public.employees (
  like app.base_columns including all,
  code text not null unique, full_name text not null, position text, tier text, department text, branch_id text references public.branches (id),
  pay_basis text not null check (pay_basis in ('daily','monthly')), daily_rate numeric(12,2) default 0, monthly_salary numeric(12,2) default 0,
  payroll_type text not null check (payroll_type in ('daily','weekly','biweekly','monthly')), hire_date date,
  bank_name text, bank_account text, payout_method text, mobile text, emergency_name text, emergency_mobile text,
  sss text, philhealth text, pagibig text, tin text,
  status text not null check (status in ('probationary','regular','contractual','inactive')),
  documents jsonb not null default '[]', trainings jsonb not null default '[]',
  shift_start time not null default '08:00', shift_end time not null default '17:00', rest_day smallint not null default 0
);

create table public.jobs (
  like app.base_columns including all,
  number text not null unique, client_id text not null references public.clients (id), site_id text not null references public.sites (id),
  quotation_id text, branch_id text references public.branches (id), service_codes jsonb not null default '[]', scope text,
  start_at timestamp not null, end_at timestamp not null,
  status text not null check (status in ('Pending','Confirmed','In Progress','Completed','Cancelled','Rescheduled')),
  leader_id text references public.employees (id), crew_ids jsonb not null default '[]',
  vehicle_id text, equipment_ids jsonb not null default '[]', materials jsonb not null default '[]', ppe jsonb not null default '[]',
  checklist jsonb not null default '[]', photos jsonb not null default '[]',   -- production: store files in Storage, keep paths here
  findings text, damage_report text, equipment_condition_notes text,
  signoff_name text, signoff_data text, signoff_at timestamp, client_rating smallint check (client_rating between 1 and 5),
  completed_at timestamp, contract_amount numeric(14,2) not null default 0, estimated_cost numeric(14,2) not null default 0,
  reminder_sent boolean default false, rescheduled_from timestamp,
  check (end_at > start_at)
);
create index on public.jobs (start_at);
create index on public.jobs (client_id);
create index on public.jobs (status) where deleted_at is null;

create table public.attendance (
  like app.base_columns including all,
  employee_id text not null references public.employees (id), date date not null,
  kind text not null check (kind in ('Present','Absent','Leave','Holiday','Rest Day')),
  clock_in timestamp, clock_out timestamp, job_id text, field_work boolean not null default false,
  in_lat double precision, in_lng double precision, out_lat double precision, out_lng double precision, in_photo text, out_photo text,
  late_min integer not null default 0, undertime_min integer not null default 0, ot_min integer not null default 0,
  worked_hours numeric(6,2) not null default 0, paid_leave boolean,
  approval text not null default 'Pending' check (approval in ('Pending','Approved','Rejected')),
  approved_by text, approved_at timestamptz, notes text,
  check (clock_out is null or clock_in is null or clock_out >= clock_in)
);
create unique index attendance_one_per_day on public.attendance (employee_id, date) where deleted_at is null;

create table public.corrections (
  like app.base_columns including all,
  attendance_id text, employee_id text not null references public.employees (id), date date not null,
  clock_in timestamp not null, clock_out timestamp not null, reason text not null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  decided_by text, decided_at timestamptz, decision_note text, check (clock_out > clock_in)
);
create table public.holidays (like app.base_columns including all, date date not null unique, name text not null, kind text not null check (kind in ('Regular','Special')));
create table public.reviews (
  like app.base_columns including all,
  employee_id text not null references public.employees (id), month text not null,
  quality smallint, safety smallint, equipment_care smallint, teamwork smallint, supervisor smallint,
  training_completed smallint default 0, disciplinary text, incentive numeric(12,2) default 0, penalty numeric(12,2) default 0, notes text,
  unique (employee_id, month)
);

/* ------------------------------------------------------------------ */
/* Payroll                                                             */
/* ------------------------------------------------------------------ */
create table public.adjustments (
  like app.base_columns including all,
  employee_id text not null references public.employees (id),
  kind text not null check (kind in ('Allowance','Incentive','Reimbursement','Cash Advance','Loan','Other Deduction')),
  amount numeric(12,2) not null check (amount > 0), balance numeric(12,2), period_id text, note text, active boolean not null default true
);
create table public.periods (
  like app.base_columns including all,
  label text not null, period_start date not null, period_end date not null,
  type text not null check (type in ('daily','weekly','biweekly','monthly')),
  status text not null default 'Draft' check (status in ('Draft','For Approval','Approved','Finalized')),
  submitted_by text, approved_by text, approved_at timestamptz, finalized_by text, finalized_at timestamptz,
  locked boolean not null default false, expense_id text, check (period_end >= period_start)
);
create table public.runs (like app.base_columns including all, period_id text not null unique references public.periods (id), lines jsonb not null default '[]');

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */
create table public.locations (like app.base_columns including all, name text not null unique);
create table public.items (
  like app.base_columns including all,
  code text not null unique, name text not null,
  category text not null check (category in ('Chemical','Consumable','Spare Part','PPE','Office Supply','Cleaning Material')),
  uom text not null, reorder_level numeric(12,2) not null default 0, cost numeric(12,2) not null default 0, supplier text,
  location_id text references public.locations (id), expiry_date date, batch_no text, track_expiry boolean not null default false
);
create table public.stock (
  like app.base_columns including all,
  item_id text not null references public.items (id),
  type text not null check (type in ('Opening','Purchase','Issue to Job','Return from Job','Damaged / Wasted','Adjustment','Transfer Out','Transfer In','Count Variance')),
  qty numeric(14,3) not null check (qty <> 0), unit_cost numeric(12,2) not null default 0, location_id text not null references public.locations (id),
  job_id text, supplier text, reference text, batch_no text, expiry_date date, reason text, date date not null default current_date,
  approval text not null default 'Approved' check (approval in ('Approved','Pending','Rejected')), approved_by text,
  reversal_of text references public.stock (id), transfer_id text
);
create index on public.stock (item_id, location_id);
create index on public.stock (job_id);
create table public.requests (
  like app.base_columns including all,
  job_id text not null, requested_by text, lines jsonb not null default '[]',
  status text not null default 'Pending' check (status in ('Pending','Issued','Rejected')), decided_by text, note text
);

/* ------------------------------------------------------------------ */
/* Equipment, machines & vehicles                                      */
/* ------------------------------------------------------------------ */
create table public.assets (
  like app.base_columns including all,
  code text not null unique, name text not null, category text not null, brand text, model text, serial text,
  purchase_date date, purchase_cost numeric(14,2) default 0,
  condition text not null check (condition in ('Excellent','Good','Fair','Poor','Damaged')), location text,
  maintenance_interval_days integer default 0, last_maintenance date, custodian_id text,
  status text not null default 'Available' check (status in ('Available','Reserved','Checked Out','Under Maintenance','Damaged','Retired')),
  meter_reading numeric(12,1), meter_unit text, daily_allocation numeric(12,2) default 0
);
create table public.checkouts (
  like app.base_columns including all,
  asset_id text not null references public.assets (id), job_id text not null, requested_by text, responsible_id text,
  status text not null check (status in ('Requested','Rejected','Released','Returned')),
  expected_return timestamp not null, approved_by text,
  out_at timestamp, out_condition text, out_meter numeric(12,1), out_photos jsonb not null default '[]',
  in_at timestamp, in_condition text, in_meter numeric(12,1), damage_notes text, missing_accessories text, in_photos jsonb not null default '[]', note text
);
-- An asset can be released to only one job at a time.
create unique index checkouts_one_active_release on public.checkouts (asset_id) where status = 'Released' and deleted_at is null;
create table public.tickets (
  like app.base_columns including all,
  asset_id text not null references public.assets (id), source text not null check (source in ('Damage report','Scheduled','Manual')), checkout_id text,
  description text not null, status text not null default 'Open' check (status in ('Open','In Repair','Closed')),
  opened_on date not null, closed_on date, cost numeric(12,2) default 0, vendor text
);

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */
create table public.invoices (
  like app.base_columns including all,
  number text not null unique, client_id text not null references public.clients (id), site_id text, job_id text, quotation_id text,
  issue_date date not null, due_date date not null, items jsonb not null default '[]',
  vat_mode text not null check (vat_mode in ('exclusive','inclusive','none')), vat_rate numeric(5,2) not null default 12,
  discount numeric(14,2) not null default 0, withholding_rate numeric(5,2) not null default 0,
  status text not null default 'Draft' check (status in ('Draft','Approved','Reversed')),
  approved_by text, approved_at timestamptz, reversal_reason text, reversed_at timestamptz, branch_id text references public.branches (id), notes text, last_reminder date,
  check (due_date >= issue_date)
);
create index on public.invoices (client_id);
create table public.payments (
  like app.base_columns including all,
  invoice_id text not null references public.invoices (id), client_id text not null references public.clients (id), date date not null,
  amount numeric(14,2) not null check (amount >= 0), wht_amount numeric(14,2) not null default 0 check (wht_amount >= 0),
  method text not null check (method in ('Cash','Bank Transfer','Check','GCash','Credit Card','Other')), reference text,
  receipt_no text not null unique, reversed boolean default false, reversal_reason text
);
create table public.expenses (
  like app.base_columns including all,
  date date not null, payee text not null,
  category text not null check (category in ('Payroll','Fuel','Materials','Equipment Repair','Transportation','Marketing','Rent','Utilities','Government Fees','Subcontractor','Other')),
  job_id text, branch_id text references public.branches (id), amount numeric(14,2) not null check (amount > 0), vat numeric(14,2) not null default 0, wht numeric(14,2) not null default 0,
  method text, receipt text, approval text not null default 'Pending' check (approval in ('Pending','Approved','Rejected')), approved_by text,
  paid boolean not null default false, recurring text check (recurring in ('monthly','weekly')), petty_cash boolean not null default false, notes text,
  source text check (source in ('payroll','maintenance')), source_id text, reversed boolean default false, check (vat <= amount)
);
create table public.petty (
  like app.base_columns including all,
  date date not null, kind text not null check (kind in ('Replenishment','Disbursement')), amount numeric(14,2) not null check (amount > 0), description text, expense_id text
);

/* ------------------------------------------------------------------ */
/* System                                                              */
/* ------------------------------------------------------------------ */
create table public.notifications (
  like app.base_columns including all,
  key text not null unique, type text not null, title text not null, body text, severity text not null check (severity in ('info','warn','critical')),
  link text, for_roles jsonb not null default '[]', read_by jsonb not null default '[]', channels_queued jsonb not null default '[]'
);
create table public.settings (id text primary key default 'main', data jsonb not null, updated_at timestamptz not null default now(), updated_by text);
create table public.audit_logs (
  id text primary key default gen_random_uuid()::text, at timestamptz not null default now(),
  user_id text, user_name text, action text not null, table_name text not null, record_id text, summary text, before jsonb, after jsonb
);
create index on public.audit_logs (table_name, record_id);
create index on public.audit_logs (at desc);
