-- Geographic client insights: saved map position for every service address, plus the Admin / CEO "executive dashboard" permission.
-- Addresses are placed by city / area when saved and refined to a street-level point in the background; unmappable ones are flagged (never blocking).
alter table public.sites add column if not exists city text, add column if not exists province text,
  add column if not exists geo_status text, add column if not exists geo_source text, add column if not exists geo_precision text,
  add column if not exists geo_address text, add column if not exists geo_at timestamptz, add column if not exists geo_tries int;
alter table public.clients add column if not exists lat double precision, add column if not exists lng double precision, add column if not exists city text, add column if not exists province text,
  add column if not exists geo_status text, add column if not exists geo_source text, add column if not exists geo_precision text,
  add column if not exists geo_address text, add column if not exists geo_at timestamptz, add column if not exists geo_tries int;
alter table public.ocular_visits add column if not exists lat double precision, add column if not exists lng double precision, add column if not exists city text, add column if not exists province text,
  add column if not exists geo_status text, add column if not exists geo_source text, add column if not exists geo_precision text,
  add column if not exists geo_address text, add column if not exists geo_at timestamptz, add column if not exists geo_tries int;
create index if not exists sites_city_idx on public.sites (province, city) where deleted_at is null;

-- Only the Owner / Admin (CEO) sees exact client locations and revenue / collections / profitability by client and area.
insert into public.role_permissions (role, permission) values ('owner', 'dashboard.executive') on conflict do nothing;
