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
revoke all on function public.chat_lock(text, integer), public.chat_unlock(text) from public, anon, authenticated;
grant execute on function public.chat_lock(text, integer), public.chat_unlock(text) to service_role;
