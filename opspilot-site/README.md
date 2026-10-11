# OpsPilot marketing site

Static, single-page marketing site for OpsPilot (Custom Business Systems). Zero runtime dependencies; a small Node script assembles reusable components into `dist/`.

```
npm run build   # writes dist/ (Node 20+)
npm run dev     # build + preview at http://localhost:4173
```

## Structure
- `src/content.mjs` – all copy (edit wording here)
- `src/components.mjs` – section/UI components (header, hero, cards, FAQ, form…)
- `src/dashboard.mjs` + `src/dashboard.css` – illustrative "command center" dashboard (KPI sparklines, interactive chart, gauge rings, dot-matrix map, job table). All figures are labelled sample data. Chart colours were checked with a palette validator.
- `src/icons.mjs` – inline icons and the OpsPilot logo mark
- Scope builder: `scopeTypes` / `scopeNotes` in `content.mjs` (presets per business type); logic at the end of `main.js`. Shows no prices and copies a scope outline into the contact form.
- `src/styles.css`, `src/main.js` – styling and progressive enhancement
- `site.config.json` – contact person and form endpoint
- `public/favicon.svg` – brand favicon

## Contact form
- **Out of the box (no service configured):** submitting opens the visitor's email app with the request pre-written to `info@opspilot.ph`. The page says plainly that nothing has been received until they press Send there.
- **To receive submissions directly:** create an account with a form service (Formspree, Basin, Getform, or FormSubmit.co, which needs a one-time email activation), paste its endpoint URL into `formEndpoint` in `site.config.json`, and redeploy. Success is shown only after the service returns OK.
- A consent checkbox and a privacy notice (`#privacy`) are included. The notice is a plain-language draft: have it reviewed for Data Privacy Act requirements.
- Optional contact buttons (booking link, Messenger, Viber, WhatsApp) and a photo for the contact card appear only when set in `site.config.json`.

## Still to supply
Public domain, email/phone/address (none invented), real screenshots for the project showcase, and the form endpoint.

## Going online
The build output is plain static files in `dist/`, so any static host works. Settings for any host: **root directory** `opspilot-site`, **build command** `node build.mjs`, **output directory** `dist`, no install step.

**Vercel (recommended)** – New Project → import this repo → set *Root Directory* to `opspilot-site` (the repo root `vercel.json` belongs to the TopMop app; don't use it for this site). Deploy, then add the custom domain under Settings → Domains and follow the DNS records Vercel shows.

**GitHub Pages** – Settings → Pages → Source: *GitHub Actions*. The workflow `.github/workflows/opspilot-site-pages.yml` publishes on every push to `main` that touches `opspilot-site/` (or run it manually from the Actions tab).

**After the domain is live**
1. Set `siteUrl` in `site.config.json` (e.g. `https://opspilot.ph`) and redeploy: adds canonical tags, `sitemap.xml` and the sitemap line in `robots.txt`.
2. Connect the contact form (see "Contact form" above) so submissions reach you directly; until then the form hands the request to the visitor's email app.
3. Fill in `officeHours` when confirmed.
