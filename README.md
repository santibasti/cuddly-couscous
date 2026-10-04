# Cattle Creek Range & Café Operations

Internal operations platform for **Cattle Creek Country Club**: driving range, café,
player tabs, point of sale, inventory, cashier closeout, members, and reports.

## Run

No build step or dependencies. Serve the folder with any static server:

    python3 -m http.server 8000   # then open http://localhost:8000

## Logo (required step)

Save the official logo as `assets/brand/cattle-creek-logo.png`. It is shown as
supplied (scaled proportionally only) on the login screen, sidebar, dashboard
header, receipt preview, and reports. Until the file exists, a plain text
wordmark is shown. See `assets/brand/README.md`.

## Demo notes

- Any name/password signs in. Manager approval PIN is `1234` (voids, drawer variance over $5).
- Data is stored in the browser (`localStorage`); Settings → Reset demo data restores samples.
- Range has exactly 15 bays (Bay 1 – Bay 15). Currency is PHP (₱); all times display in Asia/Manila (UTC+8).
- Every session, item added, payment, discount, void, stock adjustment and closeout is stored with an epoch time and a `+08:00` ISO timestamp, and listed in Reports → Audit Trail.
- Stored demo data is versioned (`ccc-ops-v2`); upgrading from the first build resets it once.
- Brand names and the palette live in `js/brand.js` and `css/styles.css` (`:root` tokens).
- "FieldPilot" does not appear anywhere in the client-facing UI.

## Structure

    index.html        app shell
    css/styles.css    design tokens, layout, responsive + print styles
    js/brand.js       names + logo component
    js/icons.js       inline SVG icon set
    js/store.js       state, seed data, persistence, helpers
    js/app.js         login, navigation, 11 views, actions
