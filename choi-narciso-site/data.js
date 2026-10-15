/* ---------------------------------------------------------------
   Choi Narciso — content
   Edit this file only. Swap a photo by replacing img/NN.jpg with the
   full-resolution original, then add NN to SHARP so it appears.
   `title`, `credit`, `year` show as captions once filled in.
---------------------------------------------------------------- */
const IMG = (n) => `img/${n}.jpg`;

// Until the originals arrive, only full-resolution photos are shown.
// Set SHOW_LOWRES = true to preview the full layout with the low-res crops.
const SHOW_LOWRES = false;
const SHARP = new Set(['01', '02', '03', '04']);
const keyOf = (src) => src.match(/(\d\d)\.jpg$/)?.[1];
const ok = (src) => SHOW_LOWRES || SHARP.has(keyOf(src));

const WORKS = {
  '01': { cat: 'portrait',  alt: 'Black-and-white close-up portrait of a person in round glasses, lit from one side' },
  '02': { cat: 'editorial', alt: 'Woman in a ruffled skirt standing between two rock formations, sepia tone' },
  '03': { cat: 'editorial', alt: 'Model in a pink knitted dress floating in dark green water' },
  '04': { cat: 'editorial', alt: 'Model in a cream ruffled mesh dress seated on a bamboo raft at a lake' },
  '05': { cat: 'still',     alt: 'Green jeep parked in shallow water with mountains behind' },
  '06': { cat: 'portrait',  alt: 'Black-and-white close-up of a young woman' },
  '07': { cat: 'portrait',  alt: 'Close-up portrait with strands of hair across the face' },
  '08': { cat: 'portrait',  alt: 'Black-and-white portrait of a man' },
  '09': { cat: 'still',     alt: 'Silhouette of a person in red stage light' },
  '10': { cat: 'sport',     alt: 'Boxer in a wrapped-hands stance' },
  '11': { cat: 'portrait',  alt: 'Black-and-white close-up of a woman, shot from the front' },
  '12': { cat: 'portrait',  alt: 'Woman looking over her shoulder against a dark background' },
  '13': { cat: 'editorial', alt: 'Model in a knitted dress with a hand raised to her face' },
  '14': { cat: 'editorial', alt: 'Black-and-white fashion study in a dark jacket' },
  '15': { cat: 'editorial', alt: 'Man in a cap and glasses in profile, magazine page' },
  '16': { cat: 'still',     alt: 'Wristwatch resting among rocks' },
  '17': { cat: 'still',     alt: 'Red and yellow flowers against a turquoise background' },
  '18': { cat: 'still',     alt: 'Wilted sunflower against black' },
  '19': { cat: 'portrait',  alt: 'Black-and-white portrait of a young man in a tank top' },
  '20': { cat: 'sport',     alt: 'Two boxers in the ring' },
  '21': { cat: 'editorial', alt: 'Model in a flowing white dress at a window with a red wall' },
};

const label = (k) => WORKS[k].title || (WORKS[k].cat[0].toUpperCase() + WORKS[k].cat.slice(1));
const has = (list) => list.filter(k => ok(IMG(k)));

// Hero slideshow, selected strip, archive order
const HERO     = has(['02', '01', '04', '03', '21']);
const SELECTED = has(['02', '01', '03', '13', '04', '12', '21', '15']);
const ARCHIVE  = has(['06','02','16','11','10','03','08','17','12','15','20','07','13','18','01','09','19','14','04','05','21']);

// Published features. `images` = keys from WORKS that belong to the story (add as they are confirmed).
const PROJECTS = [
  { slug: 'harvesting-hope',   title: 'Harvesting Hope',    outlet: 'Vogue Philippines', date: 'April 2026', cover: IMG('c-vogue'),          images: [], intro: '' },
  { slug: 'light-notes-59',    title: 'Light Notes No. 59', outlet: 'Vogue',             date: '',           cover: IMG('c-lightnotes59'),  images: [], intro: '' },
  { slug: 'light-notes-57',    title: 'Light Notes No. 57', outlet: 'Vogue',             date: '',           cover: IMG('c-lightnotes57'),  images: [], intro: '' },
  { slug: 'come-rain-or-shine',title: 'Come Rain or Shine', outlet: 'Metro',             date: '',           cover: IMG('c-metro'),         images: [], intro: '' },
  { slug: 'dining-design',     title: 'Dining Design',      outlet: 'F&B Report',        date: '',           cover: IMG('c-fb'),            images: [], intro: '' },
];

// <picture> with a WebP source (made by scripts/optimize.py) and the JPEG as fallback
const pic = (src, alt = '', attrs = '') =>
  `<picture><source type="image/webp" srcset="${src.replace(/^img\/(.+)\.jpg$/, 'img/web/$1.webp')}"><img src="${src}" alt="${alt}" ${attrs}></picture>`;
