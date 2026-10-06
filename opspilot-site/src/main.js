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

  // ---- Premium layer: scroll progress, card spotlight, count-up, interactive chart ----
  const bar = $('.scroll-progress i');
  if (bar) {
    const upd = () => { const h = document.documentElement.scrollHeight - innerHeight; bar.style.setProperty('--p', h > 0 ? Math.min(1, scrollY / h).toFixed(4) : 0); };
    addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  }

  if (!reduced && matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.card, .industry, .engage, .principle, .step, .problem').forEach((el) => {
      el.setAttribute('data-spot', '');
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  // Count-up for KPI numbers. Final text is already in the HTML; this only animates it.
  const fmt = (el, n) => (el.dataset.money ? '₱' : '') + Math.round(n).toLocaleString('en-PH');
  const countUp = (el) => {
    const end = +el.dataset.count, t0 = performance.now(), dur = 1300;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(el, end * e);
      if (k < 1) requestAnimationFrame(tick); else el.textContent = fmt(el, end);
    };
    requestAnimationFrame(tick);
  };
  if (!reduced && 'IntersectionObserver' in window) {
    const co = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { countUp(en.target); co.unobserve(en.target); }
    }), { threshold: 0.6 });
    document.querySelectorAll('[data-count]').forEach((el) => co.observe(el));
  }

  // Interactive area chart: pointer + keyboard crosshair with tooltip (sample data).
  document.querySelectorAll('.chart[data-chart]').forEach((wrap) => {
    const m = JSON.parse(wrap.dataset.chart);
    const svg = wrap.querySelector('svg'), g = wrap.querySelector('.ch-hover'), tip = wrap.querySelector('.ch-tip');
    const line = g.querySelector('.ch-cross'), hb = g.querySelector('.ch-hot-b'), hp = g.querySelector('.ch-hot-p');
    const n = m.labels.length, step = (m.W - m.L - m.R) / (n - 1), plotH = m.H - m.T - m.B;
    const X = (i) => m.L + i * step, Y = (v) => m.T + plotH - (v / m.max) * plotH;
    let idx = n - 1;
    const show = (i) => {
      idx = Math.max(0, Math.min(n - 1, i));
      const x = X(idx);
      line.setAttribute('x1', x); line.setAttribute('x2', x);
      hb.setAttribute('cx', x); hb.setAttribute('cy', Y(m.billed[idx]));
      hp.setAttribute('cx', x); hp.setAttribute('cy', Y(m.paid[idx]));
      g.hidden = false; tip.hidden = false;
      const pct = Math.max(14, Math.min(86, (x / m.W) * 100));
      tip.style.left = pct + '%';
      tip.innerHTML = `<b>${m.labels[idx]}</b><span><i style="background:#3d7bff"></i>Billed<em>₱${m.billed[idx]}k</em></span><span><i style="background:#12a594"></i>Collected<em>₱${m.paid[idx]}k</em></span><small>Sample data</small>`;
    };
    const hide = () => { g.hidden = true; tip.hidden = true; };
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      show(Math.round((((e.clientX - r.left) / r.width) * m.W - m.L) / step));
    });
    svg.addEventListener('pointerleave', () => { if (document.activeElement !== wrap) hide(); });
    wrap.addEventListener('focus', () => show(idx));
    wrap.addEventListener('blur', hide);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
      else if (e.key === 'Escape') hide();
    });
  });
})();
