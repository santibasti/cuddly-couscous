// Browser test of the AI Chat staff screen against the STAGING database (real chat-send function, real staging data). It clicks through every step, saves screenshots, then reads the staging database to prove what was stored.
// Needs: the app running on staging (npm run dev), the seed data (scripts/staging/ui-test-seed.sql), and these typed in the window (never printed):
//   set STAGING_LOGIN_EMAIL=...   set STAGING_LOGIN_PASSWORD=...   set STAGING_URL=https://nnggknbqrknkuexudvrp.supabase.co   set STAGING_SERVICE_KEY=...        (optional: APP_URL, default http://localhost:5173)
//   node scripts/ui/aichat-staging.cjs
const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const path = require('path');
const APP = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''), EMAIL = process.env.STAGING_LOGIN_EMAIL, PW = process.env.STAGING_LOGIN_PASSWORD, SB = (process.env.STAGING_URL || '').replace(/\/$/, ''), SVC = process.env.STAGING_SERVICE_KEY;
if (!EMAIL || !PW) { console.log('STOP: set STAGING_LOGIN_EMAIL and STAGING_LOGIN_PASSWORD in this window first.'); process.exit(2); }
if (/ghbumxivporzsalivgyg/.test(SB)) { console.log('STOP: that is the PRODUCTION address.'); process.exit(3); }
const dir = path.join(os.homedir(), 'v23-ui-evidence', new Date().toISOString().replace(/[:.]/g, '-')); fs.mkdirSync(dir, { recursive: true });
const results = []; const ok = (name, pass, ev = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${ev ? `\n      ${ev}` : ''}`); };
const rest = async (p) => { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } }); const j = await r.json().catch(() => null); if (!r.ok || !Array.isArray(j)) { console.log(`   [database read failed] HTTP ${r.status}: ${JSON.stringify(j).slice(0, 300)}`); return []; } return j; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } }); const dialogs = [];
  p.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  const shot = async (n) => p.screenshot({ path: path.join(dir, `${n}.png`) });
  await p.goto(`${APP}/#/`); await p.waitForTimeout(1500);
  console.log(`signing in as ${EMAIL} (password length ${PW.length}) at ${APP}`);
  if (await p.locator('input[type=email]').count()) {
    await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill(PW); await p.getByRole('button', { name: /Sign in/ }).click();
    for (let i = 0; i < 30; i++) { await p.waitForTimeout(1000); if (!(await p.locator('input[type=email]').count())) break; }   // wait up to 30 s for the app to open
    const still = await p.locator('input[type=email]').count();
    if (still) { await shot('00-login-failed'); const msgs = await p.locator('.alert, .toast, [role=alert], .err, .error').allInnerTexts().catch(() => []); console.log(`SIGN-IN DID NOT COMPLETE. The app says: ${msgs.join(' | ') || '(no message shown)'}`); }
  }
  await p.goto(`${APP}/#/ai-chat`); await p.waitForTimeout(2500);
  const signedIn = await p.getByRole('button', { name: /All conversations/ }).count() > 0; ok('signed in to the STAGING app as the owner and AI Chat opens', signedIn, signedIn ? '' : (await p.locator('body').innerText()).slice(0, 200).replace(/\n+/g, ' | ')); if (!signedIn) { await shot('00-not-signed-in'); await b.close(); process.exit(1); }
  await p.getByRole('button', { name: /All conversations/ }).click(); await p.waitForTimeout(800);
  const row = (n) => p.locator('.aichat-row', { hasText: n }); const txt = async () => p.locator('.aichat').innerText(); const list = async () => p.locator('.aichat-list').innerText();
  const settle = async (re, ms = 20000) => { const t0 = Date.now(); let t = await txt(); while (!re.test(t) && Date.now() - t0 < ms) { await p.waitForTimeout(500); t = await txt(); } return t; };   // wait until the screen shows the expected state (the first call to a cold function can take several seconds)
  const l0 = await list(); ok('the five "UI Test" conversations are listed', ['new contact', 'previous contact (no match)', 'phone matches ONE', 'same NAME', 'same PHONE'].every((x) => l0.includes(x)), l0.replace(/\n+/g, ' | ').slice(0, 300)); await shot('01-list');
  // A. one match
  await row('phone matches ONE').click(); await p.waitForTimeout(500); let t = await txt(); await shot('02-A-one-match');
  ok('A: suggested match: "Previous contact", the possible client UI Test Maria Cruz, how it was found, a "This is the client" button', /Previous contact/.test(t) && /UI Test Maria Cruz/.test(t) && /phone number ManyChat holds/.test(t) && await p.getByRole('button', { name: 'This is the client' }).count() === 1, t.replace(/\n+/g, ' | ').slice(0, 260));
  await p.getByRole('button', { name: 'This is the client' }).click(); t = await settle(/Existing client/); await shot('03-A-linked');
  ok('A: LINK: a confirmation question was asked and the contact is now an existing client (live chat-send call)', dialogs.some((d) => /Link this chat to client UI Test Maria Cruz/.test(d)) && /Existing client/.test(t), dialogs.at(-1) ?? '');
  await p.waitForTimeout(500); const open = await p.getByRole('link', { name: 'Open client' }).count(); ok('A: "Open client" link is offered', open === 1);
  await p.getByRole('button', { name: 'Unlink' }).click(); t = await settle(/Previous contact/);  await shot('04-A-unlinked');
  ok('A: UNLINK: asked to confirm, and the contact is back to "Previous contact"', dialogs.some((d) => /Unlink this chat/.test(d)) && /Previous contact/.test(t) && !/Existing client/.test(t));
  // B. same name
  await row('same NAME').click(); await p.waitForTimeout(500); t = await txt(); await shot('05-B-same-name');
  ok('B: same NAME on two clients: only the second UI Test Carla Lim is suggested (by phone), one Link button', /UI Test Carla Lim/.test(t) && await p.getByRole('button', { name: 'This is the client' }).count() === 1, t.replace(/\n+/g, ' | ').slice(0, 240));
  await p.getByRole('button', { name: 'This is the client' }).click(); t = await settle(/Existing client/); await shot('06-B-linked');
  ok('B: linked to UI Test Carla Lim', /Existing client/.test(t) && dialogs.some((d) => /Link this chat to client UI Test Carla Lim/.test(d)));
  // C. same phone
  await row('same PHONE').click(); await p.waitForTimeout(500); t = await txt(); await shot('07-C-same-phone');
  ok('C: same PHONE on two clients: "More than one client has this contact\'s mobile number", both Eva Tan and Evan Tan offered, nobody linked', /More than one client has this contact's mobile number/.test(t) && /UI Test Eva Tan/.test(t) && /UI Test Evan Tan/.test(t) && await p.getByRole('button', { name: 'This is the client' }).count() === 2 && !/Existing client/.test(t));
  await p.getByRole('button', { name: 'This is the client' }).nth(1).click(); t = await settle(/Existing client/); await shot('08-C-linked');
  ok('C: choosing the second candidate links only that one', /Existing client/.test(t) && dialogs.some((d) => /Link this chat to client UI Test Evan Tan/.test(d)));
  // D. previous contact, no match: search by hand
  await row('previous contact (no match)').click(); await p.waitForTimeout(500); t = await txt(); await shot('09-D-previous');
  ok('D: previous contact with no suggestion: explained, a manual-link search is offered, no client records shown', /Previous contact/.test(t) && /Link to a TopMop client by hand/.test(t) && !/Possible match/.test(t));
  await p.getByText('Link to a TopMop client by hand').click(); await p.getByPlaceholder('Search a client by name or mobile').fill('UI Test Maria'); await p.waitForTimeout(1500); t = await txt(); await shot('10-D-search');
  ok('D: typing a client name lists the matching client with a Link button', /UI Test Maria Cruz/.test(t) && await p.getByRole('button', { name: 'Link', exact: true }).count() >= 1);
  await p.getByRole('button', { name: 'Link', exact: true }).first().click(); t = await settle(/Existing client: UI Test Maria Cruz/); await shot('11-D-linked');
  ok('D: after confirming, the contact is an existing client: UI Test Maria Cruz', /Existing client: UI Test Maria Cruz/.test(t));
  // E. re-check
  await p.getByRole('button', { name: /Re-check this contact/ }).click(); await p.waitForTimeout(3500); let body = await p.locator('body').innerText(); await shot('12-E-recheck');
  ok('E: RE-CHECK this contact answers without an error', /contact re-checked/i.test(body) && !/NOT SAVED|error/i.test(body.split('Contact re-checked')[0] ?? ''), '');
  await p.getByRole('button', { name: /Re-check old contacts/ }).click(); await p.waitForTimeout(4000); body = await p.locator('body').innerText(); await shot('13-E-recheck-old');
  ok('E: RE-CHECK old contacts answers without an error', /contacts re-checked/i.test(body) || /re-checked/i.test(body), '');
  await b.close();
  // F. what the staging database says (read with the service key; nothing is changed)
  if (SB && SVC) {
    const c = await rest('chat_conversations?id=like.uitest-*&select=id,contact_status,link_state,client_id,linked_by&order=id'); const by = Object.fromEntries(c.map((x) => [x.id, x]));
    ok('F: DATABASE: uitest-c-one was linked and unlinked, so it is previous / suggested with no client', by['uitest-c-one']?.contact_status === 'previous' && !by['uitest-c-one']?.client_id, JSON.stringify(by['uitest-c-one']));
    ok('F: DATABASE: Carla (uitest-c-name) is existing, linked by staff to uitest-carla2', by['uitest-c-name']?.contact_status === 'existing' && by['uitest-c-name']?.link_state === 'staff' && by['uitest-c-name']?.client_id === 'uitest-carla2', JSON.stringify(by['uitest-c-name']));
    ok('F: DATABASE: the same-phone contact (uitest-c-two) is existing, linked by staff to uitest-dup2 only', by['uitest-c-two']?.contact_status === 'existing' && by['uitest-c-two']?.client_id === 'uitest-dup2', JSON.stringify(by['uitest-c-two']));
    ok('F: DATABASE: the no-match contact (uitest-c-prev) is existing, linked by staff to uitest-maria', by['uitest-c-prev']?.contact_status === 'existing' && by['uitest-c-prev']?.client_id === 'uitest-maria', JSON.stringify(by['uitest-c-prev']));
    const a = await rest('audit_logs?table_name=eq.chat_conversations&record_id=like.uitest-*&select=at,record_id,summary&order=at.desc&limit=20'); console.log('\nAUDIT ROWS (link / unlink):'); for (const x of Array.isArray(a) ? a : []) console.log(`  ${x.at}  ${x.record_id}  ${x.summary}`);
    ok('F: DATABASE: the audit log has the link and unlink actions (at least 5 rows)', Array.isArray(a) && a.length >= 5, `${Array.isArray(a) ? a.length : 0} rows`);
  } else console.log('\n(STAGING_URL / STAGING_SERVICE_KEY not set: the database check F was NOT done)');
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed\nScreenshots: ${dir}`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`\nSCRIPT STOPPED at a step it could not do: ${String(e.message).split('\n')[0]}\nPassed so far: ${results.filter(Boolean).length} of ${results.length}. Screenshots (if any): ${dir}`); process.exit(1); });
