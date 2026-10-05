-- Payment recording with verification.
--   Methods: Cash, Bank Transfer, Cheque, GCash. Status: Pending Verification → Verified (or Rejected).
--   Only Verified payments — and, for cheques, only Cleared ones — reduce an invoice balance (statement, aging, revenue, job profitability).
--   Team Leaders may record a CASH payment as Pending Verification only. Only Admin / Finance verify, edit, reverse or delete payments.
--   Verified payments are never overwritten: they can only be reversed (or have their cheque clearing status updated).

update public.payments set method = 'Cheque' where method = 'Check';
update public.payments set method = 'Bank Transfer' where method in ('Credit Card','Other');
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('Cash','Bank Transfer','Cheque','GCash'));

alter table public.payments
  add column job_id text references public.jobs (id), add column paid_at timestamp, add column received_by text not null default 'Finance', add column notes text,
  add column status text not null default 'Verified' check (status in ('Pending Verification','Verified','Rejected')),    -- rows that existed before verification was introduced were already posted
  add column verified_by text, add column verified_at timestamptz, add column reject_reason text,
  add column bank_name text, add column transfer_date date,
  add column cheque_no text, add column cheque_date date, add column cheque_status text check (cheque_status in ('Pending Clearance','Deposited','Cleared','Bounced')), add column cleared_at timestamptz,
  add column gcash_ref text, add column sender text;
alter table public.payments alter column status set default 'Pending Verification';
create index on public.payments (status) where deleted_at is null;

-- "Counts": verified, not reversed, and a cheque must be cleared.
create function app.payment_counts(p public.payments) returns boolean language sql immutable as $$
  select not coalesce(p.reversed, false) and p.deleted_at is null and p.status = 'Verified' and (p.method <> 'Cheque' or coalesce(p.cheque_status, 'Cleared') = 'Cleared') $$;
-- "Committed": recorded money that is not rejected / bounced / reversed (used to stop over-payment while entries wait for verification).
create function app.payment_committed(p public.payments) returns boolean language sql immutable as $$
  select not coalesce(p.reversed, false) and p.deleted_at is null and p.status <> 'Rejected' and coalesce(p.cheque_status, '') <> 'Bounced' $$;

create or replace function app.guard_payment_insert() returns trigger language plpgsql as $$
declare inv public.invoices; committed numeric; can_all boolean := app.has_perm('payments.record') or app.has_perm('invoices.edit') or auth.uid() is null;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  if inv.status <> 'Approved' then raise exception 'Payments can only be recorded on approved invoices.'; end if;
  if not can_all and new.method <> 'Cash' then raise exception 'Team Leaders can only record a cash payment.'; end if;
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

create or replace function app.guard_payment_update() returns trigger language plpgsql as $$
declare skip text[] := array['updated_at','updated_by','deleted_at','deleted_by'];
        locked_keys text[] := array['reversed','reversal_reason','cheque_status','cleared_at','notes'];
        mgr boolean := app.has_perm('payments.verify') or auth.uid() is null;
begin
  if old.status = 'Verified' then
    if to_jsonb(new) - skip - locked_keys <> to_jsonb(old) - skip - locked_keys then raise exception 'A verified payment is locked. Reverse it with a reason and record a new one.'; end if;
    if new.deleted_at is not null and old.deleted_at is null then raise exception 'A verified payment cannot be deleted. Reverse it instead.'; end if;
    if (new.reversed is distinct from old.reversed or new.cheque_status is distinct from old.cheque_status) and not mgr then raise exception 'Only Admin / Finance can reverse a payment or update cheque clearing.'; end if;
    if coalesce(new.reversed, false) and coalesce(new.reversal_reason, '') = '' then raise exception 'A reversal reason is required.'; end if;
    if old.reversed and not new.reversed then raise exception 'A reversed payment cannot be reinstated.'; end if;
    return new;
  end if;
  -- pending / rejected entries
  if not mgr then raise exception 'Only Admin / Finance can verify, edit, reject or delete payments.'; end if;
  if new.status = 'Rejected' and coalesce(trim(new.reject_reason), '') = '' then raise exception 'A rejection reason is required.'; end if;
  if new.status = 'Verified' and old.status <> 'Verified' then new.verified_by := coalesce(auth.uid()::text, new.verified_by); new.verified_at := now(); end if;
  if new.deleted_at is not null and old.deleted_at is null and coalesce(current_setting('app.change_reason', true), '') = '' then raise exception 'A reason is required to delete a payment entry.'; end if;
  return new;
end $$;

-- Balances, statement and aging: verified (and cleared) money only.
create or replace view public.v_invoice_balances with (security_invoker = true) as
select i.id as invoice_id, i.number, i.client_id, i.issue_date, i.due_date, i.status,
       app.invoice_net(i) as net, app.invoice_total(i) as total,
       round(app.invoice_net(i) * i.withholding_rate / 100, 2) as expected_wht,
       coalesce(p.cash, 0) as cash_collected, coalesce(p.wht, 0) as wht_credited,
       case when i.status = 'Approved' then app.invoice_total(i) - coalesce(p.cash, 0) - coalesce(p.wht, 0) else 0 end as balance
from public.invoices i
left join lateral (select sum(amount) cash, sum(wht_amount) wht from public.payments x where x.invoice_id = i.id and app.payment_counts(x)) p on true
where i.deleted_at is null;

-- Permissions: recording and verifying are separate.
create policy payments_record_insert on public.payments for insert with check (app.has_perm('payments.record') or app.has_perm('payments.record_cash'));
create policy payments_own_select on public.payments for select using (app.has_perm('payments.record_cash') and created_by = auth.uid()::text);
create policy payments_verify_update on public.payments for update using (app.has_perm('payments.verify'));
create policy payments_verify_select on public.payments for select using (app.has_perm('payments.verify'));
insert into public.role_permissions (role, permission) values
('owner', 'payments.record'), ('owner', 'payments.record_cash'), ('owner', 'payments.verify'),
('finance', 'payments.record'), ('finance', 'payments.verify'), ('leader', 'payments.record_cash')
on conflict do nothing;
