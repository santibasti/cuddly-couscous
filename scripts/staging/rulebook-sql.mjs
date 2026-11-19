// Turns the rulebook markdown (lines starting "## " are sections, "# " is the title) into SQL that publishes it as version 1 in a STAGING ai_rulebook table.
//   node scripts/staging/rulebook-sql.mjs MASTER_RULEBOOK_V2.1.md > rulebook-staging.sql      then run that file in the STAGING SQL editor
import fs from 'node:fs';
const md = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n?/g, '\n');
let title = 'TopMop AI Customer Service Rulebook';
const sections = [];
let cur = null;
const slug = (t) => t.toLowerCase().replace(/^\d+\.\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';
for (const line of md.split('\n')) {
  const h2 = /^##\s+(.+?)\s*$/.exec(line);
  const h1 = /^#\s+(.+?)\s*$/.exec(line);
  if (h2) { if (cur) sections.push(cur); cur = { title: h2[1].trim(), lines: [] }; }
  else if (h1 && !cur) title = h1[1].trim();
  else if (cur) cur.lines.push(line);
}
if (cur) sections.push(cur);
const used = new Set();
const out = sections.map((s) => { let k = slug(s.title); while (used.has(k)) k += '-2'; used.add(k); return { key: k, title: s.title, body: s.lines.join('\n').trim() }; });
const q = (t) => `$q$${t}$q$`;
console.log('-- STAGING ONLY. Publishes the rulebook as version 1.');
console.log('truncate table public.ai_rulebook;');
console.log(`insert into public.ai_rulebook (version, status, title, change_note, sections, tests_passed_at, published_at) values (1, 'published', ${q(title)}, 'Staging test copy', ${q(JSON.stringify(out))}::jsonb, now(), now());`);
console.error(`${out.length} sections, ${JSON.stringify(out).length} characters`);
