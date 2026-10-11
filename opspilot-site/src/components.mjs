// Reusable section/UI components. Each returns an HTML string.
import { icon, logoMark } from './icons.mjs';
import * as c from './content.mjs';
import { heroDashboard, fullDashboard } from './dashboard.mjs';

const telHref = (m) => 'tel:+63' + m.replace(/\D/g, '').replace(/^0/, '');
const prettyMobile = (m) => m.replace(/\D/g, '').replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');

export const button = (label, href, variant = 'primary', extra = '') =>
  `<a class="btn btn-${variant}" href="${href}">${label}${variant === 'primary' || variant === 'lime' ? icon('arrow', 18) : ''}${extra}</a>`;

export const logo = (onDark = false) => `
<a class="logo ${onDark ? 'logo-dark' : ''}" href="index.html" aria-label="OpsPilot, Custom Business Systems — home">
  ${logoMark()}
  <span class="logo-text"><span class="wordmark">Ops<b>Pilot</b></span><span class="descriptor">Custom Business Systems</span></span>
</a>`;

export const sectionHead = (eyebrow, title, lead = '', center = false) => `
<div class="section-head ${center ? 'center' : ''} reveal">
  <p class="eyebrow">${eyebrow}</p>
  <h2>${title}</h2>
  ${lead ? `<p class="lead">${lead}</p>` : ''}
</div>`;

export const header = (active = '') => `
<header class="site-header" id="top">
  <div class="scroll-progress" aria-hidden="true"><i></i></div>
  <div class="container header-inner">
    ${logo()}
    <nav class="nav" id="site-nav" aria-label="Primary">
      <ul>${c.nav.map(([l, h]) => `<li><a href="${h}"${h === active ? ' aria-current="page"' : ''}>${l}</a></li>`).join('')}</ul>
      ${button('Request a Demo', 'contact.html', 'primary')}
    </nav>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
      <span class="icon-open">${icon('menu')}</span><span class="icon-close">${icon('close')}</span>
    </button>
  </div>
</header>`;

export const hero = () => `
<section class="hero" id="home" aria-labelledby="hero-title">
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="eyebrow eyebrow-dark">Custom Business Systems</p>
      <h1 id="hero-title">Your business. <span>One clear system.</span></h1>
      <p class="hero-lead">Custom operations systems for Philippine MSMEs. Connect your jobs, people, equipment, sales, and collections around the way your business works.</p>
      <div class="btn-row">${button('Request a Demo', 'contact.html', 'lime')}${button('Explore Solutions', 'solutions.html', 'ghost')}</div>
      <ul class="hero-points">
        <li>${icon('check', 18)}Built around your workflow</li>
        <li>${icon('check', 18)}Start with one module</li>
        <li>${icon('check', 18)}Usable on phones and tablets</li>
      </ul>
      <dl class="facts">
        <div><dt>${c.solutions.length}</dt><dd>Core modules</dd></div>
        <div><dt>${c.steps.length}</dt><dd>Implementation steps</dd></div>
        <div><dt>${c.industries.length}</dt><dd>Industry setups</dd></div>
        <div><dt>1</dt><dd>Shared set of records</dd></div>
      </dl>
    </div>
    <div class="hero-visual">
      <div class="orbit" aria-hidden="true"><i></i><i></i></div>
      ${heroDashboard()}
      <div class="float-badge fb-top">${icon('shield', 20)}<div><strong>Agreed scope</strong><span>Data ownership defined in the agreement</span></div></div>
      <div class="float-badge fb-bottom">${icon('layers', 20)}<div><strong>Start with one module</strong><span>Add more as you grow</span></div></div>
    </div>
  </div>
</section>`;

const tickerItems = ['Attendance', 'Payroll preparation', 'Equipment tracking', 'Inventory', 'Bookings', 'Job queue', 'Crew assignments', 'Quotations', 'Service reports', 'Client sign-off', 'Billing', 'Collections', 'Player tabs', 'Management dashboards'];
export const ticker = () => `
<section class="ticker" aria-label="Capabilities">
  <p class="ticker-label">Built around everyday operations</p>
  <div class="ticker-viewport">
    <ul class="ticker-track">${tickerItems.map((t) => `<li>${t}</li>`).join('')}</ul>
    ${[1, 2, 3].map(() => `<ul class="ticker-track" aria-hidden="true">${tickerItems.map((t) => `<li>${t}</li>`).join('')}</ul>`).join('\n    ')}
  </div>
</section>`;

export const problems = () => `
<section class="section theme-light" id="problems" aria-labelledby="problems-title">
  <div class="container">
    ${sectionHead('Sound familiar?', 'Daily operations shouldn’t live in five different places.', 'These are common patterns in growing businesses. Each one maps to a practical capability in the system.', true).replace('<h2>', '<h2 id="problems-title">')}
    ${storyIllustration()}
    <div class="problem-list">
      ${c.problems.map((p) => `
      <article class="problem reveal">
        <div class="problem-from"><span class="problem-ico">${icon(p.icon, 22)}</span><p>${p.problem}</p></div>
        <div class="problem-arrow" aria-hidden="true">${icon('arrow', 22)}</div>
        <div class="problem-to"><h3>${p.capability}</h3><p>${p.detail}</p></div>
      </article>`).join('')}
    </div>
  </div>
</section>`;

export const solutions = (withHead = true) => `
<section class="section theme-light" id="solutions" aria-label="Solution modules">
  <div class="container">
    ${withHead ? sectionHead('Solutions', 'Modules that fit together.', 'Start with the module that matters most. Add others as your needs grow; they share the same records.', true) : ''}
    <div class="card-grid bento">
      ${c.solutions.map((s, i) => `
      <article class="card reveal b${i}" id="module-${i + 1}">
        <span class="card-idx">0${i + 1}</span>
        <span class="card-ico">${icon(s.icon, 26)}</span>
        <div class="b${i}-copy"><h3>${s.title}</h3>
        <p>${s.text}</p>
        <details class="card-more"><summary>What’s included</summary><ul class="card-points">${s.points.map((t) => `<li>${icon('check', 16)}<span>${t}</span></li>`).join('')}</ul></details></div>
        <a class="card-link" href="contact.html">Ask about this ${icon('arrow', 16)}</a>
      </article>`).join('')}
    </div>
  </div>
</section>`;

export const sampleDashboard = () => `
<section class="section dash-section" id="dashboard" aria-labelledby="dashboard-title">
  <div class="container">
    <div class="section-head center reveal">
      <p class="eyebrow eyebrow-dark">Sample dashboard</p>
      <h2 id="dashboard-title">What the owner sees each morning.</h2>
      <p class="lead">An illustrative view of how records entered by your team come together: jobs, crews, equipment, sales, payments and balances in one place. Hover the chart to explore.</p>
    </div>
    <div class="dash-stage reveal">${fullDashboard()}</div>
    <p class="dash-foot"><span>Illustrative dashboard</span><span>Sample data</span><span>Philippine pesos</span><span>Recorded locations, not live tracking</span></p>
  </div>
</section>`;

export const industries = () => `
<section class="section section-tint" id="industries" aria-labelledby="industries-title">
  <div class="container">
    ${sectionHead('Industries', 'One approach, adapted to how you operate.', 'The building blocks stay the same; the screens, fields and reports are configured for your kind of business.', true).replace('<h2>', '<h2 id="industries-title">')}
    <div class="industry-grid">
      ${c.industries.map((i) => `
      <article class="industry reveal">
        <span class="card-ico card-ico-blue">${icon(i.icon, 26)}</span>
        <h3>${i.title}</h3>
        <p class="industry-sub">${i.sub}</p>
        <ul class="ticks">${i.items.map((t) => `<li>${icon('check', 18)}<span>${t}</span></li>`).join('')}</ul>
      </article>`).join('')}
    </div>
  </div>
</section>`;

// Illustrative mini-interfaces with readable SAMPLE content (no real clients, names or figures).
const chip = (cls, t) => `<span class="status ${cls}"><i aria-hidden="true"></i>${t}</span>`;
const stat = (l, v) => `<div class="pv-stat"><small>${l}</small><b>${v}</b></div>`;
const row = (t, sub, st) => `<li class="pv-row"><span class="l"><strong>${t}</strong><small>${sub}</small></span>${st}</li>`;
const pvx = (label, inner) => `<div class="pvx" role="group" aria-label="Illustrative preview with sample data: ${label}">${inner}</div>`;
const pvHead = (t, sub) => `<div class="pvx-h"><span>${t}</span><small>${sub}</small></div>`;

const projectPreview = (kind) => {
  if (kind === 'topmop') return pvx('crews, jobs and equipment', `
    ${pvHead('Today · crews and jobs', 'Sample data')}
    <div class="pv-stats">${stat('Crew present', '42 / 46')}${stat('Jobs today', '18')}${stat('Equipment out', '31')}</div>
    <ul class="pv-rows-t">
      ${row('Crew A · Sample Office Tower', 'Floor polisher #3 issued 8:00 AM', chip('st-progress', 'In progress'))}
      ${row('Crew B · Sample Café', 'Return due 5:00 PM · sign-off pending', chip('st-wait', 'Awaiting sign-off'))}
      ${row('Crew C · Sample Warehouse', 'Starts 1:00 PM', chip('st-sched', 'Scheduled'))}
    </ul>`);
  if (kind === 'range') return pvx('bays and a player tab', `
    ${pvHead('Bays · today', 'Sample data')}
    <div class="pv-split">
      <div class="pv-bays">${[['Bay 1', 'st-progress', 'In use'], ['Bay 2', 'st-done', 'Open'], ['Bay 3', 'st-wait', 'Reserved'], ['Bay 4', 'st-progress', 'In use'], ['Bay 5', 'st-done', 'Open'], ['Bay 6', 'st-done', 'Open']].map(([n, c2, t]) => `<div class="pv-bay"><strong>${n}</strong>${chip(c2, t)}</div>`).join('')}</div>
      <div class="pv-tab">
        <p class="pv-tab-h">Player tab · Bay 4</p>
        <p class="pv-line"><span>Medium bucket × 2</span><b>₱300</b></p>
        <p class="pv-line"><span>Iced coffee</span><b>₱120</b></p>
        <p class="pv-line pv-total"><span>Total</span><b>₱420</b></p>
        <p class="pv-btn">Checkout</p>
      </div>
    </div>`);
  if (kind === 'carwash') return pvx('job queue by bay', `
    ${pvHead('Job queue · by bay', 'Sample data')}
    <ul class="pv-rows-t">
      ${row('Bay 1 · Sedan', 'Full wash · started 12 min ago', chip('st-progress', 'In progress'))}
      ${row('Bay 2 · SUV', 'Exterior wash and wax', chip('st-sched', 'Waiting'))}
      ${row('Bay 3 · Pickup', 'Interior clean · paid ₱450', chip('st-done', 'Done'))}
    </ul>
    <div class="pv-stats">${stat('Vehicles today', '24')}${stat('Sales recorded', '₱18,600')}${stat('Low stock', 'Shampoo')}</div>`);
  if (kind === 'maintenance') return pvx('visit checklist and client sign-off', `
    ${pvHead('Aircon check · Sample Clinic', '2:00 PM')}
    <div class="pv-split">
      <ul class="pv-check">${[['Filters cleaned', 1], ['Drain line cleared', 1], ['Pressure checked', 1], ['Photos attached', 0], ['Client sign-off', 0]].map(([t, d]) => `<li class="${d ? 'is-done' : ''}"><i class="pv-box" aria-hidden="true"></i>${t}</li>`).join('')}</ul>
      <div class="pv-sign">
        <p class="pv-tab-h">Client sign-off</p>
        <svg viewBox="0 0 160 46" aria-hidden="true"><path d="M8 32c14-26 22 10 36-12s20 14 32-6 18 6 28-4 14 8 24 0" fill="none" stroke="#b6f23a" stroke-width="2.4" stroke-linecap="round"/></svg>
        <p class="pv-line"><span>Signed by</span><b>Sample Client</b></p>
        <p class="pv-line"><span>Invoice</span><b>₱4,500 · Sent</b></p>
      </div>
    </div>`);
  return pvx('bookings and payments', `
    ${pvHead('Today · bookings', 'Sample data')}
    <ul class="pv-rows-t">
      ${row('9:00 AM · Haircut', 'Stylist 1', chip('st-done', 'Paid ₱350'))}
      ${row('10:00 AM · Color', 'Stylist 2', chip('st-sched', 'Booked ₱1,800'))}
      ${row('11:30 AM · Haircut', 'Stylist 1', chip('st-sched', 'Booked ₱350'))}
      ${row('1:00 PM · Treatment', 'Stylist 3', chip('st-done', 'Paid ₱1,200'))}
    </ul>
    <div class="pv-stats pv-stats-2">${stat('Bookings today', '12')}${stat('Payments recorded', '₱1,550')}</div>`);
};

const workCard = (p) => `
      <article class="work-card reveal${p.group === 'concept' ? ' work-concept' : ''}">
        <div class="work-preview"><div class="win-bar" aria-hidden="true"><i></i><i></i><i></i><span>Illustrative preview</span><em>Sample data</em></div>${projectPreview(p.kind)}</div>
        <div class="work-body">
          <span class="status-pill ${p.group === 'concept' ? 'pill-concept' : p.kind === 'topmop' ? 'pill-dev' : 'pill-demo'}">${p.status}</span>
          <h3>${p.name}</h3>
          <p>${p.text}</p>
          <ul class="tags">${p.tags.map((t) => `<li>${t}</li>`).join('')}</ul>
        </div>
      </article>`;

export const workGroups = () => `
<section class="section theme-light" id="work" aria-label="Projects and concept prototypes">
  <div class="container">
    <h2 class="work-group-h reveal"><span>Projects</span></h2>
    <div class="work-grid">${c.projects.filter((p) => p.group === 'project').map(workCard).join('')}
    </div>
    <h2 class="work-group-h reveal"><span>Concept prototypes</span><small>Built with sample data to show what is possible</small></h2>
    <p class="strip-hint" aria-hidden="true">Swipe to browse →</p>
    <div class="work-grid work-grid-3 work-strip" tabindex="0" role="region" aria-label="Concept prototypes, scroll sideways to browse">${c.projects.filter((p) => p.group === 'concept').map(workCard).join('')}
    </div>
  </div>
</section>`;

export const workTeaser = () => `
<section class="section" id="work" aria-labelledby="work-title">
  <div class="container">
    ${sectionHead('Our Work', 'Projects, described plainly.', 'Two projects we are building or demonstrating. Previews are illustrative, not screenshots, and neither is presented as a client deployment.', true).replace('<h2>', '<h2 id="work-title">')}
    <p class="strip-hint" aria-hidden="true">Swipe to browse →</p>
    <div class="work-grid work-strip" tabindex="0" role="region" aria-label="Projects, scroll sideways to browse">${c.projects.filter((p) => p.group === 'project').map(workCard).join('')}
    </div>
    <p class="more-link reveal">${button('See all projects and concepts', 'work.html', 'primary')}</p>
  </div>
</section>`;

export const process = () => `
<section class="section theme-light" id="process" aria-labelledby="process-title">
  <div class="container">
    ${sectionHead('Implementation process', 'From first conversation to launch.', 'A clear path with agreed scope at every stage.', true).replace('<h2>', '<h2 id="process-title">')}
    <ol class="steps">
      ${c.steps.map((s, i) => `
      <li class="step reveal">
        <div class="step-top"><span class="step-num">0${i + 1}</span><span class="step-ico">${icon(s.icon, 22)}</span></div>
        <h3>${s.title}</h3>
        <p>${s.text}</p>
      </li>`).join('')}
    </ol>
  </div>
</section>`;

const meetCard = (config) => `
      <div class="meet">
        ${config.photo ? `<img class="meet-photo" src="${config.photo}" alt="${config.contactPerson}" width="72" height="72" loading="lazy">` : `<span class="meet-photo meet-initials" aria-hidden="true">${config.contactPerson.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>`}
        <div><strong>${config.contactPerson}</strong><span>Your contact for demos and workflow consultations</span>
          <p class="meet-links"><a href="mailto:${config.email}">${config.email}</a><a href="${telHref(config.mobile)}">${prettyMobile(config.mobile)}</a></p></div>
      </div>`;

export const aboutBody = (config) => `
<section class="section theme-light" id="about" aria-label="About OpsPilot">
  <div class="container about-grid">
    <div class="reveal">
      <p class="lead">OpsPilot builds custom business systems for Philippine MSMEs. We focus on everyday workflows (who worked where, what equipment went out, what was billed and what has been paid) and on systems that your staff can actually use.</p>
      <p class="lead">We would rather understand your operation properly than hand you a generic package.</p>
      ${meetCard(config)}
    </div>
    <ul class="principles">
      ${c.principles.map((p) => `<li class="principle reveal"><span class="card-ico card-ico-blue">${icon(p.icon, 24)}</span><div><h3>${p.title}</h3><p>${p.text}</p></div></li>`).join('')}
    </ul>
  </div>
</section>`;

export const engagement = () => `
<section class="section section-tint" id="engagement" aria-labelledby="engagement-title">
  <div class="container">
    ${sectionHead('Engagement model', 'Simple to understand, defined in writing.', 'We are not publishing fixed prices yet. After a workflow consultation we provide a quotation based on your scope.', true).replace('<h2>', '<h2 id="engagement-title">')}
    <div class="engage-grid">
      ${c.engagement.map((e, i) => `<article class="engage reveal"><span class="engage-n">${i + 1}</span><h3>${e.title}</h3><p>${e.text}</p></article>`).join('')}
    </div>
    <p class="agreement-note reveal">${icon('shield', 22)}<span>Scope, data ownership, export arrangements and support terms are defined in the agreement.</span></p>
  </div>
</section>`;

export const scopeBuilder = () => `
<section class="section theme-light" id="scope" aria-labelledby="scope-title">
  <div class="container">
    ${sectionHead('Scope builder', 'Outline the system you have in mind.', 'Pick your business type and the modules that matter most. You will get a scope outline to send with your inquiry. No prices are shown; a quotation follows the consultation.', true).replace('<h2>', '<h2 id="scope-title">')}
    <noscript><p class="noscript-note">The scope builder needs JavaScript. You can still describe your workflow in the contact form below.</p></noscript>
    <div class="scope reveal" id="scope-tool">
      <div class="scope-main">
        <fieldset class="scope-group">
          <legend><span class="scope-n">01</span>Business type</legend>
          <div class="choice-grid choice-4">
            ${c.scopeTypes.map((t, i) => `<label class="choice"><input type="radio" name="scope-type" value="${t.id}"${i === 0 ? ' checked' : ''}><span class="choice-box"><strong>${t.label}</strong><small>${t.hint}</small></span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="scope-group">
          <legend><span class="scope-n">02</span>Modules <small>(suggested for your type; change freely)</small></legend>
          <div class="choice-grid choice-2">
            ${c.solutions.map((m, i) => `<label class="choice"><input type="checkbox" name="scope-module" value="${i}"><span class="choice-box choice-row">${icon(m.icon, 20)}<strong>${m.title}</strong></span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="scope-group">
          <legend><span class="scope-n">03</span>Worth discussing</legend>
          <div class="choice-grid choice-1">
            ${c.scopeNotes.map((n) => `<label class="choice"><input type="checkbox" name="scope-note" value="${n.id}" data-label="${n.label}"><span class="choice-box choice-row">${icon('check', 18)}<span>${n.label}</span></span></label>`).join('')}
          </div>
        </fieldset>
      </div>
      <aside class="scope-summary" aria-labelledby="scope-sum-title">
        <h3 id="scope-sum-title">Your scope outline</h3>
        <p class="scope-type-line" id="scope-type-line"></p>
        <ul class="scope-list" id="scope-list" aria-live="polite"></ul>
        <p class="scope-count" id="scope-count"></p>
        <div class="scope-pricing">
          <strong>How it is priced</strong>
          <ul>
            <li>One-time implementation fee for agreed setup, configuration and training</li>
            <li>Monthly package for hosting, maintenance, backups and defined support</li>
            <li>Extra modules and major changes quoted separately</li>
          </ul>
          <p>No price is estimated here. Scope, data ownership, export arrangements and support terms are defined in the agreement.</p>
        </div>
        <button type="button" class="btn btn-primary" id="scope-send" disabled>Use this scope in my inquiry${icon('arrow', 18)}</button>
        <p class="scope-hint" id="scope-hint">Select at least one module.</p>
      </aside>
    </div>
  </div>
</section>`;

export const faq = () => `
<section class="section theme-light" id="faq" aria-labelledby="faq-title">
  <div class="container faq-wrap">
    ${sectionHead('FAQ', 'Common questions', '', true).replace('<h2>', '<h2 id="faq-title">')}
    <div class="faq-list reveal">
      ${c.faqs.map((f) => `<details class="faq"><summary><span>${f.q}</span>${icon('plus', 20)}</summary><p>${f.a}</p></details>`).join('')}
    </div>
  </div>
</section>`;

const contactDetails = (config) => `
      <ul class="contact-list" id="details">
        ${config.email ? `<li>${icon('mail', 20)}<div><span>Email</span><a href="mailto:${config.email}">${config.email}</a></div></li>` : ''}
        ${config.mobile ? `<li>${icon('phone', 20)}<div><span>Mobile</span><a href="${telHref(config.mobile)}">${prettyMobile(config.mobile)}</a></div></li>` : ''}
        ${config.address ? `<li>${icon('pin', 20)}<div><span>Office</span><address>${config.address}</address></div></li>` : ''}
        ${config.officeHours ? `<li>${icon('clock', 20)}<div><span>Office hours</span><p>${config.officeHours}</p></div></li>` : ''}
      </ul>`;

const contactActions = (config) => {
  const b = [];
  if (config.bookingUrl) b.push(`<a class="btn btn-lime" href="${config.bookingUrl}" rel="noopener">Book a consultation${icon('arrow', 18)}</a>`);
  if (config.messengerUrl) b.push(`<a class="btn btn-ghost" href="${config.messengerUrl}" rel="noopener">Message on Messenger</a>`);
  if (config.viberNumber) b.push(`<a class="btn btn-ghost" href="viber://chat?number=%2B${config.viberNumber.replace(/\D/g, '')}">Chat on Viber</a>`);
  if (config.whatsappNumber) b.push(`<a class="btn btn-ghost" href="https://wa.me/${config.whatsappNumber.replace(/\D/g, '')}" rel="noopener">WhatsApp</a>`);
  return b.length ? `<div class="contact-actions">${b.join('')}</div>` : '';
};

export const contact = (config) => `
<section class="section section-navy section-top" id="contact" aria-labelledby="contact-title">
  <div class="container contact-grid">
    <div class="contact-copy reveal">
      <p class="eyebrow eyebrow-dark">Contact</p>
      <h1 id="contact-title">Let’s simplify your daily operations.</h1>
      <p class="lead lead-dark">Tell us which workflow is giving you the most trouble. We will follow up to arrange a demo or workflow consultation.</p>
      <p class="contact-person"><span>Contact person</span><strong>${config.contactPerson}</strong></p>
      ${contactDetails(config)}
      ${contactActions(config)}
    </div>
    <form class="form reveal" id="contact-form" novalidate data-endpoint="${config.formEndpoint || ''}" data-mailto="${config.email}" ${config.formEndpoint ? 'action="' + config.formEndpoint + '" ' : ''}method="post">
      ${config.formEndpoint ? '' : `<p class="form-notice" role="note">${icon('mail', 18)}<span><strong>How this form works:</strong> sending opens your email app with your request ready to go to <a href="mailto:${config.email}">${config.email}</a>. We receive it only once you press Send there. You can also call ${prettyMobile(config.mobile)}.</span></p>`}
      <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" autocomplete="name" required></div>
      <div class="field"><label for="f-company">Company</label><input id="f-company" name="company" type="text" autocomplete="organization" required></div>
      <div class="field"><label for="f-type">Business type</label>
        <select id="f-type" name="business_type" required><option value="">Select…</option>${c.businessTypes.map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="field-row">
        <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="f-phone">Phone</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" required></div>
      </div>
      <div class="field"><label for="f-workflow">Workflow to improve</label><textarea id="f-workflow" name="workflow" rows="4" required placeholder="e.g. Tracking crew attendance and equipment across sites"></textarea></div>
      <div class="consent"><label class="check"><input type="checkbox" name="consent" value="yes" required><span>I agree that OpsPilot may use these details to respond to my inquiry, as described in the <a href="privacy.html">privacy notice</a>.</span></label></div>
      <div class="hp" aria-hidden="true"><label>Leave empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      <button class="btn btn-lime" type="submit">Send request${icon('arrow', 18)}</button>
      <p class="form-status" id="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>`;

export const privacy = (config) => `
<section class="section privacy" id="privacy" aria-label="Privacy notice">
  <div class="container privacy-wrap">
    <p>When you use the contact form on this site, you give us your name, company, business type, email address, phone number and a description of the workflow you want to improve.</p>
    <ul>
      <li><strong>Why we use it:</strong> to reply to your inquiry and arrange a demo or workflow consultation.</li>
      <li><strong>Who sees it:</strong> OpsPilot. If a form-handling service is connected to this site, that service processes the submission on our behalf; your email app is used if it is not.</li>
      <li><strong>How long we keep it:</strong> only as long as needed to respond to you and, if we work together, for the engagement.</li>
      <li><strong>Your choices:</strong> you can ask us to see, correct or delete your details at any time by writing to <a href="mailto:${config.email}">${config.email}</a>.</li>
    </ul>
  </div>
</section>`;

export const footer = (config) => `
<footer class="site-footer">
  <div class="container footer-inner">
    ${logo(true)}
    <p class="footer-tag">Your business. One clear system.</p>
    <nav class="footer-nav" aria-label="Footer">${c.nav.map(([l, h]) => `<a href="${h}">${l}</a>`).join('')}<a href="privacy.html">Privacy</a></nav>
    <p class="footer-contact"><a href="mailto:${config.email}">${config.email}</a><span aria-hidden="true">·</span><a href="${telHref(config.mobile)}">${prettyMobile(config.mobile)}</a><span aria-hidden="true">·</span><span>${config.address}</span></p>
    <p class="footer-small">© <span id="year">${new Date().getFullYear()}</span> OpsPilot. Dashboards and previews on this site are illustrative and use sample data. <a href="privacy.html">Privacy notice</a></p>
  </div>
</footer>`;


// ---------- Multi-page components ----------
export const pageHero = (eyebrow, title, lead = '') => `
<section class="page-hero" aria-labelledby="page-title">
  <div class="container reveal">
    <p class="eyebrow eyebrow-dark">${eyebrow}</p>
    <h1 id="page-title">${title}</h1>
    ${lead ? `<p class="page-lead">${lead}</p>` : ''}
  </div>
</section>`;

export const ctaBand = (title = 'Let’s simplify your daily operations.', text = 'Tell us which workflow is giving you the most trouble. We will follow up to arrange a demo or workflow consultation.') => `
<section class="cta-band" aria-label="Get in touch">
  <div class="container cta-inner reveal">
    <div><h2>${title}</h2><p>${text}</p></div>
    <div class="btn-row">${button('Request a Demo', 'contact.html', 'lime')}${button('Contact details', 'contact.html#details', 'ghost')}</div>
  </div>
</section>`;

export const solutionsOverview = () => `
<section class="section section-tint" id="solutions" aria-labelledby="solutions-title">
  <div class="container">
    ${sectionHead('Solutions', 'Modules that fit together.', 'Start with the module that matters most. Add others as your needs grow; they share the same records.', true).replace('<h2>', '<h2 id="solutions-title">')}
    <div class="mini-grid">
      ${c.solutions.map((s, i) => `<a class="mini reveal" href="solutions.html#module-${i + 1}"><span class="card-ico">${icon(s.icon, 24)}</span><h3>${s.title}</h3><p>${s.short}</p><span class="mini-more">Details ${icon('arrow', 16)}</span></a>`).join('')}
      <a class="mini mini-cta reveal" href="contact.html"><span class="card-ico card-ico-blue">${icon('plus', 24)}</span><h3>Something else?</h3><p>Describe your workflow and we will tell you how it could fit.</p><span class="mini-more">Talk to us ${icon('arrow', 16)}</span></a>
    </div>
    <p class="more-link reveal">${button('See all solutions', 'solutions.html', 'primary')}</p>
  </div>
</section>`;

export const industriesOverview = (config = {}) => `
<section class="section theme-light" id="industries" aria-labelledby="industries-title">
  <div class="container">
    ${sectionHead('Industries', 'One approach, adapted to how you operate.', 'The building blocks stay the same; the screens, fields and reports are configured for your kind of business.', true).replace('<h2>', '<h2 id="industries-title">')}
    <div class="industry-grid">
      ${c.industries.map((i) => `
      <article class="industry reveal">
        ${industryBanner(i.id, config)}
        <span class="card-ico card-ico-blue">${icon(i.icon, 26)}</span>
        <h3>${i.title}</h3>
        <p class="industry-sub">${i.sub}</p>
        <ul class="ticks">${i.items.slice(0, 3).map((t) => `<li>${icon('check', 18)}<span>${t}</span></li>`).join('')}</ul>
        <a class="card-link" href="industries.html#${i.id}">See how it fits ${icon('arrow', 16)}</a>
      </article>`).join('')}
    </div>
  </div>
</section>`;

const moduleNames = (ids) => ids.map((n) => c.solutions[n].title);
const presetFor = { 'service-contractors': 0, 'driving-ranges': 1, 'car-washes': 2 };

export const industryDetails = () => c.industries.map((ind, i) => `
<section class="section${i % 2 ? ' section-tint' : ' theme-light'}" id="${ind.id}" aria-labelledby="${ind.id}-title">
  <div class="container split${i % 2 ? ' split-rev' : ''}">
    <div class="split-copy reveal">
      <span class="card-ico card-ico-blue">${icon(ind.icon, 26)}</span>
      <h2 id="${ind.id}-title">${ind.title}</h2>
      <p class="lead">${ind.intro}</p>
      <ul class="ticks">${ind.items.map((t) => `<li>${icon('check', 18)}<span>${t}</span></li>`).join('')}</ul>
      <p class="chips-label">Typical modules</p>
      <ul class="tags">${moduleNames(c.scopeTypes[presetFor[ind.id]].modules).map((t) => `<li>${t}</li>`).join('')}</ul>
      <div class="btn-row">${button('Request a Demo', 'contact.html', 'primary')}</div>
    </div>
    <div class="work-card industry-visual reveal">
      <div class="work-preview"><div class="win-bar" aria-hidden="true"><i></i><i></i><i></i><span>Illustrative preview</span><em>Sample data</em></div>${projectPreview(ind.preview)}</div>
    </div>
  </div>
</section>`).join('');

export const otherIndustries = () => `
<section class="section" id="other" aria-labelledby="other-title">
  <div class="container center-block reveal">
    <h2 id="other-title">Running something else?</h2>
    <p class="lead">If your business has staff, stock, bookings or daily transactions, the same building blocks may fit. Describe how it works today and we will tell you honestly whether and how we can help.</p>
    <div class="btn-row center-row">${button('Describe your workflow', 'contact.html', 'primary')}</div>
  </div>
</section>`;


// ---------- Brand illustrations (original, code-drawn; line-art on navy) ----------
const star = (cx, cy, r) => `<path class="il-lime il-glow" d="M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}z"/>`;
const windows = (x, y, cols, rows, gx, gy) => Array.from({ length: cols * rows }, (_, i) => `<path d="M${x + (i % cols) * gx} ${y + Math.floor(i / cols) * gy}h10"/>`).join('');

const illustrations = {
  'service-contractors': { label: 'Illustration: a crew cart heading to an office building, with a job checklist and location pin', svg: `
    <path class="il-line il-thin" d="M20 250H620"/>
    <rect class="il-fill" x="400" y="62" width="120" height="188" rx="4"/><rect class="il-fill" x="340" y="132" width="60" height="118" rx="4"/><rect class="il-fill" x="520" y="112" width="70" height="138" rx="4"/>
    <g class="il-line il-thin">${windows(416, 90, 3, 6, 36, 26)}${windows(352, 156, 2, 4, 26, 26)}${windows(534, 134, 2, 4, 28, 26)}</g>
    <path class="il-limeline il-glow" d="M460 18c-10 0-17 7-17 16 0 12 17 28 17 28s17-16 17-28c0-9-7-16-17-16z"/><circle class="il-lime" cx="460" cy="34" r="5"/>
    <path class="il-line il-dash" d="M214 222C270 180 330 180 392 224"/>
    <rect class="il-fill" x="70" y="192" width="140" height="34" rx="8"/><circle class="il-fill" cx="98" cy="238" r="12"/><circle class="il-fill" cx="184" cy="238" r="12"/>
    <path class="il-line" d="M70 192L50 150H36"/><path class="il-fill" d="M92 192l8-32h40l8 32z"/><rect class="il-fill" x="154" y="164" width="14" height="28" rx="3"/>
    <path class="il-line" d="M176 192L204 98"/><path class="il-fill" d="M190 90l26 8-7 24-27-8z"/>
    <rect class="il-fill" x="226" y="46" width="108" height="88" rx="10"/>
    ${[0, 1, 2].map((i) => `<path class="il-limeline" d="M244 ${74 + i * 23}l5 5 9-10"/><path class="il-line il-thin" d="M270 ${76 + i * 23}h50"/>`).join('')}
    ${star(600, 70, 9)}${star(60, 90, 7)}` },
  'driving-ranges': { label: 'Illustration: driving range bays with a ball flying toward a flag on target rings, and a coffee cup', svg: `
    <path class="il-line il-thin" d="M20 192H620"/><g class="il-line il-thin"><path d="M320 192L120 272M320 192V272M320 192L520 272"/></g>
    <ellipse class="il-fill" cx="472" cy="228" rx="104" ry="28"/><ellipse class="il-line" cx="472" cy="228" rx="66" ry="18"/><ellipse class="il-line" cx="472" cy="228" rx="28" ry="8"/>
    <path class="il-line" d="M472 228V118"/><path class="il-lime il-glow" d="M472 118l42 15-42 15z"/>
    <path class="il-limeline il-dash il-glow" d="M158 234C226 36 410 28 466 214"/><circle class="il-lime il-glow" cx="158" cy="234" r="7"/><path class="il-line" d="M158 241v10"/>
    ${[0, 1, 2].map((i) => `<path class="il-fill" d="M${22 + i * 42} 252v-52l19-12 19 12v52z"/><path class="il-line il-thin" d="M${32 + i * 42} 252v-30h18v30"/>`).join('')}
    <path class="il-fill" d="M548 66h38v28a13 13 0 0 1-13 13h-12a13 13 0 0 1-13-13z"/><path class="il-line" d="M586 72h6a7 7 0 0 1 0 15h-6"/><path class="il-line il-thin" d="M560 56c-5-7 5-9 0-17M574 56c-5-7 5-9 0-17"/>
    ${star(300, 70, 8)}${star(600, 160, 6)}` },
  'car-washes': { label: 'Illustration: a car passing through a wash bay with spray nozzles, bubbles and sparkles', svg: `
    <path class="il-line il-thin" d="M20 252H620"/>
    <rect class="il-fill" x="112" y="56" width="22" height="196" rx="4"/><rect class="il-fill" x="506" y="56" width="22" height="196" rx="4"/><rect class="il-fill" x="112" y="56" width="416" height="28" rx="9"/>
    ${[196, 258, 320, 382, 444].map((x) => `<circle class="il-lime" cx="${x}" cy="90" r="4"/><path class="il-line il-dash il-thin" d="M${x} 98v60"/><ellipse class="il-fill" cx="${x - 8}" cy="176" rx="3" ry="5"/><ellipse class="il-fill" cx="${x + 9}" cy="166" rx="3" ry="5"/>`).join('')}
    <path class="il-fill" d="M180 240v-28q0-14 16-20l46-14q18-28 58-28h46q36 0 52 30l32 12q18 6 18 20v28z"/><path class="il-line" d="M256 176q16-20 46-20h42l26 28H252z"/><path class="il-line il-thin" d="M312 160v24"/>
    <circle class="il-fill" cx="232" cy="242" r="23"/><circle class="il-line" cx="232" cy="242" r="9"/><circle class="il-fill" cx="404" cy="242" r="23"/><circle class="il-line" cx="404" cy="242" r="9"/>
    <g class="il-line il-thin"><circle cx="158" cy="206" r="9"/><circle cx="170" cy="230" r="5"/><circle cx="470" cy="214" r="7"/><circle cx="484" cy="188" r="10"/><circle cx="148" cy="170" r="5"/></g>
    ${star(300, 146, 10)}${star(430, 132, 7)}${star(560, 100, 8)}` },
};

export const industryBanner = (id, config = {}) => {
  const photo = (config.images || {})[id];
  const ill = illustrations[id];
  if (photo) return `<div class="il-banner il-banner-photo"><img src="${photo}" alt="Illustrative image: ${ill.label.replace('Illustration: ', '')}" width="640" height="280" loading="lazy"></div>`;
  return `<div class="il-banner"><svg class="il" viewBox="0 0 640 280" role="img" aria-label="${ill.label}">${ill.svg}</svg></div>`;
};

export const storyIllustration = () => `
<figure class="story reveal">
  <div class="story-art">
    <svg class="il" viewBox="0 0 960 330" role="img" aria-label="Illustration: scattered notebooks, spreadsheets, receipts and chat messages converge into one OpsPilot system shown as a dashboard (sample data).">
      <g transform="rotate(-7 115 150)"><rect class="il-fill" x="58" y="82" width="116" height="146" rx="8"/><g class="il-line il-thin"><path d="M80 112h72M80 134h72M80 156h56M80 178h64"/></g>${[0, 1, 2, 3, 4].map((i) => `<circle class="il-solid il-stroke" cx="58" cy="${100 + i * 28}" r="4"/>`).join('')}</g>
      <g transform="rotate(5 252 130)"><rect class="il-fill" x="188" y="66" width="130" height="104" rx="8"/><g class="il-line il-thin"><path d="M188 92h130M188 118h130M188 144h130M231 66v104M274 66v104"/></g><rect class="il-lime" x="192" y="70" width="36" height="18" rx="3" opacity=".85"/></g>
      <g transform="rotate(-3 150 270)"><path class="il-fill" d="M98 214h92v96l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6z"/><g class="il-line il-thin"><path d="M110 236h60M110 254h44M110 272h52"/></g></g>
      <g transform="rotate(8 304 236)"><rect x="268" y="204" width="68" height="66" rx="4" fill="#ffd98a"/><g stroke="#8a5a00" stroke-width="2" stroke-linecap="round" opacity=".6"><path d="M280 226h42M280 242h34M280 258h24"/></g></g>
      <path class="il-fill" d="M214 214h62a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10h-36l-14 14v-14h-12a10 10 0 0 1-10-10v-22a10 10 0 0 1 10-10z" transform="translate(-10 50)"/>
      <g class="il-line il-dash"><path d="M338 110C402 110 420 150 448 162"/><path d="M338 176C396 176 418 168 448 166"/><path d="M338 262C400 262 420 196 450 172"/></g>
      <g transform="translate(494 166)"><circle r="56" fill="none" stroke="#2f6bff" stroke-width="7" class="il-glow-blue"/><path d="M0 -30l16 48-16-11-16 11z" fill="#fff"/><circle cx="0" cy="-72" r="7" class="il-lime il-glow"/></g>
      <path class="il-limeline il-glow" d="M556 166h52"/><path class="il-limeline il-glow" d="M600 156l12 10-12 10"/>
      <rect x="628" y="46" width="310" height="238" rx="18" fill="#0b1733" stroke="#4d73d8" stroke-width="2"/>
      <text x="650" y="80" fill="#fff" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="17" font-weight="700">Operations overview</text>
      <text x="650" y="100" fill="#a5b4d6" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="12">Illustrative · Sample data</text>
      ${[['Jobs today', '18'], ['Crew', '42 / 46'], ['Sales', '₱186,400']].map(([l, v], i) => `<rect x="${650 + i * 96}" y="114" width="88" height="56" rx="10" fill="#12234a" stroke="#2c4a92"/><text x="${660 + i * 96}" y="134" fill="#a5b4d6" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="11">${l}</text><text x="${660 + i * 96}" y="156" fill="#fff" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="${v.length > 6 ? 12.5 : 17}" font-weight="800">${v}</text>`).join('')}
      <path d="M650 252C690 226 710 244 750 222S820 232 850 206 900 214 918 196" fill="none" stroke="#12a594" stroke-width="3" stroke-linecap="round"/>
      <path d="M650 262C700 240 730 258 770 236S830 246 860 222 900 228 918 214" fill="none" stroke="#3d7bff" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/>
    </svg>
  </div>
  <figcaption class="story-cap"><span><b>Today</b> Notebooks, spreadsheets, receipts and chat messages</span><span class="story-arrow" aria-hidden="true">→</span><span><b>With OpsPilot</b> One clear system your staff can use</span></figcaption>
</figure>`;
