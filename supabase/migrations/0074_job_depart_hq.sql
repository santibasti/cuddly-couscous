-- The time the crew leaves HQ on the service day (HH:mm), set on the booking form so everyone knows.
alter table public.jobs add column depart_hq text;
