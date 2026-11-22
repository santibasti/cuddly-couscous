-- AI V2.3: recognise previous Messenger contacts and existing clients (no second customer database: the chat_conversations row IS the persistent mapping of one ManyChat contact).
--  contact_status : new (first known interaction) | previous (has talked to TopMop before, service history NOT verified) | existing (positively matched to a TopMop client record)
--  link_state     : verified (matched by the system: mobile / booking made from this chat) | staff (a person linked it) | ambiguous (more than one client fits: staff decide) | suggested (a number or job number the customer typed: staff confirm)
--  link_basis     : why (mobile, chat_booking, staff, job_number ...) ; link_candidates : [{client_id, name, basis}] for staff to confirm
--  mc_*           : what ManyChat said about the contact (first contact date, last interaction, tags), read once and kept
-- A name is never a basis for a link.
alter table public.chat_conversations add column if not exists contact_status text not null default 'new';
alter table public.chat_conversations add column if not exists link_state text;
alter table public.chat_conversations add column if not exists link_basis text;
alter table public.chat_conversations add column if not exists link_candidates jsonb not null default '[]'::jsonb;
alter table public.chat_conversations add column if not exists linked_by text;
alter table public.chat_conversations add column if not exists linked_at timestamptz;
alter table public.chat_conversations add column if not exists mc_subscribed_at timestamptz;
alter table public.chat_conversations add column if not exists mc_last_interaction timestamptz;
alter table public.chat_conversations add column if not exists mc_tags jsonb not null default '[]'::jsonb;
alter table public.chat_conversations add column if not exists mc_synced_at timestamptz;
alter table public.chat_conversations add column if not exists mc_phone text;   -- the contact's own mobile as ManyChat holds it (10 digits), used to match a client; never a number typed in the chat
do $$ begin
  alter table public.chat_conversations add constraint chat_conversations_contact_status_check check (contact_status in ('new', 'previous', 'existing'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.chat_conversations add constraint chat_conversations_link_state_check check (link_state is null or link_state in ('verified', 'staff', 'ambiguous', 'suggested'));
exception when duplicate_object then null; end $$;

-- Older links that came from a number the customer TYPED in the chat (no booking was made from the chat) are only suggestions now: staff confirm them in AI Chat.
update public.chat_conversations c set contact_status = 'previous', link_state = 'suggested', link_basis = 'legacy_match',
  link_candidates = (select coalesce(jsonb_agg(jsonb_build_object('client_id', cl.id, 'name', cl.name, 'basis', 'legacy_match')), '[]'::jsonb) from public.clients cl where cl.id = c.client_id)
  where c.client_id is not null and c.inquiry_id is null and c.link_state is null;
-- Conversations that created a client or inquiry from the chat itself (a booking or a saved lead) are positively linked.
update public.chat_conversations set contact_status = 'existing', link_state = 'verified', link_basis = 'chat_booking' where client_id is not null and inquiry_id is not null and link_state is null;
-- Conversations staff or the system already marked as returning are "previous" until a client is linked.
update public.chat_conversations set contact_status = 'previous' where returning_customer and client_id is null and contact_status = 'new';

-- Clients whose mobile number equals the given one, whatever the formatting (0917 123 4567, +63 917 123 4567, 63917...). Compared on the last 10 digits.
-- The client record may be OLDER or NEWER than the chat: there is deliberately no date comparison.
create or replace function public.chat_clients_by_mobile(p_mobile text) returns table (id text, name text, mobile text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.mobile from public.clients c
  where c.deleted_at is null and length(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g')) >= 10
    and right(regexp_replace(coalesce(c.mobile, ''), '\D', '', 'g'), 10) = right(regexp_replace(p_mobile, '\D', '', 'g'), 10)
  limit 5;
$$;
revoke all on function public.chat_clients_by_mobile(text) from public, anon, authenticated;
grant execute on function public.chat_clients_by_mobile(text) to service_role;
