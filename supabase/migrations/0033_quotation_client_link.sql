-- Quotation share link: the client opens it without signing in, reads the quotation and accepts it with a drawn signature.
-- The acceptance is written straight to the quotation (status Approved + signature), so it shows up in the app.
alter table public.quotations
  add column if not exists share_token text, add column if not exists client_sig text, add column if not exists client_sig_name text,
  add column if not exists client_sig_at timestamptz, add column if not exists client_sig_note text;
update public.quotations set share_token = replace(gen_random_uuid()::text, '-', '') where share_token is null;
alter table public.quotations alter column share_token set default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists quotations_share_token_key on public.quotations (share_token);

-- what the client sees: client-facing fields only (never internal notes, cost or other clients)
create or replace function public.get_quotation_public(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quotation', jsonb_build_object('number', q.number, 'status', q.status, 'issue_date', q.issue_date, 'valid_until', q.valid_until, 'scope', q.scope, 'items', q.items,
      'vat_mode', q.vat_mode, 'vat_rate', q.vat_rate, 'discount', q.discount, 'terms', q.terms, 'crew_size', q.crew_size, 'safety_officer', q.safety_officer,
      'work_days', q.work_days, 'disclaimer', q.disclaimer, 'intro', q.intro, 'methodology', q.methodology, 'sent_at', q.sent_at, 'decided_at', q.decided_at,
      'client_sig', q.client_sig, 'client_sig_name', q.client_sig_name, 'client_sig_at', q.client_sig_at),
    'client', jsonb_build_object('name', c.name, 'contact_person', c.contact_person, 'address', coalesce(nullif(c.address, ''), c.billing_address)),
    'site', case when s.id is null then null else jsonb_build_object('name', s.name, 'address', s.address) end,
    'company', (select data -> 'company' from public.settings where id = 'main'),
    'defaults', (select jsonb_build_object('intro', data ->> 'default_intro', 'methodology', data ->> 'default_methodology', 'disclaimer', data ->> 'default_disclaimer', 'crew', data ->> 'default_crew_size') from public.settings where id = 'main'))
  from public.quotations q join public.clients c on c.id = q.client_id left join public.sites s on s.id = q.site_id
  where q.share_token = p_token and q.status in ('Sent', 'Approved') and q.deleted_at is null $$;

create or replace function public.accept_quotation_public(p_token text, p_name text, p_sig text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q public.quotations%rowtype;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Please type your full name.'; end if;
  if p_sig is null or p_sig !~ '^data:image/png;base64,' or length(p_sig) > 600000 then raise exception 'Please sign in the signature box.'; end if;
  select * into q from public.quotations where share_token = p_token and deleted_at is null for update;
  if not found then raise exception 'This link is not available.'; end if;
  if q.status = 'Approved' and q.client_sig is not null then raise exception 'This quotation was already accepted and signed.'; end if;
  if q.status <> 'Sent' then raise exception 'This quotation is not open for acceptance. Please contact us.'; end if;
  if q.valid_until < (now() at time zone 'Asia/Manila')::date then raise exception 'This quotation has expired (valid until %). Please contact us for an updated one.', q.valid_until; end if;
  update public.quotations set status = 'Approved', decided_at = now(), client_sig = p_sig, client_sig_name = trim(p_name), client_sig_at = now(), client_sig_note = 'Accepted online through the share link' where id = q.id;
  if q.inquiry_id is not null then update public.inquiries set stage = 'Booked' where id = q.inquiry_id; end if;
  return jsonb_build_object('ok', true, 'number', q.number);
end $$;

revoke all on function public.get_quotation_public(text) from public;
revoke all on function public.accept_quotation_public(text, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.get_quotation_public(text) to anon; grant execute on function public.accept_quotation_public(text, text, text) to anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.get_quotation_public(text) to authenticated; grant execute on function public.accept_quotation_public(text, text, text) to authenticated; end if;
end $$;
