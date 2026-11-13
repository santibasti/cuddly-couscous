-- Double shifts: a person can clock out (e.g. 3 PM) and clock in again the same day (e.g. 11 PM), then clock out after midnight (3 AM).
-- It stays ONE attendance for the day it started: clock_in is the first in, clock_out the last out, and `sessions` keeps each shift in order.
alter table public.attendance add column if not exists sessions jsonb;

-- Attendance guard (0103) plus: the person may clock in again for a second shift today on their own, already-approved record (the clock-out is cleared and the
-- shift is added to `sessions`). As before they can also clock out of their own open record. Nothing else on an approved record can be changed by them.
create or replace function app.guard_attendance() returns trigger language plpgsql as $$
declare skip text[] := array['updated_at','updated_by','notes','deleted_at','deleted_by'];
        outfields text[] := array['clock_out','sessions','out_lat','out_lng','in_lat','in_lng','late_min','undertime_min','ot_min','worked_hours'];
begin
  if old.approval = 'Approved' and (to_jsonb(new) - skip) <> (to_jsonb(old) - skip)
     and not (old.clock_out is null and old.clock_in is not null and app.has_perm('attendance.approve'))
     and not (old.employee_id = app.my_employee() and old.kind = 'Present' and old.clock_in is not null
              and (to_jsonb(new) - skip - outfields) = (to_jsonb(old) - skip - outfields)
              and ((old.clock_out is null and new.clock_out is not null)                                                            -- clocking out
                or (old.clock_out is not null and new.clock_out is null and new.sessions is not null
                    and old.date = (now() at time zone 'Asia/Manila')::date)))                                                      -- another shift today
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
