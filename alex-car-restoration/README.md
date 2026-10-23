# Alex Car Restoration — website

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Lucide.

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
npm run build && npm start
```

## What is placeholder (must be replaced before launch)
Nothing factual has been invented. Until supplied and verified:

| File | What to provide |
|---|---|
| `content/site.ts` | Phone, WhatsApp, Messenger, email, address, Google Maps embed URL, hours, service areas, social links, founding year / experience / certifications / awards. Empty fields are hidden or shown as "to be confirmed". |
| `content/media.ts` | Authorised hero, about and workshop photography (put files in `public/images`). Missing images render a labelled placeholder. |
| `content/projects.ts` | Real projects with before/after and process photos. Current entries are `placeholder: true`, labelled on-site, `noindex`, and excluded from the sitemap. |
| `content/services.ts` | Confirm the six services (and add images) with the business. |
| `content/testimonials.ts` | Only genuine, permissioned testimonials. Intentionally empty. |

## Inquiry form
`POST /api/inquiry` validates input (honeypot, 6 images x 5 MB max) and forwards multipart data to `INQUIRY_WEBHOOK_URL` (Formspree, Make, Zapier, CMS...). In production without it the API returns 503 rather than silently dropping leads.

## SEO / analytics
- Set `NEXT_PUBLIC_SITE_URL` (canonical, sitemap, JSON-LD). `sitemap.xml` and `robots.txt` are generated.
- `NEXT_PUBLIC_GA_ID` enables GA4 (form success fires `generate_lead`).
- `NEXT_PUBLIC_GSC_VERIFICATION` adds the Search Console meta tag.
- JSON-LD (`AutoBodyShop`) only includes fields verified in `content/site.ts`.

## CMS readiness
All pages read through `lib/data.ts`. Swap those functions for CMS fetches (Sanity, Contentful, Payload...) keeping the types in `content/*`.

## Fonts
Body: Inter via `next/font`. Headings fall back through Neue Haas Grotesk, Helvetica Neue, Arial; add a licensed Neue Haas Grotesk webfont via `next/font/local` if purchased.

## Photo galleries
Real photography lives in `public/alex-restoration/images/` and is listed in `content/galleries.ts` (alt text, captions, dimensions). Captions describe only what is visible. Confirm image rights and consent from identifiable people (event photos) before publishing, and do not add scope, dates, client names, event or award names without verification. The galleries do not document the Frame-On / Frame-Off processes or the Provenance Book. `sharp` is installed for fast image optimisation.

## Adding a new car to the portfolio
Edit `content/projects.ts` only (full instructions and a template are at the top of that file): put the WebP photos in `public/projects/<slug>/`, add one entry with each photo's `src`, `alt`, `width` and `height`. The card, detail page, gallery with full-screen viewer, filters, SEO and sitemap are generated automatically. Keep one vehicle per entry, and only add `before`/`after` or `scope` once verified.

## Site structure (multi-page)
| Route | Page | Main content |
|---|---|---|
| `/` | Home | Hero, Since 1992 heritage, featured projects, process preview, philosophy teaser, Provenance teaser, consultation CTA |
| `/about` | About | Full story, Source/Restore/Manufacture philosophy, workshop, events, testimonials |
| `/services` | Services | Six services, restoration value and timeline |
| `/process` | Our Process | Frame-On / Frame-Off tabs (10 stages each) and the Provenance Collection |
| `/portfolio` | Portfolio | Filterable project grid |
| `/portfolio/[slug]` | Project | One vehicle, its photos and viewer |
| `/contact` | Contact | Inquiry form, contact details, client FAQ |

Old `/projects` URLs redirect to `/portfolio`. Navigation items live in `content/site.ts`; previews on the home page link to the full pages (no section is repeated in full on two pages).

## Colour & interior visualiser
`/visualiser` recolours a studio photograph in the browser using a mask image (`public/visualiser/*-masks.png`: red channel = paint, green channel = upholstery). Options live in `content/visualiser.ts`. To change the demo car, replace the base photo and mask (same pixel size) and update `car` in that file. It is labelled illustrative; confirm the licence for the photo before publishing (there is a `credit` field for attribution).
