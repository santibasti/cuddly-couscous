-- STAGING ONLY (topmop-staging, address ending nnggknbqrknkuexudvrp). Test data for trying the AI Chat staff screen: link, unlink, re-check, several matching clients.
-- Run in the SQL Editor of topmop-staging. Everything is prefixed "uitest" and is removed by the cleanup block at the bottom.
-- Migration 0135 must be applied first.
insert into public.clients (id, name, contact_person, mobile, type, status, address) values
  ('uitest-maria',  'UI Test Maria Cruz',  'UI Test Maria Cruz',  '0900 111 0001', 'Residential', 'Active', 'Makati'),
  ('uitest-carla1', 'UI Test Carla Lim',   'UI Test Carla Lim',   '0900 111 0002', 'Residential', 'Active', 'Pasig'),
  ('uitest-carla2', 'UI Test Carla Lim',   'UI Test Carla Lim',   '0900 111 0003', 'Residential', 'Active', 'Taguig'),   -- the SAME NAME as the one above, another person
  ('uitest-dup1',   'UI Test Eva Tan',     'UI Test Eva Tan',     '0900 111 0004', 'Residential', 'Active', 'Manila'),
  ('uitest-dup2',   'UI Test Evan Tan',    'UI Test Evan Tan',    '0900 111 0004', 'Residential', 'Active', 'Manila')    -- the SAME MOBILE as the one above
on conflict (id) do nothing;
insert into public.sites (id, client_id, name, address) values
  ('uitest-s-maria', 'uitest-maria', 'UI Test Maria residence', 'Makati'), ('uitest-s-carla2', 'uitest-carla2', 'UI Test Carla residence', 'Taguig')
on conflict (id) do nothing;
insert into public.jobs (id, number, client_id, site_id, start_at, end_at, status, service_codes) values   -- made by hand (no quotation, no inquiry), like a booking staff create themselves
  ('uitest-j1', 'JOB-UITEST-0001', 'uitest-maria',  'uitest-s-maria',  (current_date + 8) + time '09:00', (current_date + 8) + time '12:00', 'Confirmed',  '["GLASS_EXT"]'),
  ('uitest-j2', 'JOB-UITEST-0002', 'uitest-carla2', 'uitest-s-carla2', (current_date + 15) + time '09:00', (current_date + 15) + time '12:00', 'Dispatched', '["ROOF"]')
on conflict (id) do nothing;
-- one conversation in each state (channel messenger; subscriber ids start with uitest-)
insert into public.chat_conversations (id, channel, subscriber_id, name, status, contact_status, link_state, link_basis, link_candidates, returning_customer, returning_note, mc_phone) values
  ('uitest-c-new',  'messenger', 'uitest-new',  'UI Test: new contact',                    'Open', 'new',      null,        null,            '[]', false, null, null),
  ('uitest-c-prev', 'messenger', 'uitest-prev', 'UI Test: previous contact (no match)',    'Open', 'previous', null,        null,            '[]', true,  'A ManyChat contact since 2026-05-02, before the AI chat started', null),
  ('uitest-c-one',  'messenger', 'uitest-one',  'UI Test: phone matches ONE client',       'Needs a person', 'previous', 'suggested', 'contact_mobile', '[{"client_id":"uitest-maria","name":"UI Test Maria Cruz","basis":"contact_mobile"}]', true, 'The phone number ManyChat holds for this contact matches client UI Test Maria Cruz', '9001110001'),
  ('uitest-c-name', 'messenger', 'uitest-name', 'UI Test: same NAME on two clients',       'Needs a person', 'previous', 'suggested', 'contact_mobile', '[{"client_id":"uitest-carla2","name":"UI Test Carla Lim","basis":"contact_mobile"}]', true, 'matches the second Carla Lim only', '9001110003'),
  ('uitest-c-two',  'messenger', 'uitest-two',  'UI Test: same PHONE on two clients',      'Open', 'previous', 'ambiguous', 'contact_mobile', '[{"client_id":"uitest-dup1","name":"UI Test Eva Tan","basis":"contact_mobile"},{"client_id":"uitest-dup2","name":"UI Test Evan Tan","basis":"contact_mobile"}]', true, null, '9001110004')
on conflict (id) do nothing;
select id, name, contact_status, link_state from public.chat_conversations where id like 'uitest-%' order by id;

-- ===== CLEANUP (run when you are done) =====
-- delete from public.audit_logs where table_name = 'chat_conversations' and record_id like 'uitest-%';
-- delete from public.chat_messages where conversation_id like 'uitest-%';
-- delete from public.chat_conversations where id like 'uitest-%';
-- delete from public.jobs where id like 'uitest-%';
-- delete from public.sites where id like 'uitest-%';
-- delete from public.clients where id like 'uitest-%';
