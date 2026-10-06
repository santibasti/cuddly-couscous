-- Quotations: manpower deployment (crew size, designated safety officer), estimated working days and an editable service disclaimer.
alter table public.quotations
  add column if not exists crew_size text, add column if not exists safety_officer boolean, add column if not exists work_days integer check (work_days > 0), add column if not exists disclaimer text;
