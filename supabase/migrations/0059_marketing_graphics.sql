-- Marketing AI graphics: each post can carry a branded graphic (made in the browser from the AI's headline) stored in a private bucket.
alter table public.marketing_posts add column graphic jsonb, add column image_path text;

do $$ begin
  insert into storage.buckets (id, name, public) values ('marketing-graphics', 'marketing-graphics', false) on conflict (id) do nothing;
  create policy marketing_graphics_read on storage.objects for select to authenticated using (bucket_id = 'marketing-graphics' and app.has_perm('marketing.manage'));
  create policy marketing_graphics_add on storage.objects for insert to authenticated with check (bucket_id = 'marketing-graphics' and app.has_perm('marketing.manage'));
exception when others then
  raise notice 'Could not create the marketing-graphics bucket automatically: %', sqlerrm;
end $$;
