# Image guide (AI or real photos)

The site ships with original, code-drawn illustrations (sharp at any size, ~0 KB of image weight). You can replace the three industry banners on the home page with your own images.

## How to add them
1. Make or pick an image about **1280 × 560 px** (landscape, roughly 2.3:1). JPG or WebP, **under ~200 KB** (compress at squoosh.app).
2. Put it in `opspilot-site/public/img/` (create the folder), e.g. `contractors.jpg`.
3. In `site.config.json`, under `images`, set the path:
   ```json
   "images": { "service-contractors": "img/contractors.jpg", "driving-ranges": "", "car-washes": "" }
   ```
4. Run `npm run build` (or `npm run dev`). Empty entries keep the built-in illustration.

## Prompts (Midjourney, DALL·E, Ideogram, Firefly, etc.)
Keep one consistent style so the set looks like a family. Shared style line to append to every prompt:

> *dark navy background (#0a1630), glowing electric-blue line-art, small lime-green (#b6f23a) accent highlights, minimal isometric vector illustration, soft grid, subtle glow, no text, no logos, no people's faces, wide 2.3:1 composition, plenty of empty space at the top*

- **Service contractors:** "cleaning and maintenance crew cart with mop and bucket heading toward a modern office building, floating job checklist card and location pin" + shared style line
- **Driving range:** "golf driving range with covered bays, a glowing ball arc flying toward a flag on target rings, a coffee cup nearby" + shared style line
- **Car wash:** "car passing through an automatic wash bay with spray nozzles, soap bubbles and sparkles" + shared style line

## Please keep it honest
- **Avoid AI "people"** (a smiling team, a "client holding a tablet"). Visitors may read them as real staff or customers. Illustrations and abstract scenes are safe.
- If you use a photo of a **real** place or team, get their permission and keep the caption truthful.
- Don't use AI images as "proof" (fake results, fake storefronts, fake logos).
- Photo-realistic AI images of real brands or recognisable places can raise copyright or trademark issues; stick to generic scenes.
- Read the usage terms of the tool you use. Some require attribution or limit commercial use.
