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
| **Accounts** | One account creates one company (tenant) with name, TIN, VAT status. Roles: owner / admin / staff / viewer. |
| **Scan** | Phone camera or file upload, photos downscaled before upload, SHA-256 duplicate-photo detection, per-plan monthly scan quota. |
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
delete. `plan` is not writable from the browser (column grant removed) and `consume_scan()` enforces quotas atomically in the database.

### Billing (not built yet)

Plans and limits are defined in `src/lib/bir.ts` (`PLANS`, prices are placeholders) and `plan_limit()` in the migration — keep them in sync.
In cloud mode clients can't upgrade themselves: add a PayMongo/Xendit webhook (Supabase edge function using the service role) that sets `companies.plan` after payment.

## Not done yet / honest limits

- **Not yet tested against a live Supabase project or the live Claude API** (no credentials in the build environment). The demo mode, BIR rules, exports and UI are tested (unit tests + a real-browser run); the SQL, RLS and the edge function were written carefully but need a first real run — use the checklist below.
- Photos only — no PDF upload, no multi-page receipts yet.
- No team invitations UI (the schema supports multiple members and roles).
- No payment integration; no email-in; no accountant multi-client dashboard.
- **Tax content must be confirmed by a CPA before you sell this**: the SLP/withholding layouts are working papers, not BIR-accredited output or e-filing files (no .DAT/alphalist yet); record-retention period, EOPT invoice rules and ATC codes are the accountant's call. Don't market it as BIR-accredited.
- Data Privacy Act: you will hold business and personal data — publish a privacy policy, sign DPAs with customers, and register with the NPC if you meet the thresholds.

### First live-run checklist

1. Sign up two companies; confirm company B cannot read A's receipts or photos (try the REST API with B's token).
2. Scan 10 real receipts (clear, blurry, thermal, handwritten OR) and measure how many fields need correction.
3. Hit the free-plan limit and confirm the 402 message shows.
4. Confirm a `staff` user can't delete and a `viewer` can't write.
