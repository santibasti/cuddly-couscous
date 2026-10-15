/* Choi Narciso — portfolio behaviour. Content lives in data.js */

/* ----------------------------- helpers ----------------------------- */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ----------------------------- build DOM --------------------------- */
$('#yr').textContent = new Date().getFullYear();

$('#heroSlides').innerHTML = HERO.map((k, i) =>
  `<figure data-credit="${label(k)}"${i === 0 ? ' class="is-on"' : ''}><img src="${IMG(k)}" alt="" ${i ? 'loading="lazy"' : ''}></figure>`).join('');

$('#hsTrack').innerHTML =
  `<div class="card card--text"><h3>Selected<br><em>frames</em></h3></div>` +
  SELECTED.map((k, i) =>
    `<div class="card" data-lb="${i}" data-cursor="View">${pic(IMG(k), WORKS[k].alt, 'loading="lazy" decoding="async"')}
       <div class="card__cap"><span>${String(i + 1).padStart(2, '0')}</span><span>${label(k)}</span></div></div>`).join('');

$('#indexList').innerHTML = PROJECTS.map((p, i) =>
  `<li><a href="project.html?p=${p.slug}" data-img="${p.cover}" data-cursor="Open"><span class="n">${String(i + 1).padStart(2, '0')}</span>
    <span class="t">${p.title}</span><span class="m">${[p.outlet, p.date].filter(Boolean).join(' · ')}</span></a></li>`).join('');

$('#grid').innerHTML = ARCHIVE.map((k, i) =>
  `<div class="tile" data-cat="${WORKS[k].cat}" data-i="${i}" data-key="${k}" data-cursor="View">${pic(IMG(k), WORKS[k].alt, 'loading="lazy" decoding="async"')}</div>`).join('');

if (HERO.length) { $('#bleedImg').src = IMG(HERO.includes('03') ? '03' : HERO[0]); $('#bleedCap').textContent = label(HERO.includes('03') ? '03' : HERO[0]); }

$$('.statement__text.split').forEach(el => {
  el.innerHTML = el.textContent.trim().split(/\s+/).map(w => `<span class="w"><span>${w}</span></span>`).join(' ');
  $$('.w > span', el).forEach((s, i) => s.style.transitionDelay = `${i * 28}ms`);
});

/* ----------------------------- loader ------------------------------ */
(function loader() {
  const bar = $('.loader__bar i'), count = $('#count');
  const start = performance.now(), dur = reduce ? 100 : 1900;
  let loaded = false;
  const first = new Image(); first.onload = first.onerror = () => loaded = true; first.src = IMG(HERO[0]);
  (function tick(now) {
    const p = clamp((now - start) / dur, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    bar.style.transform = `scaleX(${eased})`;
    count.textContent = String(Math.round(eased * 100)).padStart(3, '0');
    if (p < 1 || !loaded) return requestAnimationFrame(tick);
    setTimeout(() => {
      $('.loader').classList.add('is-done');
      document.body.classList.remove('is-loading');
      setTimeout(() => document.body.classList.add('is-ready'), 350);
      initReveals();
    }, 250);
  })(start);
})();

/* ----------------------------- hero slideshow ---------------------- */
(function hero() {
  const slides = $$('#heroSlides figure'), credit = $('#heroCredit');
  let i = 0;
  const show = (n) => {
    slides[i].classList.remove('is-on');
    i = n; slides[i].classList.add('is-on');
    credit.style.opacity = 0;
    setTimeout(() => { credit.textContent = slides[i].dataset.credit; credit.style.opacity = 1; }, 400);
  };
  credit.textContent = slides[0].dataset.credit;
  setInterval(() => show((i + 1) % slides.length), 5200);
})();

/* ----------------------------- reveals ----------------------------- */
function initReveals() {
  const io = new IntersectionObserver((es) => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal, .split').forEach(el => io.observe(el));
  // clip-path'd elements report zero visible area, so watch their parent instead
  const cio = new IntersectionObserver((es) => es.forEach(e => {
    if (e.isIntersecting) { $$('.reveal-img', e.target).forEach(r => r.classList.add('is-in')); cio.unobserve(e.target); }
  }), { threshold: .25 });
  $$('.reveal-img').forEach(el => cio.observe(el.parentElement));

  // stagger archive tiles as they enter
  const tio = new IntersectionObserver((es) => es.forEach(e => {
    if (e.isIntersecting) {
      const d = (+e.target.dataset.i % 4) * 90;
      e.target.style.transitionDelay = d + 'ms';
      e.target.classList.add('is-in'); tio.unobserve(e.target);
    }
  }), { threshold: .08 });
  $$('.tile').forEach(t => tio.observe(t));
}

/* ----------------------------- scroll engine ----------------------- */
const hs = $('#hscroll'), track = $('#hsTrack'), bar = $('#hsBar'), hsCount = $('#hsCount');
const parallax = $$('[data-parallax]');
let hsDist = 0;
function measure() {
  hsDist = Math.max(0, track.scrollWidth - innerWidth);
  hs.style.height = (hsDist + innerHeight) + 'px';
}
addEventListener('resize', measure);
addEventListener('load', measure);
measure();

let cur = 0;
function onScroll() {
  // horizontal gallery
  const r = hs.getBoundingClientRect();
  const p = clamp(-r.top / (hs.offsetHeight - innerHeight || 1), 0, 1);
  cur = lerp(cur, p, reduce ? 1 : .12);
  track.style.transform = `translate3d(${-cur * hsDist}px,0,0)`;
  bar.style.transform = `scaleX(${cur})`;
  const n = SELECTED.length || 1;
  hsCount.textContent = `${String(clamp(Math.round(cur * (n - 1)) + 1, 1, n)).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  // parallax
  parallax.forEach(el => {
    const b = el.parentElement.getBoundingClientRect();
    el.style.transform = `translate3d(0,${(b.top + b.height / 2 - innerHeight / 2) * -parseFloat(el.dataset.parallax)}px,0) scale(1.05)`;
  });
  requestAnimationFrame(onScroll);
}
requestAnimationFrame(onScroll);

/* ----------------------------- cursor + magnetic ------------------- */
if (fine) {
  const c = $('.cursor'), label = $('.cursor__label');
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; c.classList.add('is-on'); });
  (function loop() {
    cx = lerp(cx, x, .2); cy = lerp(cy, y, .2);
    c.style.transform = `translate3d(${cx}px,${cy}px,0)`;
    requestAnimationFrame(loop);
  })();
  document.addEventListener('pointerover', e => {
    const t = e.target.closest('[data-cursor]');
    if (t) { label.textContent = t.dataset.cursor; c.classList.add('is-big'); }
    else c.classList.remove('is-big');
  });
  $$('[data-magnetic]').forEach(el => {
    el.addEventListener('pointermove', e => {
      const b = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - b.left - b.width / 2) * .25}px,${(e.clientY - b.top - b.height / 2) * .35}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)'; el.style.transform = ''; });
    el.addEventListener('pointerenter', () => el.style.transition = 'none');
  });
}

/* ----------------------------- published hover preview ------------- */
(function indexPreview() {
  const pv = $('#indexPreview'), img = $('img', pv);
  let x = 0, y = 0, cx = 0, cy = 0, on = false;
  $$('#indexList a').forEach(a => {
    a.addEventListener('pointerenter', () => { img.src = a.dataset.img; pv.classList.add('is-on'); on = true; });
    a.addEventListener('pointerleave', () => { pv.classList.remove('is-on'); on = false; });
  });
  addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; });
  (function loop() {
    cx = lerp(cx, x, .14); cy = lerp(cy, y, .14);
    const tilt = clamp((x - cx) * .08, -12, 12);
    pv.style.left = (cx + 30) + 'px';
    pv.style.top = (cy - pv.offsetHeight / 2) + 'px';
    pv.style.rotate = tilt + 'deg';
    requestAnimationFrame(loop);
  })();
})();

/* ----------------------------- filters ----------------------------- */
$$('#filters button').forEach(b => { if (b.dataset.f !== 'all' && !ARCHIVE.some(a => a.cat === b.dataset.f)) b.remove(); });
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#filters button').forEach(x => x.classList.toggle('is-active', x === b));
  const f = b.dataset.f;
  $$('.tile').forEach(t => {
    const hide = f !== 'all' && t.dataset.cat !== f;
    t.classList.toggle('is-hide', hide);
    if (!hide) { t.classList.remove('is-in'); requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('is-in'))); }
  });
});

/* ----------------------------- lightbox ---------------------------- */
const caption = (k) => [label(k), WORKS[k].credit, WORKS[k].year].filter(Boolean).join(' · ');
(function lightbox() {
  const lb = $('#lb'), img = $('img', lb), cap = $('figcaption', lb);
  let list = [], idx = 0;
  const set = (i) => {
    idx = (i + list.length) % list.length;
    img.style.opacity = 0;
    setTimeout(() => { img.src = list[idx].src; cap.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}  —  ${list[idx].t}`; img.style.opacity = 1; }, 180);
  };
  const open = (l, i) => { list = l; lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; set(i); };
  const close = () => { lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };

  document.addEventListener('click', e => {
    const card = e.target.closest('[data-lb]');
    if (card) return open(SELECTED.map(k => ({ src: IMG(k), t: caption(k) })), +card.dataset.lb);
    const tile = e.target.closest('.tile');
    if (tile) {
      const vis = $$('.tile:not(.is-hide)');
      open(vis.map(t => ({ src: IMG(t.dataset.key), t: caption(t.dataset.key) })), vis.indexOf(tile));
    }
  });
  $('.lb__close').onclick = close;
  $('.lb__prev').onclick = () => set(idx - 1);
  $('.lb__next').onclick = () => set(idx + 1);
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') set(idx - 1);
    if (e.key === 'ArrowRight') set(idx + 1);
  });
  let sx = 0;
  lb.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
  lb.addEventListener('touchend', e => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 50) set(idx + (d < 0 ? 1 : -1)); });
})();

/* ----------------------------- mobile menu ------------------------- */
(function menu() {
  const btn = $('.nav__burger'), m = $('.menu');
  const toggle = (open) => { btn.setAttribute('aria-expanded', open); m.classList.toggle('is-open', open); m.setAttribute('aria-hidden', !open); };
  btn.onclick = () => toggle(btn.getAttribute('aria-expanded') !== 'true');
  $$('a', m).forEach(a => a.addEventListener('click', () => toggle(false)));
})();

/* ----------------------------- nav behaviour ----------------------- */
(function navScroll() {
  const nav = $('.nav'); let last = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY, down = y > last;
    nav.classList.toggle('is-solid', y > innerHeight * .6);
    nav.classList.toggle('is-hidden', down && y > innerHeight * .6 && !$('.menu.is-open'));
    last = y;
  }, { passive: true });
})();
