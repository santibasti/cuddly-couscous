-- Chat auto-booking, step 2: the booking also gets the INTERNAL pre-approved quotation (never sent to the client; the Job Order and the invoice need it),
-- and, only when the owner switches on "Create and send the Job Order automatically", the Job Order itself.
-- The client agreed to the starting rates in the chat and sent the details: that is the pre-approval. The quotation holds the starting rates; the crew counts the real quantity on site.
create or replace function app.take_number(p_kind text) returns integer language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  select coalesce((data -> 'counters' ->> p_kind)::int, 0) + 1 into cur from public.settings where id = 'main' for update;
  if cur is null then raise exception 'Company settings have not been loaded.'; end if;
  update public.settings set data = jsonb_set(data, '{counters}', coalesce(data -> 'counters', '{}'::jsonb) || jsonb_build_object(p_kind, cur)), updated_at = now() where id = 'main';
  return cur;
end $$;
revoke all on function app.take_number(text) from public, anon, authenticated;

create or replace function public.chat_book(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare d date := (p ->> 'date')::date; mx int := greatest(1, coalesce((p ->> 'max_jobs')::int, 2)); n int; cid text := p ->> 'client_id'; addr text := left(coalesce(nullif(p ->> 'address', ''), 'Address to be confirmed'), 300);
        sid text; br text; jno text; jid text; codes jsonb := coalesce(p -> 'service_codes', '[]'::jsonb); iid text := p ->> 'inquiry_id'; q jsonb := p -> 'quotation'; qid text; qno text; sc text;
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
  jno := 'JOB-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(app.take_number('JOB')::text, 4, '0');
  sc := coalesce(nullif(q ->> 'scope', ''), 'Booked through the Messenger chat. Team, vehicle and price are still to be arranged and confirmed by staff.');
  if q is not null then
    qno := 'QT-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(app.take_number('QT')::text, 4, '0');
    insert into public.quotations (number, client_id, site_id, inquiry_id, issue_date, valid_until, scope, items, vat_mode, vat_rate, discount, terms, status, sent_at, decided_at, branch_id,
                                   crew_size, safety_officer, work_days, disclaimer, intro, methodology, payment_option, ocular_done, method_sections, created_by)
    values (qno, cid, sid, iid, (q ->> 'issue_date')::date, (q ->> 'valid_until')::date, sc, coalesce(q -> 'items', '[]'::jsonb), coalesce(q ->> 'vat_mode', 'none'), coalesce((q ->> 'vat_rate')::numeric, 0), 0, q ->> 'terms',
            'Approved', now(), now(), br, q ->> 'crew_size', coalesce((q ->> 'safety_officer')::boolean, true), coalesce((q ->> 'work_days')::int, 1), q ->> 'disclaimer', q ->> 'intro', q ->> 'methodology',
            coalesce(q ->> 'payment_option', 'completion'), false, q -> 'method_sections', 'chat')
    returning id into qid;
  end if;
  insert into public.jobs (number, client_id, site_id, branch_id, quotation_id, service_codes, scope, start_at, end_at, status, crew_ids, created_by)
  values (jno, cid, sid, br, qid, codes, sc, d + time '08:00', d + time '17:00', 'Confirmed', '[]'::jsonb, 'chat') returning id into jid;
  if iid is not null then update public.inquiries set stage = 'Booked', site_id = sid, updated_at = now() where id = iid and deleted_at is null; end if;
  return jsonb_build_object('ok', true, 'job_id', jid, 'number', jno, 'jobs_before', n, 'quotation_id', qid, 'quotation_number', qno, 'client_id', cid, 'site_id', sid);
end $$;
revoke all on function public.chat_book(jsonb) from public, anon, authenticated;
grant execute on function public.chat_book(jsonb) to service_role;

-- The Job Order for a chat booking (only when the owner switched on the automatic Job Order). The content is built by the same code as the app's, so the app sees it as up to date.
create or replace function public.chat_job_order(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare jid text := p ->> 'job_id'; tok text := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8); no text; oid text; j record; send boolean := coalesce((p ->> 'send')::boolean, true);
begin
  select * into j from public.jobs where id = jid and deleted_at is null; if not found then return jsonb_build_object('ok', false, 'reason', 'no_job'); end if;
  if exists (select 1 from public.job_orders where job_id = jid and deleted_at is null) then return jsonb_build_object('ok', false, 'reason', 'exists'); end if;
  no := 'JO-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(app.take_number('JO')::text, 4, '0');
  insert into public.job_orders (number, version, job_id, quotation_id, client_id, status, issued_on, content, content_key, sent_at, sent_by, sent_via, last_sent_at, sent_count, share_token, history, created_by)
  values (no, 1, jid, j.quotation_id, j.client_id, case when send then 'Sent to Client' else 'Draft' end, (now() at time zone 'Asia/Manila')::date, p -> 'content', p ->> 'content_key',
          case when send then now() end, case when send then 'chat' end, case when send then 'Messenger chat (automatic)' end, case when send then now() end, case when send then 1 else 0 end, tok,
          jsonb_build_array(jsonb_build_object('at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'by', 'Chat', 'action', case when send then 'Created and sent through the Messenger chat after the client agreed to the starting rates' else 'Draft created by the Messenger chat' end)), 'chat')
  returning id into oid;
  return jsonb_build_object('ok', true, 'job_order_id', oid, 'number', no, 'share_token', tok);
end $$;
revoke all on function public.chat_job_order(jsonb) from public, anon, authenticated;
grant execute on function public.chat_job_order(jsonb) to service_role;
