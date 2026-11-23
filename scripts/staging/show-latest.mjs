// Prints the newest evidence folder's name and the first/last lines of its staging logs (no keys are ever in them).   node scripts/staging/show-latest.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const root = path.join(os.homedir(), 'v23-evidence'); const dirs = fs.existsSync(root) ? fs.readdirSync(root).sort() : []; if (!dirs.length) { console.log('No evidence folder found.'); process.exit(1); }
const dir = path.join(root, dirs.at(-1)); console.log(`folder: ${dir}\nfiles: ${fs.readdirSync(dir).join(', ')}`);
for (const f of fs.readdirSync(dir).filter((x) => /^04-.*\.log$/.test(x))) { const l = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/); console.log(`\n===== ${f} (${l.length} lines) first 40 =====`); console.log(l.slice(0, 40).join('\n')); if (l.length > 80) { console.log(`\n----- last 25 -----`); console.log(l.slice(-25).join('\n')); } }
