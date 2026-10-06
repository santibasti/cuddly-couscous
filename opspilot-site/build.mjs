// Static site builder: assembles components into dist/. No dependencies.
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as ui from './src/components.mjs';
import { scopeTypes, solutions, businessTypes } from './src/content.mjs';

const root = import.meta.dirname;
const dist = join(root, 'dist');
const config = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));

const title = 'OpsPilot | Custom Business Systems for Philippine MSMEs';
const description = 'OpsPilot builds custom operations systems for Philippine MSMEs, connecting jobs, people, equipment, sales and collections. Request a demo or workflow consultation.';

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#0A1630">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="styles.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${ui.header()}
<main id="main">
${ui.hero()}
${ui.ticker()}
${ui.problems()}
${ui.solutions()}
${ui.sampleDashboard()}
${ui.industries()}
${ui.work()}
${ui.process()}
${ui.about()}
${ui.engagement()}
${ui.scopeBuilder()}
${ui.faq()}
${ui.contact(config)}
</main>
${ui.footer()}
<script src="main.js" defer></script>
</body>
</html>
`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(join(dist, 'index.html'), html);
await cp(join(root, 'src/styles.css'), join(dist, 'styles.css'));
const scopeData = JSON.stringify({ types: scopeTypes, modules: solutions.map((m) => m.title), businessTypes });
await writeFile(join(dist, 'main.js'), `window.OPSPILOT_SCOPE = ${scopeData};\n` + await readFile(join(root, 'src/main.js'), 'utf8'));
await cp(join(root, 'public'), dist, { recursive: true });
console.log(`Built dist/ (${(html.length / 1024).toFixed(0)} KB HTML). Form endpoint: ${config.formEndpoint ? 'configured' : 'NOT configured'}`);
