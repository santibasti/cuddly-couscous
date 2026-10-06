-- Employee rating (1–5 stars) from the monthly scorecard, stored on the employee record so each person can read their own
-- (migration 0025 lets a login read only its own employee row) and Admin sees the whole team. Updated by Admin / Operations sessions.
alter table public.employees
  add column if not exists rating numeric(2,1) check (rating between 1 and 5),
  add column if not exists rating_parts jsonb,
  add column if not exists rating_at date;
