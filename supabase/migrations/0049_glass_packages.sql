-- more than one glass package: price for N panels, with its own excess rate per panel
alter table public.services add column if not exists packages jsonb;
update public.services set packages = '[
  {"id":"pk-5700-41","price":5700,"qty":41,"excess_rate":140},
  {"id":"pk-6799-41","price":6799,"qty":41,"excess_rate":140},
  {"id":"pk-7799-41","price":7799,"qty":41,"excess_rate":140},
  {"id":"pk-12799-51","price":12799,"qty":51,"excess_rate":140}]'::jsonb
where code = 'GLASS_EXT' and packages is null;
