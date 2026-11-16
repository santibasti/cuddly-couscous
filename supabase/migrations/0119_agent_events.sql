-- TOPMOP AI Headquarters, step 1: a log of what the "agents" (the automated desks of the business) really did.
-- Every event is a fact written by the database when something actually happens (a new inquiry, a quotation sent, a booking created, a post drafted, a Jarvis action...).
-- The Headquarters screen reads it live and animates the characters from it; nothing in it is invented. Titles hold only numbers and general words, never client names or amounts.
create table if not exists public.agent_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  agent text not null,                   -- agent key from the roster in the app (jarvis, messenger, quote, ...)
  dept text not null,                    -- hub, email, creative, ads, desk, booking, hr, board
  kind text not null check (kind in ('start', 'done', 'fail', 'approval', 'message', 'info')),
  title text not null check (char_length(title) <= 140),
  ref text,                              -- record number such as QT-2026-0042 (no names)
  to_agent text                          -- for kind 'message': the agent that receives the hand-over
);
create index if not exists agent_events_at on public.agent_events (at desc);
alter table public.agent_events enable row level security;
drop policy if exists agent_events_owner on public.agent_events;
create policy agent_events_owner on public.agent_events for select using (app.has_perm('admin.users'));
revoke all on public.agent_events from anon;
revoke insert, update, delete on public.agent_events from authenticated;
revoke all on sequence public.agent_events_id_seq from anon, authenticated;

-- one place that writes an event; it can never make the business action that triggered it fail
create or replace function app.agent_event(p_agent text, p_dept text, p_kind text, p_title text, p_ref text default null, p_to text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.agent_events (agent, dept, kind, title, ref, to_agent) values (p_agent, p_dept, p_kind, left(p_title, 140), p_ref, p_to);
exception when others then null;
end $$;
revoke all on function app.agent_event(text, text, text, text, text, text) from public;

-- inquiries: a new lead arrives (Facebook goes to the Messenger Receptionist) and is handed to the booking desk
create or replace function app.ev_inquiry() returns trigger language plpgsql security definer set search_path = public as $$
declare fb boolean := coalesce(new.source, '') ~* '(facebook|messenger)';
begin
  if tg_op = 'INSERT' then
    perform app.agent_event(case when fb then 'messenger' else 'qualifier' end, 'desk', 'start', 'New inquiry' || coalesce(' from ' || nullif(new.source, ''), ''));
    perform app.agent_event('qualifier', 'desk', 'message', 'Lead recorded and passed on for a quotation', null, 'quote');
  elsif new.stage is distinct from old.stage then
    if new.stage = 'Booked' then perform app.agent_event('booking', 'booking', 'done', 'An inquiry became a booking');
    elsif new.stage = 'Lost' then perform app.agent_event('qualifier', 'desk', 'info', 'An inquiry was marked lost'); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_ev_inquiry on public.inquiries;
create trigger trg_ev_inquiry after insert or update of stage on public.inquiries for each row execute function app.ev_inquiry();

-- quotations: drafted, sent, decided
create or replace function app.ev_quotation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform app.agent_event('quote', 'booking', 'start', 'Quotation ' || new.number || ' drafted', new.number);
  elsif new.status is distinct from old.status then
    if new.status = 'Sent' then perform app.agent_event('quote', 'booking', 'done', 'Quotation ' || new.number || ' sent to the client', new.number);
    elsif new.status = 'Approved' then perform app.agent_event('quote', 'booking', 'done', 'Quotation ' || new.number || ' approved by the client', new.number, 'booking');
    elsif new.status = 'Rejected' then perform app.agent_event('quote', 'booking', 'info', 'Quotation ' || new.number || ' was rejected', new.number);
    elsif new.status = 'Expired' then perform app.agent_event('quote', 'booking', 'info', 'Quotation ' || new.number || ' expired', new.number); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_ev_quotation on public.quotations;
create trigger trg_ev_quotation after insert or update of status on public.quotations for each row execute function app.ev_quotation();

-- jobs: a booking is created; its status moves
create or replace function app.ev_job() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform app.agent_event('booking', 'booking', 'done', 'Booking ' || new.number || ' created', new.number, 'scheduler');
  elsif new.status is distinct from old.status then
    perform app.agent_event('scheduler', 'booking', case when new.status in ('Cancelled', 'Rescheduled') then 'info' else 'done' end, new.number || ': ' || new.status, new.number);
  end if;
  return new;
end $$;
drop trigger if exists trg_ev_job on public.jobs;
create trigger trg_ev_job after insert or update of status on public.jobs for each row execute function app.ev_job();

-- job orders: a draft is prepared for a booking
create or replace function app.ev_job_order() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform app.agent_event('joborders', 'booking', 'done', 'Job order ' || new.number || ' drafted', new.number);
  elsif new.status = 'Sent to Client' and old.status is distinct from new.status then perform app.agent_event('joborders', 'booking', 'done', 'Job order ' || new.number || ' sent to the client', new.number); end if;
  return new;
end $$;
drop trigger if exists trg_ev_job_order on public.job_orders;
create trigger trg_ev_job_order after insert or update of status on public.job_orders for each row execute function app.ev_job_order();

-- discount requests wait for the Owner
create or replace function app.ev_discount() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.agent_event('quote', 'booking', 'approval', 'Discount request ' || new.number || ' waits for approval', new.number);
  return new;
end $$;
drop trigger if exists trg_ev_discount on public.discount_requests;
create trigger trg_ev_discount after insert on public.discount_requests for each row execute function app.ev_discount();

-- marketing posts: an AI draft waits for approval, then is published (or fails)
create or replace function app.ev_post() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'Idea' then perform app.agent_event('creative', 'creative', 'approval', 'A ' || lower(new.kind) || ' post draft waits for approval'); end if;
  elsif new.status is distinct from old.status then
    if new.status = 'Posted' then perform app.agent_event('creative', 'creative', 'done', 'A ' || lower(new.kind) || ' post was published');
    elsif new.status = 'Failed' then perform app.agent_event('creative', 'creative', 'fail', 'A post could not be published');
    elsif new.status = 'Approved' then perform app.agent_event('creative', 'creative', 'start', 'A ' || lower(new.kind) || ' post is scheduled'); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_ev_post on public.marketing_posts;
create trigger trg_ev_post after insert or update of status on public.marketing_posts for each row execute function app.ev_post();

-- Jarvis's own activity log feeds the Chief of Staff (the texts there are already free of names)
create or replace function app.ev_jarvis() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'inquiry' then return new; end if;     -- the inquiry itself is already shown by the inquiry desk
  perform app.agent_event('jarvis', 'hub', case new.kind when 'brief' then 'done' when 'answer' then 'done' when 'review' then 'done' else 'info' end, new.text);
  return new;
end $$;
drop trigger if exists trg_ev_jarvis on public.jarvis_events;
create trigger trg_ev_jarvis after insert on public.jarvis_events for each row execute function app.ev_jarvis();

-- live updates for the Headquarters screen, and a daily clean-up (30 days are kept)
do $$ begin
  begin alter publication supabase_realtime add table public.agent_events; exception when others then raise notice 'Realtime publication not changed: %', sqlerrm; end;
  perform cron.unschedule('agent-events-cleanup') where exists (select 1 from cron.job where jobname = 'agent-events-cleanup');
  perform cron.schedule('agent-events-cleanup', '30 19 * * *', $c$ delete from public.agent_events where at < now() - interval '30 days' $c$);
exception when others then
  raise notice 'Could not schedule the agent events clean-up: %', sqlerrm;
end $$;
