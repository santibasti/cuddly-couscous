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

## Multi-day jobs (migration 0118)
A job over several days is followed day by day: the calendar chip, the Happening Today board and a "Day by day" card on the job show each day's own state (scheduled, working, day done, no clock-in) from that day's attendance, not the job-wide status. The Attendance page lists the job every day it runs, and the "missing clock-in" alert checks every day. The Site Check-In (once, on the first day) now also approves the crew's attendance on the following days of the same job. Deploy: `supabase.cmd db push` (answer Y).

## Per-day pay on multi-day jobs
Staff paid **per job order** earn their job rate for each day they worked on a multi-day job (a day = an approved, clocked-in attendance dated that day; a shift past midnight is still one day). Each day is paid in the pay week it falls in; the weekly payroll table shows each day's pay, and "My earnings this week" adds the rate on each day worked. Job costing uses the same rule. No database change.

## AI Headquarters, step 1 (migration 0119)
`agent_events` is a log of what the automated desks of the business really did, written by database triggers when something happens: a new inquiry (the Facebook ones go to the Messenger Receptionist), a quotation drafted / sent / approved, a discount request waiting, a booking created, a job order drafted or sent, a marketing post drafted (waiting for approval) / published / failed, and Jarvis's own activity. Titles hold only numbers and general words, never client names or amounts. The owner's **AI Headquarters** screen (menu: Overview) reads it live (Realtime) and animates the characters from it: working, handing over to another desk, waiting for approval, finished, problem; idle agents wander to the AI Café (decorative, no AI calls). Agents with no real feed yet are marked **PLANNED** and only idle. The screen has a clearly labelled DEMO MODE with a scripted preview. Events are kept 30 days. Roster and rules: `src/lib/hq.ts`. Deploy: `supabase.cmd db push` (answer Y); no function deploy needed.

## Lead Flow (screen only, no database change)
Sales → **Lead Flow** shows every lead on its road: New inquiry → Quotation ready → With the client → Client said yes → Booked, crew needed → Job order to send → Ready to go. Steps come from the existing inquiries, quotations, jobs and job orders. The gold steps are approval gates; the buttons ("Prepare the quotation" from the rate list, "Approve & mark as sent", "Client said yes / declined", "Book it" with suggested free days and team, "Assign this team") use the same pricing list and the same quotation and double-booking rules as the other screens, and nothing is sent to a client automatically. Leads older than 30 days (and jobs that already started) are hidden until asked for. Each step is looked after by a character of the AI Headquarters, and the database events from migration 0119 keep the Headquarters moving.

## AI Headquarters: cinematic view
The default view of AI Headquarters is concept art (`public/hq/headquarters.webp`) with a live layer on top: glowing rings on departments that are working (cyan), waiting for the Owner (gold) or in trouble (red), light packets that travel to the AI core when something really happens, an AI core that ripples on Jarvis activity, and "holographic" panels that replace the painted dashboards with real figures from the app (or "Not connected yet"). The painted people, robots and numbers are art only. The previous animated floor plan is still available with the "Floor plan" button. The picture is served as a public file, so use only art you are happy to have public; to change the look, replace that file (keep the same layout or adjust the zone coordinates at the top of `src/components/HqCinematic.tsx`).

## AI Headquarters: the living office (Studio view)
The default view is now a coded 2.5D glass-walled office (React + CSS/SVG, with Motion for the camera and the slide-over panels): nine rooms with desks, chairs and monitors, glass corridors, and 26 miniature robots that sit, type, wait, hand over work, cheer and stroll to the AI café. Cinematic (concept art plus a live layer) and List (accessible tables) are other views. What the robots DO comes only from real events (the `agent_events` log from migration 0119, restored for the last 24 hours on load, merged without duplicates, and re-fetched after any reconnect); a late event keeps its own time, so it never replays an old animation. Monitors glow only while their agent really has work; PLANNED departments are dimmed and never show work. Clicking a room zooms the camera to it and opens its work queue; clicking a robot opens its task, recent activity and links to the real screens (Lead Flow, Marketing, Jarvis). DEMO MODE is a labelled sample scenario with Start / Pause / Reset (a Facebook lead about glass cleaning in Makati, handed from Messenger to Booking to an approval); it sends, books and saves nothing. Motion pauses while the scene is off screen or the tab is hidden, and respects the reduced-motion setting and the "Pause motion" button. Files: `src/pages/Headquarters.tsx`, `src/components/HqStudio.tsx`, `HqRobots.tsx`, `src/lib/hq.ts`, `hqsim.ts`, `hqscenario.ts`.

## AI Headquarters: Rooms · V2 (living office) and real events
The **Rooms · V2** view (`src/components/HqWing.tsx`, `HqBot.tsx`, `src/lib/hqwing.ts`) shows nine rooms joined by corridors with automatic sliding doors. It uses the same `agent_events` feed as the other views (no new migration, no deploy). What is real: a door opens only while someone really walks through it; a **hand-over event** (an event with a receiver, e.g. the qualifier passing a lead to Quotation, Booking passing a booking to Scheduling) makes the sender walk the task card to the receiver's desk and back (one task at a time per person, a burst waits its turn); a **start event** sends a pulse from JARVIS to that room; an **approval** turns the room's door light amber and shows "waiting for you" on the JARVIS core; a **problem** turns it red; a **finished** task flashes it green. What is decorative: breathing, blinking, and idle agents taking a break in the AI Café (scripted chat, no AI calls); an agent with a task never goes there, and a new task sends it straight back to the desk. Rooms with no live feed say NOT CONNECTED and their agents only rest. The top badge shows LIVE, RECONNECTING (last 24 h kept, nothing lost) or SAMPLE. The screen corrects for a wrong computer clock using the time of each fresh live event, and does no work while hidden, off screen, paused or when reduced motion is on.

## AI Headquarters: HR attendance feed (migration 0120)
Alex, the Attendance Analyst, is now a **live** agent and the Human Resources room shows LIVE. Database triggers write facts to `agent_events` when attendance really changes: a worked day finishes and was approved automatically (finished flash), a worked day waits for approval (the HR door light turns amber and JARVIS shows "waiting for you"), a time correction is sent, the owner approves or rejects (finished / noted, and if more items still wait the desk goes back to waiting). Titles hold only general words and counts, never names, times or pay. It does not change attendance and cannot make a clock-in, clock-out, correction or approval fail. The HR room's work queue lists the real pending days and corrections with a button to Attendance; Records (Ron) and Training (Tess) stay PLANNED. Deploy: `supabase.cmd db push` (answer Y); no function deploy.

## AI Headquarters: Services today (inside Booking & Scheduling)
Today's services live in the **Booking & Scheduling** room: a "Services today" pill on its wall (done out of total, working on site, on the road) and, when you open the room, the full list: each job going on today with its stage (scheduled, on the way, arrived, working, finished, heading back, back at HQ, no clock-in) and the crew on site out of the crew assigned, with a link to the Happening Today page. It uses the same stage rules as that page (`src/lib/todaystage.ts`, shared by both). In demo mode it shows three clearly labelled SAMPLE services. Screen only: no migration or deploy.

## AI Headquarters: everyday life in the office (Rooms view)
Decorative touches that never read or change a business status: a **wall clock** in every room and a digital Manila clock and date in the JARVIS atrium; **day and night lighting** that follows the Manila clock (dawn, day, dusk, night: sky colour, stars, a soft tint, a warmer café), with a button to preview day or night; a **cleaning robot** that patrols every corridor and connector with a mop; and a **water cooler** in the six work rooms where an idle agent now and then walks over, drinks for a few seconds and walks back (never while the agent has a task, and never when a hand-over is in progress). Screen only: no migration or deploy.

## ManyChat: Messenger leads and "is that date free?" (functions `lead-intake` + `chat-availability`)
ManyChat runs the conversation in Messenger and replies to the customer. TopMop supplies the facts and keeps the records. ManyChat is already an approved Meta partner, so this works without the Messenger App Review that the direct Page assistant above needs.

**What the chat does:** greets, asks the service, place, property type, a date and the mobile number; asks TopMop whether the date is free (`chat-availability`); offers the nearest open dates when it is not; at the end sends the lead (`lead-intake`), which creates the client and the inquiry (source "Facebook") and alerts the owner. The chat never gives a price or confirms a booking: it says a person reviews the details and confirms. (Prices stay with the approved quotation in Lead Flow.)

**Rules** (Admin → Settings → *Messenger booking rules*): earliest day (default 2 days from today), closed weekdays (default Sunday), most jobs in a day (**2**), how far ahead to look (21 days), alternative dates offered (3). A day is open while it has fewer than the daily limit of live jobs; regular holidays are closed. Optionally also require a free team leader, crew and vehicle (off by default). It checks the same calendar as the booking form, does not book or hold anything, and a customer's date is only ever a request.

**Setup**
1. Use the same secret as the lead address (`supabase secrets set LEAD_INTAKE_KEY=your_long_random_key`) and deploy both: `supabase.cmd functions deploy lead-intake --no-verify-jwt` and `supabase.cmd functions deploy chat-availability --no-verify-jwt`. No `db push` is needed.
2. In ManyChat (an **External Request** step needs the Pro plan; check ManyChat's current pricing and Messenger rules on their site): after the customer types the date, add an External Request, method **POST**, URL `https://<project-ref>.supabase.co/functions/v1/chat-availability?key=your_long_random_key`, body `{"when": "{{preferred_date}}"}` (your date field; a real date such as `2026-11-21` also works; the words "Saturday", "bukas", "Nov 21" are understood).
3. Map the answer to fields: `status`, `reply_en`, `reply_tl`, `alt1_label`, `alt1_date`, `alt2_label`, `alt2_date`, `alt3_label`, `alt3_date`. Send `reply_en` (or `reply_tl` for a Tagalog chat) as the next message, and add quick-reply buttons from the `alt*_label` fields. `status` is `available`, `full`, `closed`, `too_soon` or `unclear`.
4. At the end of the chat, call `lead-intake` as in the section above, with the chosen date in `preferred_date`.

Quick test from PowerShell: `Invoke-RestMethod -Method Post -Uri "https://<project-ref>.supabase.co/functions/v1/chat-availability?key=your_long_random_key" -ContentType "application/json" -Body '{"when":"next Saturday"}'`

Not built (decide later): a soft hold on a date while the customer decides, an instant price estimate in the chat, photos from the customer, and replying from an AI inside ManyChat.

### ManyChat: book an open date automatically (function `chat-book`, migration 0121)
Admin → Settings → Messenger booking rules → **Book open dates automatically** (off by default). Use `chat-book` instead of `lead-intake` at the end of the chat when the customer has given name, mobile, address, service and a date (same address pattern and key; body as `lead-intake` plus `"date"` or `"when"`).
- **The date is not open** (full, closed, too soon, or not understood): nothing is saved or booked; the answer offers the nearest open dates (`alt1_label`, `alt1_date` ...).
- **Open and the switch is ON:** the lead is saved and the date is booked as a **Confirmed job with no team, vehicle or price** (stage "Booked", a person arranges the team and sends the quotation). The check and the booking happen in one step under a lock on that day, so two customers can never take the last place. The customer reply (`reply_en` / `reply_tl`, `status` = `confirmed`, `job_number`) names the date and reference and says the arrival time and final price follow; the owner gets an alert and the booking appears in the AI Headquarters.
- **Open and the switch is OFF:** the lead is saved and the answer says our team will confirm (`status` = `pending_human`), as before.
- If the last place is taken at the same moment, or the booking fails, the chat never says "booked": it offers other dates or says a person will confirm, and the owner is alerted.
Deploy: `supabase.cmd db push` (answer Y), then `supabase.cmd functions deploy chat-book --no-verify-jwt` (and redeploy `chat-availability`). Try one test booking and cancel it in Jobs before enabling the switch for real customers.

### ManyChat: the price talk (function `chat-estimate`, shared rates)
The chat never makes up a price. `chat-estimate` returns the **starting rates** (city package and included panels, ₱140 per extra panel, or the per-unit rate and minimum for roof, wall, floor and solar) and, when the customer gives a count, an **estimate**. Every estimate says it is only an estimate, that **the crew does the final count on site and the final amount follows that count** (English and Tagalog, `estimate_en` / `estimate_tl`); an unknown city says a person will verify the rate. Example: Makati, about 40 panels → ₱4,799 for up to 31 panels + 9 extra × ₱140 = estimated ₱6,059.
- Setup: `supabase.cmd functions deploy chat-estimate --no-verify-jwt` (same `LEAD_INTAKE_KEY`). Body: `{"address":"Makati","service":"window cleaning","panels":40}` (`qty` = square metres for roof / wall / floor).
- `chat-book` also accepts `panels` (the answer then carries the estimate sentence) and `rates_ok: true` (the customer said yes to the starting rates; saved on the inquiry with the time). Redeploy it: `supabase.cmd functions deploy chat-book --no-verify-jwt`.
- The rate table is one file for the whole system (`supabase/functions/_shared/rates.ts`); the app's Quick booking uses the same file, so the chat and the app can never quote different prices. To change a rate, change that file.
- The Job Order the customer receives shows the **rates** (quantities counted on site), never a fixed total; extra panels counted by the crew are added at ₱140 as an addition, as today. (Creating that Job Order automatically from the chat is the next step; see the booking notes above.)

### ManyChat: Taglish, the internal quotation and the automatic Job Order (migration 0122)
- **Taglish.** `chat-availability`, `chat-estimate` and `chat-book` take `"lang": "en" | "tl" | "taglish"` and return the ready-to-send text in `reply`, plus `reply_en`, `reply_tl` and `reply_tglish` (Taglish customers get Taglish with "po", the same dates and the same figures). Let ManyChat store the customer's language and pass it on; a Taglish customer should keep getting Taglish.
- **Internal pre-approved quotation.** When the chat books a date it also makes the quotation at the **starting rates** (the city's package for glass, the minimum for roof / wall / floor / solar), already Approved, never sent to the client: the client agreed to the rates in the chat and sent the details. It exists because the Job Order and the invoice are built from it. The crew counts the real quantity on site; extra panels are added at ₱140 as today. A city that is not in the rate list is still booked, without a quotation, and the owner is alerted to price it.
- **Job Order, option A (your choice for now; the switch is off).** The app drafts the Job Order for the booking (rates inside, quantities counted on site) and you send it with one tap, as with Quick booking.
- **Job Order, option B (switch it on when you decide).** Admin → Settings → Messenger booking rules → **Create and send the Job Order automatically** (needs "Book open dates automatically" on). The booking then also creates the Job Order, marked sent "Messenger chat (automatic)", and the answer carries `job_order_link` (also inside `reply`). The Job Order is written by the **same code as the app** (a bundle in `supabase/functions/_shared/appcore.mjs`; after changing pricing or Job Order code run `npm run build:core` and commit it; a test fails if it is stale). Set the address of the app once: `supabase.cmd secrets set APP_URL=https://ops.topmop.ph`. If the Job Order cannot be made, the booking stands and you get an alert.
- **Deploy:** `supabase.cmd db push` (answer Y; migrations 0121 and 0122), then `supabase.cmd functions deploy chat-book --no-verify-jwt`, `chat-availability`, `chat-estimate` (same flags). Make one test booking and cancel it in Jobs before enabling anything for real customers.
- **Fix found on the way:** Quick booking priced "Solar Panel Cleaning" as a glass-panel package because the word "panel" matched; it is now priced as a solar job (₱245 per panel, minimum 20).

## Minimum charge waived for a second service (booked with any main service)
When a window-cleaning (glass) package is part of the booking, the minimum charge of the add-on services (roof, wall, floor, solar) no longer applies: the add-on is billed for the quantity the crew counts on site at the standard rate (e.g. 10 solar panels = ₱2,450 instead of the 20-panel minimum, ₱4,900). Without a glass package the minimums stay (roof 100 sqm, wall / floor 50 sqm, solar 20 panels). A minimum negotiated on a line (Owner / Admin) still applies. This is in the Final Quote's line normalisation (`resolveReviewItems`), so the invoice follows it. In the chat, `chat-estimate` takes `"with_glass": true` for an add-on asked together with a window package: the answer says there is no minimum charge and the estimate is rate × quantity. Screen and function change only: no migration. Redeploy `chat-estimate`.

## Glass package list corrected (migration 0123)
TopMop has no ₱5,700 or ₱7,799 package. Migration 0049 had added them to the glass price list (Admin → Pricing). Migration 0123 removes those two and adds the missing ₱5,799 / 41-panel package, so the list matches the rate list: ₱4,799 / 31 (the base), ₱5,799 / 41, ₱6,799 / 41, ₱12,799 / 51 (each extra panel ₱140). A package you added by hand is left untouched. Run it with `supabase.cmd db push` (answer Y).

**Update (any main service, not only glass).** The waiver applies when the job already has a booked main service: a glass package, a roof job, any basic package or service on its quotation. Every further service added to it (roof, wall, floor, solar) is billed **per square metre or per panel for the quantity counted on site, with no minimum**; the main service keeps its own minimum. Example: roof booked (100 sqm minimum stays), floor added at 30 sqm = 30 × ₱125 = ₱3,750 (alone, floor would be billed at the 50 sqm minimum, ₱6,250). In the chat send `"with_main": true` (alias `with_glass`) to `chat-estimate` for the second service. Not changed: the first draft in the quotation builder still shows a minimum on a second service; the Final Quote (billing) applies the waiver.

## AI Rulebook (migration 0124; menu: System → AI Rulebook)
The customer-service rules of the chat are **versioned data**, not text buried in a prompt. Owner / Admin only (permission `admin.settings`).
- **Edit** a draft: sections with a title and text. **Import from Markdown** splits a pasted rulebook at every `## ` heading (the text itself is never in the code or the repository; it lives only in the database); **Export** copies it back out as Markdown.
- **Test** it: "Run the tests" checks the parts of the chat that are code: package prices and estimates (Makati 40 panels = ₱6,059, 21 panels = ₱4,799), the "crew counts on site" wording, unknown cities, commercial and custom-quote services (never priced from the residential table), minimums and the second-service waiver, closed and full dates, Taglish. A draft is also checked for the required sections (identity, pricing, booking, handover, non-negotiable rules), empty or duplicate sections and length.
- **Publish** only after the tests passed on the saved draft. One version is published at a time, one draft at a time; the previous version is kept. **Restore as draft** copies any old version into a new draft (rollback: test and publish it again). Published and archived versions are never edited. All changes go through database functions (`rulebook_save_draft`, `rulebook_tests_passed`, `rulebook_publish`, `rulebook_restore`).
- **What is not in it:** the rates (Admin → Pricing / the rate list) and the booking rules (Settings → Messenger booking rules), so a rule cannot be changed by editing wording.
- **Use today:** `chat-book` records the published version on each inquiry ("Rulebook version: n"). The chat functions do not read the rulebook text yet; the AI brain for free-text questions will (next step), always calling the price, date and booking functions for facts.
- Deploy: `supabase.cmd db push` (answer Y), `supabase.cmd functions deploy chat-book --no-verify-jwt`, then the usual "Update now". In the demo build the screen works in this browser only.

## AI chat: the AI brain in ManyChat (functions `chat-brain` + `chat-send`, migration 0125; menu: Sales → AI Chat)
Every customer message from ManyChat goes to `chat-brain`. The AI (Claude) answers from the **published AI Rulebook** and gets every price, date and booking from the system's own functions (`chat-estimate`, `chat-availability`, `chat-book`, `lead-intake`), never from memory. It never confirms a booking itself (the system writes that sentence), and hands over complaints, refunds, discounts, contracts, unusual or unsafe work, commercial properties and anything it is unsure of.

**Modes** (Admin → Settings → AI chat; default Off):
- **Suggest (start here).** The AI writes a **draft**; nothing is sent. The draft waits in **AI Chat** with its safety flags and the actions it would take (book the date, save the lead). Staff edit it, **Approve & send** (the actions run once, then the reply goes to the customer through ManyChat) or **Discard**. A booking's wording comes from the system, not from the draft.
- **Full.** The reply goes out at once, unless a safety check fails: then the customer gets a safe sentence ("Ire-refer ko po ito sa aming team…"), the conversation is marked **Needs a person** and the owner is alerted.
- **Off.** Messages are only stored.
In both modes a conversation marked **Needs a person** (or taken over with **Take over**) gets no AI replies until you press **Hand back to the AI**.

**Safety checks on every reply:** any peso amount must come from a tool or the rate table; no "booked / naka-book na / confirmed" unless the system really booked; no discount, free service, guarantee or rope-access promise; no empty or very long reply. Customer text is treated as information, never as instructions. A message with the same ManyChat message id is handled once (retries are safe). Every message keeps the rulebook version, the tools it called and any error.

**Setup**
1. `supabase.cmd db push` (answer Y; migration 0125), then `supabase.cmd functions deploy chat-brain --no-verify-jwt` and `supabase.cmd functions deploy chat-send` (and redeploy `chat-book`, `chat-estimate`, `chat-availability`).
2. Secrets (on your PC): `ANTHROPIC_API_KEY` (already set for the other AI functions); optional `CHAT_AI_MODEL` (default `claude-haiku-5-5`); **`MANYCHAT_API_TOKEN`** (ManyChat → Settings → API) so an approved reply is pushed to the customer. Without that token, Approve marks the reply approved and copies it so you can paste it into ManyChat's live chat. `supabase.cmd secrets set MANYCHAT_API_TOKEN=...`
3. In ManyChat, for each customer message: **External Request** POST `https://<project-ref>.supabase.co/functions/v1/chat-brain?key=your_long_random_key`, body `{"channel":"messenger","subscriber_id":"{{user_id}}","name":"{{first_name}}","text":"{{last_input_text}}","message_id":"{{message_id}}","lang":"{{language}}"}`; put the answer's `reply` in the next message and send nothing when it is empty. (Use your ManyChat field names; check ManyChat's current rules for External Request time limits, and for sending after the 24-hour window.)
4. Open **AI Chat** to approve drafts, then try a Taglish price question, a date question and a complaint before changing anything for real customers.

## Robot look: glossy toy robots
All the robots (Rooms · V2 desks and walkers, Studio, Lead Flow and the panels) now share one look, drawn in code (original art, no pictures): a round glossy white head with a big dark visor and glowing eyes, a lens ring on the side of the head, chunky joints, a glowing chest light, and boots, all in the agent's own accent colour. In Rooms · V2 each agent holds a prop that tells the job (phone for the inquiry desk, envelope for email, camera for photo and video, clipboard for quotations and job orders, tablet for booking and scheduling, magnifier for analysts, laptop for strategy and finance, a glowing orb for JARVIS). The prop is put away while the agent types or reviews and shows while idle, waiting, handing over or on a break. Screen only: no migration or deploy. Files: `src/components/HqBot.tsx`, `HqOffice.tsx`.

**Each robot has its own shape.** Every agent has its own head (round, tall, square, dome or big), face (a pair of eyes, a wide visor, one big eye, a visor band or a screen with a pixel smile), ears (a lens, headphones, a headset with a microphone or none), antenna (none, a ball or a wire), body (slim, chunky, pear or round) and feet (boots, wheels or big round feet), like a squad of toy robots. The squad is a table in `src/lib/botlook.ts` (change one line to re-shape an agent); a test keeps neighbours in a department from looking alike. The same shapes are used when they sit, stand and walk (side, back and front), in Rooms · V2, the Studio view, Lead Flow and the panels.

## Estimate card (a picture of the estimate; function in the app, migration 0126)
When the AI quotes an estimate with a quantity, the reply can carry a **card**: a TopMop-branded picture with the same figures as the text (package, extra panels, the estimated total, "the final amount follows the crew's count on site", the disclaimer). It is drawn by the app at **`/api/estimate-card?address=Pasay&qty=50`** (a Vercel function, PNG, cached a day) from the same rate table; the address carries only the inputs, so nobody can make a card with a price of their choice. A person-needed answer (unknown city, commercial property, gutter / ACP / ceiling ...) gets no card (the address answers 404).
- **Suggest mode:** the draft in **Sales → AI Chat** shows the card; a tick box "Send this estimate card with the reply" (on by default). **Approve & send** sends the text and then the picture through ManyChat (needs `MANYCHAT_API_TOKEN`).
- **Full mode:** `chat-brain` answers with `card_url` besides `reply`. In ManyChat map `$.card_url` to a text field `ai_card`, and add an **Image** block with `{{ai_card}}` behind a condition "ai_card has any value".
- Setup: `supabase.cmd db push` (answer Y; migration 0126), `supabase.cmd functions deploy chat-brain --no-verify-jwt`, `supabase.cmd functions deploy chat-send --no-verify-jwt`; the picture itself deploys with the app (Vercel). Optional secret `APP_URL` (default `https://ops.topmop.ph`). After changing the rate table or the card design run `npm run build:card` and commit `api/_cardcore.mjs` (a test fails if it is stale).

### Panel-counting picture (`public/panel-guide.png`)
When a customer asks how panels are counted, or the AI explains it, the reply carries the reference picture **"Counted by side, not by size"** (each side of a window is one panel; inside and outside is two; the crew does the final count on site). One picture per reply: the estimate card wins when both apply. Served by the app at `/panel-guide.png`; regenerate with `node scripts/build-panel-guide.mjs`. Deploy `chat-brain` again after pulling.

## Job Order sent a few minutes after the booking (function `chat-followups`, migration 0127)
**Admin → Settings → Messenger booking rules → "Send the automatic Job Order this many minutes after the booking"** (default **10**; 0 = in the same message). With the automatic Job Order on, the booking reply confirms the date and says the Job Order will follow; the Job Order is created at once but **sent** after the delay: `chat-followups` (called every minute by the database, only when something is due) pushes the link through ManyChat and then marks the Job Order "Sent to Client" (so it counts as sent only when the customer really got it). Three tries, two minutes apart; then the owner is alerted to send it by hand. Needs `MANYCHAT_API_TOKEN` (without it, or when the booking did not come from a known subscriber, the link goes in the booking reply as before).
- Deploy: `supabase.cmd db push` (answer Y; migration 0127), `supabase.cmd functions deploy chat-followups --no-verify-jwt`, `supabase.cmd functions deploy chat-book --no-verify-jwt`, `supabase.cmd functions deploy chat-brain --no-verify-jwt`, `supabase.cmd functions deploy chat-send --no-verify-jwt`.
- When the automatic Job Order cannot be made, the owner alert now says why ("Job Order not sent … (reason)"), and the chat-book answer carries `job_order_error`.

## Price records follow the Master Service Pricing List of 13 Nov 2026 (migration 0128)
`supabase.cmd db push` (answer Y) sets the service records to the list: glass base ₱4,799 / 31 panels with the packages ₱5,799 / 41, ₱6,799 / 41 and ₱12,799 / 51 (₱140 per extra panel); roof ₱145/sqm (min 100); exterior wall ₱125/sqm and floor / driveway ₱125/sqm (min 50); solar ₱245/panel (min 20); gutter, ACP and interior wall and ceiling stay custom quote (names follow the list). The city-to-package table of the chat and Quick booking (`_shared/rates.ts`) already matched the list. Existing quotations keep the prices they were made with. A test (`src/lib/pricelist.test.ts`) keeps the records and the chat estimates in step.

## Edited drafts are kept (migration 0129) and the AI's language
- When staff edit an AI draft before **Approve & send**, the sent message keeps what the AI originally wrote (`original_body`). In **AI Chat** such a message shows "✏️ Edited by staff — see what the AI wrote". Use it to spot corrections you make again and again, then turn them into rulebook rules (System → AI Rulebook). The edit itself only changes that one conversation; the AI does not learn from it by itself.
- Language: the AI writes English with a polite "po"; if the customer writes Tagalog or Taglish it replies in Taglish; never in pure Tagalog (the Tagalog price and date texts of the chat functions are not used by the AI).
- Deploy: `supabase.cmd db push` (answer Y), then `supabase.cmd functions deploy chat-brain --no-verify-jwt` and `supabase.cmd functions deploy chat-send --no-verify-jwt`.
