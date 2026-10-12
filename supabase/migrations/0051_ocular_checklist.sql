-- ocular visit site checklist (access, water supply, glass condition, roof steepness, …); length/width of measured areas live inside the measurements jsonb
alter table public.ocular_visits add column if not exists checklist jsonb not null default '[]';
