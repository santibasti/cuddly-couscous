-- BookingPilot — Supabase Storage buckets and policies.
-- Path convention for both buckets: <organization_id>/<...>. Policies compare the first folder with the caller's memberships.

insert into storage.buckets (id, name, public) values ('property-photos', 'property-photos', true) on conflict (id) do nothing;   -- listing photos are public-read
insert into storage.buckets (id, name, public) values ('booking-attachments', 'booking-attachments', false) on conflict (id) do nothing; -- IDs / payment proofs: private

create or replace function public.storage_org(p_name text) returns uuid language sql immutable as $$
  select nullif((storage.foldername(p_name))[1], '')::uuid
$$;

create policy photos_write on storage.objects for all
  using (bucket_id = 'property-photos' and public.has_role(public.storage_org(name), array['owner', 'manager']::public.role_code[]))
  with check (bucket_id = 'property-photos' and public.has_role(public.storage_org(name), array['owner', 'manager']::public.role_code[]));

create policy attachments_read on storage.objects for select
  using (bucket_id = 'booking-attachments' and public.has_role(public.storage_org(name), array['owner', 'manager', 'staff']::public.role_code[]));
create policy attachments_write on storage.objects for insert
  with check (bucket_id = 'booking-attachments' and public.has_role(public.storage_org(name), array['owner', 'manager', 'staff']::public.role_code[]));
create policy attachments_delete on storage.objects for delete
  using (bucket_id = 'booking-attachments' and public.has_role(public.storage_org(name), array['owner', 'manager']::public.role_code[]));
