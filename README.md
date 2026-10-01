# TopMop Operations

Field-service operating system for **TopMop Window Cleaning Solutions Corp.** — CRM, quotations, booking, job cards, attendance,
payroll, inventory, equipment out/in, expenses, receivables, job costing, reports and automations, in PHP (₱) and Asia/Manila time.

> **Status:** Phases 1–3 are implemented as a working, demo-ready web app. The app currently runs on an in-browser demo
> data store; the PostgreSQL/Supabase schema, business-rule triggers and RLS policies are complete and tested, but the UI is
> **not yet wired to Supabase** — see [What is and isn't done](#what-is-and-isnt-done).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 48 tests: pricing rules, payroll maths, store rules, seed integrity
npm run build        # type-check + production build
```

Sign in with any demo account (password **`topmop123`**), or use the role buttons on the login screen:

| Role | Login | Lands on |
| --- | --- | --- |
| Owner / Admin | `owner@topmop.ph` | Dashboard |
| Operations Manager | `ops@topmop.ph` | Dashboard |
| Finance / Admin Staff | `finance@topmop.ph` | Dashboard |
| Team Leader | `leader@topmop.ph` | Dashboard (own jobs) |
| Field Employee | `field@topmop.ph` | Clock in/out (mobile-first) |
| Viewer / Accountant | `accountant@topmop.ph` | Reports |
| Client portal | `/#/portal` – any client contact email, password `topmop123` | Quotes / services / invoices |

Sample data is generated relative to *today* (~110 jobs, 16 employees, 13 clients, 24 stock items, 18 assets, 84 invoices,
payroll periods in every status, alerts of every kind), so every module is populated immediately. **Admin → Data & security → Reset** restores it.

## Modules

| Phase | Module | Highlights |
| --- | --- | --- |
| 1 | **Login & roles** | Six roles; permission matrix editable by the Owner (Admin → Permissions); disabled users; route + action level enforcement |
| 1 | **Dashboard** | Today's jobs, crew clocked in/out, machines out, low stock, pending quotes, receivables, revenue/expenses/gross & net profit, payroll payable, upcoming bookings, completed vs scheduled, revenue by service, top clients, balances; filter by date range / branch / service / client; expected → billed → collected → paid strip |
| 1 | **Clients** | Types, status, tax/VAT/withholding, multiple sites, notes & access instructions, quotation/job/invoice/payment/service-report history, complaints, communication log with follow-ups |
| 1 | **Jobs & calendar** | Month / week / day / list; **drag-and-drop rescheduling**; crew, leader, vehicle, equipment, PPE, materials, checklist, before/after photos, findings, damage report, signature sign-off, service-report PDF; **double-booking blocked** for crew, vehicles and machines |
| 1 | **Attendance** | GPS + timestamp + optional selfie, late/undertime/OT/holiday/rest-day/field-work flags, approvals, correction requests with trail, daily view by job site |
| 1 | **Employees** | Full profile, government IDs, bank, documents & expiry, trainings, monthly scorecard & tier |
| 4 | **Dispatch & Return Checklist** | Enforced job flow **Confirmed → Dispatch Checklist Pending → Departed from HQ → Arrived at Site → In Progress → Work Completed → Return Checklist Pending → Returned to HQ → Closed**. Mobile step-by-step departure form (job & crew confirmation synced to attendance → vehicle check with odometer / fuel / photo → tools, machines & PPE with QR scan or typed Asset ID, quantities, condition, damage photo, responsible person → chemicals & materials issued from stock → departure time, GPS, loading photo, Team Leader confirmation). Departing with missing / damaged / short items or absent crew needs a reason and **Operations Manager approval**. “Arrived at site” action on the job card (GPS, contact, before photos, safety briefing, site notes, extra equipment / material requests). Return checklist compares issued vs returned, material usage = issued − returned, ending odometer / fuel / vehicle condition, photos, GPS; syncs asset status (Available / Under Maintenance / Damaged / Missing). Missing or damaged items auto-create incident reports and maintenance tickets, alert Admin and Operations, and keep the job open until resolved or acknowledged. QR labels for every asset (PDF). Edits by Ops / Admin require a reason and are audited with old and new values |
| 1 | **Equipment out/in** | Register, request → approve/release → return with condition, meter, photos; **never checked out to two jobs**; overdue flags; damage auto-creates a repair ticket; utilization & downtime |
| 1 | **Inventory** | Beginning/in/out/reserved/available, valuation (weighted-average cost), expiry & batch, receiving, issue/return to job, waste, adjustments with approval, transfers, physical counts, reversal entries, material requests |
| 2 | **Quotations** | Pipeline (inquiry → ocular → quotation → approval → booked), TopMop pricing rules (glass ₱4,799/31 panels + ₱140 excess, roof ₱145/sqm min 100, wall/floor ₱125/sqm min 50, solar ₱245/panel min 20 — editable in Admin), glass **panel counter** (2×1 m rule, grouped small panels), VAT/discount, PDF, email & WhatsApp share |
| 2 | **Invoices & receivables** | Invoice from job, approval lock, reversal, partial payments, withholding-tax credit, receipts (PDF), statement of account, aging (Current / 1–30 / 31–60 / 61–90 / 90+), reminders |
| 2 | **Expenses** | Categories, VAT/WHT, receipt upload, approval, recurring auto-generation, petty cash ledger |
| 2 | **Payroll** | Pulls approved attendance; regular, OT, holiday, rest-day, leave, allowances, incentives, reimbursements, cash advances, loans; SSS/PhilHealth/Pag-IBIG/withholding tax from **configurable** rates; Draft → For Approval → Approved → Finalized (locked); payslip PDF; register Excel; approved payroll posts to Expenses |
| 2 | **Job costing** | Labor (from attendance), materials (from stock issues), transport, equipment allocation, subcontractors, other; **estimated vs actual** flags; unprofitable-job alerts |
| 3 | **Reports** | 19 reports with PDF, Excel and CSV export (attendance, payroll, scorecards, stock movement/valuation, low-stock/expiry, machine out/in, maintenance, booking calendar, job completion, service report, quotes sent/won/lost, revenue, expenses, aging, statement, P&L, job / client / service-type profitability) |
| 3 | **Automations** | In-app alerts for late/missing attendance, unapproved corrections, upcoming jobs, booking confirmations, low stock, expiring chemicals/PPE, overdue returns, maintenance due, invoices due/overdue, payroll awaiting approval, document/certification expiry, overdue follow-ups; external channels queued per Admin settings |
| 3 | **Client portal** | Clients approve/decline quotations, see bookings, download service reports, invoices and statements |
| — | **Admin** | Users, permissions, service pricing, statutory rates & pay rules, company profile, audit log, recycle bin |

## Rules the system enforces

* No double-booking of crew, vehicles or machines; an asset can't be released to two jobs at once.
* Stock transactions are immutable and can't go negative — fix with reversal/adjustment entries; adjustments need a second approver.
* Approved invoices are locked (reverse instead); payments can't exceed the balance and are reversed, not deleted.
* Finalized payroll periods are locked; completed equipment out/in records can't be edited or deleted.
* Soft delete everywhere; every record carries created/updated date and user; every create / update / approve / reverse / lock / export is in the audit log.

## Architecture

```
src/lib/types.ts       domain model (mirrors the SQL schema)
src/lib/business.ts    pure business logic: pricing, panel counting, VAT, aging, payroll, job costing, P&L, scorecards, conflicts
src/lib/store.ts       audited data store (demo: localStorage) + auth + immutability guards
src/lib/actions.ts     permission-checked domain operations + automation engine
src/lib/seed.ts        TopMop sample dataset
src/lib/export.ts      PDF (jsPDF) and Excel (ExcelJS) generators
src/pages/*            one file per module
supabase/              PostgreSQL schema, triggers, RLS, views, storage (see supabase/README.md)
```

Stack: React 19 · TypeScript · Vite · React Router · Recharts · jsPDF · ExcelJS. Navy / teal / white with TopMop-green action buttons; no gradients or cartoon imagery; responsive with a mobile bottom-nav and stacked tables.

## What is and isn't done

**Verified:** type-check clean; 48 automated tests; every screen loaded under all six roles without console errors; browser-tested flows
(GPS clock-in, quotation pricing, drag-and-drop rescheduling, equipment release, payment + receipt PDF, payroll approve, Excel / PDF downloads);
the SQL migrations, seed and every guard were executed against a real PostgreSQL engine (PGlite) — RLS, immutability, double-booking,
overpayment, negative stock and single-release-per-asset all reject correctly.

**Not done — read before relying on it:**

1. **The UI is not connected to Supabase.** Data lives in `localStorage` in the demo. The schema, RLS and rules are ready in `supabase/`; the remaining
   work is a Supabase-backed implementation of `src/lib/store.ts` / `actions.ts` (async reads, RPC or table writes, Supabase Auth in place of the demo login, file uploads to Storage).
2. **Demo authentication is not secure** (accounts and password hashes ship in the browser bundle). Production must use Supabase Auth; UI permission checks are convenience, RLS is the security boundary.
3. **Statutory rates are placeholders.** SSS / PhilHealth / Pag-IBIG / withholding tax are configurable fields (per period, percent or fixed, with min/cap) filled with sample values; set them to current government schedules. Holidays are a sample list. Pay rules (OT 1.25×, regular holiday 2.0×, special 1.3×, rest day 1.3×) are editable defaults, not legal advice.
4. **Prices for non-standard services** (interior glass, ACP, ceiling, gutter, other) are "custom quote" — TopMop supplied no defaults. Sample client names, TINs and amounts are fictional.
5. **Notifications are queued, not delivered.** Email/SMS/WhatsApp are marked per notification (plus `mailto:` and `wa.me` share links); no provider is connected.
6. PDFs print amounts as `PHP 1,234.00` because jsPDF's built-in fonts have no ₱ glyph (Excel and the UI use ₱). Embed a TTF font to change this.
7. Client-portal login is a demo; the real portal needs Supabase Auth users with `profiles.client_id`.
8. QR scanning uses the device camera, which browsers only allow on HTTPS or `localhost`; the manual code box also works with USB/Bluetooth scanners. It was tested with typed codes, not a physical camera.
9. Field photos are stored inline (resized) in the demo; use Storage buckets in production.
