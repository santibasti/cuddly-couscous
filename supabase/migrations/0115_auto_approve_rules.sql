-- Attendance that approves itself, two rules (the Owner no longer approves what the site check-in or a normal day already proves):
--  1. SITE CHECK-IN: whoever the Team Leader's Site Check-In lists as present is approved, also when they clock in AFTER the check-in was saved (0102 only covered those already clocked in).
--  2. NORMAL DAY: when Admin's "Approve clean attendance automatically" is ON, a finished day is approved unless the person was late by more than the Admin threshold
--     (default 15 minutes, after the grace period) or worked overtime. Leaving early (undertime) no longer holds it back; it still reduces pay as before.
-- Approved by 'auto'. Late beyond the threshold, overtime, corrections and open (no clock-out) records still wait for the Owner.
-- Done in an AFTER trigger that is security definer (like 0102), so it also works when the person clocking in or out has no approval permission.

create or replace function app.auto_approve_attendance() returns trigger language plpgsql security definer set search_path = public as $$
declare s jsonb; jid text; late_max int; ok boolean := false;
begin
  if new.approval <> 'Pending' or new.deleted_at is not null or new.kind <> 'Present' or new.clock_in is null then return new; end if;
  -- rule 1: a site check-in for that day lists this person as present
  select w.job_id into jid from public.workflows w
   where w.deleted_at is null and w.arr_at is not null and w.arr_at::date = new.date
     and exists (select 1 from jsonb_array_elements_text(coalesce(w.arr_crew_present, '[]'::jsonb)) x(v) where x.v = new.employee_id)
   order by w.arr_at desc limit 1;
  if found then ok := true; end if;
  -- rule 2: a finished, normal day (only when Admin turned auto-approval on)
  if not ok and new.clock_out is not null then
    select s2.data into s from public.settings s2 where s2.id = 'main';
    late_max := coalesce(nullif(s ->> 'auto_approve_late_min', '')::int, 15);
    if coalesce((s ->> 'auto_approve_attendance')::boolean, false) and coalesce(new.late_min, 0) <= late_max and coalesce(new.ot_min, 0) = 0 then ok := true; end if;
  end if;
  if not ok then return new; end if;
  perform set_config('app.auto_approve', 'on', true);
  update public.attendance a set approval = 'Approved', approved_by = 'auto', approved_at = now(),
         job_id = coalesce(a.job_id, jid), field_work = (a.field_work or jid is not null)
   where a.id = new.id and a.approval = 'Pending';
  perform set_config('app.auto_approve', 'off', true);
  return new;
end $$;
revoke all on function app.auto_approve_attendance() from public;
drop trigger if exists trg_auto_approve_attendance on public.attendance;
create trigger trg_auto_approve_attendance after insert or update on public.attendance for each row execute function app.auto_approve_attendance();

-- catch up: the last 14 days that are still waiting but already fit these rules (the trigger fires for each row that is touched)
do $$
begin
  update public.attendance a set approval = 'Pending'
   where a.deleted_at is null and a.approval = 'Pending' and a.kind = 'Present' and a.clock_in is not null
     and a.date >= (now() at time zone 'Asia/Manila')::date - 14;
exception when others then
  raise notice 'Could not catch up pending attendance: %', sqlerrm;
end $$;
