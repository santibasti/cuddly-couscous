-- The client can sign through the link also when the office already marked the quotation Approved (e.g. after a phone call) but no signature was captured yet.
create or replace function public.accept_quotation_public(p_token text, p_name text, p_sig text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q public.quotations%rowtype;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Please type your full name.'; end if;
  if p_sig is null or p_sig !~ '^data:image/png;base64,' or length(p_sig) > 600000 then raise exception 'Please sign in the signature box.'; end if;
  select * into q from public.quotations where share_token = p_token and deleted_at is null for update;
  if not found then raise exception 'This link is not available.'; end if;
  if q.status = 'Approved' and q.client_sig is not null then raise exception 'This quotation was already accepted and signed.'; end if;
  -- Sent, or already marked Approved in the office but not yet signed by the client (the client can still sign to confirm)
  if q.status not in ('Sent', 'Approved') then raise exception 'This quotation is not open for acceptance. Please contact us.'; end if;
  if q.status = 'Sent' and q.valid_until < (now() at time zone 'Asia/Manila')::date then raise exception 'This quotation has expired (valid until %). Please contact us for an updated one.', q.valid_until; end if;
  update public.quotations set status = 'Approved', decided_at = coalesce(decided_at, now()), client_sig = p_sig, client_sig_name = trim(p_name), client_sig_at = now(), client_sig_note = 'Accepted online through the share link' where id = q.id;
  if q.inquiry_id is not null and q.status = 'Sent' then update public.inquiries set stage = 'Booked' where id = q.inquiry_id; end if;
  return jsonb_build_object('ok', true, 'number', q.number);
end $$;
