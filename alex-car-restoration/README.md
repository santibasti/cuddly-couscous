# Alex Car Restoration – Shop Manager

Web app to run a classic-car restoration shop: projects, schedule, mechanic assignment, timeline, progress updates, parts and budgets.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # logic tests (phases, progress, scheduling, alerts, reducer)
npm run build
```

## What it does
- **Dashboard** – active projects, behind-schedule count, today's tasks, team utilisation, "needs attention" alerts (late projects/phases, over budget, unassigned tasks, late parts), latest updates.
- **Projects** – create a project (vehicle, customer, dates, budget); the 9 restoration phases (intake → delivery) are scheduled automatically across the dates.
- **Project detail** – phase tracker (start / finish each phase), tasks with mechanic assignment, hours and status, parts & materials, budget vs. labor + parts spend, progress log.
- **Schedule** – weekly mechanic × day board, click a task to advance it, overbooking flagged in red, unassigned tasks list.
- **Timeline** – Gantt of every project's phases with a today marker.
- **Mechanics** – workload, rates, upcoming tasks, add/deactivate.
- **Parts & orders** – everything still to order or arriving, with ETAs.

## Data
Demo data lives in the browser (`localStorage`) and is generated relative to today. Use **Reset demo data** in the sidebar to restore it.
This is a front-end prototype: to go multi-user, replace `src/lib/store.tsx` with a backend (e.g. Supabase/Postgres) – the types in `src/lib/types.ts` map directly to tables.

## Ideas for next steps
Customer portal with photo updates, estimates/invoices and deposits, time clock for mechanics, photo uploads per phase, SMS/email notifications, parts supplier ordering, reports (profit per project), roles (owner / mechanic / customer).
