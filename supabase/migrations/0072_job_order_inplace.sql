-- A sent Job Order stays a record of what the client was told, except for three details that follow the booking in place: booking date, VIP flag and assigned vehicle.
create or replace function app.guard_job_order() returns trigger language plpgsql as $$
declare free text[] := array['status','superseded_by_id','history','last_sent_at','sent_count','updated_at','updated_by'];
begin
  if auth.uid() is not null and not app.has_perm('joborders.manage') then raise exception 'Only Admin / Operations can change a Job Order.'; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('Draft','Revised') then raise exception 'A new Job Order starts as a Draft (or a Revised version).'; end if;
    return new;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then raise exception 'A Job Order cannot be deleted; a changed booking creates a revised version.'; end if;
  if old.status in ('Sent to Client','Superseded') then
    -- a sent Job Order is a record of what the client was told
    -- only details the client does not need a new version for may follow the booking: booking date, VIP flag, assigned vehicle
    if (to_jsonb(new) - free - 'content') <> (to_jsonb(old) - free - 'content')
       or (new.content - 'booking_date' - 'vip' - 'vehicle') <> (old.content - 'booking_date' - 'vip' - 'vehicle') then
      raise exception 'A Job Order that was sent to the client cannot be edited. A revised version is created when the booking changes.';
    end if;
    if old.status = 'Superseded' and new.status <> 'Superseded' then raise exception 'A superseded Job Order cannot be reopened.'; end if;
    if old.status = 'Sent to Client' and new.status not in ('Sent to Client','Superseded') then raise exception 'A sent Job Order can only be superseded by a newer version.'; end if;
    return new;
  end if;
  -- Draft / Revised: may follow the booking, or be sent
  if new.status not in (old.status, 'Sent to Client') then raise exception 'A Draft can only be marked as sent to the client.'; end if;
  if new.status = 'Sent to Client' then
    if (new.content ->> 'blocker') is not null then raise exception '%', new.content ->> 'blocker'; end if;
    if exists (select 1 from public.job_orders x where x.job_id = new.job_id and x.version > new.version and x.deleted_at is null) then raise exception 'Only the latest version can be sent.'; end if;
    new.sent_at := coalesce(new.sent_at, now()); new.last_sent_at := coalesce(new.last_sent_at, new.sent_at);
  end if;
  return new;
end $$;
