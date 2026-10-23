# Alex Car Restoration – Shop Manager

Web app to run a classic-car restoration shop: projects, schedule, mechanic assignment, timeline, progress updates, parts and budgets.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # logic tests (phases, progress, scheduling, alerts, reducer)
npm run build
```

## Services
The shop offers four services, and each one has its own workflow, typical length and pricing style. These are draft workflows to confirm with the client; they live in one place (`SERVICES` and `PHASE_DEFS` in `src/lib/logic.ts`) so they are quick to change.

| Service | Typical length | Steps | Priced |
|---|---|---|---|
| Restoration | Weeks to months | Intake, teardown, body, paint, mechanical, interior, reassembly, QC, delivery | Estimate per car |
| Paint | Days to two weeks | Inspect, prep and body repair, prime, paint, cure, polish, QC, delivery | Estimate per car |
| Detailing | Hours to two days | Check-in, wash, interior, polish, QC, handover | Package price list |
| Ceramic coating | One to three days plus curing | Inspect, wash, paint correction, coating, cure, QC, handover | Package price list, with warranty |

Every job carries its service, so progress, health, the project stepper, the schedule and the executive numbers all follow that job's own steps. Short jobs can fit every step into a single day. The demo price list is in `PACKAGES`.

### Ceramic coating records
Each ceramic job keeps a coating record for the warranty: product and batch number, gloss before and after, paint thickness, when the cure started, the date the car must stay dry until, the handover date, and the free maintenance check. Dates are worked out for you (dry for 7 days after the cure starts, check due 12 months after handover, warranty end from the package), and starting the cure step or signing off delivery fills them in automatically. The Today page lists cars that must stay dry and checks that are due or overdue. The 7-day and 12-month figures are in `NO_WASH_DAYS` and `MAINTENANCE_MONTHS` in `src/lib/logic.ts`; Alex should confirm them.

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

## Put the demo on your own link
The app is a static site (no server needed), so any static host works. The address you get is `something.vercel.app`, or your own domain such as `demo.yourdomain.com`.

**Vercel (recommended)**
1. Sign in at vercel.com with GitHub and choose **Add New → Project**, then import this repository.
2. Set **Root Directory** to `alex-car-restoration`. The build settings are already in `vercel.json`.
3. Choose the branch to publish, then **Deploy**. You get a link in about a minute.
4. For your own domain: **Settings → Domains → Add**, then create the DNS record Vercel shows you.

**Netlify (no GitHub needed)**
1. Run `npm install && npm run build` in this folder.
2. Drag the generated `dist` folder onto app.netlify.com/drop.
3. Rename the site under **Site settings** to get a friendlier address.

Notes for presenting: demo data is saved in each viewer's own browser, so everyone starts with the same sample data and nobody sees anyone else's changes. Fonts load from Google Fonts, so the venue needs internet. Open the link once beforehand to check it.

## Data
Demo data lives in the browser (`localStorage`) and is generated relative to today. Use **Reset demo data** in the sidebar to restore it.
This is a front-end prototype: to go multi-user, replace `src/lib/store.tsx` with a backend (e.g. Supabase/Postgres) – the types in `src/lib/types.ts` map directly to tables.

## Ideas for next steps
Customer portal with photo updates, estimates/invoices and deposits, time clock for mechanics, photo uploads per phase, SMS/email notifications, parts supplier ordering, reports (profit per project), roles (owner / mechanic / customer).
