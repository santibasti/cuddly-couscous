-- Quotation images / attachments: optional pictures that explain a quotation or a variation.
--   Kept completely apart from job / service photos (own table, own private Storage bucket 'quotation-attachments').
--   Only the Admin, Operations Manager and the assigned Team Leader can add or delete them.
--   Images on an approved / rejected / expired quotation or an approved / rejected variation are locked with that record.
--   A revision (duplicate) gets copies; the original keeps its own. Only images flagged share_with_client reach the client view and the client PDF.

create table public.quote_images (
  like app.base_columns including all,
  quotation_id text references public.quotations (id), variation_id text references public.variations (id), job_id text references public.jobs (id),
  category text not null check (category in ('Scope Area','Panel Count','Additional Work','Site Condition','Access Limitation','Exclusion','Other')),
  caption text not null default '' check (length(caption) <= 140),
  item_index integer check (item_index is null or item_index >= 0), item_label text,
  file text not null,                         -- Storage path in production ('quotation-attachments/…'); an inline data URL in the demo
  name text not null, width integer not null check (width > 0), height integer not null check (height > 0),
  share_with_client boolean not null default false,
  check ((quotation_id is not null) <> (variation_id is not null))
);
create index on public.quote_images (quotation_id) where deleted_at is null;
create index on public.quote_images (variation_id) where deleted_at is null;

create trigger trg_touch before update on public.quote_images for each row execute function app.touch();
create trigger trg_no_delete before delete on public.quote_images for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.quote_images for each row execute function app.audit();

create function app.guard_quote_image() returns trigger language plpgsql as $$
declare q public.quotations; v public.variations; n integer; emp text := app.my_employee(); ok boolean;
begin
  select * into q from public.quotations where id = coalesce(new.quotation_id, old.quotation_id);
  select * into v from public.variations where id = coalesce(new.variation_id, old.variation_id);
  if q.id is not null and q.status in ('Approved','Rejected','Expired') then raise exception 'Images on a % quotation are locked with it. Duplicate the quotation to add new ones.', lower(q.status); end if;
  if v.id is not null and v.status in ('Approved','Rejected') then raise exception 'Images on a % variation are locked with it.', lower(v.status); end if;
  if auth.uid() is not null then
    ok := app.has_perm('sales.edit') or app.has_perm('jobs.all')
          or (app.has_perm('quoteimg.manage') and (
               (q.id is not null and (q.ocular_assignee_id = emp or exists (select 1 from public.jobs j where j.quotation_id = q.id and j.leader_id = emp)))
               or (v.id is not null and exists (select 1 from public.jobs j where j.id = v.job_id and j.leader_id = emp))));
    if not ok then raise exception 'Only the Admin, Operations Manager or the assigned Team Leader can add or delete quotation images.'; end if;
  end if;
  if tg_op = 'INSERT' then
    select count(*) into n from public.quote_images i where i.deleted_at is null and ((new.quotation_id is not null and i.quotation_id = new.quotation_id) or (new.variation_id is not null and i.variation_id = new.variation_id));
    if n >= 12 then raise exception 'A maximum of 12 images can be attached to one quotation or variation.'; end if;
    if new.variation_id is not null then new.job_id := coalesce(new.job_id, v.job_id); end if;
  end if;
  return new;
end $$;
create trigger trg_guard_quote_image before insert or update on public.quote_images for each row execute function app.guard_quote_image();

alter table public.quote_images enable row level security;
-- staff see every image of the records they can see; the client portal sees only images selected for sharing
create policy qi_select on public.quote_images for select using (
  app.has_perm('sales.view') or app.has_perm('jobs.all') or app.has_perm('quoteimg.manage')
  or (share_with_client and (exists (select 1 from public.quotations q where q.id = quote_images.quotation_id and q.client_id = app.my_client())
                          or exists (select 1 from public.variations v join public.jobs j on j.id = v.job_id where v.id = quote_images.variation_id and j.client_id = app.my_client()))));
create policy qi_insert on public.quote_images for insert with check (app.has_perm('quoteimg.manage') or app.has_perm('sales.edit'));
create policy qi_update on public.quote_images for update using (app.has_perm('quoteimg.manage') or app.has_perm('sales.edit'));

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('quotation-attachments', 'quotation-attachments', false) on conflict do nothing;
    execute $p$create policy qimg_storage_read on storage.objects for select to authenticated using (bucket_id = 'quotation-attachments' and (app.has_perm('sales.view') or app.has_perm('jobs.all') or app.has_perm('quoteimg.manage')))$p$;
    execute $p$create policy qimg_storage_write on storage.objects for insert to authenticated with check (bucket_id = 'quotation-attachments' and (app.has_perm('quoteimg.manage') or app.has_perm('sales.edit')))$p$;
  end if;
end $$;

insert into public.role_permissions (role, permission) values ('owner', 'quoteimg.manage'), ('ops', 'quoteimg.manage'), ('leader', 'quoteimg.manage') on conflict do nothing;
