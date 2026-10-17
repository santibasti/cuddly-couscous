-- Employee photo / avatar: a small square picture (about 256 px, stored as a data URL) shown on the attendance cards.
alter table public.employees add column avatar text;
