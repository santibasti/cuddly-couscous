\set ON_ERROR_STOP off

create or replace function t_as(u text) returns void language plpgsql as $$ begin perform set_config('t.uid', u, false); end $$;
\echo '--- storage: portal client (u3), crew e1 (u4), crew e2 (u5), ops (u6)'
set role authenticated;
select t_as('00000000-0000-0000-0000-000000000003'); select 'portal sees objects: ' || count(*) from storage.objects where bucket_id='job-photos';
select t_as('00000000-0000-0000-0000-000000000004'); select 'crew e1 sees: ' || string_agg(name, ',' order by name) from storage.objects where bucket_id='job-photos';
select t_as('00000000-0000-0000-0000-000000000005'); select 'crew e2 sees: ' || coalesce(string_agg(name, ',' order by name), '') from storage.objects where bucket_id='job-photos';
select t_as('00000000-0000-0000-0000-000000000006'); select 'ops sees: ' || count(*) from storage.objects where bucket_id='job-photos';
\echo '--- storage insert: portal -> jA, crew e1 -> jA (own), crew e1 -> jB (not own), crew e1 -> ocular/oA, crew e2 -> ocular/oA'
select t_as('00000000-0000-0000-0000-000000000003'); insert into storage.objects(bucket_id,name) values ('job-photos','jA/x.jpg');
select t_as('00000000-0000-0000-0000-000000000004'); insert into storage.objects(bucket_id,name) values ('job-photos','jA/ok.jpg');
insert into storage.objects(bucket_id,name) values ('job-photos','jB/bad.jpg');
insert into storage.objects(bucket_id,name) values ('job-photos','ocular/oA/ok.jpg');
select t_as('00000000-0000-0000-0000-000000000005'); insert into storage.objects(bucket_id,name) values ('job-photos','ocular/oA/bad.jpg');
reset role;

set role authenticated;
\echo '--- settings: pricing user (u2) tries to grant itself admin.users'
select t_as('00000000-0000-0000-0000-000000000002');
update public.settings set data = jsonb_set(data, '{access,pricing}', '["admin.settings","admin.users"]') where id='main';
select 'access after pricing edit: ' || (data->'access')::text || ' rates: ' || (data->'rates')::text from public.settings;
update public.settings set data = jsonb_set(data, '{rates,x}', '2') where id='main';
select 'rates change allowed: ' || (data->'rates')::text from public.settings;
select 'role_permissions: ' || coalesce(string_agg(role||':'||permission, ','), 'none') from public.role_permissions;
\echo '--- owner (u1) changes the matrix'
select t_as('00000000-0000-0000-0000-000000000001');
update public.settings set data = jsonb_set(data, '{access,pricing}', '["admin.settings","sales.edit"]') where id='main';
select 'access after owner edit: ' || (data->'access')::text from public.settings;
\echo '--- portal (u3): edit quotation content / decision / read jobs'
select t_as('00000000-0000-0000-0000-000000000003');
update public.quotations set items = '[{"rate":1}]' where id='qA';
update public.quotations set reject_reason='no thanks', decided_at=now() where id='qA';
select 'quote after: ' || items::text || ' / ' || coalesce(reject_reason,'') from public.quotations where id='qA';
select 'portal direct jobs rows: ' || count(*) from public.jobs;
select 'portal_jobs(): ' || (select count(*) from public.portal_jobs()) || ' keys=' || (select string_agg(k, ',' order by k) from (select jsonb_object_keys(x) k from public.portal_jobs() x limit 20) s);
\echo '--- job_photos: ocular assignee e1 (u4)'
select t_as('00000000-0000-0000-0000-000000000004');
insert into public.job_photos(id,job_id,client_id,ocular_id,path) values ('n1','jB','c2','oA','ocular/oA/n1.jpg');
insert into public.job_photos(id,job_id,client_id,ocular_id,path,client_ok) values ('n2',null,'c1','oA','ocular/oA/n2.jpg',true);
insert into public.job_photos(id,job_id,client_id,ocular_id,path) values ('n3',null,'c2','oA','ocular/oA/n3.jpg');
insert into public.job_photos(id,job_id,client_id,ocular_id,path) values ('n4',null,'c1','oA','ocular/oA/n4.jpg');
insert into public.job_photos(id,job_id,client_id,path) values ('n5','jA','c1','jA/n5.jpg');
update public.job_photos set client_ok = true where id='n4';
update public.job_photos set job_id='jB', client_id='c2' where id='n4';
update public.job_photos set caption='fixed caption' where id='n4';
select 'rows by e1: ' || string_agg(id||':'||coalesce(job_id,'-')||':'||client_ok, ',' order by id) from public.job_photos where id like 'n%';
select t_as('00000000-0000-0000-0000-000000000006');
update public.job_photos set client_ok = true where id='n4';
update public.job_photos set job_id='jA' where id='n4';
select 'ops edit ok: ' || client_ok || ' ' || job_id from public.job_photos where id='n4';
reset role;
