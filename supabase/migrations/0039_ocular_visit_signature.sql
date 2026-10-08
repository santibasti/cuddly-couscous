-- Ocular visit: the contact person signs on site when the visit is completed (proof that the visit took place).
alter table public.ocular_visits add column if not exists visit_sig text, add column if not exists visit_sig_name text, add column if not exists visit_sig_at timestamptz;
