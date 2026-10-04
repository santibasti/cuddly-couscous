-- Discount requests are prepared on the Team Leader's own quotation screen (never shown on the client-facing quotation), so the
-- "quotation must be presented first" rule from 0012 is withdrawn.
create or replace function app.guard_discount_request() returns trigger language plpgsql as $$
declare locked boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Pending Admin Approval' then raise exception 'A new Discount Request always starts as Pending Admin Approval.'; end if;
    if new.base_total - new.requested_amount <= 0 then raise exception 'The discount cannot be equal to or more than the bill total.'; end if;
    if auth.uid() is not null and not app.has_perm('discount.approve') and exists (select 1 from public.discount_requests r where r.job_id = new.job_id and r.status = 'Rejected' and r.deleted_at is null) then
      raise exception 'The Admin already rejected a discount for this job. The decision stands.'; end if;
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
alter table public.workflows drop column if exists quote_presented_at;
