-- READ-ONLY. Shows the clients that remove-clients.sql would delete, and what is attached to each.
-- Change the names in the list below (lower case) if you need to; the same list is at the top of remove-clients.sql.
with names(n) as (values ('test client delete me'), ('jen narciso')),
c as (select id, name from public.clients where deleted_at is null and lower(trim(name)) in (select n from names))
select c.name as client,
  (select count(*) from public.jobs j where j.client_id = c.id) as jobs,
  (select count(*) from public.quotations q where q.client_id = c.id) as quotations,
  (select count(*) from public.invoices i where i.client_id = c.id) as invoices,
  (select count(*) from public.payments p where p.client_id = c.id) as payments,
  (select count(*) from public.sites s where s.client_id = c.id) as sites
from c
union all
select '— clients that will STAY: ' || string_agg(name, ', '), null, null, null, null, null from public.clients where deleted_at is null and lower(trim(name)) not in (select n from names);
