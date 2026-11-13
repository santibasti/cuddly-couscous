-- Two fixes for attendance on long shifts:
--  1) Since attendance approves itself at the site check-in (0102), the record is already Approved while the person is still on duty. The person must still be able to
--     clock out on their own record: allowed when the record has no clock-out yet and only the clock-out fields change.
--  2) A shift can run past midnight (e.g. 9 AM to 3 AM the next day): the whole shift is one attendance record on the day it started. The auto-approval at the
--     site check-in therefore also covers a crew member who clocked in yesterday and is still on duty.

create or replace function app.guard_attendance() returns trigger language plpgsql as $$
declare skip text[] := array['updated_at','updated_by','notes','deleted_at','deleted_by'];
        outfields text[] := array['clock_out','out_lat','out_lng','late_min','undertime_min','ot_min','worked_hours'];
begin
  if old.approval = 'Approved' and (to_jsonb(new) - skip) <> (to_jsonb(old) - skip)
     and not (old.clock_out is null and old.clock_in is not null and app.has_perm('attendance.approve'))
     and not (old.clock_out is null and old.clock_in is not null and new.clock_out is not null and old.employee_id = app.my_employee()
              and (to_jsonb(new) - skip - outfields) = (to_jsonb(old) - skip - outfields))
     and not (app.has_perm('attendance.approve') and exists (select 1 from public.corrections c where c.employee_id = old.employee_id and c.date = old.date and c.status = 'Approved')) then
    raise exception 'Approved attendance cannot be edited. File a correction request.';
  end if;
  if new.approval <> old.approval and new.approval in ('Approved','Rejected') and coalesce(current_setting('app.auto_approve', true), '') <> 'on' then
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

create or replace function app.auto_approve_site_attendance() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.auto_approve', 'on', true);
  update public.attendance a
     set approval = 'Approved', approved_by = 'auto', approved_at = now(), job_id = coalesce(a.job_id, new.job_id), field_work = true
   where a.deleted_at is null and a.approval = 'Pending' and a.kind = 'Present' and a.clock_in is not null
     and (a.date = new.arr_at::date or (a.date = new.arr_at::date - 1 and a.clock_out is null))      -- today's, or a shift from yesterday still on duty
     and a.employee_id in (select jsonb_array_elements_text(coalesce(new.arr_crew_present, '[]'::jsonb)));
  perform set_config('app.auto_approve', 'off', true);
  return new;
end $$;
