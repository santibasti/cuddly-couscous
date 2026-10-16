-- Multi-day projects: a service report can have an end date as well as a start date.
alter table public.service_reports add column service_end_date date;
