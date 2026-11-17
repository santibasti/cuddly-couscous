-- Chat auto-booking: when the owner switches on "Book open dates automatically" (Admin -> Settings -> Messenger booking rules), the chat books an open date by itself.
-- One function does the check and the booking in a single step under a lock on that day, so two customers chatting at the same moment can never both take the last place.
-- A day is open while it has fewer than the daily limit (default 2) of live jobs. The job is created as "Confirmed" with NO team, vehicle or price: a person arranges those and sends the quotation.
-- Only the service role (the chat-book function) may call it. The existing job trigger then shows the booking in the AI Headquarters and the owner is alerted.
create or replace function public.chat_book(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare d date := (p ->> 'date')::date; mx int := greatest(1, coalesce((p ->> 'max_jobs')::int, 2)); n int; cid text := p ->> 'client_id'; addr text := left(coalesce(nullif(p ->> 'address', ''), 'Address to be confirmed'), 300);
        sid text; br text; cur int; jno text; jid text; codes jsonb := coalesce(p -> 'service_codes', '[]'::jsonb); iid text := p ->> 'inquiry_id';
begin
  if cid is null or d is null then return jsonb_build_object('ok', false, 'reason', 'bad_request'); end if;
  perform pg_advisory_xact_lock(7210001, (d - date '2000-01-01'));
  select count(*) into n from public.jobs j
   where j.deleted_at is null and j.status not in ('Cancelled', 'Rescheduled', 'Completed', 'Work Completed', 'Leaving Site', 'Arrived at HQ', 'Closed')
     and j.start_at::date <= d and j.end_at::date >= d;
  if n >= mx then return jsonb_build_object('ok', false, 'reason', 'full', 'jobs', n); end if;
  select s.id into sid from public.sites s where s.client_id = cid and s.deleted_at is null and lower(s.address) = lower(addr) limit 1;
  select c.branch_id into br from public.clients c where c.id = cid; if br is null then select b.id into br from public.branches b where b.deleted_at is null limit 1; end if;
  if sid is null then insert into public.sites (client_id, name, address) values (cid, left(addr, 80), addr) returning id into sid; end if;
  select coalesce((data -> 'counters' ->> 'JOB')::int, 0) + 1 into cur from public.settings where id = 'main' for update;
  if cur is null then return jsonb_build_object('ok', false, 'reason', 'no_settings'); end if;
  update public.settings set data = jsonb_set(data, '{counters}', coalesce(data -> 'counters', '{}'::jsonb) || jsonb_build_object('JOB', cur)), updated_at = now() where id = 'main';
  jno := 'JOB-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(cur::text, 4, '0');
  insert into public.jobs (number, client_id, site_id, branch_id, service_codes, scope, start_at, end_at, status, crew_ids, created_by)
  values (jno, cid, sid, br, codes, 'Booked through the Messenger chat. Team, vehicle and price are still to be arranged and confirmed by staff.', d + time '08:00', d + time '17:00', 'Confirmed', '[]'::jsonb, 'chat')
  returning id into jid;
  if iid is not null then update public.inquiries set stage = 'Booked', site_id = sid, updated_at = now() where id = iid and deleted_at is null; end if;
  return jsonb_build_object('ok', true, 'job_id', jid, 'number', jno, 'jobs_before', n);
end $$;
revoke all on function public.chat_book(jsonb) from public, anon, authenticated;
grant execute on function public.chat_book(jsonb) to service_role;
