-- Permit authenticated admins to read through RLS; never allow browser writes.
grant select on table public.email_threads to authenticated;
grant select on table public.email_audit to authenticated;
revoke all on table public.email_threads from anon;
revoke all on table public.email_audit from anon;
revoke insert, update, delete on table public.email_threads from authenticated;
revoke insert, update, delete on table public.email_audit from authenticated;
