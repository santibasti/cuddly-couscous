// Static multi-page site builder: assembles components into dist/. No dependencies.
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as ui from './src/components.mjs';
import { scopeTypes, solutions, businessTypes } from './src/content.mjs';

const root = import.meta.dirname;
const dist = join(root, 'dist');
const config = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
const site = (config.siteUrl || '').replace(/\/$/, '');
const brandDescription = 'OpsPilot builds custom operations systems for Philippine MSMEs, connecting jobs, people, equipment, sales and collections. Request a demo or workflow consultation.';

const pages = [
  {
    file: 'index.html', nav: 'index.html',
    title: 'OpsPilot | Custom Business Systems for Philippine MSMEs',
    description: brandDescription,
    body: () => [ui.hero(), ui.ticker(), ui.problems(), ui.solutionsOverview(), ui.industriesOverview(config), ui.workTeaser(), ui.process(), ui.ctaBand()],
  },
  {
    file: 'solutions.html', nav: 'solutions.html',
    title: 'Solutions | OpsPilot',
    description: 'Seven modules for attendance and payroll preparation, equipment and inventory, jobs and crews, quotations, service reports, billing and dashboards. Start with one and add more.',
    body: () => [
      ui.pageHero('Solutions', 'Seven modules. One set of records.', 'Start with the module that matters most. Add others as your needs grow; they share the same records, so nothing is typed twice.'),
      ui.solutions(false), ui.sampleDashboard(), ui.scopeBuilder(), ui.ctaBand(),
    ],
  },
  {
    file: 'industries.html', nav: 'industries.html',
    title: 'Industries | OpsPilot',
    description: 'How OpsPilot adapts to service contractors, driving ranges and car washes: crews and equipment, bays and player tabs, job queues and supplies.',
    body: () => [
      ui.pageHero('Industries', 'One approach, adapted to how you operate.', 'The building blocks stay the same; the screens, fields and reports are configured for your kind of business.'),
      ui.industryDetails(), ui.otherIndustries(), ui.ctaBand(),
    ],
  },
  {
    file: 'work.html', nav: 'work.html',
    title: 'Our Work | OpsPilot',
    description: 'OpsPilot projects and concept prototypes: a service operations system in development, a driving range and café demo, and prototypes for car washes, maintenance and appointment businesses.',
    body: () => [
      ui.pageHero('Our Work', 'Projects and concept prototypes.', 'Two projects we are building or demonstrating, plus concept prototypes that show how the approach adapts to other businesses. Previews are illustrative, not screenshots, and none is presented as a client deployment.'),
      ui.workGroups(), ui.ctaBand('Have a workflow in mind?', 'We can prototype it with your own scenarios before you commit to a full build.'),
    ],
  },
  {
    file: 'about.html', nav: 'about.html',
    title: 'About | OpsPilot',
    description: 'OpsPilot builds practical business systems for Philippine MSMEs around real workflows. Meet your contact, and see how engagement, scope and support are defined.',
    body: () => [
      ui.pageHero('About OpsPilot', 'Practical systems for the way real businesses run.', 'Custom business systems for Philippine MSMEs, built around everyday workflows and the people who use them.'),
      ui.aboutBody(config), ui.engagement(), ui.ctaBand(),
    ],
  },
  {
    file: 'contact.html', nav: 'contact.html',
    title: 'Contact | OpsPilot',
    description: 'Request a demo or workflow consultation with OpsPilot. Contact Jig Narciso at info@opspilot.ph or 0919 318 5860, BGC, Taguig.',
    body: () => [ui.contact(config), ui.faq()],
  },
  {
    file: 'privacy.html', nav: '',
    title: 'Privacy notice | OpsPilot',
    description: 'How OpsPilot handles the details you share through its website contact form.',
    body: () => [ui.pageHero('Privacy', 'Privacy notice', 'How we handle the details you share through this website.'), ui.privacy(config)],
  },
  {
    file: '404.html', nav: '', noindex: true,
    title: 'Page not found | OpsPilot',
    description: 'This page could not be found.',
    body: () => [`<section class="page-hero"><div class="container"><p class="eyebrow eyebrow-dark">404</p><h1 id="page-title">Page not found</h1><p class="page-lead">The page you were looking for does not exist or has moved.</p><div class="btn-row" style="margin-top:28px">${ui.button('Back to home', 'index.html', 'lime')}${ui.button('Contact us', 'contact.html', 'ghost')}</div></div></section>`],
  },
];

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'ProfessionalService', name: 'OpsPilot', description: brandDescription,
  email: config.email, telephone: '+63' + config.mobile.replace(/\D/g, '').replace(/^0/, ''),
  address: { '@type': 'PostalAddress', addressLocality: config.address, addressCountry: 'PH' }, ...(site ? { url: site } : {}),
});

const render = (pg) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pg.title}</title>
<meta name="description" content="${pg.description}">
<meta name="theme-color" content="#0A1630">
${pg.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${pg.title}">
<meta property="og:description" content="${pg.description}">
<meta property="og:type" content="website">
${site && !pg.noindex ? `<link rel="canonical" href="${site}/${pg.file === 'index.html' ? '' : pg.file}">\n<meta property="og:url" content="${site}/${pg.file === 'index.html' ? '' : pg.file}">` : ''}
${site ? `<meta property="og:image" content="${site}/og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">` : ''}
${pg.file === 'index.html' ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="styles.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${ui.header(pg.nav)}
<main id="main">
${pg.body().join('\n')}
</main>
${ui.footer(config)}
<script src="main.js" defer></script>
</body>
</html>
`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const pg of pages) await writeFile(join(dist, pg.file), render(pg));
await writeFile(join(dist, 'styles.css'), (await readFile(join(root, 'src/styles.css'), 'utf8')) + '\n' + (await readFile(join(root, 'src/dashboard.css'), 'utf8')));
const scopeData = JSON.stringify({ types: scopeTypes, modules: solutions.map((m) => m.title), businessTypes, notes: (await import('./src/content.mjs')).scopeNotes });
await writeFile(join(dist, 'main.js'), `window.OPSPILOT_SCOPE = ${scopeData};\n` + await readFile(join(root, 'src/main.js'), 'utf8'));
await cp(join(root, 'public'), dist, { recursive: true });
await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ''}`);
if (site) {
  const urls = pages.filter((p) => !p.noindex).map((p) => `<url><loc>${site}/${p.file === 'index.html' ? '' : p.file}</loc></url>`).join('');
  await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`);
}
console.log(`Built ${pages.length} pages to dist/. Form endpoint: ${config.formEndpoint ? 'configured' : 'NOT configured (email handoff in use)'}`);
