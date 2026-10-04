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
