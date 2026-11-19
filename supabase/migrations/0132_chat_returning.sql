-- A customer who already dealt with our team (a person answered them in Messenger, or they are an existing client) is marked "returning":
-- the AI skips the welcome, does not treat them as a new inquiry and gets their history as context. Set by staff (AI Chat) or automatically
-- when the mobile number matches a client / a ManyChat tag says so.
alter table public.chat_conversations add column if not exists returning_customer boolean not null default false;
alter table public.chat_conversations add column if not exists returning_note text;
