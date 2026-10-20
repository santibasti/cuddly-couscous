-- Crew and Team Leader logins timed out reading the activity log: the policy called app.has_perm() once per row, so a login with no access made the
-- database test every row of a growing table. Wrapping the call in (select …) makes it run once per query.
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select using ((select app.has_perm('admin.audit')));
