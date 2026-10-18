-- Client rating now asks six things (1 Poor … 5 Excellent): cleanliness result, professionalism of the team, punctuality, safety practices, tools & equipment, communication.
-- The first three keep their old columns; the new three are added here. Any of them rated 1–2 still needs an issue category and an Admin follow-up.
alter table public.client_feedback
  add column q_punctuality smallint check (q_punctuality between 1 and 5), add column q_safety smallint check (q_safety between 1 and 5), add column q_tools smallint check (q_tools between 1 and 5);

create or replace function app.guard_client_feedback() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (new.rating = 1 or coalesce(new.q_quality, 5) <= 2 or coalesce(new.q_professionalism, 5) <= 2 or coalesce(new.q_communication, 5) <= 2
        or coalesce(new.q_punctuality, 5) <= 2 or coalesce(new.q_safety, 5) <= 2 or coalesce(new.q_tools, 5) <= 2) then
      if new.issue_category is null then raise exception 'Not Satisfied or a rating of 1–2 needs an issue category (Quality, Delay, Communication, Damage, Scope or Other).'; end if;
      new.follow_up := 'Required';
    else new.follow_up := 'None'; end if;
    return new;
  end if;
  if (new.job_id, new.client_id, new.rating, new.aspects, new.comment, new.issue_category, new.service_date, new.q_quality, new.q_professionalism, new.q_communication, new.q_punctuality, new.q_safety, new.q_tools)
     is distinct from (old.job_id, old.client_id, old.rating, old.aspects, old.comment, old.issue_category, old.service_date, old.q_quality, old.q_professionalism, old.q_communication, old.q_punctuality, old.q_safety, old.q_tools) then
    raise exception 'Client feedback cannot be edited.'; end if;
  if new.follow_up is distinct from old.follow_up then
    if old.follow_up <> 'Required' or new.follow_up <> 'Acknowledged' then raise exception 'Invalid follow-up change.'; end if;
    if not (app.has_perm('feedback.acknowledge') or auth.uid() is null) then raise exception 'Only the Owner / Admin can acknowledge negative client feedback.'; end if;
    if coalesce(trim(new.ack_note), '') = '' then raise exception 'Enter the follow-up note.'; end if;
  end if;
  return new;
end $$;
