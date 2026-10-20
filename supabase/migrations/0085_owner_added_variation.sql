-- Owner / Operations can add a charge straight to a job's total bill (agreed with the client by message or phone): an approved variation marked 'owner_added'.
alter table public.variations drop constraint if exists variations_source_check;
alter table public.variations add constraint variations_source_check check (source in ('final_review','owner_added'));
