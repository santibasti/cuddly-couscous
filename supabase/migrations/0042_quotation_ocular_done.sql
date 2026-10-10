-- was an ocular visit done before this quotation? yes = the exact price is already agreed (the Job Order shows no prices); no = the Job Order shows the approved rates
alter table public.quotations add column if not exists ocular_done boolean;
