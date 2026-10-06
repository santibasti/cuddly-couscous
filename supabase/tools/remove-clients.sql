-- Removes the test clients listed below, with EVERYTHING attached to them (bookings, quotations, invoices, payments, service reports, sites, follow-ups ...).
-- Equipment that was out on their jobs is put back to Available; stock issued to their jobs is removed from the movements (so on-hand goes back).
-- Run supabase/tools/preview-remove-clients.sql first. One transaction: if anything fails, nothing changes. The audit trail is not touched.
begin;
set local session_replication_role = replica;

create temp table _c on commit drop as select id from public.clients where lower(trim(name)) in ('test client delete me', 'jen narciso');   -- <— names to remove (lower case)
create temp table _j on commit drop as select id from public.jobs where client_id in (select id from _c);
insert into _j select b.job_id from public.back_jobs b where (b.origin_job_id in (select id from _j) or b.client_id in (select id from _c)) and b.job_id not in (select id from _j);

delete from public.payments            where client_id in (select id from _c) or invoice_id in (select id from public.invoices where client_id in (select id from _c) or job_id in (select id from _j));
delete from public.payment_confirmations where client_id in (select id from _c) or job_id in (select id from _j);
delete from public.invoices            where client_id in (select id from _c) or job_id in (select id from _j);
delete from public.client_feedback     where client_id in (select id from _c) or job_id in (select id from _j);
delete from public.back_jobs           where client_id in (select id from _c) or job_id in (select id from _j) or origin_job_id in (select id from _j);
delete from public.discount_requests   where client_id in (select id from _c) or job_id in (select id from _j);
delete from public.variations          where job_id in (select id from _j);
delete from public.incidents           where job_id in (select id from _j);
delete from public.workflows           where job_id in (select id from _j);
delete from public.checkouts           where job_id in (select id from _j);
delete from public.requests            where job_id in (select id from _j);
delete from public.stock               where job_id in (select id from _j);
delete from public.quote_images        where job_id in (select id from _j) or quotation_id in (select id from public.quotations where client_id in (select id from _c));
delete from public.job_orders          where client_id in (select id from _c) or job_id in (select id from _j);
delete from public.followups           where client_id in (select id from _c);
delete from public.followup_rules      where client_id in (select id from _c);
delete from public.expenses            where job_id in (select id from _j);
update public.attendance set job_id = null where job_id in (select id from _j);
delete from public.ocular_visits       where client_id in (select id from _c);
delete from public.jobs                where id in (select id from _j);
delete from public.quotations          where client_id in (select id from _c);
delete from public.inquiries           where client_id in (select id from _c);
delete from public.communications      where client_id in (select id from _c);
delete from public.complaints          where client_id in (select id from _c);
delete from public.sites               where client_id in (select id from _c);
delete from public.clients             where id in (select id from _c);

-- equipment that was waiting on those jobs
update public.assets a set status = 'Available' where a.status in ('In Use', 'Reserved') and not exists (select 1 from public.checkouts c where c.asset_id = a.id and c.status = 'Released' and c.deleted_at is null);

commit;
select name as "clients left" from public.clients order by name;
