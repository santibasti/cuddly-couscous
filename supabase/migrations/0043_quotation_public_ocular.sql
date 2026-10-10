-- the client's quotation link needs to know whether to show amounts (ocular done) or only the agreed rates
create or replace function public.get_quotation_public(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quotation', jsonb_build_object('number', q.number, 'status', q.status, 'issue_date', q.issue_date, 'valid_until', q.valid_until, 'scope', q.scope, 'items', q.items,
      'vat_mode', q.vat_mode, 'vat_rate', q.vat_rate, 'discount', q.discount, 'terms', q.terms, 'payment_option', q.payment_option, 'ocular_done', coalesce(q.ocular_done, q.ocular_visit_id is not null), 'crew_size', q.crew_size, 'safety_officer', q.safety_officer,
      'work_days', q.work_days, 'disclaimer', q.disclaimer, 'intro', q.intro, 'methodology', q.methodology, 'sent_at', q.sent_at, 'decided_at', q.decided_at,
      'client_sig', q.client_sig, 'client_sig_name', q.client_sig_name, 'client_sig_at', q.client_sig_at),
    'client', jsonb_build_object('name', c.name, 'contact_person', c.contact_person, 'address', coalesce(nullif(c.address, ''), c.billing_address)),
    'site', case when s.id is null then null else jsonb_build_object('name', s.name, 'address', s.address) end,
    'company', (select data -> 'company' from public.settings where id = 'main'),
    'defaults', (select jsonb_build_object('intro', data ->> 'default_intro', 'methodology', data ->> 'default_methodology', 'disclaimer', data ->> 'default_disclaimer', 'crew', data ->> 'default_crew_size') from public.settings where id = 'main'))
  from public.quotations q join public.clients c on c.id = q.client_id left join public.sites s on s.id = q.site_id
  where q.share_token = p_token and q.status in ('Sent', 'Approved') and q.deleted_at is null $$;
