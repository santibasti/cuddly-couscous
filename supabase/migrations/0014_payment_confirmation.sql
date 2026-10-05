-- Payment Method Confirmation (end of the job, just before Client Handover and the Client Satisfaction Check).
-- The Team Leader records how the client will pay: Cash, GCash, Bank Transfer, Cheque or Terms / To Be Billed.
-- Money received becomes a payment entry that is ALWAYS Pending Verification (only Finance / Admin can verify it).
-- It is stored apart from the service record: it never blocks the handover or the service report.
create table public.payment_confirmations (
  like app.base_columns including all,
  job_id text not null references public.jobs (id), workflow_id text references public.workflows (id), client_id text not null references public.clients (id),
  final_bill numeric(14,2) not null check (final_bill > 0),
  method text not null check (method in ('Cash','GCash','Bank Transfer','Cheque','Terms / To Be Billed')),
  collection text not null check (collection in ('Received','To Be Paid Later')),
  expected_today numeric(14,2) not null default 0 check (expected_today >= 0), balance_later numeric(14,2) not null check (balance_later >= 0),
  note text, amount_received numeric(14,2), gcash_ref text, bank_name text, transfer_ref text, cheque_no text, cheque_date date, terms text, due_date date,
  confirmed_by text, confirmed_at timestamp not null, payment_id text references public.payments (id),
  check (method <> 'Terms / To Be Billed' or collection = 'To Be Paid Later'),
  check (collection <> 'Received' or expected_today > 0)
);
create unique index on public.payment_confirmations (job_id) where deleted_at is null;
alter table public.payments add column confirmation_id text references public.payment_confirmations (id);

create trigger trg_touch before update on public.payment_confirmations for each row execute function app.touch();
create trigger trg_no_delete before delete on public.payment_confirmations for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.payment_confirmations for each row execute function app.audit();

create function app.guard_payment_confirmation() returns trigger language plpgsql as $$
begin
  if new.collection = 'Received' then
    if new.method = 'GCash' and coalesce(new.gcash_ref, '') = '' then raise exception 'Enter the GCash reference number.'; end if;
    if new.method = 'Bank Transfer' and (coalesce(new.bank_name, '') = '' or coalesce(new.transfer_ref, '') = '') then raise exception 'Enter the bank name and the transfer reference number.'; end if;
    if new.method = 'Cheque' and (coalesce(new.bank_name, '') = '' or coalesce(new.cheque_no, '') = '' or new.cheque_date is null) then raise exception 'Enter the bank name, cheque number and cheque date.'; end if;
  end if;
  if new.method = 'Terms / To Be Billed' and coalesce(new.terms, '') = '' and new.due_date is null then raise exception 'Enter the agreed payment terms or due date.'; end if;
  if tg_op = 'UPDATE' and old.payment_id is not null and (new.method, new.collection, new.expected_today, new.final_bill) is distinct from (old.method, old.collection, old.expected_today, old.final_bill) then
    raise exception 'A payment was already recorded from this confirmation. Finance handles it from here.'; end if;
  return new;
end $$;
create trigger trg_guard_payment_confirmation before insert or update on public.payment_confirmations for each row execute function app.guard_payment_confirmation();

create or replace function app.guard_payment_insert() returns trigger language plpgsql as $$
declare inv public.invoices; committed numeric; can_all boolean := app.has_perm('payments.record') or app.has_perm('invoices.edit') or auth.uid() is null;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  if inv.status <> 'Approved' then raise exception 'Payments can only be recorded on approved invoices.'; end if;
  if not can_all and new.method <> 'Cash' and not exists (select 1 from public.payment_confirmations c where c.id = new.confirmation_id and c.job_id = new.job_id and c.method = new.method) then
    raise exception 'Team Leaders can only record a cash payment (or the payment they confirmed with the client on site).'; end if;
  if new.status <> 'Pending Verification' and not (app.has_perm('payments.verify') or auth.uid() is null) then
    raise exception 'A new payment is saved as Pending Verification; only Admin / Finance can verify it.'; end if;
  if coalesce(trim(new.received_by), '') = '' then raise exception 'Enter who received the payment.'; end if;
  if new.method = 'Bank Transfer' and (coalesce(new.bank_name, '') = '' or coalesce(new.reference, '') = '' or new.transfer_date is null) then raise exception 'Bank transfer needs the bank name, account / reference number and transfer date.'; end if;
  if new.method = 'Cheque' and (coalesce(new.bank_name, '') = '' or coalesce(new.cheque_no, '') = '' or new.cheque_date is null or new.cheque_status is null) then raise exception 'A cheque needs the bank name, cheque number, cheque date and clearing status.'; end if;
  if new.method = 'GCash' and (coalesce(new.gcash_ref, '') = '' or coalesce(new.sender, '') = '') then raise exception 'GCash needs the reference number and the sender name or mobile number.'; end if;
  if new.amount <= 0 then raise exception 'Enter the amount received.'; end if;
  select coalesce(sum(x.amount + x.wht_amount), 0) into committed from public.payments x where x.invoice_id = new.invoice_id and app.payment_committed(x);
  if committed + new.amount + new.wht_amount > app.invoice_total(inv) + 0.005 then
    raise exception 'Payment exceeds the remaining balance of %.', round(app.invoice_total(inv) - committed, 2);
  end if;
  new.job_id := coalesce(new.job_id, inv.job_id);
  return new;
end $$;

alter table public.payment_confirmations enable row level security;
create policy pc_select on public.payment_confirmations for select using (
  app.has_perm('payments.verify') or app.has_perm('invoices.view') or app.has_perm('reports.finance')
  or (app.has_perm('dispatch.view') and exists (select 1 from public.jobs j where j.id = job_id and (app.has_perm('jobs.all') or j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))));
create policy pc_insert on public.payment_confirmations for insert with check (
  app.has_perm('dispatch.run') and exists (select 1 from public.jobs j where j.id = job_id and (app.has_perm('jobs.all') or j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())));
create policy pc_update on public.payment_confirmations for update using (
  app.has_perm('dispatch.run') and exists (select 1 from public.jobs j where j.id = job_id and (app.has_perm('jobs.all') or j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())));
