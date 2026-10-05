-- Controlled Discount Request workflow.
--   Team Leaders / Field staff only SUBMIT a request; only the Owner / Admin (discount.approve) approves, rejects or modifies it.
--   Status flow: Pending Admin Approval → Approved → Applied (or Rejected). The original quotation amount and rates are never changed:
--   the discount is a separate line on the final bill, the variation approval summary, the invoice and every revenue / profit report.
--   A client signature on a discounted bill is refused until the request is approved AND applied.

create table public.discount_requests (
  like app.base_columns including all,
  number text not null unique,
  job_id text not null references public.jobs (id),
  client_id text not null references public.clients (id),
  quotation_id text,
  original_total numeric(14,2) not null, additional_total numeric(14,2) not null default 0, base_total numeric(14,2) not null check (base_total > 0),
  kind text not null check (kind in ('percent','fixed')), value numeric(14,4) not null check (value > 0),
  requested_amount numeric(14,2) not null check (requested_amount > 0), proposed_final numeric(14,2) not null check (proposed_final > 0),
  reason text not null, reason_note text, client_notes text,
  status text not null default 'Pending Admin Approval' check (status in ('Pending Admin Approval','Approved','Rejected','Applied')),
  submitted_by text, submitted_at timestamptz not null default now(),
  approved_kind text check (approved_kind in ('percent','fixed')), approved_value numeric(14,4),
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount > 0), approved_final numeric(14,2), approved_base numeric(14,2),
  decision_note text, decided_by text, decided_at timestamptz,
  est_cost numeric(14,2), gp_before numeric(14,2), gp_after numeric(14,2), margin_after numeric(8,2),
  applied_at timestamptz, applied_by text, net_amount numeric(14,2)
);
create index on public.discount_requests (job_id);
create index on public.discount_requests (status) where deleted_at is null;
-- one live request per job at a time (a rejected one frees the job for a new request)
create unique index discount_one_open_per_job on public.discount_requests (job_id) where deleted_at is null and status <> 'Rejected';

alter table public.invoices
  add column discount_request_id text references public.discount_requests (id),
  add column discount_granted numeric(14,2) check (discount_granted is null or discount_granted > 0);

create trigger trg_touch before update on public.discount_requests for each row execute function app.touch();
create trigger trg_no_delete before delete on public.discount_requests for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.discount_requests for each row execute function app.audit();

/* ------------------------------------------------------------------ */
/* Who may do what with a request                                      */
/* ------------------------------------------------------------------ */
create function app.guard_discount_request() returns trigger language plpgsql as $$
declare locked boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Pending Admin Approval' then raise exception 'A new Discount Request always starts as Pending Admin Approval.'; end if;
    if new.base_total - new.requested_amount <= 0 then raise exception 'The discount cannot be equal to or more than the bill total.'; end if;
    if exists (select 1 from public.invoices i where i.job_id = new.job_id and i.status <> 'Reversed' and i.deleted_at is null) then raise exception 'This job is already invoiced.'; end if;
    return new;
  end if;
  -- the request itself is immutable; only the decision / application columns change
  if (new.job_id, new.client_id, new.base_total, new.kind, new.value, new.requested_amount, new.reason, new.submitted_by, new.submitted_at)
     is distinct from (old.job_id, old.client_id, old.base_total, old.kind, old.value, old.requested_amount, old.reason, old.submitted_by, old.submitted_at)
     and not (new.status = 'Approved' and app.has_perm('discount.approve')) then
    raise exception 'A submitted Discount Request cannot be edited. Only the Owner / Admin can approve it at a modified amount.'; end if;
  if old.status = 'Rejected' and new.status <> 'Rejected' then raise exception 'A rejected request stays rejected: submit a new one.'; end if;
  select exists (select 1 from public.workflows w where w.job_id = new.job_id and w.deleted_at is null
                 and ((w.conf_mode = 'approval' and w.conf_at is not null) or w.rep_client_at is not null)) into locked;
  if old.status = 'Applied' and locked and new.status <> old.status then
    raise exception 'The client has already signed the discounted bill — the discount is final.'; end if;
  if new.status <> old.status or new.approved_amount is distinct from old.approved_amount then
    if new.status in ('Approved','Rejected') then
      if not (app.has_perm('discount.approve') or auth.uid() is null) then raise exception 'Only the Owner / Admin can approve, reject or modify a discount.'; end if;
      if coalesce(trim(new.decision_note), '') = '' then raise exception 'An approval / rejection note is required.'; end if;
      if new.status = 'Approved' and (new.approved_amount is null or new.approved_amount >= new.approved_base or new.approved_base is null) then
        raise exception 'Approve with the discount amount and the bill total it was approved against.'; end if;
    elsif new.status = 'Applied' then
      if old.status <> 'Approved' then raise exception 'Only an approved discount can be applied to the final bill.'; end if;
      if not (app.has_perm('discount.request') or app.has_perm('discount.approve') or auth.uid() is null) then raise exception 'Not permitted to apply this discount.'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_discount_request before insert or update on public.discount_requests for each row execute function app.guard_discount_request();

/* ------------------------------------------------------------------ */
/* Nobody else can type a discount into a quotation, variation or invoice */
/* ------------------------------------------------------------------ */
create function app.line_discounts(items jsonb) returns numeric language sql immutable as $$
  select coalesce(sum(coalesce((i->>'discount')::numeric, 0)), 0) from jsonb_array_elements(coalesce(items, '[]'::jsonb)) i $$;

create function app.guard_discount_edit() returns trigger language plpgsql as $$
declare od numeric := 0; oli numeric := 0;
begin
  if auth.uid() is null or app.has_perm('discount.approve') then return new; end if;
  if tg_op = 'UPDATE' then od := coalesce(old.discount, 0); oli := app.line_discounts(old.items); end if;
  if coalesce(new.discount, 0) is distinct from od or app.line_discounts(new.items) is distinct from oli then
    -- an invoice may carry a discount that was approved through a Discount Request
    if tg_table_name = 'invoices' and new.discount_request_id is not null
       and exists (select 1 from public.discount_requests r where r.id = new.discount_request_id and r.status = 'Applied' and r.deleted_at is null) then return new; end if;
    raise exception 'Only the Owner / Admin can apply or edit a discount. Submit a Discount Request instead.';
  end if;
  return new;
end $$;
create trigger trg_guard_discount_edit before insert or update on public.quotations for each row execute function app.guard_discount_edit();
create trigger trg_guard_discount_edit before insert or update on public.variations for each row execute function app.guard_discount_edit();
create trigger trg_guard_discount_edit before insert or update on public.invoices for each row execute function app.guard_discount_edit();

/* ------------------------------------------------------------------ */
/* No client signature / invoice while a discount is still open        */
/* ------------------------------------------------------------------ */
create function app.guard_discount_open() returns trigger language plpgsql as $$
declare jid text; r record; signing boolean := false;
begin
  if tg_table_name = 'workflows' then
    jid := new.job_id;
    signing := (new.conf_mode = 'approval' and new.conf_at is not null and old.conf_at is null) or (new.rep_client_at is not null and old.rep_client_at is null);
  elsif tg_table_name = 'variations' then
    jid := new.job_id; signing := new.status = 'Approved' and old.status is distinct from 'Approved';
  else
    jid := new.job_id; signing := tg_op = 'INSERT' and new.job_id is not null;
  end if;
  if not signing then return new; end if;
  select * into r from public.discount_requests d where d.job_id = jid and d.deleted_at is null and d.status in ('Pending Admin Approval','Approved') limit 1;
  if found then
    raise exception 'Discount request % is % — the client cannot sign the final bill (or the job be invoiced) until the discount is approved and applied.', r.number,
      case r.status when 'Pending Admin Approval' then 'waiting for Admin approval' else 'approved but not yet applied' end;
  end if;
  return new;
end $$;
create trigger trg_guard_discount_open before update on public.workflows for each row execute function app.guard_discount_open();
create trigger trg_guard_discount_open before update on public.variations for each row execute function app.guard_discount_open();
create trigger trg_guard_discount_open before insert on public.invoices for each row execute function app.guard_discount_open();

/* ------------------------------------------------------------------ */
alter table public.discount_requests enable row level security;
create policy dr_select on public.discount_requests for select using (
  app.has_perm('discount.approve') or app.has_perm('reports.finance') or app.has_perm('invoices.view')
  or (app.has_perm('discount.request') and (app.has_perm('jobs.all') or exists (select 1 from public.jobs j where j.id = job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())))));
create policy dr_insert on public.discount_requests for insert with check (
  app.has_perm('discount.approve') or (app.has_perm('discount.request') and (app.has_perm('jobs.all') or exists (select 1 from public.jobs j where j.id = job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())))));
create policy dr_update on public.discount_requests for update using (app.has_perm('discount.approve') or app.has_perm('discount.request'));

-- Default permissions (generated from src/lib/rbac.ts; editable by the Owner in Admin → Permissions).
insert into public.role_permissions (role, permission) values
('owner', 'discount.request'), ('owner', 'discount.approve'),
('ops', 'discount.request'), ('leader', 'discount.request'), ('field', 'discount.request')
on conflict do nothing;
