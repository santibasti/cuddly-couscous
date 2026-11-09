-- The client's quotation link now also carries the pictures marked "show to client" (with any markup drawn on them), so the client sees what to look at before signing.
-- Same function as before (0052) plus an 'images' list: only shared, not deleted, up to 12, oldest first. Nothing else about the link changes.
create or replace function public.get_quotation_public(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quotation', jsonb_build_object('number', q.number, 'status', q.status, 'issue_date', q.issue_date, 'valid_until', q.valid_until, 'scope', q.scope, 'items', q.items,
      'vat_mode', q.vat_mode, 'vat_rate', q.vat_rate, 'discount', q.discount, 'terms', q.terms, 'payment_option', q.payment_option, 'method_sections', q.method_sections, 'ocular_done', coalesce(q.ocular_done, q.ocular_visit_id is not null), 'crew_size', q.crew_size, 'safety_officer', q.safety_officer,
      'work_days', q.work_days, 'disclaimer', q.disclaimer, 'intro', q.intro, 'methodology', q.methodology, 'sent_at', q.sent_at, 'decided_at', q.decided_at,
      'client_sig', q.client_sig, 'client_sig_name', q.client_sig_name, 'client_sig_at', q.client_sig_at),
    'client', jsonb_build_object('name', c.name, 'contact_person', c.contact_person, 'address', coalesce(nullif(c.address, ''), c.billing_address)),
    'site', case when s.id is null then null else jsonb_build_object('name', s.name, 'address', s.address) end,
    'company', (select data -> 'company' from public.settings where id = 'main'),
    'defaults', (select jsonb_build_object('intro', data ->> 'default_intro', 'methodology', data ->> 'default_methodology', 'disclaimer', data ->> 'default_disclaimer', 'crew', data ->> 'default_crew_size') from public.settings where id = 'main'),
    'images', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'category', i.category, 'caption', i.caption, 'file', i.file, 'item_label', i.item_label) order by i.created_at)
                        from (select * from public.quote_images x where x.quotation_id = q.id and x.share_with_client and x.deleted_at is null order by x.created_at limit 12) i), '[]'::jsonb))
  from public.quotations q join public.clients c on c.id = q.client_id left join public.sites s on s.id = q.site_id
  where q.share_token = p_token and q.status in ('Sent', 'Approved') and q.deleted_at is null $$;
