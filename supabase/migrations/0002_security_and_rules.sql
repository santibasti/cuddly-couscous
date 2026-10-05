-- TopMop Operations — business-rule triggers, audit trail, immutability, row-level security, reporting views.

/* ================================================================== */
/* 1. Generic triggers                                                 */
/* ================================================================== */
create function app.touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid()::text;
  return new;
end $$;

create function app.audit() returns trigger language plpgsql security definer set search_path = public as $$
declare rid text; act text; uname text;
begin
  select name into uname from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then rid := new.id; act := 'create';
  elsif tg_op = 'UPDATE' then rid := new.id; act := case when new.deleted_at is not null and old.deleted_at is null then 'delete' else 'update' end;
  else rid := old.id; act := 'delete'; end if;
  insert into public.audit_logs (user_id, user_name, action, table_name, record_id, summary, before, after)
  values (coalesce(auth.uid()::text, 'system'), coalesce(uname, 'System'), act, tg_table_name, rid, initcap(act) || ' ' || tg_table_name,
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Nothing is ever hard-deleted: use deleted_at (soft delete) or a reversal / adjustment entry.
create function app.no_hard_delete() returns trigger language plpgsql as $$
begin
  raise exception 'Records in % cannot be deleted. Soft-delete, reverse or adjust instead.', tg_table_name using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array['branches','clients','sites','communications','complaints','services','inquiries','quotations','employees','jobs','attendance','corrections','holidays','reviews',
                           'adjustments','periods','runs','locations','items','stock','requests','assets','checkouts','tickets','invoices','payments','expenses','petty','notifications','profiles']
  loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch()', t);
    execute format('create trigger trg_no_delete before delete on public.%I for each row execute function app.no_hard_delete()', t);
    if t <> 'notifications' then
      execute format('create trigger trg_audit after insert or update on public.%I for each row execute function app.audit()', t);
    end if;
  end loop;
end $$;

create trigger trg_no_delete before delete on public.audit_logs for each row execute function app.no_hard_delete();
create function app.append_only() returns trigger language plpgsql as $$ begin raise exception 'The audit log is append-only.'; end $$;
create trigger trg_append_only before update on public.audit_logs for each row execute function app.append_only();

/* ================================================================== */
/* 2. Immutability of financial / stock / asset records                */
/* ================================================================== */
-- Stock ledger: only the approval decision may change; quantities never.
create function app.guard_stock() returns trigger language plpgsql as $$
begin
  if to_jsonb(new) - array['approval','approved_by','updated_at','updated_by'] <> to_jsonb(old) - array['approval','approved_by','updated_at','updated_by'] then
    raise exception 'Stock transactions are immutable. Post a reversal or adjustment instead.';
  end if;
  if old.approval <> 'Pending' and new.approval <> old.approval then raise exception 'This stock transaction has already been decided.'; end if;
  if new.approval = 'Approved' and old.approval = 'Pending' and not (app.has_perm('inventory.approve') or auth.uid() is null) then
    raise exception 'Not permitted to approve stock adjustments.';
  end if;
  if new.approval = 'Approved' and old.approval = 'Pending' and new.created_by = auth.uid()::text and app.user_role() <> 'owner' then
    raise exception 'Someone else must approve your adjustment.';
  end if;
  return new;
end $$;
create trigger trg_guard_stock before update on public.stock for each row execute function app.guard_stock();

-- Never let approved stock go negative at a location.
create function app.guard_stock_negative() returns trigger language plpgsql as $$
declare oh numeric;
begin
  if new.approval = 'Approved' and (tg_op = 'INSERT' or old.approval <> 'Approved') and new.qty < 0 then
    select coalesce(sum(qty), 0) into oh from public.stock where item_id = new.item_id and location_id = new.location_id and approval = 'Approved' and deleted_at is null and id <> new.id;
    if oh + new.qty < 0 then raise exception 'Insufficient stock: % on hand, % requested.', oh, -new.qty; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_stock_negative before insert or update on public.stock for each row execute function app.guard_stock_negative();

-- Invoice arithmetic (net of VAT, VAT, total, expected withholding) computed from line items.
create function app.invoice_net(i public.invoices) returns numeric language sql immutable as $$
  with g as (select coalesce(sum((it->>'qty')::numeric * (it->>'rate')::numeric - coalesce((it->>'discount')::numeric, 0)), 0) as gross from jsonb_array_elements(i.items) it),
       a as (select greatest(0, gross - i.discount) as after from g)
  select round(case i.vat_mode when 'inclusive' then after / (1 + i.vat_rate / 100) else after end, 2) from a $$;
create function app.invoice_total(i public.invoices) returns numeric language sql immutable as $$
  with g as (select coalesce(sum((it->>'qty')::numeric * (it->>'rate')::numeric - coalesce((it->>'discount')::numeric, 0)), 0) as gross from jsonb_array_elements(i.items) it),
       a as (select greatest(0, gross - i.discount) as after from g)
  select round(case i.vat_mode when 'exclusive' then after * (1 + i.vat_rate / 100) else after end, 2) from a $$;

-- Approved invoices are locked. They can only be reversed (status → Reversed) or get reminder/notes updates.
create function app.guard_invoice() returns trigger language plpgsql as $$
declare skip text[] := array['updated_at','updated_by','status','reversal_reason','reversed_at','last_reminder','notes','due_date','deleted_at','deleted_by'];
begin
  if old.status = 'Draft' then
    if new.status = 'Approved' then
      if not (app.has_perm('invoices.approve') or auth.uid() is null) then raise exception 'Not permitted to approve invoices.'; end if;
      new.approved_by := coalesce(auth.uid()::text, new.approved_by); new.approved_at := now();
    elsif new.status = 'Reversed' then raise exception 'A draft invoice cannot be reversed.'; end if;
    return new;
  end if;
  if to_jsonb(new) - skip <> to_jsonb(old) - skip then raise exception 'Approved invoices are locked. Reverse the invoice and issue a new one.'; end if;
  if new.status <> old.status then
    if not (old.status = 'Approved' and new.status = 'Reversed') then raise exception 'Invalid invoice status change.'; end if;
    if not (app.has_perm('invoices.approve') or auth.uid() is null) then raise exception 'Not permitted to reverse invoices.'; end if;
    if exists (select 1 from public.payments p where p.invoice_id = new.id and not coalesce(p.reversed, false) and p.deleted_at is null) then raise exception 'Reverse the payments on this invoice first.'; end if;
    if coalesce(new.reversal_reason, '') = '' then raise exception 'A reversal reason is required.'; end if;
    new.reversed_at := now();
  end if;
  return new;
end $$;
create trigger trg_guard_invoice before update on public.invoices for each row execute function app.guard_invoice();

-- Payments: only on approved invoices, never exceeding the outstanding balance; afterwards only reversible.
create function app.guard_payment_insert() returns trigger language plpgsql as $$
declare inv public.invoices; settled numeric;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  if inv.status <> 'Approved' then raise exception 'Payments can only be recorded on approved invoices.'; end if;
  select coalesce(sum(amount + wht_amount), 0) into settled from public.payments where invoice_id = new.invoice_id and not coalesce(reversed, false) and deleted_at is null;
  if settled + new.amount + new.wht_amount > app.invoice_total(inv) + 0.005 then
    raise exception 'Payment exceeds the outstanding balance of %.', round(app.invoice_total(inv) - settled, 2);
  end if;
  return new;
end $$;
create trigger trg_guard_payment_insert before insert on public.payments for each row execute function app.guard_payment_insert();
create function app.guard_payment_update() returns trigger language plpgsql as $$
declare skip text[] := array['updated_at','updated_by','reversed','reversal_reason','deleted_at','deleted_by'];
begin
  if to_jsonb(new) - skip <> to_jsonb(old) - skip then raise exception 'Payments are immutable. Reverse the payment instead.'; end if;
  if old.reversed and not new.reversed then raise exception 'A reversed payment cannot be reinstated.'; end if;
  return new;
end $$;
create trigger trg_guard_payment_update before update on public.payments for each row execute function app.guard_payment_update();

-- Payroll: approval needs payroll.approve; finalized periods and their runs are locked forever.
create function app.guard_period() returns trigger language plpgsql as $$
begin
  if old.locked then raise exception 'This payroll period is finalized and locked.'; end if;
  if new.status <> old.status then
    if new.status in ('Approved','Finalized') and not (app.has_perm('payroll.approve') or auth.uid() is null) then raise exception 'Only an approver can approve or finalize payroll.'; end if;
    if new.status = 'Finalized' then new.locked := true; new.finalized_at := now(); new.finalized_by := auth.uid()::text;
      if old.status <> 'Approved' then raise exception 'Approve the payroll before finalizing.'; end if; end if;
    if new.status = 'For Approval' and not exists (select 1 from public.runs r where r.period_id = new.id) then raise exception 'Generate the payroll first.'; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_period before update on public.periods for each row execute function app.guard_period();
create function app.guard_run() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.periods p where p.id = coalesce(new.period_id, old.period_id) and (p.locked or p.status not in ('Draft'))) then
    raise exception 'Payroll runs can only be changed while the period is a draft.'; end if;
  return new;
end $$;
create trigger trg_guard_run before update on public.runs for each row execute function app.guard_run();

-- Equipment out/in: completed records are locked; return meter cannot go backwards; damage auto-opens a repair ticket.
create function app.guard_checkout() returns trigger language plpgsql as $$
begin
  if old.status = 'Returned' or old.status = 'Rejected' then raise exception 'Completed out/in records are locked.'; end if;
  if new.status = 'Released' and old.status <> 'Released' then
    if not (app.has_perm('assets.approve') or auth.uid() is null) then raise exception 'Not permitted to release equipment.'; end if;
    if exists (select 1 from public.assets a where a.id = new.asset_id and a.status in ('Retired','Damaged','Under Maintenance')) then raise exception 'This asset is not serviceable.'; end if;
    new.out_at := coalesce(new.out_at, now() at time zone 'Asia/Manila'); new.approved_by := coalesce(auth.uid()::text, new.approved_by);
  end if;
  if new.status = 'Returned' then
    if new.in_meter is not null and new.out_meter is not null and new.in_meter < new.out_meter then raise exception 'Return meter reading cannot be lower than at release.'; end if;
    new.in_at := coalesce(new.in_at, now() at time zone 'Asia/Manila');
  end if;
  return new;
end $$;
create trigger trg_guard_checkout before update on public.checkouts for each row execute function app.guard_checkout();

create function app.checkout_side_effects() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Released' and (tg_op = 'INSERT' or old.status <> 'Released') then
    update public.assets set status = 'Checked Out', custodian_id = new.responsible_id, location = 'On site', condition = coalesce(new.out_condition, condition), meter_reading = coalesce(new.out_meter, meter_reading) where id = new.asset_id;
  elsif new.status = 'Returned' and old.status = 'Released' then
    if new.in_condition in ('Damaged','Poor') or coalesce(new.damage_notes, '') <> '' then
      update public.assets set status = 'Damaged', condition = new.in_condition, location = 'Workshop', custodian_id = null, meter_reading = coalesce(new.in_meter, meter_reading) where id = new.asset_id;
      insert into public.tickets (asset_id, source, checkout_id, description, status, opened_on)
      values (new.asset_id, 'Damage report', new.id, coalesce(new.damage_notes, 'Damage reported on return') || case when coalesce(new.missing_accessories, '') <> '' then ' | Missing: ' || new.missing_accessories else '' end, 'Open', (now() at time zone 'Asia/Manila')::date);
    else
      update public.assets set status = 'Available', condition = coalesce(new.in_condition, condition), custodian_id = null, meter_reading = coalesce(new.in_meter, meter_reading) where id = new.asset_id;
    end if;
  end if;
  return new;
end $$;
create trigger trg_checkout_effects after update on public.checkouts for each row execute function app.checkout_side_effects();

-- Attendance: approved records cannot be edited (use corrections); own clock-in only.
create function app.guard_attendance() returns trigger language plpgsql as $$
begin
  if old.approval = 'Approved' and (to_jsonb(new) - array['updated_at','updated_by','notes','deleted_at','deleted_by']) <> (to_jsonb(old) - array['updated_at','updated_by','notes','deleted_at','deleted_by'])
     and not (app.has_perm('attendance.approve') and exists (select 1 from public.corrections c where c.employee_id = old.employee_id and c.date = old.date and c.status = 'Approved')) then
    raise exception 'Approved attendance cannot be edited. File a correction request.';
  end if;
  if new.approval <> old.approval and new.approval in ('Approved','Rejected') then
    if not (app.has_perm('attendance.approve') or auth.uid() is null) then raise exception 'Not permitted to approve attendance.'; end if;
    if old.employee_id = app.my_employee() and app.user_role() <> 'owner' then raise exception 'You cannot approve your own attendance.'; end if;
    new.approved_by := coalesce(auth.uid()::text, new.approved_by); new.approved_at := now();
  end if;
  return new;
end $$;
create trigger trg_guard_attendance before update on public.attendance for each row execute function app.guard_attendance();

/* ================================================================== */
/* 3. Double-booking prevention for crew, vehicle and equipment        */
/* ================================================================== */
create function app.guard_job_overlap() returns trigger language plpgsql as $$
declare jn text;
begin
  if new.deleted_at is not null or new.status in ('Cancelled','Rescheduled','Completed') then return new; end if;
  select j.number into jn from public.jobs j
   where j.id <> new.id and j.deleted_at is null and j.status not in ('Cancelled','Rescheduled','Completed')
     and j.start_at < new.end_at and new.start_at < j.end_at
     and exists (
       select 1 from jsonb_array_elements_text(j.crew_ids || jsonb_build_array(coalesce(j.leader_id, ''))) a(p)
       join jsonb_array_elements_text(new.crew_ids || jsonb_build_array(coalesce(new.leader_id, ''))) b(p) on a.p = b.p and a.p <> '')
   limit 1;
  if jn is not null then raise exception 'Double-booking blocked: crew already assigned on %.', jn; end if;
  select j.number into jn from public.jobs j
   where j.id <> new.id and j.deleted_at is null and j.status not in ('Cancelled','Rescheduled','Completed')
     and j.start_at < new.end_at and new.start_at < j.end_at
     and ((new.vehicle_id is not null and j.vehicle_id = new.vehicle_id)
          or exists (select 1 from jsonb_array_elements_text(j.equipment_ids) a(e) join jsonb_array_elements_text(new.equipment_ids) b(e) on a.e = b.e))
   limit 1;
  if jn is not null then raise exception 'Double-booking blocked: vehicle or equipment already assigned on %.', jn; end if;
  return new;
end $$;
create trigger trg_guard_job_overlap before insert or update on public.jobs for each row execute function app.guard_job_overlap();

/* ================================================================== */
/* 4. Reporting views (RLS applies via security_invoker)               */
/* ================================================================== */
create view public.v_stock_on_hand with (security_invoker = true) as
select i.id as item_id, i.code, i.name, s.location_id, sum(s.qty) as on_hand, sum(s.qty) * i.cost as value
from public.stock s join public.items i on i.id = s.item_id
where s.approval = 'Approved' and s.deleted_at is null group by i.id, i.code, i.name, i.cost, s.location_id;

create view public.v_invoice_balances with (security_invoker = true) as
select i.id as invoice_id, i.number, i.client_id, i.issue_date, i.due_date, i.status,
       app.invoice_net(i) as net, app.invoice_total(i) as total,
       round(app.invoice_net(i) * i.withholding_rate / 100, 2) as expected_wht,
       coalesce(p.cash, 0) as cash_collected, coalesce(p.wht, 0) as wht_credited,
       case when i.status = 'Approved' then app.invoice_total(i) - coalesce(p.cash, 0) - coalesce(p.wht, 0) else 0 end as balance
from public.invoices i
left join lateral (select sum(amount) cash, sum(wht_amount) wht from public.payments x where x.invoice_id = i.id and not coalesce(x.reversed, false) and x.deleted_at is null) p on true
where i.deleted_at is null;

create view public.v_ar_aging with (security_invoker = true) as
select client_id,
       sum(balance) filter (where due_date >= current_date) as current_amt,
       sum(balance) filter (where current_date - due_date between 1 and 30) as d1_30,
       sum(balance) filter (where current_date - due_date between 31 and 60) as d31_60,
       sum(balance) filter (where current_date - due_date between 61 and 90) as d61_90,
       sum(balance) filter (where current_date - due_date > 90) as d90_plus,
       sum(balance) as total
from public.v_invoice_balances where status = 'Approved' and balance > 0.005 group by client_id;

/* ================================================================== */
/* 5. Row-level security                                               */
/* ================================================================== */
alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self on public.profiles for select using (id = auth.uid() or app.has_perm('admin.users'));
create policy profiles_admin_write on public.profiles for all using (app.has_perm('admin.users')) with check (app.has_perm('admin.users'));
create policy perms_read on public.role_permissions for select using (auth.uid() is not null);
create policy perms_write on public.role_permissions for all using (app.has_perm('admin.users')) with check (app.has_perm('admin.users'));
create policy settings_read on public.settings for select using (auth.uid() is not null);
create policy settings_write on public.settings for all using (app.has_perm('admin.settings')) with check (app.has_perm('admin.settings'));
create policy audit_read on public.audit_logs for select using (app.has_perm('admin.audit'));
-- audit rows are written only by SECURITY DEFINER triggers; no insert/update/delete policy exists for users.

-- Simple tables: (table, permission to read (any of), permission to write (any of))
do $$
declare r record;
begin
  for r in select * from (values
    ('branches',       array['dashboard.view','clients.view','jobs.all','employees.view','admin.settings'], array['admin.settings']),
    ('clients',        array['clients.view','sales.view','invoices.view','jobs.all'],                        array['clients.edit']),
    ('sites',          array['clients.view','sales.view','jobs.all','jobs.mine'],                            array['clients.edit']),
    ('communications', array['clients.view'],                                                                array['clients.edit']),
    ('complaints',     array['clients.view'],                                                                array['clients.edit']),
    ('services',       array['sales.view','jobs.all','jobs.mine','reports.finance','admin.settings'],       array['admin.settings']),
    ('inquiries',      array['sales.view'],                                                                  array['sales.edit']),
    ('quotations',     array['sales.view','reports.finance'],                                                array['sales.edit','sales.approve']),
    ('employees',      array['employees.view','payroll.view','attendance.view','jobs.all','performance.view','reports.hr'], array['employees.edit']),
    ('holidays',       array['attendance.own','attendance.view','payroll.view'],                            array['admin.settings']),
    ('reviews',        array['performance.view','reports.hr'],                                               array['performance.edit']),
    ('adjustments',    array['payroll.view'],                                                                array['payroll.edit']),
    ('periods',        array['payroll.view','reports.hr'],                                                   array['payroll.edit','payroll.approve']),
    ('runs',           array['payroll.view','reports.hr'],                                                   array['payroll.edit']),
    ('locations',      array['inventory.view','inventory.request'],                                          array['inventory.edit']),
    ('items',          array['inventory.view','inventory.request','reports.ops'],                            array['inventory.edit']),
    ('stock',          array['inventory.view','reports.ops'],                                                array['inventory.edit','inventory.approve']),
    ('requests',       array['inventory.view','inventory.request'],                                          array['inventory.request','inventory.approve']),
    ('assets',         array['assets.view','assets.request','reports.ops'],                                  array['assets.edit']),
    ('tickets',        array['assets.view','reports.ops'],                                                   array['assets.edit']),
    ('invoices',       array['invoices.view','reports.finance'],                                             array['invoices.edit','invoices.approve']),
    ('payments',       array['invoices.view','reports.finance'],                                             array['invoices.edit','invoices.approve']),
    ('expenses',       array['expenses.view','reports.finance'],                                             array['expenses.edit','expenses.approve']),
    ('petty',          array['expenses.view'],                                                               array['expenses.edit'])
  ) as v(tbl, reads, writes)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('create policy %I on public.%I for select using (exists (select 1 from unnest(%L::text[]) p where app.has_perm(p)))', r.tbl || '_select', r.tbl, r.reads);
    execute format('create policy %I on public.%I for insert with check (exists (select 1 from unnest(%L::text[]) p where app.has_perm(p)))', r.tbl || '_insert', r.tbl, r.writes);
    execute format('create policy %I on public.%I for update using (exists (select 1 from unnest(%L::text[]) p where app.has_perm(p)))', r.tbl || '_update', r.tbl, r.writes);
  end loop;
end $$;

-- Jobs: everyone with jobs.all; crew/leaders only see & update their own assignments.
alter table public.jobs enable row level security;
create policy jobs_select on public.jobs for select using (
  app.has_perm('jobs.all') or (app.has_perm('jobs.mine') and (leader_id = app.my_employee() or crew_ids ? app.my_employee()))
  or client_id = app.my_client());
create policy jobs_insert on public.jobs for insert with check (app.has_perm('jobs.edit'));
create policy jobs_update on public.jobs for update using (
  app.has_perm('jobs.edit') or (app.has_perm('jobs.complete') and (leader_id = app.my_employee() or crew_ids ? app.my_employee())));

-- Attendance: own records, or anyone's with attendance.view / approve.
alter table public.attendance enable row level security;
create policy att_select on public.attendance for select using (app.has_perm('attendance.view') or employee_id = app.my_employee());
create policy att_insert on public.attendance for insert with check ((app.has_perm('attendance.own') and employee_id = app.my_employee()) or app.has_perm('attendance.approve'));
create policy att_update on public.attendance for update using (app.has_perm('attendance.approve') or (employee_id = app.my_employee() and approval = 'Pending' and app.has_perm('attendance.own')));
alter table public.corrections enable row level security;
create policy cor_select on public.corrections for select using (app.has_perm('attendance.view') or employee_id = app.my_employee());
create policy cor_insert on public.corrections for insert with check (employee_id = app.my_employee() or app.has_perm('attendance.approve'));
create policy cor_update on public.corrections for update using (app.has_perm('attendance.approve'));

-- Equipment out/in: requesters see their own; approvers & asset viewers see all.
alter table public.checkouts enable row level security;
create policy co_select on public.checkouts for select using (app.has_perm('assets.view') or requested_by = app.my_employee() or responsible_id = app.my_employee());
create policy co_insert on public.checkouts for insert with check (app.has_perm('assets.request') and status = 'Requested');
create policy co_update on public.checkouts for update using (app.has_perm('assets.approve') or (app.has_perm('assets.request') and (responsible_id = app.my_employee() or requested_by = app.my_employee())));

-- Notifications: visible to the roles they were raised for.
alter table public.notifications enable row level security;
create policy notif_select on public.notifications for select using (for_roles ? app.user_role()::text);
create policy notif_update on public.notifications for update using (for_roles ? app.user_role()::text);

-- Client portal: portal users (profiles.client_id) can read only their own client's quotations, jobs, invoices and payments.
create policy portal_quotations on public.quotations for select using (client_id = app.my_client() and status <> 'Draft');
create policy portal_invoices on public.invoices for select using (client_id = app.my_client() and status = 'Approved');
create policy portal_payments on public.payments for select using (client_id = app.my_client());
create policy portal_clients on public.clients for select using (id = app.my_client());
create policy portal_sites on public.sites for select using (client_id = app.my_client());
create policy portal_decision on public.quotations for update using (client_id = app.my_client() and status = 'Sent');

/* ================================================================== */
/* 6. File storage (Supabase Storage) — private buckets                */
/* ================================================================== */
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values
      ('receipts', 'receipts', false), ('job-photos', 'job-photos', false), ('signed-documents', 'signed-documents', false),
      ('equipment-photos', 'equipment-photos', false), ('attendance-selfies', 'attendance-selfies', false), ('employee-documents', 'employee-documents', false)
    on conflict (id) do nothing;
    execute $p$create policy storage_read on storage.objects for select to authenticated using (
      (bucket_id = 'receipts' and app.has_perm('expenses.view')) or (bucket_id in ('job-photos','signed-documents') and (app.has_perm('jobs.all') or app.has_perm('jobs.mine')))
      or (bucket_id = 'equipment-photos' and (app.has_perm('assets.view') or app.has_perm('assets.request')))
      or (bucket_id = 'attendance-selfies' and (app.has_perm('attendance.view') or (storage.foldername(name))[1] = app.my_employee()))
      or (bucket_id = 'employee-documents' and app.has_perm('employees.edit')))$p$;
    execute $p$create policy storage_write on storage.objects for insert to authenticated with check (
      (bucket_id = 'receipts' and app.has_perm('expenses.edit')) or (bucket_id in ('job-photos','signed-documents') and app.has_perm('jobs.complete'))
      or (bucket_id = 'equipment-photos' and app.has_perm('assets.request'))
      or (bucket_id = 'attendance-selfies' and app.has_perm('attendance.own') and (storage.foldername(name))[1] = app.my_employee())
      or (bucket_id = 'employee-documents' and app.has_perm('employees.edit')))$p$;
  end if;
end $$;
