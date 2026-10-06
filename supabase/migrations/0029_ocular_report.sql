-- Ocular report: the estimator's recommendation and the client's signed acknowledgement of the findings (locked once signed).
alter table public.ocular_visits
  add column if not exists report_surface text, add column if not exists report_hazards text, add column if not exists report_recommendation text,
  add column if not exists report_services jsonb, add column if not exists report_days integer check (report_days >= 1), add column if not exists report_crew text, add column if not exists report_at timestamptz,
  add column if not exists client_sig text, add column if not exists client_sig_name text, add column if not exists client_sig_at timestamptz,
  add column if not exists assessor_sig text, add column if not exists assessor_sig_at timestamptz;

-- once the client has signed, the findings and the report are locked; only Admin / Operations may reopen it (clear the signature) and only the quotation link / status may follow
create or replace function app.guard_ocular_signed() returns trigger language plpgsql as $$
declare ok text[] := array['status','quotation_id','converted_at','updated_at','updated_by'];
begin
  if old.client_sig is not null then
    if new.client_sig is null then
      if auth.uid() is not null and not app.has_perm('ocular.schedule') then raise exception 'Only Admin / Operations can reopen a signed ocular report.'; end if;
      return new;
    end if;
    if (to_jsonb(new) - ok) <> (to_jsonb(old) - ok) then raise exception 'This ocular report was signed by the client and is locked. Admin / Operations can reopen it.'; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_ocular_signed before update on public.ocular_visits for each row execute function app.guard_ocular_signed();
