// Progressive enhancement: mobile menu, header state, reveal-on-scroll, contact form.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mobile menu
  const btn = $('.menu-btn');
  const nav = $('#site-nav');
  const setMenu = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('menu-open', open);
  };
  btn.addEventListener('click', () => setMenu(btn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { setMenu(false); btn.focus(); }
  });
  matchMedia('(min-width: 900px)').addEventListener('change', (m) => { if (m.matches) setMenu(false); });

  // Header shadow after scrolling
  const header = $('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Reveal on scroll (skipped entirely for reduced motion)
  const items = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }

  // Contact form. Success is only ever shown after a real, successful response.
  const form = $('#contact-form');
  const status = $('#form-status');
  const say = (msg, kind) => { status.textContent = msg; status.dataset.kind = kind; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    say('', '');
    form.querySelectorAll('[aria-invalid]').forEach((f) => f.removeAttribute('aria-invalid'));
    const bad = [...form.elements].filter((f) => f.required && !f.checkValidity());
    if (bad.length) {
      bad.forEach((f) => f.setAttribute('aria-invalid', 'true'));
      say('Please complete the highlighted fields.', 'error');
      bad[0].focus();
      return;
    }
    if (form.elements.website.value) return; // honeypot: silently drop bots

    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      say('Not sent. This form is not connected to a submission service yet, so your details were not delivered.', 'error');
      return;
    }
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    say('Sending…', 'info');
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      say('Thank you. Your inquiry was received. We will follow up to arrange your demo or consultation.', 'success');
    } catch {
      say('Something went wrong and your inquiry was not sent. Please try again later.', 'error');
    } finally {
      submit.disabled = false;
    }
  });
})();
