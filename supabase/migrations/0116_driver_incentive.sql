-- Driver incentive: an employee can be marked as a driver with a fixed incentive per day they drive; the booking (job order) names the one driver of the van
-- (two drivers may ride together, only the one chosen earns the incentive). The incentive is paid through payroll for each day they attended as the chosen driver and shows in the crew's own earnings.
alter table public.employees add column if not exists is_driver boolean not null default false, add column if not exists driver_incentive numeric(12,2) not null default 0 check (driver_incentive >= 0);
alter table public.jobs add column if not exists driver_id text references public.employees (id) on delete set null;
