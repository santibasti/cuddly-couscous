# Supabase / PostgreSQL setup

The database is designed for Supabase (PostgreSQL 15+). All business rules that protect financial, stock, payroll and asset
records are enforced **in the database** (triggers + row-level security), so they hold no matter which client writes to it.

| File | Purpose |
| --- | --- |
| `migrations/0001_schema.sql` | Tables, constraints, indexes. Column names mirror `src/lib/types.ts`. |
| `migrations/0002_security_and_rules.sql` | Audit trail, no-hard-delete, immutability guards, double-booking / negative-stock / overpayment guards, reporting views, RLS policies, storage buckets. |
| `migrations/0006_simplified_workflow.sql` | 7-step workflow: drops odometer / photo columns, adds scope-approval mode and work finish time, new step-order guards and job-status flow (Work Completed → Closed). |
| `migrations/0007_discount_requests.sql` | Controlled Discount Requests: `discount_requests` table (Pending Admin Approval → Approved → Applied / Rejected), `discount.request` / `discount.approve` permissions, triggers that stop anyone but the Owner / Admin from typing a discount into a quotation, variation or invoice, and that refuse a client signature or invoice while a request is still open. Adds `discount_request_id` / `discount_granted` to invoices. |
| `migrations/0008_client_declines_job.sql` | A client can decline the job on site: `workflows.conf_mode = 'declined'` skips work and handover, the job goes On Site → Work Completed → Closed via close-out, and declined jobs cannot be invoiced. |
| `migrations/0009_client_satisfaction.sql` | Client Satisfaction Check: `client_feedback` table (rating 1–3, ticked items, comment, issue category), automatic Follow-Up Required for Not Satisfied, Admin-only acknowledgement, and a job-status guard so a job cannot be Closed until negative feedback is acknowledged. |
| `migrations/0010_payment_verification.sql` | Payment recording: methods Cash / Bank Transfer / Cheque / GCash with method-specific details, status Pending Verification → Verified / Rejected, cheque clearing; only Verified (and Cleared cheque) payments reduce balances, statements and aging; Team Leaders record cash as pending only; verified payments are locked (reverse only). |
| `migrations/0011_back_jobs.sql` | Back Job / Callback: `back_jobs` table + linked follow-up job (`jobs.back_job_id` / `origin_job_id`), status flow Reported → … → Closed driven by the follow-up job, Admin / Operations approval, no scheduling before approval, no invoice for no-charge back jobs. |
| `migrations/0012_discount_after_presentation.sql` | `workflows.quote_presented_at`; a Discount Request is refused until the quotation has been presented to the client. |
| `migrations/0013_discount_request_internal.sql` | Withdraws the 0012 "present first" rule: discounts are requested on the Team Leader's internal quotation screen, not on the client-facing quote. |
| `migrations/0014_payment_confirmation.sql` | Payment Method Confirmation before Client Handover: `payment_confirmations` table (method, received / to be paid later, expected today, balance later, note, Team Leader confirmation), `payments.confirmation_id`; money received is always a Pending Verification payment; stored apart from the service record. |
| `migrations/0015_ocular_visits_and_ratings.sql` | Ocular visits (booking type in the shared calendar: client, contact, location, services, estimator, duration, concerns, access notes; Scheduled / Confirmed / Completed / Cancelled / Converted to Quotation; panel count + measurements, no photos or odometer; `quotations.ocular_*` carry-forward) and the revised Client Satisfaction Check (three 1–5 questions; a 1–2 rating or Not Satisfied needs an issue category and an Admin follow-up). |
| `migrations/0016_quotation_images.sql` | Optional quotation images / attachments (own table + private bucket `quotation-attachments`, separate from job photos): category, caption, optional line-item link, share-with-client flag; add / delete limited to Admin, Operations and the assigned Team Leader; locked with an approved quotation / variation. |
| `migrations/0017_client_followups.sql` | Client lifetime value & maintenance follow-up: `followups` (one row per client + interval + completed service, never duplicated) and `followup_rules` (Admin custom intervals by client or service type), `app.sync_followups()` (run by trigger when a job completes or a rule changes: resets the older open follow-ups, schedules the 6-month / 1-year dates from the newest completed service, links bookings), views `v_client_lifetime` and `v_followup_dashboard`, Admin-only status changes (`followups.manage`). |
| `migrations/0018_app_connection.sql` | Functions the web app calls when connected: `next_numbers` (unique document numbers across users) and `save_settings` (Admin settings without touching the counters). |
| `migrations/0019_app_schema_access.sql` | Lets signed-in users use the `app` helper functions their triggers and security policies call (fixes "permission denied for schema app"). |
| `migrations/0020_workflow_access.sql` | Lets the people who run the job workflow (Team Leaders, Operations) do what its steps write: release / return equipment (checkouts, assets, repair tickets, stock) and read the quotation behind their assigned job; drops the circular back-job foreign key. Found by replaying the whole job flow under row-level security for each role. |
| `migrations/0021_job_orders.sql` | Job Order Confirmation: `job_orders` (one number, many versions; Draft → Sent to Client; Revised / Superseded; a sent version is immutable except its status line and resend log), Admin / Operations only (`joborders.manage`), share-link function `get_job_order_public` (no sign-in, sent versions only), document number type `JO`. |
| `migrations/0022_geo_insights.sql` | Geographic client insights: map position columns (`lat`, `lng`, `city`, `province`, `geo_*`) on `sites`, `clients`, `ocular_visits`; `dashboard.executive` permission for the Owner / Admin. |
| `migrations/0023_delete_clients_items.sql` | Delete clients and inventory items (soft delete → Recycle bin, restorable): Owner / Admin only (`clients.delete`, `inventory.delete`); refused for a client with billing, payments or started / completed service, and for an item with stock movements. |
| `migrations/0024_profile_on_signup.sql` | A login created in Supabase (Authentication → Users → Add user) gets its app profile automatically, switched off with the lowest role ("Waiting for Admin"); the Owner / Admin sets role + employee and switches it on in Admin → Users. Also backfills logins that already exist without a profile. |
| `migrations/0025_own_employee_record.sql` | A crew member / Team Leader login can read its own employee record (and no one else's pay or ID details), so attendance knows who is clocking in. |
| `migrations/0026_maintenance.sql` | Maintenance module: `maint_templates`, `maint_profiles`, `maint_plans`, `maint_records`; asset statuses Due for Maintenance / Out of Service; rules (only Admin / Operations plan, approve and complete; Team Leaders can only add a Requested report; a completed record is locked; cannot start work on equipment that is out on a job; cannot release an Out-of-Service asset); document number `MT`; permissions `maintenance.view / request / manage`. |
| `migrations/0027_employee_rating.sql` | Employee rating (1–5) + breakdown on the employee record, readable by the employee themselves (via 0025) and by Admin. |
| `migrations/0028_quotation_manpower.sql` | Quotations: `crew_size`, `safety_officer`, `work_days`, `disclaimer`. |
| `migrations/0029_ocular_report.sql` | Ocular report fields (surface condition, hazards, recommendation, services, days, crew) and client / estimator signatures; once the client has signed the visit's findings and report are locked, only Admin / Operations can reopen it. |
| `migrations/0030_quotation_intro_methodology.sql` | Quotations: `intro` and `methodology` text. |
| `migrations/0005_final_quote_review.sql` | Client Final Quote Review: additional-work variations (source, revision, decided time, sign GPS / device), deposit and final total on the conforme; the conforme waits for open additions; approved / declined variations are locked. |
| `migrations/0004_job_workflow_and_incidents.sql` | Per-job 11-step workflow, variations and incident tables; step-order / evidence guards, job status flow, variation locking and contract value, `In Use` / `Missing` asset statuses, edit-with-reason, RLS. |
| `migrations/0003_role_permissions.sql` | Default role → permission matrix (generated from `src/lib/rbac.ts`). The Owner edits it afterwards. |
| `seed.sql` | **Generated, not committed.** Demo dataset: `npm run db:seed-sql`. |

## Apply

```bash
supabase link --project-ref <ref>
supabase db push                      # applies migrations/0001..0003
npm run db:seed-sql                   # writes supabase/seed.sql (≈2.8k rows of TopMop sample data)
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # run as the postgres role (loads historical records with triggers bypassed)
```

Create users in **Authentication → Users**, then add a matching row in `public.profiles`
(`id` = the auth user id, `role`, `employee_id`; `client_id` for client-portal users).

## What the database enforces

* **No hard deletes** – every table has `deleted_at`; `DELETE` raises an error. Corrections are reversal / adjustment entries.
* **Append-only audit log** – `audit_logs` is written by `SECURITY DEFINER` triggers (create / update / delete / approve) with before & after JSON; it cannot be updated or deleted.
* **Stock ledger immutable** – only the approval decision can change; quantities never. Approved stock can never go negative at a location. Adjustments need a second approver.
* **Approved invoices locked** – can only move to `Reversed` (and only once payments are reversed). Payments can't exceed the balance and are reversible, not deletable.
* **Payroll** – `Approved`/`Finalized` require `payroll.approve`; finalizing sets `locked`; locked periods and their runs can never change.
* **Equipment** – a partial unique index guarantees an asset is `Released` to only one job at a time; completed out/in rows are locked; a damaged return opens a maintenance ticket and takes the asset out of service.
* **Scheduling** – overlapping active jobs cannot share crew, vehicle or equipment.
* **RLS** – policies check `public.role_permissions` through `app.has_perm()`. Field crews only see jobs they are assigned to and their own attendance; portal users only see their own client's quotations, jobs and invoices.
* **Storage** – six private buckets (`receipts`, `job-photos`, `signed-documents`, `equipment-photos`, `attendance-selfies`, `employee-documents`) with permission-based policies. In the demo, photos are inline data URLs; in production store the file in a bucket and keep its path in the row.

## Reporting views

`v_stock_on_hand`, `v_invoice_balances` (net, VAT, total, expected withholding, collected, balance) and `v_ar_aging`
(Current / 1–30 / 31–60 / 61–90 / 90+).

## Known gaps to close before go-live

* Column-level privacy (employee pay / bank / government IDs, client TINs) is UI-gated in the app; add views or column privileges if the API is exposed to roles that must not read them.
* Notification delivery (email / SMS / WhatsApp) is queued per notification (`channels_queued`); connect a provider from an Edge Function on a schedule.
* Statutory rates in `settings.data.statutory` are placeholders — set them to the current SSS / PhilHealth / Pag-IBIG / withholding-tax schedules.

## Staff logins (Team Leaders, crew, office)

**Easiest way:** Supabase → Authentication → Users → Add user (email + password, tick *Auto confirm*). The login shows up in the app under Admin → Users as *Waiting for Admin*; click Edit, pick the role, link the employee and switch it on (needs migration 0024). The script below does the same for many people at once.

A login is a Supabase user plus a row in `profiles` that sets the role and links the person to their employee record
(`profiles.employee_id`). The link is what makes attendance, "my jobs" and the role's permissions work.
`scripts/create-staff.mjs` does both steps. Run it on your own computer:

```bash
# Supabase → Project Settings → API → copy the project URL and the service_role key (secret: never commit it, never put it in Vercel)
set SUPABASE_URL=https://xxxx.supabase.co                   # Windows cmd   (macOS / Linux: export ...)
set SUPABASE_SERVICE_ROLE_KEY=eyJ...
node scripts/create-staff.mjs --list                         # employees, and who already has a login
copy scripts\staff.example.json staff.json                   # edit: email, role (leader / field / ops / finance / viewer), employee code
node scripts/create-staff.mjs staff.json --dry-run           # check first
node scripts/create-staff.mjs staff.json                     # creates the logins and prints each password once
```

Give each person their email and password privately. A crew member opens the app, signs in and lands on Attendance; a Team Leader also
sees their jobs, the job workflow and attendance approval for the crew. Replayed under row-level security: a crew member can clock in / out and file a
correction for themselves only, cannot clock in for someone else or approve attendance, and sees no payroll; a Team Leader can approve crew
attendance but not their own.

## Removing the sample data

`tools/preview-demo-data.sql` (read-only) counts the sample rows and your own rows; `tools/clear-demo-data.sql` removes the sample rows only
(ids like `cl-0007`; rows you created have long random ids) in one transaction. It keeps logins, your own records, company settings and document counters,
the service price list, branches, storage locations, holidays, maintenance checklist templates, and the inventory / equipment names as a starting list
(their stock movements, checkouts and maintenance history are cleared). Run it once in the Supabase SQL editor, after the preview.

## Owner alerts by SMS (quotation signed, scope approved, discount requested)

The database records these events itself (migrations `0044`/`0045`, table `alert_outbox`), so they are sent even when nobody has the app open. The `send-alerts` Edge Function delivers them by SMS through [Semaphore](https://semaphore.co) (Philippines).

1. Create a Semaphore account, add credit, and copy your API key (Account → API).
2. Set the secrets (your own values; several numbers can be separated with commas):
   `supabase secrets set SEMAPHORE_API_KEY=... ALERT_SMS_TO=09171234567 WEBHOOK_SECRET=<random text>`
   Optional: `SEMAPHORE_SENDER=<approved sender name>` (without it Semaphore's shared sender is used).
3. `supabase functions deploy send-alerts --no-verify-jwt`
4. The database calls `send-alerts` itself (migration `0046`) and, from migration `0088`, sends the secret in the `x-webhook-secret` header. See **Protecting the SMS functions** below: do not skip it.

Messages use plain letters ("PHP 12,117.28") and carry no link (Philippine phone companies often drop texts with links), so each stays within 160 characters = 1 SMS credit.  There is no setting to add a link. Failed sends are kept in `alert_outbox` (`error`, `attempts`) and retried the next time the function runs.

### Protecting the SMS functions (do this once, after `supabase.cmd db push` has applied `0088`)

The two SMS functions are public addresses. Without a secret, anyone who finds the address can call them. Migration `0088` makes the database send a secret with every call, taken from Supabase Vault. Do the steps **in this order**; nothing stops working at any step.

1. Make up a long random text (about 40 letters and digits) on your own computer and keep it private. In PowerShell: `-join ((48..57)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})`
2. In the Supabase **SQL editor** run (put your text in place of the angle brackets, nowhere else): `select vault.create_secret('<your text>', 'webhook_secret');`
3. In a terminal: `supabase secrets set WEBHOOK_SECRET=<your text>`
4. Redeploy both: `supabase functions deploy send-alerts --no-verify-jwt` and `supabase functions deploy send-client-reminders --no-verify-jwt`

Check: in the SQL editor `select app.webhook_headers();` must show an `x-webhook-secret` entry. Then a call without the header is refused (HTTP 403) while the alerts and reminders keep arriving. To change the secret later, update both places (the Vault secret and the function secret) in the same few minutes.

## SMS reminders to clients (day before and 7:00 AM on the service day)

Needs the same Semaphore account/secrets as the owner alerts (`SEMAPHORE_API_KEY`, optional `SEMAPHORE_SENDER`). The scheduler sends the `WEBHOOK_SECRET` (see **Protecting the SMS functions**).

1. `supabase.cmd db push` (migration `0048`: log table + a pg_cron job that runs every 10 minutes; if it prints a notice that scheduling failed, enable the **pg_cron** and **pg_net** extensions under Database → Extensions and run the `do $$ ... $$` block from the migration again).
2. `supabase functions deploy send-client-reminders --no-verify-jwt`
3. In the app: Admin → Settings → Notifications & reminders → tick **SMS reminders to clients** and set the two send times, then **Save**.

The text greets the client ("Good day, Sir Regulus!": Sir / Mam from a Mr. / Ms. in the name or the client's "Call them in texts" setting, migration `0090`; a first name is never used to guess), gives the day, the arrival time (ETA = the Job Order's arrival window), the team's first names and the vehicle, says "Automated message, please do not reply here" and "Questions? Message us on Facebook Messenger", and carries no link (phone companies drop texts with links). It is about 235 to 245 characters, so 2 SMS credits each; the team list shortens itself so it never runs past 2 SMS. To see exactly what a client receives, use **Admin → Rates & settings → Owner alert texts (SMS) → Send me a sample** (needs migration `0091`): it texts the real reminder for the next upcoming booking, marked SAMPLE, to the first `ALERT_SMS_TO` number only, never to a client. Each reminder is sent once per job and service date. `client_sms_log` shows what was sent, to which number, and any error (for example a client with no valid mobile number).

## Facebook Page AI assistant (replies to customers, saves leads)

Customer messages on your Facebook Page are stored in the app (**Facebook Inbox** in the menu). The AI (Claude) drafts a reply from your services, prices and the extra facts you type in Admin; when the customer has given name, mobile and what they need, it creates a client + inquiry (source "Facebook") in TopMop. By default (mode **Suggest**) nothing is sent until you press **Approve & send**.

1. `supabase.cmd db push` (migration `0053`: inbox tables + permission) and, in the app, Admin → Settings → Facebook AI assistant → set the mode and add your extra facts → **Save**.
2. **Anthropic key:** create an API key at console.anthropic.com. **Meta app:** at developers.facebook.com create an app (type *Business*), add the **Messenger** product, connect your Page, and generate the Page access token. Note the App Secret (Settings → Basic).
3. Secrets (your own values; no spaces or `<` `>`):
   `supabase secrets set FB_VERIFY_TOKEN=any-random-word FB_APP_SECRET=... FB_MESSENGER_TOKEN=... (a separate secret, so the Marketing AI posting token FB_PAGE_TOKEN stays untouched) ANTHROPIC_API_KEY=...`
4. `supabase functions deploy fb-webhook --no-verify-jwt` and `supabase functions deploy fb-send`
5. In the Meta app → Messenger → Webhooks: callback URL `https://<project-ref>.supabase.co/functions/v1/fb-webhook`, verify token = the word from step 3, subscribe the Page to **messages**.
6. Facebook only delivers messages from the public once the app has the **pages_messaging** permission approved (App Review, business verification). Before that, only people with a role on the app (you, testers) can chat with it — enough to test.

The AI never invents prices, never promises dates, and hands the chat to a person (status **Needs a person**) for complaints, custom jobs or anything it is unsure about; those replies are never sent automatically.

## Lead intake address (for ManyChat / Chatfuel / Botpress / Zapier / a website form)

A chatbot tool collects the customer's details and sends them to TopMop. TopMop creates the client (or finds the same mobile number) and an inquiry with source "Facebook", and texts the owner "New lead …" through the owner-alert SMS.

1. Choose a long random key (letters and numbers only) and set it: `supabase secrets set LEAD_INTAKE_KEY=your_long_random_key`
2. `supabase functions deploy lead-intake --no-verify-jwt`
3. In the chatbot tool add an **External request / Webhook** step at the end of the chat:
   - Method **POST**, URL `https://<project-ref>.supabase.co/functions/v1/lead-intake?key=your_long_random_key`
   - Header `Content-Type: application/json` (if the tool can add headers, you can use `x-api-key: your_long_random_key` instead of `?key=`)
   - Body (use the tool's own fields in place of the examples):
     `{"name": "Maria Santos", "mobile": "09171234567", "address": "Alabang, Muntinlupa", "service": "window cleaning", "property_type": "Residential", "preferred_date": "Saturday", "details": "2-storey house, about 30 windows", "source": "Facebook"}`
4. Only `name` and `mobile` (or `email`) are required. A leftover test lead can be removed in Clients.

Quick test from PowerShell (replace the project ref and key):
`Invoke-RestMethod -Method Post -Uri "https://<project-ref>.supabase.co/functions/v1/lead-intake?key=your_long_random_key" -ContentType "application/json" -Body '{"name":"Test Lead","mobile":"09170000000","service":"window cleaning"}'`

## Marketing AI (Facebook Page posts)

Writes posts for your Page (tips, recently finished jobs, seasonal and promo posts) on a schedule and publishes the ones you approve.

1. `supabase db push` (migration 0058 adds the posts table and an hourly schedule).
2. `supabase functions deploy marketing-run --no-verify-jwt` — the hourly schedule calls it without a login.
3. Secrets: `ANTHROPIC_API_KEY` (writes the posts) and `FB_PAGE_TOKEN` (a Facebook Page access token with the `pages_manage_posts` permission — needed only for posting; without it you can still copy the text into Facebook by hand).
4. Admin → Rates & settings → **Marketing AI**: choose the mode, days, time and topics. Review posts under **Marketing AI** in the menu.

Only photos marked "client agreed to marketing use" in the Photo Library are ever attached, and the AI is never given client names, addresses or prices.

### Marketing photo library and mood
- Marketing AI → **Photo library**: upload photos; `supabase functions deploy ai-photo-tag` lets the AI describe each one and flag faces, plates or house numbers (needs migration `0060` and `ANTHROPIC_API_KEY`). The AI picks fitting photos for new posts from the ones marked OK to use; you can also add photos to any post by hand.
- Admin → Marketing AI → **Mood / tone** sets how posts sound (or let it vary); the Marketing page also has a one-off mood picker, and every post has a mood row inside ✨ Rephrase with AI.
- Redeploy `marketing-run` after pulling: `supabase functions deploy marketing-run --no-verify-jwt`.
- Admin → Marketing AI → **Company knowledge**: press **🌐 Read my website** (redeploy `marketing-run` first). The function reads the home page and a few of its own pages, and the AI writes a factual brief (services, clients, areas, safety, what is NOT stated). Review and edit it, then Save — every post is written from that brief.
- **Light service poster** (optional, pick it under Look): the light flyer layout — photo behind a white fade, logo block, "Clean | Restore | Protect | Maintain" banner, green label, the service name, three icon steps, an optional place tag, a Before/After strip (needs 3 photos on the post: hero, before, after), navy band and contact footer. For another service only the words change. Phone, email, website and Facebook name come from Admin → Marketing AI. Redeploy `marketing-run` so the AI fills the new fields.

## Crew recognition (attendance screen)
`supabase db push` applies migration `0064` (badge data on employees, the boards, praise wall, crew-versus-crew score and the monthly announcement table). Badges (perfect attendance, on-time streak, most improved, documentation star) are recalculated whenever an Admin / HR session has the app open — the same place the ratings are refreshed.

## Jarvis (the owner's voice assistant on Telegram)

Jarvis sends the owner a spoken + written **morning brief at 7:00 (Manila time)**, **instant voice alerts** (a discount is requested, a quotation is accepted, a new inquiry arrives) and answers **questions sent as text or voice notes** ("how many jobs tomorrow?", "who has not paid?"). It only reads data; it never changes anything.
Function: `supabase/functions/jarvis`; database part: migration `0110`.

1. **Voice service:** make an account at elevenlabs.io, create an API key, and choose a voice you like in the Voice Library (for example a calm British male voice); copy its **Voice ID**. The same key is used to understand your voice notes (speech-to-text). Check the current prices on their site.
2. **Your Telegram id:** after deploying `telegram-webhook` (step 5), open your private chat with the company bot and send `/myid`; it answers with a number.
3. **Secrets** (your own values; run on your computer, never paste them into chat). `WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN` and `ANTHROPIC_API_KEY` must already be set (the SMS alerts and the Telegram bot use them; the Vault secret `webhook_secret` must hold the same value as `WEBHOOK_SECRET`, see migration 0088):
   `supabase secrets set ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... JARVIS_OWNER_TELEGRAM_ID=<your id from /myid>`
   Optional: `JARVIS_ADDRESS=Boss` (how it addresses you), `JARVIS_SPEAK_NAMES=0` (never say client names), `JARVIS_MODEL`, `ELEVENLABS_TTS_MODEL`, `ELEVENLABS_STT_MODEL`.
   Several owners: `JARVIS_OWNER_TELEGRAM_ID=111,222`.
4. `supabase db push` (migration `0110`: the tables, the triggers and the 7:00 schedule).
5. `supabase functions deploy jarvis --no-verify-jwt` and `supabase functions deploy telegram-webhook --no-verify-jwt`.
6. Test: in your private chat with the bot send `/jarvis` → "Jarvis online". Then send a voice note or a question.

Only the Telegram ids in `JARVIS_OWNER_TELEGRAM_ID`, writing in a private chat with the bot, can talk to Jarvis. Without the voice key it still sends the text; without `ELEVENLABS_VOICE_ID` it stays text-only.

**The Jarvis screen (in the app, menu → Jarvis).** A command-center page for the owner: a glowing core that pulses while Jarvis listens and speaks, live panels (what needs you, today's jobs, crew, cash, new inquiries, alerts) and a way to talk to it (tap the core and speak, or type). It uses the same `jarvis` function, so after pulling this change redeploy it: `supabase functions deploy jarvis --no-verify-jwt` (no database change). Only the account with role `owner` can use it; the browser asks for microphone permission the first time. The full-screen button is for a TV or tablet.

**Jarvis and the web.** Jarvis can also answer general questions (news, weather, prices, how-to) by searching the web with Claude's own web search; no Google key is needed. It is on by default; set `JARVIS_WEB=0` to turn it off. It is told never to put client names, phone numbers, amounts or other private business details into a search. Each search costs a little on the Anthropic bill (up to 3 searches per question); check Anthropic's current pricing, and the web-search setting in the Anthropic console must be enabled for your organisation (the Executive screen already uses it).

**The Jarvis console view.** The Jarvis screen now opens on a *Console* view (a swirling particle sphere whose outer spikes follow the voice, system status, a real activity log, a radar of today's jobs placed by start time on a 12-hour dial, a voice waveform and the key figures). *Panels* is the earlier layout, and the *Colour* button switches the console between deep blue and cyan. The activity log comes from migration `0111` (table `jarvis_events`: it stores only the kind of event, never a question or an answer), so run `supabase db push` and redeploy `supabase functions deploy jarvis --no-verify-jwt`. The status bars show real things: how many of the screen's data parts loaded, whether the voice and AI keys are set, the share of the last 20 owner alerts that were delivered, and whether web search is on.

## Jarvis memory (migration 0112)
Jarvis keeps short notes about how the owner likes to work (`jarvis_notes`) and counts what the owner asks about most (`jarvis_topics`). The notes are put into his instructions on every answer and in the morning brief, so he adapts. He saves a note only when the owner says something lasting ("keep briefs short", "call them team leaders") and forgets one when asked. The owner can see and delete notes in the MEMORY box on the Jarvis screen. Telegram follow-up memory now lasts 3 hours (last 10 messages). After `git pull` run `supabase.cmd db push` (answer Y) and `supabase.cmd functions deploy jarvis --no-verify-jwt`.

## Jarvis company knowledge base (migration 0113)
The owner uploads (or pastes) the company document in the KNOWLEDGE box on the Jarvis screen. It is cut into sections at its `# ` headings and stored in `jarvis_knowledge`; Jarvis sees the list of sections and any "rules" section on every answer, and reads the right section with `lookup_knowledge`. The document is confidential and the repository is public, so it is never committed: it lives only in the database. Uploading again replaces the old one. Deploy: `supabase.cmd db push` then `supabase.cmd functions deploy jarvis --no-verify-jwt`.

## Jarvis learning loop and weather (migration 0114)
- **Thumbs up/down** under each answer on the Jarvis screen. A thumbs-down can say why: with a reason it becomes a saved note straight away; without one, Jarvis proposes a note for the owner to approve.
- **Nightly review** at 22:00 Manila: Jarvis reads the day's questions (kept 14 days in `jarvis_turns`) and thumbs (`jarvis_feedback`), and proposes up to 3 notes (`jarvis_proposals`). They appear in the MEMORY box ("I'd like to learn") with ✓ / ×; nothing is saved until the owner approves. Rejected ones are not proposed again.
- **Weather check** at 18:00 Manila for tomorrow's jobs, using the free Open-Meteo forecast (no key) for the city found in each site address. A message is sent only when rain, thunderstorms or strong gusts threaten a job; the morning brief also mentions risks for today's jobs, and he can answer "will it rain tomorrow?" with the `get_weather` tool.
- Deploy: `supabase.cmd db push` (answer Y) then `supabase.cmd functions deploy jarvis --no-verify-jwt`.

## Attendance auto-approval rules (migration 0115)
Attendance approves itself ("auto") in two cases, so the Owner only sees what really needs a decision: (1) the person is listed as present on that day's Site Check-In, even if they clock in after it was saved; (2) with Admin's "Approve normal attendance automatically" ON, a finished day with no overtime and lateness within Admin's threshold (default 15 minutes, after the grace period); leaving early no longer blocks it. Late beyond the threshold, overtime, corrections and open records still wait. The migration also approves the last 14 days of waiting records that already fit. Deploy: `supabase.cmd db push` (answer Y); no function deploy is needed.

## Driver incentive (migration 0116)
In Employees (payroll access) a person can be marked **Driver: Yes** with a fixed incentive per day driven. On a job order (booking), the form has a **Driver** field listing the assigned crew who are drivers; only the one chosen earns the incentive, even if two drivers ride in the van. It is paid for each day they attended as the chosen driver (two jobs on one day pay once; a multi-day job pays each day, in the pay period of that day; not tied to the handover signature), appears as a "Driver" column in payroll and in the crew member's "My earnings this week". Deploy: `supabase.cmd db push` (answer Y).

## Job extra bonuses (migration 0117)
Beyond the panel bonus, Outside Metro Manila (₱250) and Commercial, the Owner can switch on per job (Payroll, "Crew bonus per job order"): **2nd site** (₱300 per crew member), **Night shift** (₱500 per crew member; the row hints when the job runs between 10 PM and 6 AM) and **Manlift** (₱500, only for crew marked **Manlift operator** in Employees). Amounts are in Payroll's "Pay per job order & crew bonuses" settings. Like the other job bonuses they are paid once the client signs the handover, show in payroll (columns "2nd site", "Night shift", "Manlift") and in the crew's My earnings. Only the Owner can switch them on (database guard). Deploy: `supabase.cmd db push` (answer Y).
