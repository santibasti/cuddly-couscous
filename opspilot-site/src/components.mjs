// Reusable section/UI components. Each returns an HTML string.
import { icon, logoMark } from './icons.mjs';
import * as c from './content.mjs';
import { heroDashboard, fullDashboard } from './dashboard.mjs';

export const button = (label, href, variant = 'primary', extra = '') =>
  `<a class="btn btn-${variant}" href="${href}">${label}${variant === 'primary' || variant === 'lime' ? icon('arrow', 18) : ''}${extra}</a>`;

export const logo = (onDark = false) => `
<a class="logo ${onDark ? 'logo-dark' : ''}" href="#home" aria-label="OpsPilot, Custom Business Systems — home">
  ${logoMark()}
  <span class="logo-text"><span class="wordmark">Ops<b>Pilot</b></span><span class="descriptor">Custom Business Systems</span></span>
</a>`;

export const sectionHead = (eyebrow, title, lead = '', center = false) => `
<div class="section-head ${center ? 'center' : ''} reveal">
  <p class="eyebrow">${eyebrow}</p>
  <h2>${title}</h2>
  ${lead ? `<p class="lead">${lead}</p>` : ''}
</div>`;

export const header = () => `
<header class="site-header" id="top">
  <div class="scroll-progress" aria-hidden="true"><i></i></div>
  <div class="container header-inner">
    ${logo()}
    <nav class="nav" id="site-nav" aria-label="Primary">
      <ul>${c.nav.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul>
      ${button('Request a Demo', '#contact', 'primary')}
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
      <div class="btn-row">${button('Request a Demo', '#contact', 'lime')}${button('Explore Solutions', '#solutions', 'ghost')}</div>
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
<section class="section" id="problems" aria-labelledby="problems-title">
  <div class="container">
    ${sectionHead('Sound familiar?', 'Daily operations shouldn’t live in five different places.', 'These are common patterns in growing businesses. Each one maps to a practical capability in the system.', true).replace('<h2>', '<h2 id="problems-title">')}
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

export const solutions = () => `
<section class="section section-tint" id="solutions" aria-labelledby="solutions-title">
  <div class="container">
    ${sectionHead('Solutions', 'Modules that fit together.', 'Start with the module that matters most. Add others as your needs grow; they share the same records.', true).replace('<h2>', '<h2 id="solutions-title">')}
    <div class="card-grid bento">
      ${c.solutions.map((s, i) => `
      <article class="card reveal b${i}">
        <span class="card-idx">0${i + 1}</span>
        <span class="card-ico">${icon(s.icon, 26)}</span>
        <div class="b${i}-copy"><h3>${s.title}</h3>
        <p>${s.text}</p>
        <ul class="card-points">${s.points.map((t) => `<li>${icon('check', 16)}<span>${t}</span></li>`).join('')}</ul></div>
        <a class="card-link" href="#contact">Ask about this ${icon('arrow', 16)}</a>
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

export const work = () => `
<section class="section" id="work" aria-labelledby="work-title">
  <div class="container">
    ${sectionHead('Our Work', 'Projects and concept prototypes.', 'Two projects we are building or demonstrating, plus concept prototypes that show how the approach adapts to other businesses. Previews are illustrative, not screenshots, and none is presented as a client deployment.', true).replace('<h2>', '<h2 id="work-title">')}
    <h3 class="work-group-h reveal"><span>Projects</span></h3>
    <div class="work-grid">${c.projects.filter((p) => p.group === 'project').map(workCard).join('')}
    </div>
    <h3 class="work-group-h reveal"><span>Concept prototypes</span><small>Built with sample data to show what is possible</small></h3>
    <div class="work-grid work-grid-3">${c.projects.filter((p) => p.group === 'concept').map(workCard).join('')}
    </div>
    <div class="work-cta reveal">
      <div><strong>Have a workflow in mind?</strong><span>We can prototype it with your own scenarios before you commit to a full build.</span></div>
      ${button('Request a Demo', '#contact', 'primary')}
    </div>
  </div>
</section>`;

export const process = () => `
<section class="section section-tint" id="process" aria-labelledby="process-title">
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

export const about = () => `
<section class="section" id="about" aria-labelledby="about-title">
  <div class="container about-grid">
    <div class="reveal">
      <p class="eyebrow">About OpsPilot</p>
      <h2 id="about-title">Practical systems for the way real businesses run.</h2>
      <p class="lead">OpsPilot builds custom business systems for Philippine MSMEs. We focus on everyday workflows (who worked where, what equipment went out, what was billed and what has been paid) and on systems that your staff can actually use.</p>
      <p class="lead">We would rather understand your operation properly than hand you a generic package.</p>
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
<section class="section" id="scope" aria-labelledby="scope-title">
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
<section class="section section-tint" id="faq" aria-labelledby="faq-title">
  <div class="container faq-wrap">
    ${sectionHead('FAQ', 'Common questions', '', true).replace('<h2>', '<h2 id="faq-title">')}
    <div class="faq-list reveal">
      ${c.faqs.map((f) => `<details class="faq"><summary><span>${f.q}</span>${icon('plus', 20)}</summary><p>${f.a}</p></details>`).join('')}
    </div>
  </div>
</section>`;

const telHref = (m) => 'tel:+63' + m.replace(/\D/g, '').replace(/^0/, '');
const prettyMobile = (m) => m.replace(/\D/g, '').replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');
const contactDetails = (config) => `
      <ul class="contact-list">
        ${config.email ? `<li>${icon('mail', 20)}<div><span>Email</span><a href="mailto:${config.email}">${config.email}</a></div></li>` : ''}
        ${config.mobile ? `<li>${icon('phone', 20)}<div><span>Mobile</span><a href="${telHref(config.mobile)}">${prettyMobile(config.mobile)}</a></div></li>` : ''}
        ${config.address ? `<li>${icon('pin', 20)}<div><span>Office</span><address>${config.address}</address></div></li>` : ''}
        ${config.officeHours ? `<li>${icon('clock', 20)}<div><span>Office hours</span><p>${config.officeHours}</p></div></li>` : ''}
      </ul>`;

export const contact = (config) => `
<section class="section section-navy" id="contact" aria-labelledby="contact-title">
  <div class="container contact-grid">
    <div class="contact-copy reveal">
      <p class="eyebrow eyebrow-dark">Contact</p>
      <h2 id="contact-title">Let’s simplify your daily operations.</h2>
      <p class="lead lead-dark">Tell us which workflow is giving you the most trouble. We will follow up to arrange a demo or workflow consultation.</p>
      <p class="contact-person"><span>Contact person</span><strong>${config.contactPerson}</strong></p>
      ${contactDetails(config)}
    </div>
    <form class="form reveal" id="contact-form" novalidate data-endpoint="${config.formEndpoint || ''}" ${config.formEndpoint ? 'action="' + config.formEndpoint + '" ' : ''}method="post">
      ${config.formEndpoint ? '' : `<p class="form-notice" role="note">${icon('alert', 18)}<span><strong>This form is not connected yet.</strong> Submitting will not send your details anywhere. Please email <a href="mailto:${config.email}">${config.email}</a> or call ${prettyMobile(config.mobile)} instead.</span></p>`}
      <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" autocomplete="name" required></div>
      <div class="field"><label for="f-company">Company</label><input id="f-company" name="company" type="text" autocomplete="organization" required></div>
      <div class="field"><label for="f-type">Business type</label>
        <select id="f-type" name="business_type" required><option value="">Select…</option>${c.businessTypes.map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="field-row">
        <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="f-phone">Phone</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" required></div>
      </div>
      <div class="field"><label for="f-workflow">Workflow to improve</label><textarea id="f-workflow" name="workflow" rows="4" required placeholder="e.g. Tracking crew attendance and equipment across sites"></textarea></div>
      <div class="hp" aria-hidden="true"><label>Leave empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      <button class="btn btn-lime" type="submit">Send request${icon('arrow', 18)}</button>
      <p class="form-status" id="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>`;

export const footer = (config) => `
<footer class="site-footer">
  <div class="container footer-inner">
    ${logo(true)}
    <p class="footer-tag">Your business. One clear system.</p>
    <p class="footer-contact"><a href="mailto:${config.email}">${config.email}</a><span aria-hidden="true">·</span><a href="${telHref(config.mobile)}">${prettyMobile(config.mobile)}</a><span aria-hidden="true">·</span><span>${config.address}</span></p>
    <p class="footer-small">© <span id="year">${new Date().getFullYear()}</span> OpsPilot. Dashboards and previews on this site are illustrative and use sample data.</p>
  </div>
</footer>`;
