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
