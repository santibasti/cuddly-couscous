/* Renders one story from PROJECTS (data.js) using ?p=<slug>. */
const $ = (s, c = document) => c.querySelector(s);
const slug = new URLSearchParams(location.search).get('p');
let i = PROJECTS.findIndex(p => p.slug === slug);
if (i < 0) i = 0;
const p = PROJECTS[i], next = PROJECTS[(i + 1) % PROJECTS.length];
const imgs = p.images.filter(k => ok(IMG(k)));
document.title = `${p.title} — Choi Narciso`;
$('#yr').textContent = new Date().getFullYear();

const meta = [['Publication', p.outlet], ['Issue', p.date], ['Photography', 'Choi Narciso']].filter(m => m[1]);
$('#project').innerHTML = `
  <section class="proj__head">
    <p class="eyebrow reveal">Published — ${String(i + 1).padStart(2, '0')} / ${String(PROJECTS.length).padStart(2, '0')}</p>
    <h1 class="reveal">${p.title}</h1>
    <ul class="proj__meta reveal">${meta.map(([k, v]) => `<li><span>${k}</span>${v}</li>`).join('')}</ul>
  </section>
  <section class="proj__body">
    <figure class="proj__cover reveal"><img src="${p.cover}" alt="${p.title}, ${p.outlet} cover"></figure>
    ${p.intro ? `<p class="proj__intro reveal">${p.intro}</p>` : `<p class="proj__intro proj__soon reveal">Full story coming soon.</p>`}
  </section>
  ${imgs.map((k, n) => `<figure class="proj__shot ${n % 3 === 0 ? 'is-wide' : ''} reveal">${pic(IMG(k), WORKS[k].alt, 'loading="lazy"')}</figure>`).join('')}
  <a class="proj__next" href="project.html?p=${next.slug}">
    <span class="eyebrow">Next story</span>
    <span class="proj__nexttitle">${next.title}</span>
  </a>`;

const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));
