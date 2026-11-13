-- Attendance needs no approval from the Owner once the crew pass the site check-in.
-- When the Team Leader saves the Site Check-In (workflow arrival) every crew member marked present who has clocked in that day gets their
-- attendance approved automatically (approved_by 'auto'), late or not, and linked to the job. The rest of the attendance rules are unchanged.

-- the attendance guard (0082) with one addition: the system's own approval below is allowed without the approval permission
create or replace function app.guard_attendance() returns trigger language plpgsql as $$
begin
  if old.approval = 'Approved' and (to_jsonb(new) - array['updated_at','updated_by','notes','deleted_at','deleted_by']) <> (to_jsonb(old) - array['updated_at','updated_by','notes','deleted_at','deleted_by'])
     and not (old.clock_out is null and old.clock_in is not null and app.has_perm('attendance.approve'))
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
   where a.deleted_at is null and a.approval = 'Pending' and a.kind = 'Present' and a.clock_in is not null and a.date = new.arr_at::date
     and a.employee_id in (select jsonb_array_elements_text(coalesce(new.arr_crew_present, '[]'::jsonb)));
  perform set_config('app.auto_approve', 'off', true);
  return new;
end $$;
revoke all on function app.auto_approve_site_attendance() from public;

drop trigger if exists trg_auto_approve_site_attendance on public.workflows;
create trigger trg_auto_approve_site_attendance after update of arr_at on public.workflows for each row
  when (new.arr_at is not null and old.arr_at is null) execute function app.auto_approve_site_attendance();

-- catch up: crew who already passed a site check-in in the last 60 days and are still waiting for approval
do $$
begin
  perform set_config('app.auto_approve', 'on', true);
  update public.attendance a
     set approval = 'Approved', approved_by = 'auto', approved_at = now(), job_id = coalesce(a.job_id, w.job_id), field_work = true
    from public.workflows w
   where w.deleted_at is null and w.arr_at is not null and w.arr_at >= (now() at time zone 'Asia/Manila') - interval '60 days'
     and a.deleted_at is null and a.approval = 'Pending' and a.kind = 'Present' and a.clock_in is not null and a.date = w.arr_at::date
     and a.employee_id in (select jsonb_array_elements_text(coalesce(w.arr_crew_present, '[]'::jsonb)));
  perform set_config('app.auto_approve', 'off', true);
end $$;
