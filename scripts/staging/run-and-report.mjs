// ONE command: runs the whole staging evidence collection, then prints everything the reviewer needs (summary, failing checks with replies, timelines, seeding notes). No keys are printed.
//   node scripts/staging/run-and-report.mjs
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const need = ['ANTHROPIC_API_KEY', 'STAGING_URL', 'STAGING_KEY', 'STAGING_SERVICE_KEY', 'RULEBOOK_FILE'].filter((k) => !process.env[k]);
if (need.length) { console.log(`STOP: these are not set in this window: ${need.join(', ')}.\nSet them again with:  set NAME=value  (one line each), then run this command again.`); process.exit(2); }
if (!fs.existsSync(process.env.RULEBOOK_FILE)) { console.log(`STOP: the rulebook file does not exist: ${process.env.RULEBOOK_FILE}`); process.exit(2); }
const root = path.join(os.homedir(), 'v23-evidence'); fs.rmSync(root, { recursive: true, force: true });
const r = spawnSync('node', ['scripts/staging/collect-evidence.mjs'], { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
console.log(`\n\n################ REPORT TO SEND (copy everything below) ################`);
const dirs = fs.existsSync(root) ? fs.readdirSync(root).sort() : []; if (!dirs.length) { console.log('No evidence folder was created (the collector stopped early; see the lines above).'); process.exit(1); }
const dir = path.join(root, dirs.at(-1)); console.log(`folder: ${dir}`);
const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
console.log('\n----- 01-commit.txt -----\n' + read('01-commit.txt')); console.log('----- EVIDENCE_SUMMARY.md -----\n' + read('EVIDENCE_SUMMARY.md').split('SHA-256')[0]);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.log')).sort()) {
  const lines = read(f).split(/\r?\n/); console.log(`\n----- ${f}: failing checks -----`); let show = false, tail = false, any = false;
  for (const l of lines) {
    if (/^(TIMELINE|DIAGNOSTICS|First conversation state|SEEDING NOTE|ANTHROPIC API ERRORS)/.test(l)) tail = true;
    if (tail) { console.log(l); any = true; continue; }
    if (/^(PASS|FAIL)\s/.test(l)) show = l.startsWith('FAIL');
    if (show) { console.log(l); any = true; }
    if (/^\d+\/\d+ passed/.test(l)) console.log(l);
  }
  if (!any) console.log('(none)');
}
console.log('\n################ END OF REPORT ################');
process.exit(r.status ?? 1);
