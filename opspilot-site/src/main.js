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

  // Scope builder: builds an outline (no prices) and can copy it into the contact form.
  const tool = $('#scope-tool');
  const data = window.OPSPILOT_SCOPE;
  if (tool && data) {
    const typeRadios = [...tool.querySelectorAll('input[name=scope-type]')];
    const mods = [...tool.querySelectorAll('input[name=scope-module]')];
    const notes = [...tool.querySelectorAll('input[name=scope-note]')];
    const list = $('#scope-list'), count = $('#scope-count'), typeLine = $('#scope-type-line');
    const send = $('#scope-send'), hint = $('#scope-hint');
    const currentType = () => data.types.find((t) => t.id === typeRadios.find((r) => r.checked).value);
    const chosen = () => mods.filter((m) => m.checked).map((m) => data.modules[+m.value]);
    const chosenNotes = () => notes.filter((n) => n.checked).map((n) => n.dataset.label);

    const render = () => {
      const t = currentType(), picked = chosen();
      typeLine.textContent = t.label;
      list.replaceChildren(...picked.map((name) => Object.assign(document.createElement('li'), { textContent: name })));
      count.textContent = picked.length === 1 ? 'Starting with one module is a good way to begin; we confirm the order with you.' : picked.length > 1 ? `${picked.length} modules. Many businesses start with one or two and add the rest later.` : '';
      send.disabled = picked.length === 0;
      hint.hidden = picked.length > 0;
    };
    const applyPreset = () => { const t = currentType(); mods.forEach((m) => { m.checked = t.modules.includes(+m.value); }); render(); };
    typeRadios.forEach((r) => r.addEventListener('change', applyPreset));
    [...mods, ...notes].forEach((i) => i.addEventListener('change', render));
    applyPreset();

    send.addEventListener('click', () => {
      const f = $('#contact-form'), t = currentType();
      f.elements.business_type.value = data.businessTypes[t.formType];
      const lines = ['Scope outline from the website scope builder:', ...chosen().map((m) => '- ' + m)];
      const n = chosenNotes();
      if (n.length) lines.push('', 'Also: ' + n.join('; ') + '.');
      const ta = f.elements.workflow;
      ta.value = lines.join('\n');
      $('#contact').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      setTimeout(() => f.elements.name.focus({ preventScroll: true }), reduced ? 0 : 500);
    });
  }
})();
