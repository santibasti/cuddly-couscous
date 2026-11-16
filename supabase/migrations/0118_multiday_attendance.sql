-- A job over several days: the crew clock in and out every day, and the Site Check-In (done once, on the first day) covers the days the job runs.
-- Attendance rule 1 of 0115 approved a person only on the day of the check-in; now also on the following days of the same job, for crew the check-in lists as present.
create or replace function app.auto_approve_attendance() returns trigger language plpgsql security definer set search_path = public as $$
declare s jsonb; jid text; late_max int; ok boolean := false;
begin
  if new.approval <> 'Pending' or new.deleted_at is not null or new.kind <> 'Present' or new.clock_in is null then return new; end if;
  -- rule 1: a site check-in lists this person as present, on the day of the check-in or any later day of that same job
  select w.job_id into jid from public.workflows w left join public.jobs j on j.id = w.job_id
   where w.deleted_at is null and w.arr_at is not null
     and (w.arr_at::date = new.date or (w.arr_at::date <= new.date and j.deleted_at is null and new.date between j.start_at::date and j.end_at::date))
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
