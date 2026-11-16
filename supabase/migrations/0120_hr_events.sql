-- AI Headquarters: the HR desk (Alex, the Attendance Analyst) now has a real feed.
-- Facts only, written by the database when attendance really changes. Titles hold numbers and general words, never names, times or pay.
--   a worked day is finished (clock-out)  -> finished at once when the day was approved automatically, otherwise "waits for approval"
--   a time correction is sent              -> waits for approval
--   the owner approves or rejects          -> finished / noted; if more records still wait, the desk shows waiting again
-- It never changes attendance and can never make the clock-in, clock-out, correction or approval fail (agent_event swallows its own errors).
create or replace function app.hr_pending() returns integer language sql stable security definer set search_path = public as $$
  select (select count(*) from public.attendance a where a.deleted_at is null and a.kind = 'Present' and a.clock_out is not null and a.approval = 'Pending')::int
       + (select count(*) from public.corrections c where c.deleted_at is null and c.status = 'Pending')::int;
$$;
revoke all on function app.hr_pending() from public;

create or replace function app.ev_attendance() returns trigger language plpgsql security definer set search_path = public as $$
declare cur text; n int;
begin
  if new.deleted_at is not null or new.kind <> 'Present' then return new; end if;
  select a.approval into cur from public.attendance a where a.id = new.id;          -- the real state now, after the auto-approval trigger ran (it fires first: trg_auto... < trg_ev...)
  if tg_op = 'UPDATE' then
    if new.clock_out is not null and old.clock_out is null then
      if cur = 'Approved' then perform app.agent_event('attendance', 'hr', 'done', 'A worked day was approved automatically');
      else perform app.agent_event('attendance', 'hr', 'approval', 'A worked day waits for approval'); end if;
    elsif new.approval is distinct from old.approval and coalesce(new.approved_by, '') <> 'auto' then
      if cur = 'Approved' then perform app.agent_event('attendance', 'hr', 'done', 'A worked day was approved');
      elsif cur = 'Rejected' then perform app.agent_event('attendance', 'hr', 'info', 'A worked day was rejected'); end if;
      n := app.hr_pending(); if n > 0 then perform app.agent_event('attendance', 'hr', 'approval', n || ' attendance item(s) still wait for approval'); end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function app.ev_attendance() from public;
drop trigger if exists trg_ev_attendance on public.attendance;
create trigger trg_ev_attendance after update on public.attendance for each row execute function app.ev_attendance();

create or replace function app.ev_correction() returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.deleted_at is not null then return new; end if;
  if tg_op = 'INSERT' then
    if new.status = 'Pending' then perform app.agent_event('attendance', 'hr', 'approval', 'A time correction waits for approval'); end if;
  elsif new.status is distinct from old.status then
    if new.status = 'Approved' then perform app.agent_event('attendance', 'hr', 'done', 'A time correction was approved');
    elsif new.status = 'Rejected' then perform app.agent_event('attendance', 'hr', 'info', 'A time correction was rejected'); end if;
    n := app.hr_pending(); if n > 0 then perform app.agent_event('attendance', 'hr', 'approval', n || ' attendance item(s) still wait for approval'); end if;
  end if;
  return new;
end $$;
revoke all on function app.ev_correction() from public;
drop trigger if exists trg_ev_correction on public.corrections;
create trigger trg_ev_correction after insert or update of status on public.corrections for each row execute function app.ev_correction();
