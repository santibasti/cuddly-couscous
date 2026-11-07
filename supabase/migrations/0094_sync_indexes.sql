-- Speed: the app asks every table "what changed since I last looked?" (updated_at >= X order by updated_at, id) every 30-90 seconds per person.
-- No table had an index for that, so each check scanned and sorted the whole table. These indexes make each check a quick lookup.
do $$
declare t text;
begin
  foreach t in array array['branches', 'clients', 'sites', 'communications', 'complaints', 'services', 'inquiries', 'quotations', 'employees', 'jobs', 'attendance', 'corrections', 'holidays', 'reviews', 'adjustments', 'periods', 'runs', 'locations', 'items', 'stock', 'requests', 'assets', 'checkouts', 'tickets', 'invoices', 'payments', 'expenses', 'petty', 'workflows', 'variations', 'incidents', 'discount_requests', 'client_feedback', 'back_jobs', 'payment_confirmations', 'ocular_visits', 'quote_images', 'followups', 'followup_rules', 'job_orders', 'service_reports', 'maint_profiles', 'maint_plans', 'maint_templates', 'maint_records'] loop
    if to_regclass('public.' || t) is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
      execute format('create index if not exists %I on public.%I (updated_at, id)', t || '_updated_at_idx', t);
    end if;
  end loop;
end $$;
