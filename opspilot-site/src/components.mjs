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
        <p>${s.text}</p></div>
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

const win = (inner, label) => `<svg viewBox="0 0 320 170" role="img" aria-label="${label}"><rect width="320" height="170" rx="10" class="pv-bg"/>${inner}</svg>`;
const projectPreview = (kind) => {
  if (kind === 'topmop') return win(`<rect x="14" y="14" width="92" height="142" rx="6" class="pv-card"/><rect x="24" y="26" width="52" height="7" rx="3" class="pv-line"/><g class="pv-rows">${[0, 1, 2, 3, 4].map((i) => `<circle cx="32" cy="${54 + i * 22}" r="6"/><rect x="44" y="${50 + i * 22}" width="${48 - (i % 3) * 8}" height="7" rx="3"/>`).join('')}</g><rect x="118" y="14" width="188" height="40" rx="6" class="pv-card"/><rect x="130" y="26" width="40" height="7" rx="3" class="pv-line"/><rect x="130" y="38" width="64" height="8" rx="3" class="pv-accent"/><rect x="118" y="64" width="188" height="92" rx="6" class="pv-card"/><g class="pv-bars">${[34, 52, 40, 66, 48, 72].map((h, i) => `<rect x="${134 + i * 28}" y="${142 - h}" width="16" height="${h}" rx="2"/>`).join('')}</g>`, 'Illustrative preview: a service operations screen with crew list, equipment and job status');
  if (kind === 'range') return win(`<g>${Array.from({ length: 8 }, (_, i) => `<rect x="${14 + (i % 4) * 46}" y="${14 + Math.floor(i / 4) * 54}" width="40" height="46" rx="6" class="${[0, 3, 4, 6].includes(i) ? 'pv-busy' : 'pv-card'}"/><rect x="${22 + (i % 4) * 46}" y="${24 + Math.floor(i / 4) * 54}" width="24" height="6" rx="3" class="pv-line"/>`).join('')}</g><rect x="204" y="14" width="102" height="142" rx="6" class="pv-card"/><rect x="214" y="26" width="52" height="7" rx="3" class="pv-line"/><g class="pv-rows">${[0, 1, 2, 3].map((i) => `<rect x="214" y="${46 + i * 20}" width="${60 - i * 6}" height="7" rx="3"/><rect x="278" y="${46 + i * 20}" width="18" height="7" rx="3"/>`).join('')}</g><rect x="214" y="132" width="82" height="16" rx="5" class="pv-accent"/>`, 'Illustrative preview: driving range bays with availability and a player tab');
  if (kind === 'carwash') return win(`${[0, 1, 2].map((i) => `<rect x="14" y="${14 + i * 38}" width="292" height="32" rx="6" class="pv-card"/><rect x="24" y="${22 + i * 38}" width="44" height="7" rx="3" class="pv-line"/><rect x="${96 + i * 34}" y="${20 + i * 38}" width="62" height="20" rx="6" class="pv-busy"/><circle cx="${112 + i * 34}" cy="${42 + i * 38}" r="3" class="pv-accent"/><circle cx="${142 + i * 34}" cy="${42 + i * 38}" r="3" class="pv-accent"/><rect x="262" y="${24 + i * 38}" width="34" height="8" rx="4" class="${i === 0 ? 'pv-accent' : 'pv-line'}"/>`).join('')}<rect x="14" y="130" width="140" height="28" rx="6" class="pv-card"/><g class="pv-bars">${[10, 16, 12, 20, 14].map((h, i) => `<rect x="${26 + i * 24}" y="${152 - h}" width="12" height="${h}" rx="2"/>`).join('')}</g><rect x="166" y="130" width="140" height="28" rx="6" class="pv-card"/><rect x="178" y="138" width="70" height="7" rx="3" class="pv-line"/><rect x="178" y="148" width="40" height="6" rx="3" class="pv-accent"/>`, 'Illustrative preview: a car wash job queue by bay with sales and supplies panels');
  if (kind === 'maintenance') return win(`<rect x="14" y="14" width="168" height="142" rx="6" class="pv-card"/><rect x="26" y="26" width="64" height="7" rx="3" class="pv-line"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="26" y="${46 + i * 21}" width="12" height="12" rx="3" class="${i < 3 ? 'pv-accent' : 'pv-busy'}"/><rect x="46" y="${48 + i * 21}" width="${100 - (i % 3) * 18}" height="7" rx="3" class="pv-line"/>`).join('')}<rect x="194" y="14" width="112" height="142" rx="6" class="pv-card"/><rect x="206" y="26" width="52" height="7" rx="3" class="pv-line"/><rect x="206" y="44" width="88" height="56" rx="6" class="pv-busy"/><path d="M216 84c10-24 18 10 28-12s16 14 24-6 12 4 18-4" fill="none" stroke="var(--lime)" stroke-width="2.4" stroke-linecap="round"/><rect x="206" y="116" width="88" height="26" rx="8" class="pv-accent"/>`, 'Illustrative preview: a service visit checklist with a client sign-off panel');
  return win(`<rect x="14" y="14" width="190" height="142" rx="6" class="pv-card"/><g>${Array.from({ length: 28 }, (_, i) => `<rect x="${24 + (i % 7) * 25}" y="${28 + Math.floor(i / 7) * 30}" width="20" height="24" rx="4" class="${[3, 9, 10, 16, 22, 24].includes(i) ? 'pv-accent' : [5, 12, 18, 20].includes(i) ? 'pv-busy' : 'pv-bg'}"/>`).join('')}</g><rect x="216" y="14" width="90" height="142" rx="6" class="pv-card"/><rect x="226" y="26" width="48" height="7" rx="3" class="pv-line"/><g class="pv-rows">${[0, 1, 2, 3, 4].map((i) => `<circle cx="232" cy="${54 + i * 21}" r="5"/><rect x="244" y="${50 + i * 21}" width="${50 - (i % 3) * 8}" height="7" rx="3"/>`).join('')}</g>`, 'Illustrative preview: a booking calendar with a staff list');
};

const workCard = (p) => `
      <article class="work-card reveal${p.group === 'concept' ? ' work-concept' : ''}">
        <div class="work-preview"><div class="win-bar" aria-hidden="true"><i></i><i></i><i></i><span>Illustrative preview</span></div>${projectPreview(p.kind)}</div>
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

export const contact = (config) => `
<section class="section section-navy" id="contact" aria-labelledby="contact-title">
  <div class="container contact-grid">
    <div class="contact-copy reveal">
      <p class="eyebrow eyebrow-dark">Contact</p>
      <h2 id="contact-title">Let’s simplify your daily operations.</h2>
      <p class="lead lead-dark">Tell us which workflow is giving you the most trouble. We will follow up to arrange a demo or workflow consultation.</p>
      <p class="contact-person"><span>Contact person</span><strong>${config.contactPerson}</strong></p>
    </div>
    <form class="form reveal" id="contact-form" novalidate data-endpoint="${config.formEndpoint || ''}" ${config.formEndpoint ? 'action="' + config.formEndpoint + '" ' : ''}method="post">
      ${config.formEndpoint ? '' : `<p class="form-notice" role="note">${icon('alert', 18)}<span><strong>This form is not connected yet.</strong> Submitting will not send your details anywhere until a submission service is configured.</span></p>`}
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

export const footer = () => `
<footer class="site-footer">
  <div class="container footer-inner">
    ${logo(true)}
    <p class="footer-tag">Your business. One clear system.</p>
    <p class="footer-small">© <span id="year">${new Date().getFullYear()}</span> OpsPilot. Dashboards and previews on this site are illustrative and use sample data.</p>
  </div>
</footer>`;
