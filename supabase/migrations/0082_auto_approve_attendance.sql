-- Optional: when a person clocks out and the day is clean (not late, no undertime, no overtime), the record is approved automatically,
-- so the Owner / Admin only reviews the exceptions. Off until Admin turns it on (Admin → Settings → "Approve clean attendance automatically").
-- Everything else in the attendance rules (approved records are locked, corrections, own-record rule) is unchanged from migration 0075.
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
  -- a clean day approves itself when the clock-out is recorded (only if Admin turned this on)
  if old.clock_out is null and new.clock_out is not null and new.approval = 'Pending' and new.kind = 'Present'
     and coalesce(new.late_min, 0) = 0 and coalesce(new.undertime_min, 0) = 0 and coalesce(new.ot_min, 0) = 0
     and coalesce((select (s.data ->> 'auto_approve_attendance')::boolean from public.settings s where s.id = 'main'), false) then
    new.approval := 'Approved'; new.approved_by := 'auto'; new.approved_at := now();
  end if;
  return new;
end $$;
