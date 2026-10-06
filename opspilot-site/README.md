# OpsPilot marketing site

Static, single-page marketing site for OpsPilot (Custom Business Systems). Zero runtime dependencies; a small Node script assembles reusable components into `dist/`.

```
npm run build   # writes dist/ (Node 20+)
npm run dev     # build + preview at http://localhost:4173
```

## Structure
- `src/content.mjs` – all copy (edit wording here)
- `src/components.mjs` – section/UI components (header, hero, cards, FAQ, form…)
- `src/dashboard.mjs` – illustrative dashboard (KPIs, SVG chart, schematic map, table). All figures are labelled sample data.
- `src/icons.mjs` – inline icons and the OpsPilot logo mark
- `src/styles.css`, `src/main.js` – styling and progressive enhancement
- `site.config.json` – contact person and form endpoint
- `public/favicon.svg` – brand favicon

## Contact form – needs configuration
No submission service is configured. Until `formEndpoint` in `site.config.json` is set to a form-handling URL (Formspree, Basin, Getform, or your own API; it is a public URL, not a secret) and the site is rebuilt, the form shows a "not connected" notice and reports "Not sent" on submit. Success is shown only after the endpoint returns an OK response.

## Still to supply
Public domain, email/phone/address (none invented), real screenshots for the project showcase, and the form endpoint.
