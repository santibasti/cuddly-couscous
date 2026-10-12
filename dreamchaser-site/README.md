# Dream Chaser Studio — website

Static, dependency-free site (HTML/CSS/JS). Open `index.html` or run `python3 -m http.server` in this folder.

## Swap in real photos
Drop high-res files into `assets/photos/` using these names (missing ones show a styled placeholder):
`hero.jpg`, `newborn-1.jpg`, `newborn-2.jpg`, `maternity-1.jpg`, `maternity-2.jpg`, `sitters-1.jpg`, `kids-1.jpg`, `family-1.jpg`, `family-2.jpg`, `fineart-1.jpg`.
The current `hero`, `newborn-1`, `sitters-1` are low-res crops from Facebook screenshots — replace them.

## Edit
- Copy, contact info, reviews: `index.html`
- Colours/fonts: CSS variables at the top of `styles.css`
- Booking form currently opens a pre-filled email; swap the handler in `script.js` for Formspree/Netlify Forms etc.
- Christmas countdown targets 1 Dec; early-bird banner text lives in `index.html` (`.announce`, `#christmas`).
