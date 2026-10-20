-- ResiboScan: multi-tenant schema. One company = one tenant; every row carries company_id and is protected by RLS.

create type member_role as enum ('owner', 'admin', 'staff', 'viewer');

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tin text not null default '',
  vat_registered boolean not null default false,
  address text not null default '',
  -- receipt scans allowed per calendar month; raise it for a customer with:
  --   update companies set scan_limit = 300 where id = '<company id>';
  scan_limit int not null default 100 check (scan_limit >= 0),
  created_at timestamptz not null default now()
);

create table memberships (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'staff',
  primary key (company_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  doc_type text not null default 'sales_invoice' check (doc_type in ('sales_invoice','official_receipt','cash_invoice','other')),
  supplier_name text not null default '',
  supplier_tin text not null default '',
  supplier_address text not null default '',
  supplier_vat_registered boolean not null default true,
  invoice_no text not null default '',
  doc_date date not null default current_date,
  vatable numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  vat_exempt numeric(14,2) not null default 0,
  zero_rated numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  withholding_tax numeric(14,2) not null default 0,
  atc text not null default '',
  purchase_type text not null default 'goods' check (purchase_type in ('goods','services','capital')),
  payment_method text not null default 'Cash',
  category text not null default 'Supplies',
  deductible boolean not null default true,
  notes text not null default '',
  status text not null default 'needs_review' check (status in ('needs_review','verified')),
  image_path text,
  image_hash text,
  confidence jsonb not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index receipts_company_date_idx on receipts(company_id, doc_date desc);
create index receipts_company_hash_idx on receipts(company_id, image_hash);

create table scan_usage (
  company_id uuid not null references companies(id) on delete cascade,
  month date not null,
  used int not null default 0,
  primary key (company_id, month)
);

create table audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  user_id uuid default auth.uid(),
  action text not null,
  receipt_id uuid,
  detail jsonb,
  at timestamptz not null default now()
);
create index audit_company_idx on audit_log(company_id, at desc);

-- ---------- helpers ----------
create function is_member(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where company_id = p_company and user_id = auth.uid());
$$;

create function can_write(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where company_id = p_company and user_id = auth.uid() and role in ('owner','admin','staff'));
$$;

create function can_admin(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where company_id = p_company and user_id = auth.uid() and role in ('owner','admin'));
$$;

-- signup: create the tenant and make the caller its owner
create function create_company(p_name text, p_tin text, p_vat_registered boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from memberships where user_id = auth.uid()) then raise exception 'account already has a company'; end if;
  insert into companies(name, tin, vat_registered) values (p_name, p_tin, p_vat_registered) returning id into cid;
  insert into memberships(company_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
end $$;

create function scans_used(p_company uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select used from scan_usage where company_id = p_company and month = date_trunc('month', now())::date), 0)
  where is_member(p_company);
$$;

-- called by the extract-receipt function (with the caller's JWT); atomically spends one scan or refuses
create function consume_scan(p_company uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  if not can_write(p_company) then raise exception 'not allowed'; end if;
  select scan_limit into lim from companies where id = p_company;
  insert into scan_usage(company_id, month, used) values (p_company, date_trunc('month', now())::date, 0) on conflict do nothing;
  update scan_usage set used = used + 1
    where company_id = p_company and month = date_trunc('month', now())::date and used < lim
    returning used into n;
  return n is not null;
end $$;

-- keep updated_at fresh and write an audit trail
create function receipts_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into audit_log(company_id, action, receipt_id, detail) values (old.company_id, 'delete', old.id, to_jsonb(old) - 'confidence');
    return old;
  end if;
  new.updated_at := now();
  insert into audit_log(company_id, action, receipt_id, detail)
    values (new.company_id, lower(tg_op), new.id, jsonb_build_object('total', new.total, 'status', new.status, 'invoice_no', new.invoice_no));
  return new;
end $$;
create trigger receipts_audit_trg before insert or update or delete on receipts for each row execute function receipts_audit();

-- ---------- row level security ----------
alter table companies enable row level security;
alter table memberships enable row level security;
alter table receipts enable row level security;
alter table scan_usage enable row level security;
alter table audit_log enable row level security;

create policy companies_select on companies for select using (is_member(id));
create policy companies_update on companies for update using (can_admin(id)) with check (can_admin(id));
-- scan_limit is not editable by clients: only these columns can be updated
revoke update on companies from authenticated;
grant update (name, tin, vat_registered, address) on companies to authenticated;

create policy memberships_select on memberships for select using (user_id = auth.uid() or is_member(company_id));

create policy receipts_select on receipts for select using (is_member(company_id));
create policy receipts_insert on receipts for insert with check (can_write(company_id));
create policy receipts_update on receipts for update using (can_write(company_id)) with check (can_write(company_id));
create policy receipts_delete on receipts for delete using (can_admin(company_id));

create policy usage_select on scan_usage for select using (is_member(company_id));
create policy audit_select on audit_log for select using (can_admin(company_id));

-- ---------- storage: private bucket, first folder = company id ----------
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict do nothing;

create policy receipts_obj_select on storage.objects for select
  using (bucket_id = 'receipts' and is_member(((storage.foldername(name))[1])::uuid));
create policy receipts_obj_insert on storage.objects for insert
  with check (bucket_id = 'receipts' and can_write(((storage.foldername(name))[1])::uuid));
create policy receipts_obj_update on storage.objects for update
  using (bucket_id = 'receipts' and can_write(((storage.foldername(name))[1])::uuid));
create policy receipts_obj_delete on storage.objects for delete
  using (bucket_id = 'receipts' and can_admin(((storage.foldername(name))[1])::uuid));
