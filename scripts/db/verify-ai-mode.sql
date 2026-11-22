-- READ-ONLY. Shows the REAL AI chat mode and which Supabase project you are looking at. Run it in the SQL Editor of the project you are about to change, and keep the output.
-- The functions read this same setting on every message, so this is the mode that is actually in force (the app's Settings screen shows the same value).
select data->'chat_ai'->>'mode' as ai_mode, data->'chat_ai'->>'ai_started_on' as ai_started_on, data->'chat_ai'->>'model' as model from public.settings where id = 'main';
-- environment fingerprint (production has many rulebook versions and real clients; staging has few): never rely on the "PRODUCTION" badge, it shows on both projects
select (select count(*) from public.ai_rulebook) as rulebook_versions, (select version from public.ai_rulebook where status = 'published') as published_rulebook, (select count(*) from public.clients) as clients, (select count(*) from public.chat_conversations) as chat_conversations;
-- anything waiting
select count(*) filter (where direction = 'out' and status = 'draft') as drafts_waiting, count(*) filter (where direction = 'in' and handled_at is null) as unanswered_inbound from public.chat_messages;
