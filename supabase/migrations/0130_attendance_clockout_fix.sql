-- 1) Why most crew could not clock out: a Site Check-In (or auto-approval) marks their attendance Approved at clock-in, but the update policy only let a
--    person change their OWN record while it was still Pending, so the clock-out was refused ("NOT SAVED ... undone"). They may now update their own record;
--    the attendance guard (0104) still limits an Approved record to the clock-out / second-shift fields only.
drop policy if exists att_update on public.attendance;
create policy att_update on public.attendance for update using (
  app.has_perm('attendance.approve') or (employee_id = app.my_employee() and app.has_perm('attendance.own') and approval in ('Pending','Approved')));

-- 2) The guard (0104) also lets the system's own automatic clock-out through (app.auto_clockout = 'on').
create or replace function app.guard_attendance() returns trigger language plpgsql as $$
declare skip text[] := array['updated_at','updated_by','notes','deleted_at','deleted_by'];
        outfields text[] := array['clock_out','sessions','out_lat','out_lng','in_lat','in_lng','late_min','undertime_min','ot_min','worked_hours'];
begin
  if old.approval = 'Approved' and (to_jsonb(new) - skip) <> (to_jsonb(old) - skip)
     and coalesce(current_setting('app.auto_clockout', true), '') <> 'on'
     and not (old.clock_out is null and old.clock_in is not null and app.has_perm('attendance.approve'))
     and not (old.employee_id = app.my_employee() and old.kind = 'Present' and old.clock_in is not null
              and (to_jsonb(new) - skip - outfields) = (to_jsonb(old) - skip - outfields)
              and ((old.clock_out is null and new.clock_out is not null)
                or (old.clock_out is not null and new.clock_out is null and new.sessions is not null
                    and old.date = (now() at time zone 'Asia/Manila')::date)))
     and not (app.has_perm('attendance.approve') and exists (select 1 from public.corrections c where c.employee_id = old.employee_id and c.date = old.date and c.status = 'Approved')) then
    raise exception 'Approved attendance cannot be edited. File a correction request.';
  end if;
  if new.approval <> old.approval and new.approval in ('Approved','Rejected') and coalesce(current_setting('app.auto_approve', true), '') <> 'on' then
    if not (app.has_perm('attendance.approve') or auth.uid() is null) then raise exception 'Not permitted to approve attendance.'; end if;
    if old.employee_id = app.my_employee() and app.user_role() <> 'owner' then raise exception 'You cannot approve your own attendance.'; end if;
    new.approved_by := coalesce(auth.uid()::text, new.approved_by); new.approved_at := now();
  end if;
  if old.clock_out is null and new.clock_out is not null and new.approval = 'Pending' and new.kind = 'Present'
     and coalesce(new.late_min, 0) = 0 and coalesce(new.undertime_min, 0) = 0 and coalesce(new.ot_min, 0) = 0
     and coalesce((select (s.data ->> 'auto_approve_attendance')::boolean from public.settings s where s.id = 'main'), false) then
    new.approval := 'Approved'; new.approved_by := 'auto'; new.approved_at := now();
  end if;
  return new;
end $$;

-- 3) The crew are clocked out by themselves when the Team Leader records "left the site" at close-out: everyone on the Site Check-In's present list
--    (or the job's crew when there is no list) who is still clocked in gets the leave time as clock-out. Lateness / undertime / overtime / worked hours
--    are worked out the same way as the app (shift end, 1 h break after 5 h, overtime in 30-minute steps).
create or replace function app.auto_clockout_crew() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; ids text[]; mins numeric; brk numeric; worked numeric; endm int; shiftend int; ot numeric; lat int; sess jsonb;
begin
  select coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(new.arr_crew_present, '[]'::jsonb)) x), '{}') into ids;
  if coalesce(array_length(ids, 1), 0) = 0 then
    select array_remove(array[j.leader_id] || coalesce((select array_agg(c) from jsonb_array_elements_text(coalesce(j.crew_ids, '[]'::jsonb)) c), '{}'), null) into ids from public.jobs j where j.id = new.job_id;
  end if;
  if coalesce(array_length(ids, 1), 0) = 0 then return new; end if;
  perform set_config('app.auto_clockout', 'on', true);
  for r in
    select a.id, a.clock_in, a.sessions, a.late_min, e.shift_end from public.attendance a join public.employees e on e.id = a.employee_id
     where a.deleted_at is null and a.kind = 'Present' and a.clock_in is not null and a.clock_out is null and a.employee_id = any(ids)
       and a.date in (new.leave_at::date, new.leave_at::date - 1) and a.clock_in <= new.leave_at
  loop
    sess := null;
    if r.sessions is not null and jsonb_array_length(r.sessions) > 0 then
      sess := (select jsonb_agg(case when i0 = jsonb_array_length(r.sessions) then s || jsonb_build_object('out', to_char(new.leave_at, 'YYYY-MM-DD"T"HH24:MI')) else s end order by i0)
                 from jsonb_array_elements(r.sessions) with ordinality t(s, i0));
      select coalesce(sum(greatest(0, m - case when m > 300 then 60 else 0 end)), 0) into worked
        from (select extract(epoch from ((s ->> 'out')::timestamp - (s ->> 'in')::timestamp)) / 60 as m from jsonb_array_elements(sess) s where s ->> 'out' is not null) z;
      worked := worked / 60.0; ot := greatest(0, worked * 60 - 480); ot := case when ot >= 30 then floor(ot / 30) * 30 else 0 end;
      update public.attendance set clock_out = new.leave_at, sessions = sess, undertime_min = 0, ot_min = ot::int, worked_hours = round(worked, 2),
             notes = trim(both ' ' from coalesce(notes, '') || ' Clocked out automatically when the crew left the site.') where id = r.id;
    else
      mins := extract(epoch from (new.leave_at - r.clock_in)) / 60; brk := case when mins > 300 then 60 else 0 end; worked := greatest(0, mins - brk) / 60.0;
      endm := extract(hour from new.leave_at)::int * 60 + extract(minute from new.leave_at)::int;
      if new.leave_at::date <> r.clock_in::date then endm := endm + 1440 * (new.leave_at::date - r.clock_in::date); end if;
      shiftend := extract(hour from r.shift_end)::int * 60 + extract(minute from r.shift_end)::int;
      ot := greatest(0, endm - shiftend); ot := case when ot >= 30 then floor(ot / 30) * 30 else 0 end;
      update public.attendance set clock_out = new.leave_at, undertime_min = greatest(0, shiftend - endm), ot_min = ot::int, worked_hours = round(worked, 2),
             notes = trim(both ' ' from coalesce(notes, '') || ' Clocked out automatically when the crew left the site.') where id = r.id;
    end if;
  end loop;
  perform set_config('app.auto_clockout', 'off', true);
  return new;
end $$;
revoke all on function app.auto_clockout_crew() from public;

drop trigger if exists trg_auto_clockout_crew on public.workflows;
create trigger trg_auto_clockout_crew after update of leave_at on public.workflows for each row
  when (new.leave_at is not null and old.leave_at is distinct from new.leave_at) execute function app.auto_clockout_crew();
