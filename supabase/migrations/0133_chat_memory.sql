-- TopMop AI V2: persistent, structured conversation memory and reliable one-answer-per-burst processing. Additive only.
--  * chat_conversations.context : what the customer told us (location, service, surface, property, access, schedule) + intent, stage, last question, what was already explained
--  * chat_conversations.busy_until : a per-conversation lock so messages of one customer are processed one batch at a time
--  * chat_messages.handled_at : an inbound message that the AI has already taken into account (so a burst is answered once)
alter table public.chat_conversations add column if not exists context jsonb not null default '{}'::jsonb;
alter table public.chat_conversations add column if not exists busy_until timestamptz;
alter table public.chat_messages add column if not exists handled_at timestamptz;
-- existing inbound messages count as handled (they were answered before this update)
update public.chat_messages set handled_at = coalesce(handled_at, created_at) where direction = 'in' and handled_at is null;
create index if not exists chat_messages_unhandled on public.chat_messages (conversation_id, created_at) where direction = 'in' and handled_at is null;

-- The lock: true when this caller now holds it. It expires by itself (a crashed run never blocks a customer for long).
create or replace function public.chat_lock(p_conv text, p_secs integer default 90) returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.chat_conversations set busy_until = now() + make_interval(secs => greatest(5, least(p_secs, 300)))
   where id = p_conv and (busy_until is null or busy_until < now());
  get diagnostics n = row_count; return n > 0;
end $$;
create or replace function public.chat_unlock(p_conv text) returns void language sql security definer set search_path = public as $$
  update public.chat_conversations set busy_until = null where id = p_conv;
$$;
-- Saves the AI's reply and marks the customer messages it answered as handled in ONE transaction: after a crash the messages are either still unhandled (retried) or answered (never both lost and duplicated).
create or replace function public.chat_answer(p_ids text[], p_row jsonb) returns text language plpgsql security definer set search_path = public as $$
declare mid text; has_card boolean;
begin
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'card_url') into has_card;
  insert into public.chat_messages (conversation_id, direction, body, status, actions, flags, model, rulebook_version, tool_log, error)
  values (p_row ->> 'conversation_id', 'out', coalesce(p_row ->> 'body', ''), coalesce(p_row ->> 'status', 'sent'), coalesce(p_row -> 'actions', '[]'::jsonb), coalesce(p_row -> 'flags', '[]'::jsonb), p_row ->> 'model', nullif(p_row ->> 'rulebook_version', '')::integer, p_row -> 'tool_log', p_row ->> 'error')
  returning id into mid;
  if has_card and nullif(p_row ->> 'card_url', '') is not null then execute 'update public.chat_messages set card_url = $1 where id = $2' using p_row ->> 'card_url', mid; end if;
  update public.chat_messages set handled_at = now() where id = any (p_ids) and direction = 'in' and handled_at is null;
  return mid;
end $$;
revoke all on function public.chat_lock(text, integer), public.chat_unlock(text), public.chat_answer(text[], jsonb) from public, anon, authenticated;
grant execute on function public.chat_lock(text, integer), public.chat_unlock(text), public.chat_answer(text[], jsonb) to service_role;
-- The every-minute recovery job (chat-recover) is scheduled per environment with supabase/cron/chat-recover.sql, so no project address is hard-coded here.
