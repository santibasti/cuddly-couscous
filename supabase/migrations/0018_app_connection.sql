-- Connecting the web app: two small server functions the app calls with the signed-in user's login.
--   next_numbers: hands out document numbers (QT / JOB / INV / OR / EMP / INC / DR / BJ / OV) from one counter, so two people never get the same number.
--   save_settings: Admin saves company settings without overwriting the server's counters.

create function public.next_numbers(p_kind text, p_n integer default 1) returns integer[]
language plpgsql security definer set search_path = public as $$
declare cur integer; res integer[];
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_kind not in ('QT','JOB','INV','OR','EMP','INC','DR','BJ','OV') then raise exception 'Unknown document number type %', p_kind; end if;
  if p_n < 1 or p_n > 50 then raise exception 'Ask for 1 to 50 numbers at a time.'; end if;
  select coalesce((data -> 'counters' ->> p_kind)::integer, 0) into cur from public.settings where id = 'main' for update;
  if not found then raise exception 'Company settings have not been loaded (settings row missing).'; end if;
  update public.settings
     set data = jsonb_set(data, '{counters}', coalesce(data -> 'counters', '{}'::jsonb) || jsonb_build_object(p_kind, cur + p_n)), updated_at = now(), updated_by = auth.uid()::text
   where id = 'main';
  select array_agg(g order by g) into res from generate_series(cur + 1, cur + p_n) g;
  return res;
end $$;

create function public.save_settings(p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_perm('admin.settings') then raise exception 'Only the Admin can change company settings.'; end if;
  update public.settings
     set data = (p_data - 'counters') || jsonb_build_object('counters', coalesce(data -> 'counters', '{}'::jsonb)), updated_at = now(), updated_by = auth.uid()::text
   where id = 'main';
end $$;

revoke all on function public.next_numbers(text, integer) from public;
revoke all on function public.save_settings(jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.next_numbers(text, integer) to authenticated;
    grant execute on function public.save_settings(jsonb) to authenticated;
  end if;
end $$;
