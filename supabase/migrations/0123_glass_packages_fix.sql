-- The glass package list had two packages that TopMop does not have (₱5,700 and ₱7,799 for 41 panels, added by migration 0049).
-- The real packages are the ones in the rate list: ₱4,799 / 31 panels (the base), ₱5,799 / 41, ₱6,799 / 41 and ₱12,799 / 51. Only the two wrong ones are removed and the missing ₱5,799 package is added;
-- anything else in the list (a package added by hand in Admin → Pricing) is left as it is.
update public.services s set packages = (
  select jsonb_agg(p order by (p ->> 'price')::numeric)
  from (
    select p from jsonb_array_elements(coalesce(s.packages, '[]'::jsonb)) p where p ->> 'id' not in ('pk-5700-41', 'pk-7799-41')
    union all
    select '{"id":"pk-5799-41","price":5799,"qty":41,"excess_rate":140}'::jsonb
     where not exists (select 1 from jsonb_array_elements(coalesce(s.packages, '[]'::jsonb)) q where (q ->> 'price')::numeric = 5799)
  ) t(p))
where s.code = 'GLASS_EXT' and s.packages is not null
  and exists (select 1 from jsonb_array_elements(s.packages) x where x ->> 'id' in ('pk-5700-41', 'pk-7799-41'));
