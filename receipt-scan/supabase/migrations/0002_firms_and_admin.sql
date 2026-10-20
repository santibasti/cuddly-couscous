-- 0002: accounting-firm accounts (many client workspaces per login) and the platform-owner console.
--
-- Make yourself the platform owner (run once in the SQL editor, after you have signed up):
--   insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';

-- ---------- company status (owner can pause an account) ----------
alter table companies add column status text not null default 'active' check (status in ('active', 'suspended'));

-- ---------- profiles: what kind of account a login is ----------
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null default 'business' check (kind in ('business', 'firm')),
  display_name text not null default '',
  -- how many client workspaces a firm may create; raise per firm from the owner console
  max_clients int not null default 10 check (max_clients >= 0),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy profiles_select on profiles for select using (user_id = auth.uid());

-- platform owners: no policies on purpose, so clients can never read or write this table
create table platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table platform_admins enable row level security;

create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- a paused company can still be read but not written to
create or replace function can_write(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join companies c on c.id = m.company_id
    where m.company_id = p_company and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'staff') and c.status = 'active'
  );
$$;

create or replace function consume_scan(p_company uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare lim int; st text; n int;
begin
  if not exists (select 1 from memberships where company_id = p_company and user_id = auth.uid() and role in ('owner', 'admin', 'staff')) then
    raise exception 'not allowed';
  end if;
  select scan_limit, status into lim, st from companies where id = p_company;
  if st <> 'active' then raise exception 'This account is paused — contact support'; end if;
  insert into scan_usage(company_id, month, used) values (p_company, date_trunc('month', now())::date, 0) on conflict do nothing;
  update scan_usage set used = used + 1
    where company_id = p_company and month = date_trunc('month', now())::date and used < lim
    returning used into n;
  return n is not null;
end $$;

-- ---------- signup / add client ----------
drop function create_company(text, text, boolean);

-- business: creates the profile and its one company. firm: creates only the profile (clients are added later).
create function signup_setup(p_kind text, p_name text, p_tin text, p_vat boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_kind not in ('business', 'firm') then raise exception 'unknown account type'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name is required'; end if;
  if exists (select 1 from profiles where user_id = auth.uid()) or exists (select 1 from memberships where user_id = auth.uid()) then
    raise exception 'account already set up';
  end if;
  insert into profiles(user_id, kind, display_name) values (auth.uid(), p_kind, trim(p_name));
  if p_kind = 'business' then
    insert into companies(name, tin, vat_registered) values (trim(p_name), coalesce(p_tin, ''), coalesce(p_vat, false)) returning id into cid;
    insert into memberships(company_id, user_id, role) values (cid, auth.uid(), 'owner');
  end if;
  return cid;
end $$;

create function add_client(p_name text, p_tin text, p_vat boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; lim int; have int;
begin
  select max_clients into lim from profiles where user_id = auth.uid() and kind = 'firm';
  if lim is null then raise exception 'only accounting-firm accounts can add clients'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'client name is required'; end if;
  select count(*) into have from memberships where user_id = auth.uid() and role = 'owner';
  if have >= lim then raise exception 'Client limit reached (%) — contact support to add more', lim; end if;
  insert into companies(name, tin, vat_registered) values (trim(p_name), coalesce(p_tin, ''), coalesce(p_vat, false)) returning id into cid;
  insert into memberships(company_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
end $$;

-- ---------- per-company numbers for the client list and the owner console ----------
create function company_stats_for(p_admin boolean) returns table (
  id uuid, name text, tin text, vat_registered boolean, status text, scan_limit int, scans_used int,
  receipts_total int, receipts_month int, needs_review int, spend_month numeric, last_activity timestamptz,
  created_at timestamptz, owner_email text, my_role text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.tin, c.vat_registered, c.status, c.scan_limit,
    coalesce(u.used, 0)::int,
    (select count(*) from receipts r where r.company_id = c.id)::int,
    (select count(*) from receipts r where r.company_id = c.id and r.doc_date >= date_trunc('month', current_date))::int,
    (select count(*) from receipts r where r.company_id = c.id and r.status = 'needs_review')::int,
    (select coalesce(sum(r.total), 0) from receipts r where r.company_id = c.id and r.doc_date >= date_trunc('month', current_date))::numeric,
    (select max(r.created_at) from receipts r where r.company_id = c.id),
    c.created_at,
    case when p_admin then (select au.email::text from memberships m join auth.users au on au.id = m.user_id where m.company_id = c.id and m.role = 'owner' limit 1) end,
    (select m.role::text from memberships m where m.company_id = c.id and m.user_id = auth.uid())
  from companies c
  left join scan_usage u on u.company_id = c.id and u.month = date_trunc('month', now())::date
  where (p_admin and is_platform_admin()) or (not p_admin and is_member(c.id))
  order by c.name;
$$;

create function my_company_stats() returns table (
  id uuid, name text, tin text, vat_registered boolean, status text, scan_limit int, scans_used int,
  receipts_total int, receipts_month int, needs_review int, spend_month numeric, last_activity timestamptz,
  created_at timestamptz, owner_email text, my_role text
) language sql stable security definer set search_path = public as $$ select * from company_stats_for(false) $$;

create function admin_company_stats() returns table (
  id uuid, name text, tin text, vat_registered boolean, status text, scan_limit int, scans_used int,
  receipts_total int, receipts_month int, needs_review int, spend_month numeric, last_activity timestamptz,
  created_at timestamptz, owner_email text, my_role text
) language sql stable security definer set search_path = public as $$ select * from company_stats_for(true) $$;

-- ---------- owner-only actions ----------
create function admin_update_company(p_id uuid, p_scan_limit int, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'bad status'; end if;
  if p_scan_limit is null or p_scan_limit < 0 then raise exception 'bad scan limit'; end if;
  update companies set scan_limit = p_scan_limit, status = p_status where id = p_id;
  if not found then raise exception 'company not found'; end if;
end $$;

create function admin_list_firms() returns table (user_id uuid, email text, display_name text, clients int, max_clients int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, au.email::text, p.display_name,
    (select count(*) from memberships m where m.user_id = p.user_id and m.role = 'owner')::int, p.max_clients, p.created_at
  from profiles p join auth.users au on au.id = p.user_id
  where p.kind = 'firm' and is_platform_admin()
  order by p.display_name;
$$;

create function admin_update_firm(p_user uuid, p_max_clients int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  if p_max_clients is null or p_max_clients < 0 then raise exception 'bad client limit'; end if;
  update profiles set max_clients = p_max_clients where user_id = p_user and kind = 'firm';
  if not found then raise exception 'firm not found'; end if;
end $$;
