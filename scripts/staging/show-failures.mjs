// Prints only the failing blocks (with the replies) and the per-conversation timelines from a runner log. No keys are ever in these logs.
//   node scripts/staging/show-failures.mjs <log file> [<log file> ...]
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/); console.log(`\n===== ${f} =====`);
  let show = false, tail = false;
  for (const l of lines) {
    if (/^(TIMELINE|DIAGNOSTICS|First conversation state)/.test(l)) tail = true;
    if (tail) { console.log(l); continue; }
    if (/^(PASS|FAIL)\s/.test(l)) show = l.startsWith('FAIL');
    if (show) console.log(l);
    if (/^\d+\/\d+ passed/.test(l)) console.log(l);
  }
}
