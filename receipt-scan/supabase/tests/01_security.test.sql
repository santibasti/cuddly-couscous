create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
create or replace function pg_temp.expect_fail(sql text, needle text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(lower(needle) in lower(sqlerrm)) = 0 then raise exception 'FAILED WITH WRONG ERROR for [%]: %', sql, sqlerrm; end if;
    return;
  end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', sql;
end $$;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-00000000000a', 'a@biz.ph'), ('00000000-0000-0000-0000-00000000000b', 'b@biz.ph'),
 ('00000000-0000-0000-0000-0000000000f1', 'firm@cpa.ph'), ('00000000-0000-0000-0000-0000000000ad', 'owner@me.ph');
insert into platform_admins values ('00000000-0000-0000-0000-0000000000ad');

do $$
declare ca uuid; cb uuid; c1 uuid; c2 uuid; n int; ok boolean; r record;
begin
  -- ===== signup =====
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set local role authenticated;
  ca := signup_setup('business', 'Alpha Trading', '123-456-789', true);
  perform pg_temp.expect_fail($q$select signup_setup('business','Again','',false)$q$, 'already set up');
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set local role authenticated;
  cb := signup_setup('business', 'Beta Cafe', '', false);
  perform pg_temp.expect_fail($q$select signup_setup('hacker','x','',false)$q$, 'unknown account type'); -- fails first on existing profile
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1'); set local role authenticated;
  if signup_setup('firm', 'Lopez CPA', '', false) is not null then raise exception 'firm signup must not create a company'; end if;
  reset role;
  raise notice 'ok  signup: business gets a company, firm gets none';

  -- ===== tenant isolation on receipts =====
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set local role authenticated;
  insert into receipts(company_id, supplier_name, total, doc_date) values (ca, 'Metro Hardware', 1120, current_date);
  select count(*) into n from receipts; if n <> 1 then raise exception 'A should see 1 receipt, saw %', n; end if;
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set local role authenticated;
  select count(*) into n from receipts; if n <> 0 then raise exception 'B must see 0 of A receipts, saw %', n; end if;
  perform pg_temp.expect_fail(format($q$insert into receipts(company_id, supplier_name, total) values (%L, 'sneaky', 1)$q$, ca), 'row-level security');
  select count(*) into n from companies; if n <> 1 then raise exception 'B should see only its own company, saw %', n; end if;
  update receipts set total = 1 where company_id = ca; get diagnostics n = row_count; if n <> 0 then raise exception 'B updated A rows'; end if;
  delete from receipts where company_id = ca; get diagnostics n = row_count; if n <> 0 then raise exception 'B deleted A rows'; end if;
  reset role;
  raise notice 'ok  isolation: B cannot read/insert/update/delete A receipts or see A company';

  -- ===== clients cannot raise their own limit or status =====
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set local role authenticated;
  perform pg_temp.expect_fail($q$update companies set scan_limit = 99999$q$, 'permission denied');
  perform pg_temp.expect_fail($q$update companies set status = 'active'$q$, 'permission denied');
  update companies set name = 'Alpha Trading Inc'; -- allowed column
  reset role;
  raise notice 'ok  column lock: scan_limit/status not client-writable, name is';

  -- ===== firm: add clients, limit, isolation =====
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1'); set local role authenticated;
  c1 := add_client('Client One', '111-111-111', true);
  c2 := add_client('Client Two', '', false);
  select count(*) into n from my_company_stats(); if n <> 2 then raise exception 'firm should list 2 clients, got %', n; end if;
  insert into receipts(company_id, supplier_name, total, doc_date) values (c1, 'X', 500, current_date), (c1, 'Y', 700, current_date);
  select * into r from my_company_stats() where id = c1;
  if r.receipts_total <> 2 or r.needs_review <> 2 or r.spend_month <> 1200 or r.my_role <> 'owner' then raise exception 'bad stats for c1: %', r; end if;
  select count(*) into n from receipts; if n <> 2 then raise exception 'firm should see only its clients receipts (2), saw %', n; end if;
  reset role;
  update profiles set max_clients = 2 where user_id = '00000000-0000-0000-0000-0000000000f1';
  set local role authenticated;
  perform pg_temp.expect_fail($q$select add_client('Client Three','',false)$q$, 'client limit reached');
  reset role;
  raise notice 'ok  firm: adds clients, sees only its own, stats correct, client limit enforced';

  -- ===== business accounts cannot add clients; my_company_stats only own =====
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set local role authenticated;
  perform pg_temp.expect_fail($q$select add_client('Nope','',false)$q$, 'only accounting-firm');
  select count(*) into n from my_company_stats(); if n <> 1 then raise exception 'business should list 1 company, got %', n; end if;
  reset role;
  raise notice 'ok  business account cannot add clients';

  -- ===== scan quota =====
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set local role authenticated;
  reset role; update companies set scan_limit = 2 where id = cb; set local role authenticated;
  if not (consume_scan(cb) and consume_scan(cb)) then raise exception 'first two scans should pass'; end if;
  if consume_scan(cb) then raise exception 'third scan must be refused'; end if;
  if scans_used(cb) <> 2 then raise exception 'scans_used wrong'; end if;
  perform pg_temp.expect_fail(format($q$select consume_scan(%L)$q$, ca), 'not allowed');   -- B cannot spend A's scans
  reset role;
  raise notice 'ok  quota: limit enforced atomically, cannot spend another company scans';

  -- ===== admin console =====
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set local role authenticated;
  select count(*) into n from admin_company_stats(); if n <> 0 then raise exception 'non-admin saw % companies via admin fn', n; end if;
  perform pg_temp.expect_fail(format($q$select admin_update_company(%L, 5, 'active')$q$, ca), 'not allowed');
  perform pg_temp.expect_fail($q$select admin_update_firm('00000000-0000-0000-0000-0000000000f1', 99)$q$, 'not allowed');
  select count(*) into n from admin_list_firms(); if n <> 0 then raise exception 'non-admin saw firms'; end if;
  perform pg_temp.expect_fail($q$insert into platform_admins values ('00000000-0000-0000-0000-00000000000a')$q$, 'row-level security');
  select count(*) into n from platform_admins; if n <> 0 then raise exception 'non-admin can read platform_admins'; end if;
  reset role;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'); set local role authenticated;
  select count(*) into n from admin_company_stats(); if n <> 4 then raise exception 'admin should see all 4 companies, saw %', n; end if;   -- A, B, c1, c2
  select * into r from admin_company_stats() where id = ca; if r.owner_email <> 'a@biz.ph' then raise exception 'owner email wrong: %', r.owner_email; end if;
  select * into r from admin_company_stats() where id = cb; if r.scans_used <> 2 or r.scan_limit <> 2 then raise exception 'admin sees wrong usage'; end if;
  perform admin_update_company(cb, 50, 'active');
  select count(*) into n from admin_list_firms(); if n <> 1 then raise exception 'admin should see 1 firm'; end if;
  perform admin_update_firm('00000000-0000-0000-0000-0000000000f1', 25);
  perform pg_temp.expect_fail(format($q$select admin_update_company(%L, 5, 'banana')$q$, ca), 'bad status');
  perform pg_temp.expect_fail(format($q$select admin_update_company(%L, -1, 'active')$q$, ca), 'bad scan limit');
  reset role;
  if (select max_clients from profiles where user_id = '00000000-0000-0000-0000-0000000000f1') <> 25 then raise exception 'firm limit not updated'; end if;
  if (select scan_limit from companies where id = cb) <> 50 then raise exception 'scan limit not updated'; end if;
  raise notice 'ok  admin: sees everything, non-admin sees nothing and cannot call admin functions, inputs validated';

  -- ===== suspend =====
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'); set local role authenticated;
  perform admin_update_company(ca, 100, 'suspended');
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set local role authenticated;
  perform pg_temp.expect_fail(format($q$insert into receipts(company_id, supplier_name, total) values (%L, 'late', 1)$q$, ca), 'row-level security');
  perform pg_temp.expect_fail(format($q$select consume_scan(%L)$q$, ca), 'paused');
  select count(*) into n from receipts; if n <> 1 then raise exception 'suspended company must still read its data'; end if;
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'); set local role authenticated;
  perform admin_update_company(ca, 100, 'active');
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set local role authenticated;
  insert into receipts(company_id, supplier_name, total) values (ca, 'back', 1);
  reset role;
  raise notice 'ok  suspend: writes and scans blocked, data still readable, reactivation works';

  -- ===== audit trail =====
  select count(*) into n from audit_log where company_id = ca; if n < 2 then raise exception 'audit rows missing'; end if;
  raise notice 'ok  audit log written';
end $$;
