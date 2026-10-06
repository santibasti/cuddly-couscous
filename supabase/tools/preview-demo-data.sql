-- READ-ONLY. Shows how many sample (demo) rows would be removed and how many of your own rows would stay.
-- Sample rows have ids like  cl-0007 / jb-0042  (letters, dash, four digits). Rows you created in the app have long random ids.
with t(tbl, demo, yours) as (
  select 'clients', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.clients where deleted_at is null union all
  select 'sites', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.sites where deleted_at is null union all
  select 'jobs', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.jobs where deleted_at is null union all
  select 'quotations', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.quotations where deleted_at is null union all
  select 'invoices', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.invoices where deleted_at is null union all
  select 'payments', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.payments where deleted_at is null union all
  select 'expenses', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.expenses where deleted_at is null union all
  select 'employees', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.employees where deleted_at is null union all
  select 'attendance', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.attendance where deleted_at is null union all
  select 'stock movements', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.stock where deleted_at is null union all
  select 'equipment out/in', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.checkouts where deleted_at is null union all
  select 'maintenance records', count(*) filter (where id ~ '^[a-z]+-[0-9]{4}$'), count(*) filter (where id !~ '^[a-z]+-[0-9]{4}$') from public.maint_records where deleted_at is null union all
  select 'inventory items (kept)', 0, count(*) from public.items where deleted_at is null union all
  select 'equipment (kept)', 0, count(*) from public.assets where deleted_at is null
)
select tbl as "table", demo as "sample rows to remove", yours as "your rows that stay" from t;

-- logins linked to a SAMPLE employee (they would lose the link; re-link them in Admin → Users)
select p.email, p.employee_id as sample_employee_id from public.profiles p where p.employee_id ~ '^[a-z]+-[0-9]{4}$';
-- your own records that point at a sample record: the cleanup removes these too (they were test entries against sample data)
select 'job → sample client/site' as what, count(*) from public.jobs j where j.id !~ '^[a-z]+-[0-9]{4}$' and (j.client_id ~ '^[a-z]+-[0-9]{4}$' or j.site_id ~ '^[a-z]+-[0-9]{4}$')
union all select 'quotation → sample client', count(*) from public.quotations q where q.id !~ '^[a-z]+-[0-9]{4}$' and q.client_id ~ '^[a-z]+-[0-9]{4}$'
union all select 'invoice → sample client/job', count(*) from public.invoices i where i.id !~ '^[a-z]+-[0-9]{4}$' and (i.client_id ~ '^[a-z]+-[0-9]{4}$' or i.job_id ~ '^[a-z]+-[0-9]{4}$')
union all select 'payment → sample invoice', count(*) from public.payments p where p.id !~ '^[a-z]+-[0-9]{4}$' and p.invoice_id ~ '^[a-z]+-[0-9]{4}$'
union all select 'stock / checkout / request → sample job', (select count(*) from public.stock where id !~ '^[a-z]+-[0-9]{4}$' and job_id ~ '^[a-z]+-[0-9]{4}$') + (select count(*) from public.checkouts where id !~ '^[a-z]+-[0-9]{4}$' and job_id ~ '^[a-z]+-[0-9]{4}$') + (select count(*) from public.requests where id !~ '^[a-z]+-[0-9]{4}$' and job_id ~ '^[a-z]+-[0-9]{4}$')
union all select 'workflow / feedback / variation → sample job', (select count(*) from public.workflows where id !~ '^[a-z]+-[0-9]{4}$' and job_id ~ '^[a-z]+-[0-9]{4}$') + (select count(*) from public.client_feedback where id !~ '^[a-z]+-[0-9]{4}$' and (job_id ~ '^[a-z]+-[0-9]{4}$' or client_id ~ '^[a-z]+-[0-9]{4}$')) + (select count(*) from public.variations where id !~ '^[a-z]+-[0-9]{4}$' and job_id ~ '^[a-z]+-[0-9]{4}$')
union all select 'expense → sample job', (select count(*) from public.expenses where id !~ '^[a-z]+-[0-9]{4}$' and job_id ~ '^[a-z]+-[0-9]{4}$');
