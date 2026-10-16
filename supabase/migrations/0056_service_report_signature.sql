-- A service report is signed by TopMop (Admin / Operations) before it can be downloaded or shared.
alter table public.service_reports add column signature text, add column signed_by text, add column signed_at timestamptz;

create or replace function app.guard_sr_signature() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.signature is distinct from old.signature or new.signed_by is distinct from old.signed_by or new.signed_at is distinct from old.signed_at) and not app.has_perm('jobs.all') then
    raise exception 'Only Admin / Operations can sign or reopen a service report.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_guard_sr_signature before update on public.service_reports for each row execute function app.guard_sr_signature();
