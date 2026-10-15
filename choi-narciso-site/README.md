# Choi Narciso — portfolio site

Static site (HTML/CSS/vanilla JS, no build step). Run `python3 -m http.server` in this folder and open http://localhost:8000.

## Where things live
- `data.js` — all content: photo captions/credits/alt text, the `SHARP` list, and the published stories (`PROJECTS`).
- `index.html` / `main.js` / `styles.css` — home page. `project.html` / `project.js` — one page per published story (`project.html?p=<slug>`).
- `scripts/optimize.py` — makes WebP copies in `img/web/`. Re-run after adding or replacing photos (`pip install pillow`).

## Before launch
- **Photos:** most of `img/` are low-res crops from Instagram screenshots, hidden by default. Replace with the photographer's originals (about 2400px long edge), add their numbers to `SHARP` in `data.js`, run the optimizer.
- **Captions:** fill `title`, `credit`, `year` per photo in `WORKS`; they show in the viewer.
- **Stories:** add confirmed photo keys to each story's `images` and write its `intro`. The outlet for "Light Notes No. 57/59" is only "Vogue": confirm the edition.
- **Copy:** the intro statement and about text are drafts. Replace with his own words.
- **Share image:** replace `YOUR-DOMAIN.com` in the `og:image` tag in `index.html` with the live address.
