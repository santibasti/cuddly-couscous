-- starter package panels for the on-site glass count (the excess over it is the additional work)
alter table public.workflows add column if not exists package_panels integer check (package_panels is null or package_panels >= 0);
