-- Reuse existing SECURITY DEFINER role resolver instead of querying private profiles directly in RLS.
drop policy if exists email_owner_read on public.email_threads;
create policy email_owner_read on public.email_threads for select to authenticated
 using (app.user_role() in ('owner'::public.app_role,'ops'::public.app_role));
drop policy if exists email_audit_owner_read on public.email_audit;
create policy email_audit_owner_read on public.email_audit for select to authenticated
 using (app.user_role() = 'owner'::public.app_role);
