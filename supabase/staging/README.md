# Staging environment for TopMop AI V2 (separate Supabase project)

Nothing here touches production. Do these steps on your PC, in order. Use a **new** Supabase project; never reuse production's keys or secrets.

## 0. Hazards found in this repository (read once)
1. **Production address inside migrations.** Nine migrations (0046, 0048, 0058, 0088, 0093, 0110, 0114, 0127 and others) hard-code `https://ghbumxivporzsalivgyg.supabase.co` in database triggers and scheduled jobs (alerts, Jarvis briefs, client SMS reminders, marketing posts, Job Order follow-ups). In a staging copy they would call **production's** functions. Step 3 (`neutralize.sql`) stops every scheduled job; the staging vault must **not** contain `webhook_secret`, so production's functions reject anything that still leaves staging.
2. **The app.** The web app only talks to a database when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist at build time; without them it runs in demo mode (browser storage only). Never give a staging or preview build the production values (see the Vercel checklist below).

## 1. Create and link the project
```powershell
cd C:\Users\Master\cuddly-couscous
git fetch origin staging/ai-v2
git checkout staging/ai-v2
supabase.cmd login
supabase.cmd link --project-ref <STAGING-REF>
supabase.cmd db push            # applies 0001 ... 0133 to STAGING (check the project ref it prints!)
```

## 2. Secrets (staging only; type them yourself, never paste them in chat)
```powershell
supabase.cmd secrets set LEAD_INTAKE_KEY=<a new long random text>
supabase.cmd secrets set ANTHROPIC_API_KEY=<a separate test key with a low spending limit>
supabase.cmd secrets set CHAT_DEBOUNCE_MS=1500
```
Do **not** set `WEBHOOK_SECRET` to production's value and do **not** set `MANYCHAT_API_TOKEN` (replies then stay as drafts and nothing reaches a customer), except for the optional delivery test in step 8.

## 3. Neutralise staging
In the staging project's SQL editor run `supabase/staging/neutralize.sql`. Expected: "OK: no webhook_secret in the staging vault" and an empty `cron.job` list.

## 4. Deploy the functions (to staging)
```powershell
supabase.cmd functions deploy chat-brain chat-estimate chat-availability chat-book chat-send chat-recover lead-intake --no-verify-jwt
```

## 5. Settings and rulebook
In the SQL editor:
```sql
insert into public.settings (id, data) values ('main', '{"chat_ai": {"mode": "suggest"}}'::jsonb)
on conflict (id) do update set data = jsonb_set(coalesce(public.settings.data, '{}'::jsonb), '{chat_ai}', '{"mode":"suggest"}'::jsonb);
```
Then publish the rulebook V2.1 as a staging copy: `node scripts/staging/rulebook-sql.mjs MASTER_RULEBOOK_V2.1.md > rulebook-staging.sql` and run that file in the SQL editor. (Alternatively run `npm run dev` with a `.env.local` that points at the STAGING project and import the file in Admin, AI Rulebook.)

## 6. Recovery job (staging)
Open `supabase/cron/chat-recover.sql`, replace `<PROJECT_URL>` with the **staging** address, run it in the staging SQL editor.

## 7. Run the real-model scenarios
```powershell
$env:STAGING_URL="https://<STAGING-REF>.supabase.co"
$env:STAGING_KEY="<the staging LEAD_INTAKE_KEY>"
$env:STAGING_SERVICE_KEY="<the staging service-role key>"
node scripts/staging/run-scenarios.mjs
```
It refuses to run against the production project, creates its own test conversations (subscriber ids starting `stg-`), prints every reply with pass/fail checks (A to G, plus a full the booking form) and removes its own rows at the end. Save the output and send it back.

## 8. Optional: actual delivery to a ManyChat test contact
Only with a ManyChat **test contact** (for example your own Messenger account): set `MANYCHAT_API_TOKEN` on the staging function, set `chat_ai.mode` to `auto` on staging, pass `STAGING_SUBSCRIBER` (your own ManyChat contact id) and run `node scripts/staging/send-as.mjs`; type customer messages there and the replies must arrive in that Messenger chat. Switch the mode back to `suggest` afterwards and remove the token.

## Vercel checklist (cannot be verified from the repository)
- Project, Settings, Git: the **Production Branch** is `claude/topmop-operations-app-fas1zc`. `vercel.json` on `staging/ai-v2` sets `git.deploymentEnabled` to `false` for that branch, so it is not built at all.
- Settings, Environment Variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be ticked for **Production only**. If they are ticked for Preview or Development, any preview build would talk to production data; untick them (a preview without them runs in demo mode, which cannot reach production).
- Settings, Deployment Protection: keep previews private (Vercel Authentication) while testing.
