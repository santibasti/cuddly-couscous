-- Row-level security speed: a policy such as  using (app.has_perm('x'))  or  using (created_by = auth.uid()::text)  calls the function once PER ROW.
-- On a growing table that is slow, and for a login with no access it means the database tests every row to return nothing (statement timeouts).
-- Wrapping each call as  (select app.has_perm('x'))  lets Postgres evaluate it once per query. The meaning of every policy is unchanged:
-- these functions depend only on who is signed in, never on the row.
-- Only calls with constant arguments (or none) are wrapped; policies already wrapped are left alone. Re-running this is harmless.
do $$
declare
  r record; q text; c text; n int := 0; failed int := 0;
  wrap text := '(?<!SELECT )(app\.has_perm\(''[^'']*''::text\)|app\.(?:my_employee|user_role|my_client)\(\)|auth\.uid\(\))';
begin
  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := case when r.qual is null then null else regexp_replace(r.qual, wrap, '(SELECT \1)', 'g') end;
    c := case when r.with_check is null then null else regexp_replace(r.with_check, wrap, '(SELECT \1)', 'g') end;
    continue when q is not distinct from r.qual and c is not distinct from r.with_check;
    begin
      execute format('alter policy %I on %I.%I%s%s', r.policyname, r.schemaname, r.tablename,
        case when q is null then '' else ' using (' || q || ')' end,
        case when c is null then '' else ' with check (' || c || ')' end);
      n := n + 1;
    exception when others then
      failed := failed + 1; raise notice 'Policy %.% left as it was: %', r.tablename, r.policyname, sqlerrm;
    end;
  end loop;
  raise notice 'Row-level security policies updated: %, left unchanged because of an error: %', n, failed;
end $$;
