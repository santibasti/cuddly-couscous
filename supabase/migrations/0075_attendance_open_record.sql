-- An approved attendance record that has no clock-out yet is still open: an approver (Owner / Admin) can complete it
-- (clock-out and the times worked out from it). Once it has a clock-out it is locked again and only corrections change it.
create or replace function app.guard_attendance() returns trigger language plpgsql as $$
begin
  if old.approval = 'Approved' and (to_jsonb(new) - array['updated_at','updated_by','notes','deleted_at','deleted_by']) <> (to_jsonb(old) - array['updated_at','updated_by','notes','deleted_at','deleted_by'])
     and not (old.clock_out is null and old.clock_in is not null and app.has_perm('attendance.approve'))
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
