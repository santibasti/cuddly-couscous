-- Owner alerts by WhatsApp / SMS: the database records an alert the moment it happens (even with nobody logged in),
-- and the `send-alerts` Edge Function delivers it. Alerts: quotation approved/signed, client signed on site, additional scope approved, discount requested.
create table public.alert_outbox (
  id bigint generated always as identity primary key,
  kind text not null, title text not null, body text not null, link text,
  created_at timestamptz not null default now(),
  sent_at timestamptz, attempts int not null default 0, error text
);
alter table public.alert_outbox enable row level security;
create policy alert_outbox_select on public.alert_outbox for select using (app.has_perm('admin.settings'));

create or replace function app.queue_alert(p_kind text, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.alert_outbox (kind, title, body, link) values (p_kind, p_title, p_body, p_link);
exception when others then null; -- an alert problem must never block a signature or a request
end $$;

create or replace function app.alert_quotation() returns trigger language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  if (new.client_sig_at is not null and old.client_sig_at is null) or (new.status = 'Approved' and old.status is distinct from 'Approved') then
    select name into cname from public.clients where id = new.client_id;
    perform app.queue_alert('quotation', 'Quotation approved', coalesce(new.number, 'A quotation') || ' for ' || coalesce(cname, 'a client') || ' was ' ||
      case when new.client_sig_at is not null and old.client_sig_at is null then 'signed by ' || coalesce(new.client_sig_name, 'the client') else 'approved' end, '/sales/quote/' || new.id);
  end if;
  return new;
end $$;
create trigger alert_quotation after update on public.quotations for each row execute function app.alert_quotation();

create or replace function app.alert_variation() returns trigger language plpgsql security definer set search_path = public as $$
declare jn text;
begin
  if new.status = 'Approved' and (tg_op = 'INSERT' or old.status is distinct from 'Approved') then
    select number into jn from public.jobs where id = new.job_id;
    perform app.queue_alert('variation', 'Additional scope approved', coalesce(new.number, 'Additional work') || ' on ' || coalesce(jn, 'a job') || ' was approved by the client' ||
      case when new.client_name is not null then ' (' || new.client_name || ')' else '' end, '/jobs/' || new.job_id);
  end if;
  return new;
end $$;
create trigger alert_variation after insert or update on public.variations for each row execute function app.alert_variation();

create or replace function app.alert_workflow() returns trigger language plpgsql security definer set search_path = public as $$
declare jn text; cname text;
begin
  if new.conf_at is not null and old.conf_at is null and new.conf_mode = 'approval' then
    select j.number, c.name into jn, cname from public.jobs j left join public.clients c on c.id = j.client_id where j.id = new.job_id;
    perform app.queue_alert('conforme', 'Client signed on site', coalesce(cname, 'The client') || ' signed the scope / final quote for ' || coalesce(jn, 'a job') || ' on site' ||
      case when new.conf_name is not null then ' (' || new.conf_name || ')' else '' end, '/jobs/' || new.job_id);
  end if;
  return new;
end $$;
create trigger alert_workflow after update on public.workflows for each row execute function app.alert_workflow();

create or replace function app.alert_discount() returns trigger language plpgsql security definer set search_path = public as $$
declare jn text; cname text;
begin
  select j.number, c.name into jn, cname from public.jobs j left join public.clients c on c.id = j.client_id where j.id = new.job_id;
  perform app.queue_alert('discount', 'Discount requested', new.number || ' · ' || coalesce(jn, 'a job') || ' · ' || coalesce(cname, '') || ': ₱' || to_char(new.requested_amount, 'FM999,999,990.00') || ' off ₱' || to_char(new.base_total, 'FM999,999,990.00') || ' — ' || new.reason, '/jobs/' || new.job_id);
  return new;
end $$;
create trigger alert_discount after insert on public.discount_requests for each row execute function app.alert_discount();
