create role service_role; create role anon; create role authenticated;
create table public.clients (id text primary key, name text not null, mobile text, deleted_at timestamptz, created_at timestamptz not null default now());
create table public.inquiries (id text primary key, client_id text, created_at timestamptz not null default now());
-- the table as it exists before V2.3 (0125 + 0132)
create table public.chat_conversations (id text primary key, channel text not null default 'messenger', subscriber_id text not null, name text, status text not null default 'Open', human_reason text, client_id text, inquiry_id text, last_message_at timestamptz not null default now(), created_at timestamptz not null default now(), returning_customer boolean not null default false, returning_note text, context jsonb not null default '{}'::jsonb);
insert into public.clients (id, name, mobile, created_at) values ('c-old','Maria Cruz','0917 555 1212', now() - interval '90 days'), ('c-new','Ana Reyes','+63 918 777 3434', now()), ('c-dup1','Dup One','0919 000 1111', now()), ('c-dup2','Dup Two','0919-000-1111', now());
insert into public.inquiries (id, client_id, created_at) values ('i1','c-new', now());
insert into public.chat_conversations (id, subscriber_id, client_id, inquiry_id, returning_customer) values
 ('conv-created','s1','c-new','i1', true),        -- the chat made an inquiry and the client was created a moment before it (the old timestamp heuristic would have called this "verified")
 ('conv-typed','s2','c-old','i1', true),          -- an EXISTING client matched by a typed mobile
 ('conv-ret','s3',null,null, true),               -- marked returning by staff, no client
 ('conv-new','s4',null,null, false);              -- nobody
