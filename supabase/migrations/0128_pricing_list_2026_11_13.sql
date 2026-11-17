-- The price records follow the TopMop Master Service Pricing List of 13 November 2026.
-- Glass: base package ₱4,799 for 31 panels, then ₱5,799 / 41, ₱6,799 / 41 and ₱12,799 / 51; every extra panel ₱140 (the same list the chat and Quick booking use: supabase/functions/_shared/rates.ts).
-- Other services: roof ₱145/sqm (min 100), exterior wall ₱125/sqm (min 50), floor / driveway ₱125/sqm (min 50), solar ₱245/panel (min 20).
-- Quotation-only: gutter, ACP, interior wall and ceiling, and anything specialised (façade, post-construction glass, commercial windows, manlift) stays "custom quote".
update public.services set package_price = 4799, package_qty = 31, excess_rate = 140, rate = 140, minimum_qty = 1, custom_quote = false,
  packages = '[{"id":"pk-5799-41","price":5799,"qty":41,"excess_rate":140},{"id":"pk-6799-41","price":6799,"qty":41,"excess_rate":140},{"id":"pk-12799-51","price":12799,"qty":51,"excess_rate":140}]'::jsonb
 where code = 'GLASS_EXT';
update public.services set rate = 145, minimum_qty = 100, unit = 'sqm', custom_quote = false where code = 'ROOF';
update public.services set rate = 125, minimum_qty = 50, unit = 'sqm', custom_quote = false, name = 'Exterior Wall Cleaning' where code = 'WALL';
update public.services set rate = 125, minimum_qty = 50, unit = 'sqm', custom_quote = false, name = 'Floor / Driveway Cleaning' where code = 'FLOOR';
update public.services set rate = 245, minimum_qty = 20, unit = 'panel', custom_quote = false where code = 'SOLAR';
update public.services set custom_quote = true, name = 'Gutter Cleaning / Vacuuming' where code = 'GUTTER';
update public.services set custom_quote = true, name = 'ACP Cleaning' where code = 'ACP';
update public.services set custom_quote = true, name = 'Interior Wall & Ceiling Dry Cleaning' where code = 'CEILING';
