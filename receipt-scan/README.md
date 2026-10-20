# ResiboScan — receipt scanning for BIR records (Philippines)

A multi-tenant web app for small Philippine businesses. Each company signs up for its own account, scans receipts and
invoices with a phone camera, reviews the extracted fields, and exports Excel/CSV for their accountant or BIR filing.

> Separate project inside this repo (the root app is TopMop Operations). Everything lives in `receipt-scan/`.

## Run it

```bash
cd receipt-scan
npm install
npm run dev        # http://localhost:5173  — demo mode, no setup
npm test           # BIR rules + export tests
npm run build
```

**Demo mode** (no `.env.local`): accounts and receipts live in the browser's localStorage so you can click through the
whole product. It has **no automatic receipt reading** (you type fields in) and is not secure storage. Use it for demos only.

## What it does

| Area | Details |
| --- | --- |
| **Accounts** | Two kinds of signup: a **business** (one private company workspace) or an **accounting firm** (many client workspaces under one login). Roles: owner / admin / staff / viewer. |
| **Client list (firms)** | One screen for all of a firm's clients: receipts and spend this month, how many are waiting for review, scan usage, last activity. Click a client to open their workspace; "← All clients" brings you back. Summary CSV download. |
| **Owner console (you)** | Every company and firm on the platform: usage vs limit, last activity, owner email, search and filters. Raise a scan limit (+50 / +100…), pause or reactivate a company, set how many clients each firm may have, export the whole list. |
| **Scan** | Phone camera or file upload, photos downscaled before upload, SHA-256 duplicate-photo detection, monthly scan limit per company (default 100). |
| **Extraction** | Edge function sends the photo to Claude with a strict "never guess" prompt and returns fields + per-field confidence. Low-confidence fields are highlighted. |
| **Review** | Side-by-side photo and form. Live checks: missing/invalid TIN, breakdown ≠ total, wrong 12% VAT, VAT charged by a NON-VAT supplier, duplicate invoice no., future date. **Verify is blocked while a red error remains.** |
| **Dashboard** | Spend this month/quarter, claimable input VAT, VAT lost on non-qualifying receipts, needs-review queue, 6-month and category charts. |
| **Export** | Excel workbook (Purchase journal, Summary List of Purchases / input VAT, By category, By month, Withholding tax) and per-sheet CSV, by month/quarter/year/custom range. Verified-only by default. CSV/Excel cells are neutralised against formula injection. |
| **Backup** | Full JSON download in Settings. |

## Go live (cloud mode)

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`).
2. Auth → enable email sign-in (and decide whether to require email confirmation).
3. Deploy the reader:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy extract-receipt      # keep JWT verification ON
   ```
4. Copy `.env.example` → `.env.local` with the project URL and anon key, then `npm run build` and host `dist/` (Vercel/Netlify/Cloudflare Pages).

### How tenant isolation works

Every table carries `company_id`; Postgres row-level security restricts rows to members of that company, and the private
`receipts` storage bucket is keyed `<company_id>/<hash>.jpg` with the same rule. Viewers are read-only; only owner/admin can
delete. `scan_limit` is not writable from the browser (column grant) and `consume_scan()` enforces it atomically in the database.

### Becoming the platform owner

The owner console is only visible to accounts listed in `platform_admins` — nobody can add themselves (the table has no client access).
After you have signed up with your own email, run this once in the Supabase SQL editor:

```sql
insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';
```

Sign out and in again and an **Owner console** item appears. In **demo mode** the same thing exists as a built-in login
(`owner@resiboscan.demo` / `admin12345`, one click on the sign-in screen) so you can try it without a server.

### Accounting firms

A firm signs up as "I'm an accountant / bookkeeper", then adds clients from the Clients page. Each client is its own company
(own receipts, photos, TIN, scan limit) owned by the firm's login. A firm can create up to `profiles.max_clients` clients
(default 10) — raise it per firm from the owner console when they pay for more. Your pricing lever: *clients per firm*.

### Paused accounts

Pausing a company in the owner console makes it read-only: the owner can still view and export their records, but cannot scan or
save (enforced in the database by `can_write()` / `consume_scan()`), and sees a banner explaining why.

### Scan limit

Each company gets 100 receipt scans per calendar month (`companies.scan_limit`, default 100) so API costs stay predictable. Raise it for one customer in the SQL editor:

```sql
update companies set scan_limit = 300 where id = '<company id>';
```

There are no plans, prices or payments in the app.

## Not done yet / honest limits

- **Not yet tested against a live Supabase project or the live Claude API** (no credentials in the build environment). The demo mode, BIR rules, exports and UI are tested (unit tests + a real-browser run); the SQL, RLS and the edge function were written carefully but need a first real run — use the checklist below.
- Photos only — no PDF upload, no multi-page receipts yet.
- No team invitations UI, and no way yet for a client to be invited into the workspace a firm created for them (the schema supports multiple members and roles).
- No payments by design (the owner console is where you raise limits by hand); no email-in; no "view as client" for the owner (support access is deliberately not built — decide a privacy policy for it first).
- **Tax content must be confirmed by a CPA before you sell this**: the SLP/withholding layouts are working papers, not BIR-accredited output or e-filing files (no .DAT/alphalist yet); record-retention period, EOPT invoice rules and ATC codes are the accountant's call. Don't market it as BIR-accredited.
- Data Privacy Act: you will hold business and personal data — publish a privacy policy, sign DPAs with customers, and register with the NPC if you meet the thresholds.

### Database tests

`supabase/tests/` contains 9 security tests that run against a plain local Postgres with a stub of Supabase's `auth`/`storage`
(`supabase/tests/run.sh`). They check: company isolation, locked columns, firm client limit and isolation, scan quota, owner-only
functions, and paused accounts. They passed when this was written; **rerun them after any change to the migrations**.

### First live-run checklist

1. Sign up two companies; confirm company B cannot read A's receipts or photos (try the REST API with B's token).
2. Scan 10 real receipts (clear, blurry, thermal, handwritten OR) and measure how many fields need correction.
3. Hit the monthly scan limit (set it to 2 in the owner console) and confirm the message shows.
5. Sign up as a firm, add two clients, and confirm a client workspace never shows another client's receipts.
6. Pause a company in the owner console and confirm it can view/export but not scan or save.
4. Confirm a `staff` user can't delete and a `viewer` can't write.
