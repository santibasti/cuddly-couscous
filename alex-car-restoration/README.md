# Alex Car Restoration – Shop Manager

Web app to run a classic-car restoration shop: projects, schedule, mechanic assignment, timeline, progress updates, parts and budgets.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # logic tests (phases, progress, scheduling, alerts, reducer)
npm run build
```

## What it does
Built around what actually happens in a restoration shop: many jobs in parallel, parts that are late or backordered, work sent out to specialists, and customers who have to approve things.

- **Operations dashboard** – KPI row (active builds by health, blocked work, parts watch, labor utilisation with trend, budget committed), builds-by-phase pipeline, "Waiting on" board (what is holding up work and by how many days the ETA misses), bay board, parts/sublet watchlist, technician capacity heatmap, today on the floor.
- **Parts & sublets pipeline** – kanban: To order → Ordered → In transit → Backordered → Received. Sublet jobs (machine shop, chrome plating, upholstery, woodwork) use the same flow (To send out → Booked in → At vendor → Delayed → Back in shop). Each item has a needed-by date, ETA, PO and supplier, and a risk flag: *Order now*, *Overdue*, *At risk* (lands after it is needed).
- **Blocked work** – a task can wait on a part/sublet job, or be manually blocked (customer approval, vendor, other). Part-driven blocks clear automatically when the item is marked received. Blocked tasks show hatched on the schedule.
- **Project health** – every job rolls up to On track / At risk / Blocked / Late, with the reasons listed.
- **Projects** – filter by health; new projects get the 9 restoration phases (intake → delivery) scheduled across the dates.
- **Project detail** – phase tracker with sign-off, tasks with mechanic assignment and "waiting on" links, parts & sublets, budget vs. labor + parts, progress log.
- **Schedule** – weekly mechanic × day board, overbooking flags, unassigned and blocked lists.
- **Timeline** – Gantt of all jobs with incoming part/sublet deliveries as diamonds.
- **Mechanics** – workload, rates, up-next tasks (with locks on blocked ones).

## Data
Demo data lives in the browser (`localStorage`) and is generated relative to today. Use **Reset demo data** in the sidebar to restore it.
This is a front-end prototype: to go multi-user, replace `src/lib/store.tsx` with a backend (e.g. Supabase/Postgres) – the types in `src/lib/types.ts` map directly to tables.

## Ideas for next steps
Customer portal with photo updates, estimates/invoices and deposits, time clock for mechanics, photo uploads per phase, SMS/email notifications, parts supplier ordering, reports (profit per project), roles (owner / mechanic / customer).
