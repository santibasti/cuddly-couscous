# Cattle Creek Range & Café Operations

Internal operations platform for **Cattle Creek Country Club**: 15-bay driving range, café, player tabs,
POS, inventory, cashier closeout, approvals, management reporting and staff attendance.

## Run

No build step or dependencies. Serve the folder with any static server:

    py -m http.server 8000        # Windows   (or: python -m http.server 8000 / npx http-server -p 8000 -c-1)

then open http://localhost:8000.

## Logo (required step)

Save the official logo as `assets/brand/cattle-creek-logo.png`. It is shown as supplied (scaled
proportionally only). Until it exists a plain text wordmark is shown.

## Accounts (demo)

Every person signs in with their **own** account (username + password, or username + PIN).

| Username | Role | Password | PIN |
|---|---|---|---|
| admin | Admin / Management | `Admin@2026` | 9090 |
| cashier1, cashier2 | Counter / Cashier | `Cattle@2026` | 1111, 2222 |
| attendant1, attendant2 | Range Attendant | `Cattle@2026` | 3333, 4444 |
| server1, server2 | Café / Server | `Cattle@2026` | 5555, 6666 |

Change these first (Staff & Roles → Reset password / PIN). Hide the demo box on the sign-in page by
setting `DEMO_HINTS = false` in `js/app.js`.

## Roles

Defaults live in `js/auth.js`; Management can adjust them in **Staff & Roles → Roles & permissions**.
Approval, staff, settings, audit, reports and inventory-adjust permissions can never be given to
non-management roles. Screens, buttons and every action are permission-checked; blocked attempts are logged.

## Workflow (unchanged)

15 bays → open player tab → add buckets / food / beverages → payment at session end → bay returns to
Available → dashboard and cashier closeout update.

## Approvals

Discounts, void/cancelled items, refunds, complimentary items, price overrides, inventory adjustments,
cash shortage/overage, closing a tab unpaid and editing a paid transaction need a **reason**. Staff
requests wait in the Approval Queue; nobody can decide their own request. When Management performs one of
these itself it is applied immediately with a mandatory reason and an audit entry (cash variances always
need a *different* administrator).

## Audit & security

- Every action is recorded under the signed-in account with sign-in/out time, device and session.
- The audit log is append-only and hash-chained (SHA-256); Audit Log shows an integrity check.
- Passwords and PINs are stored only as salted, iterated hashes. 5 failed attempts lock an account for 5 minutes.
- Idle sign-out (default 10 min, Settings) for shared tablets; clock actions re-ask for the user's PIN.
- Duplicate payments, duplicate player sessions, conflicting bay assignments and duplicate clock-ins are blocked.
- Asia/Manila time and PHP (₱) everywhere; timestamps stored as epoch + `+08:00` ISO.

> **Important:** this is a browser-only build — data lives in the browser's `localStorage`. Access control,
> approvals and the audit chain are enforced by the app, and tampering with stored data is *detected*, but a
> person with developer tools on that machine can still alter or erase local data. For production use,
> move accounts, data and the audit log to a server/database with server-side authorisation.

## Staff attendance

Clock in/out, breaks, remarks, overtime, statuses (Present, Late, Absent, Leave, Half Day, Undertime,
Overtime, Rest Day, Holiday), correction requests with approval, a PIN-only **Staff Time Clock** kiosk on the
sign-in page, and 10 attendance reports. Payroll-ready (employee numbers, hours, overtime) — no pay computed.

## Reports

Management Dashboard (Today / Yesterday / This Week / This Month / Custom) and Reports (31 reports,
sortable, filterable). **Excel** exports a real `.xlsx`; **PDF** opens a print layout — choose "Save as PDF".

## Structure

    index.html          app shell
    css/styles.css      design tokens, layout, responsive + print
    js/brand.js         names + logo component
    js/store.js         state, seed data, audit chain, Manila time, formatting
    js/sha.js           SHA-256 + salted hashing (no dependencies)
    js/auth.js          accounts, roles, permissions, sessions
    js/ui.js            shared UI helpers, sortable tables, receipts
    js/domain.js        sessions, tabs, payments (duplicate-safe)
    js/approvals.js     approval engine + queue
    js/ops.js           dashboard, range, bays, tabs, POS, café, menu, inventory, closeout, sales, members
    js/attendance.js    attendance module + report builders
    js/mgmt.js          management dashboard + reports
    js/admin.js         staff & roles, audit log, activity, players, settings
    js/charts.js, js/export.js
