-- Owner alerts now state the peso amount (quotation total, additional scope total, final signed total).
create or replace function app.doc_total(p_items jsonb, p_discount numeric, p_mode text, p_rate numeric) returns numeric
language sql immutable as $$
  with s as (
    select coalesce(sum((i ->> 'qty')::numeric * (i ->> 'rate')::numeric), 0) as gross, coalesce(sum(coalesce((i ->> 'discount')::numeric, 0)), 0) as ld
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i)
  select round(case p_mode when 'exclusive' then greatest(0, gross - ld - coalesce(p_discount, 0)) * (1 + coalesce(p_rate, 0) / 100) else greatest(0, gross - ld - coalesce(p_discount, 0)) end, 2) from s $$;

create or replace function app.peso(p numeric) returns text language sql immutable as $$ select '₱' || to_char(coalesce(p, 0), 'FM999,999,999,990.00') $$;

create or replace function app.alert_quotation() returns trigger language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  if (new.client_sig_at is not null and old.client_sig_at is null) or (new.status = 'Approved' and old.status is distinct from 'Approved') then
    select name into cname from public.clients where id = new.client_id;
    perform app.queue_alert('quotation', 'Quotation approved', coalesce(new.number, 'A quotation') || ' for ' || coalesce(cname, 'a client') || ' — ' ||
      app.peso(app.doc_total(new.items, new.discount, new.vat_mode, new.vat_rate)) || (case when new.vat_mode = 'none' then '' else ' incl. VAT' end) || ' — was ' ||
      case when new.client_sig_at is not null and old.client_sig_at is null then 'signed by ' || coalesce(new.client_sig_name, 'the client') else 'approved' end, '/sales/quote/' || new.id);
  end if;
  return new;
end $$;

create or replace function app.alert_variation() returns trigger language plpgsql security definer set search_path = public as $$
declare jn text;
begin
  if new.status = 'Approved' and (tg_op = 'INSERT' or old.status is distinct from 'Approved') then
    select number into jn from public.jobs where id = new.job_id;
    perform app.queue_alert('variation', 'Additional scope approved', coalesce(new.number, 'Additional work') || ' on ' || coalesce(jn, 'a job') || ': ' ||
      app.peso(app.doc_total(new.items, new.discount, new.vat_mode, new.vat_rate)) || (case when new.vat_mode = 'none' then '' else ' incl. VAT' end) || ' approved by the client' ||
      case when new.client_name is not null then ' (' || new.client_name || ')' else '' end, '/jobs/' || new.job_id);
  end if;
  return new;
end $$;

create or replace function app.alert_workflow() returns trigger language plpgsql security definer set search_path = public as $$
declare jn text; cname text;
begin
  if new.conf_at is not null and old.conf_at is null and new.conf_mode = 'approval' then
    select j.number, c.name into jn, cname from public.jobs j left join public.clients c on c.id = j.client_id where j.id = new.job_id;
    perform app.queue_alert('conforme', 'Client signed on site', coalesce(cname, 'The client') || ' signed the scope / final quote for ' || coalesce(jn, 'a job') || ' on site' ||
      case when new.conf_final_total is not null then ' — final total ' || app.peso(new.conf_final_total) else '' end ||
      case when new.conf_name is not null then ' (' || new.conf_name || ')' else '' end, '/jobs/' || new.job_id);
  end if;
  return new;
end $$;
