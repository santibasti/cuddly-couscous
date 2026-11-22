-- EMERGENCY KILL SWITCH (same effect as Settings, AI chat, mode Off). Run in the SQL Editor of the project whose replies must stop.
-- With the mode off, chat-brain stores customer messages but sends and drafts nothing, and chat-recover does nothing. Staff can still use AI Chat.
update public.settings set data = data || jsonb_build_object('chat_ai', coalesce(data->'chat_ai', '{}'::jsonb) || '{"mode":"off"}'::jsonb) where id = 'main';
select data->'chat_ai'->>'mode' as ai_mode_now from public.settings where id = 'main';   -- must say: off
