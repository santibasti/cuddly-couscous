-- Office-only "Remove from the booking": a variation with kind = 'reduction' is subtracted from the final bill (the client dropped a package / service).
alter table public.variations add column if not exists kind text check (kind is null or kind = 'reduction');
