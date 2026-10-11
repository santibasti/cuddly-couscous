-- "Would you recommend TopMop to your friends and family?" asked in the client rating
alter table public.client_feedback add column if not exists recommend text check (recommend is null or recommend in ('yes', 'maybe', 'no'));
