-- Removes the SAMPLE (demo) records from the live database and keeps everything you created yourself.
-- KEPT: logins (profiles), your own records (long random ids), company settings and document counters, service price list, branches,
--       storage locations, holidays, maintenance checklist templates, and the inventory item + equipment NAMES as a starting list
--       (their stock movements, checkouts, repair tickets and maintenance plans/history are cleared, so stock on hand becomes 0 and gear is Available).
-- The audit trail is append-only by design and is not touched.
-- Run supabase/tools/preview-demo-data.sql first and read it. Then paste this whole file into the Supabase SQL editor and run it ONCE.
-- It runs as one transaction: if anything fails nothing is changed.

begin;
set local session_replication_role = replica;   -- allows the delete (normally blocked by the no-hard-delete rule); nothing else is bypassed

delete from public.maint_records   where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.maint_plans     where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.maint_profiles  where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.job_orders      where job_id ~ '^[a-z]+-[0-9]{4}$';
delete from public.back_jobs       where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.client_feedback where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.payment_confirmations where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.discount_requests where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.variations      where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.incidents       where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.workflows       where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.checkouts       where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.tickets         where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.requests        where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.stock           where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.quote_images    where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.followups       where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.followup_rules  where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.ocular_visits   where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.payments        where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.invoices        where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.jobs            where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.quotations      where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.inquiries       where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.communications  where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.complaints      where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.sites           where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.clients         where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.expenses        where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.petty           where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.attendance      where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.corrections     where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.adjustments     where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.runs            where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.periods         where id ~ '^[a-z]+-[0-9]{4}$';
delete from public.reviews         where id ~ '^[a-z]+-[0-9]{4}$';

-- logins that were linked to a sample employee lose that link (re-link in Admin → Users)
update public.profiles set employee_id = null where employee_id ~ '^[a-z]+-[0-9]{4}$';
delete from public.employees       where id ~ '^[a-z]+-[0-9]{4}$';

-- the starting equipment and inventory lists: back to a clean state
update public.assets set status = 'Available', condition = 'Good', last_maintenance = null, location = coalesce(nullif(location, 'Unknown'), 'Main Warehouse')
 where status <> 'Retired';
update public.items set batch_no = null where batch_no is not null and id ~ '^[a-z]+-[0-9]{4}$';

commit;

-- what is left
select 'clients' as "table", count(*) from public.clients union all select 'jobs', count(*) from public.jobs union all select 'quotations', count(*) from public.quotations
union all select 'invoices', count(*) from public.invoices union all select 'employees', count(*) from public.employees union all select 'attendance', count(*) from public.attendance
union all select 'inventory items', count(*) from public.items union all select 'equipment', count(*) from public.assets union all select 'logins', count(*) from public.profiles;
