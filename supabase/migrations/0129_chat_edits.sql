-- When staff edit an AI draft before sending, keep what the AI wrote, so repeated corrections can be seen and turned into rulebook rules.
alter table public.chat_messages add column if not exists original_body text;
