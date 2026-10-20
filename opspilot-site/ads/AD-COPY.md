# OpsPilot ad kit

Creatives are in `out/` (PNG, ready to upload; the `.html` files are the editable sources).
Regenerate them with `node ads/build-ads.mjs` from `opspilot-site/` (needs Playwright + Chromium).

## Files

| Concept | Idea | Sizes |
|---|---|---|
| **A-spreadsheets** | Problem hook: "Still running your business on Excel and chat threads?" + sample dashboard | square 1080×1080, portrait 1080×1350, story/reel 1080×1920, link 1200×628 |
| **B-one-system** | Brand statement: "Your business. One clear system." + module hub | same four sizes |
| **C-bring-a-workflow** | Consultation offer: "Bring one workflow" + 3-step process | same four sizes |
| **D-carousel-1…5** | Carousel, one card per industry (contractors, car washes, clinics, fleets, construction) | square 1080×1080 |

Use square or portrait for the Facebook/Instagram feed, story for Stories and Reels, landscape for link ads.

## Rules these ads follow (keep them if you edit)

- Every dashboard is labelled **SAMPLE DATA**. Never show it as a real client result.
- No invented numbers, testimonials, client names, prices, awards or "save X%" promises.
- Don't say "free" unless the demo or consultation really is free for the viewer.
- Don't mention TopMop or any client by name without their written permission.

## Landing page and tracking

Send clicks to `https://www.opspilot.ph/?utm_source=facebook&utm_medium=paid&utm_campaign=<name>` (or to `/contact.html`). The site has no analytics yet, so ask people in the form's workflow box or on a call where they saw the ad.

## Copy (Facebook / Instagram)

### Version 1: problem hook (pair with A)

**Primary text**
> Still running your business on Excel, notebooks and chat threads?
>
> OpsPilot builds one clear system for attendance, jobs, stock, quotations and billing, set up around how your business actually works.
>
> See sample dashboards and request a demo at opspilot.ph

**Headline:** Your business. One clear system.
**Description:** Custom business systems for Philippine MSMEs
**Button:** Learn More

### Version 2: Taglish (pair with A or B)

**Primary text**
> Pagod na sa Excel, papel at chat threads para sa attendance, jobs, stock at billing?
>
> Gumagawa ang OpsPilot ng isang malinaw na system na bagay sa paraan ng pagpapatakbo ng business n'yo.
>
> Tingnan ang mga sample dashboard at mag-request ng demo: opspilot.ph

**Headline:** Isang malinaw na system para sa business n'yo
**Description:** Custom business systems para sa MSMEs sa Pilipinas
**Button:** Learn More

### Version 3: workflow consultation (pair with C)

**Primary text**
> Bring one workflow that slows your team down. We will map it with you and show what a system could look like.
>
> Scope, roles and reports are agreed in writing, and we test with your own sample records before wider use.
>
> Request a consultation at opspilot.ph

**Headline:** Bring one workflow. We'll show how it could run.
**Description:** Workflow consultation for MSMEs
**Button:** Contact Us

### Carousel (pair with D1–D5)

**Primary text**
> One approach, set up for your kind of business. Swipe to see sample dashboards for contractors, car washes, clinics, fleets and construction.

| Card | Headline | Link |
|---|---|---|
| 1 | Cleaning and maintenance contractors | opspilot.ph/service-contractors.html |
| 2 | Car washes | opspilot.ph/car-washes.html |
| 3 | Clinics and dental practices | opspilot.ph/clinics.html |
| 4 | Bus, taxi and van fleets | opspilot.ph/taxi-fleets.html |
| 5 | Construction businesses | opspilot.ph/construction.html |

### Short variants (Stories, Reels, Google Search headlines)

- Your business. One clear system.
- Custom business systems for Philippine MSMEs
- Stop tracking work in Excel and chat
- Attendance, jobs, stock and billing in one place
- Request a demo, bring your own workflow

## Audience ideas to test (Meta Ads Manager)

Start broad and let Meta optimise, then compare. Suggested starting tests:

1. **Owners and managers**: Philippines, ages 28–60, interests such as small business, entrepreneurship, business owners; location Metro Manila and nearby provinces.
2. **Industry angle**: use the carousel for people interested in construction, car wash, clinics or transport; use A for general small-business audiences.
3. **Retargeting**: visitors to opspilot.ph (needs the Meta Pixel, which the site does not have yet; add it only with a matching privacy-notice update).

Test one change at a time (image or text or audience) with 2–3 ads per ad set, run each for several days before judging, and keep the objective on **Leads** or **Messages** rather than reach. Budget and results depend on your market; I can't promise cost per lead.

## Before you run ads

- Confirm the mailbox and form work (done) and that someone answers within hours.
- Check Meta's advertising policies and Philippine rules on advertising for your claims.
- If you add the Meta Pixel or Google Analytics, update the privacy notice first.
