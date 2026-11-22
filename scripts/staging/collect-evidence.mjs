// Collects the STAGING evidence for the V2.3 final review in one go. Run it on your PC in the STAGING folder (the project linked to nnggknbqrknkuexudvrp).
//   $env:ANTHROPIC_API_KEY="..."            (typed by you; used only by the real-model runner, never printed)
//   $env:STAGING_URL="https://nnggknbqrknkuexudvrp.supabase.co"; $env:STAGING_KEY="<LEAD_INTAKE_KEY of staging>"; $env:STAGING_SERVICE_KEY="<service role key of staging>"
//   $env:RULEBOOK_FILE="C:\path\to\MASTER_RULEBOOK_V2.3.md"
//   optional, for the controlled ManyChat delivery run (a third run):  $env:STAGING_SUBSCRIBER="<test contact id>"; $env:STAGING_SUBSCRIBER_PHONE="<its phone as ManyChat holds it>"
//   node scripts/staging/collect-evidence.mjs
// It refuses to run unless the linked Supabase project is staging, records the commit, the deployed function versions, and runs the real-model runner (realmodel-v23.mjs) and the staging runner (run-scenarios.mjs) TWICE each.
// Logs go to <home>/v23-evidence/<time>/ (outside the repository) with a SHA-256 of every file and EVIDENCE_SUMMARY.md. No key is ever written to a log. Nothing here touches production.
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
const STAGING_REF = 'nnggknbqrknkuexudvrp', PROD_REF = 'ghbumxivporzsalivgyg';
const fail = (m) => { console.error(`STOP: ${m}`); process.exit(2); };
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
const ref = (() => { try { return fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim(); } catch { return ''; } })();
if (ref === PROD_REF) fail('this folder is linked to PRODUCTION. Use the staging folder.');
if (ref !== STAGING_REF) fail(`the linked Supabase project is "${ref || 'none'}", not staging (${STAGING_REF}). Run: supabase link --project-ref ${STAGING_REF}`);
if (!process.env.STAGING_URL?.includes(STAGING_REF)) fail('STAGING_URL must be the staging address (it must contain ' + STAGING_REF + ').');
for (const k of ['ANTHROPIC_API_KEY', 'STAGING_KEY', 'STAGING_SERVICE_KEY', 'RULEBOOK_FILE']) if (!process.env[k]) fail(`${k} is not set.`);
const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const dir = path.join(os.homedir(), 'v23-evidence', stamp); fs.mkdirSync(dir, { recursive: true });
const write = (name, text) => { fs.writeFileSync(path.join(dir, name), text); return name; };
const files = []; const rows = [];

const sha = run('git', ['rev-parse', 'HEAD']).stdout.trim(); const status = run('git', ['status', '--short']).stdout.trim();
files.push(write('01-commit.txt', `commit: ${sha}\nbranch: ${run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()}\nlinked supabase project: ${ref}\nstaging url host: ${new URL(process.env.STAGING_URL).host}\ntime: ${new Date().toISOString()}\nuncommitted changes:\n${status || '(none)'}\n`));
const fl = run('supabase', ['functions', 'list']); files.push(write('02-deployed-functions.txt', `${fl.stdout}\n${fl.stderr}`));   // versions and update times of the deployed functions
const redact = (t) => { let o = t; for (const k of ['ANTHROPIC_API_KEY', 'STAGING_KEY', 'STAGING_SERVICE_KEY']) if (process.env[k]) o = o.split(process.env[k]).join('[redacted]'); return o; };

const runner = (label, script, n, extra = {}) => {
  const r = run('node', [script], { CHATSIM_REAL: '1', ...extra }); const out = redact(`${r.stdout}\n${r.stderr}`); const name = write(`${label}-run${n}.log`, out); files.push(name);
  const m = [...out.matchAll(/(\d+)\/(\d+) passed/g)].pop(); const passed = m ? Number(m[1]) : 0, total = m ? Number(m[2]) : 0;
  rows.push({ label, run: n, passed, total, ok: r.status === 0 && total > 0 && passed === total, exit: r.status }); console.log(`${label} run ${n}: ${passed}/${total} ${r.status === 0 ? 'OK' : 'FAILED'}`);
};
for (const n of [1, 2]) runner('03-real-model-in-memory', 'scripts/chatsim/realmodel-v23.mjs', n);
for (const n of [1, 2]) runner('04-staging-supabase', 'scripts/staging/run-scenarios.mjs', n, { STAGING_SUBSCRIBER: '', STAGING_SUBSCRIBER_PHONE: '' });
let delivery = false; if (process.env.STAGING_SUBSCRIBER && process.env.STAGING_SUBSCRIBER_PHONE) { delivery = true; runner('05-manychat-delivery', 'scripts/staging/run-scenarios.mjs', 3, { STAGING_SUBSCRIBER: process.env.STAGING_SUBSCRIBER, STAGING_SUBSCRIBER_PHONE: process.env.STAGING_SUBSCRIBER_PHONE }); }

const hashes = files.map((f) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')}  ${f}`).join('\n');
const allOk = rows.every((r) => r.ok);
write('EVIDENCE_SUMMARY.md', `# V2.3 staging evidence\ncommit: ${sha}\nstaging project: ${STAGING_REF}\ngenerated: ${new Date().toISOString()}\n\n| log | run | passed | total | result |\n|---|---|---|---|---|\n${rows.map((r) => `| ${r.label} | ${r.run} | ${r.passed} | ${r.total} | ${r.ok ? 'PASS' : 'FAIL'} |`).join('\n')}\n\nManyChat delivery run: ${delivery ? 'included (run 3)' : 'NOT run (STAGING_SUBSCRIBER / STAGING_SUBSCRIBER_PHONE not set)'}\n\nSHA-256 of every file:\n\n\`\`\`\n${hashes}\n\`\`\`\n`);
console.log(`\nEvidence folder: ${dir}\n${allOk ? 'ALL RUNS PASSED' : 'AT LEAST ONE RUN FAILED: open the logs'}${delivery ? '' : '\nThe ManyChat delivery run was NOT done.'}\nSend EVIDENCE_SUMMARY.md and the .log files for the review (they hold no keys).`);
process.exit(allOk ? 0 : 1);
