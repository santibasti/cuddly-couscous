// Browser test of the AI Chat staff screen in the app's DEMO mode (sample conversations in every state; nothing live). Needs Playwright and the built app served on port 4173:
//   npm run build && npx vite preview --port 4173 &   then   node scripts/ui/aichat-contact.cjs
const { chromium } = require('playwright');
const results = []; const ok = (name, pass, ev = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${ev ? `\n      ${ev}` : ''}`); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } }); const dialogs = []; const toasts = [];
  p.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await p.goto('http://localhost:4173/#/ai-chat'); await p.waitForTimeout(800);
  const o = p.getByText(/owner/i).first(); if (await o.count()) { await o.click().catch(() => {}); await p.waitForTimeout(800); }
  await p.goto('http://localhost:4173/#/ai-chat'); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /All conversations/ }).click(); await p.waitForTimeout(300);
  const row = (n) => p.locator('.aichat-row', { hasText: n }); const panel = () => p.locator('.aichat .card').nth(1);
  const txt = async () => (await p.locator('.aichat').innerText());
  // 1. badges in the list
  const list = await p.locator('.aichat-list').innerText();
  ok('list shows an "existing client" badge, two "confirm client" badges and a "previous contact" badge', /existing client/.test(list) && (list.match(/confirm client/g) ?? []).length === 2 && /previous contact/.test(list) && /needs a person/.test(list), list.replace(/\n+/g, ' | ').slice(0, 260));
  // 2. one suggested match (the phone matches a client): staff confirm
  await row('Maria').click(); await p.waitForTimeout(300); let t = await txt();
  ok('suggested match: shows "Previous contact", the possible client and how it was found, and a "This is the client" button; no booking details are shown', /Previous contact/.test(t) && /Possible match, please confirm/.test(t) && /Maria Cruz/.test(t) && /phone number ManyChat holds/.test(t) && await p.getByRole('button', { name: 'This is the client' }).count() === 1 && !/JOB-\d{4}/.test(t));
  await p.getByRole('button', { name: 'This is the client' }).click(); await p.waitForTimeout(400); t = await txt();
  ok('MANUAL LINK (confirm): a confirmation question is asked, then the contact becomes an existing client and the badge changes', dialogs.some((d) => /Link this chat to client Maria Cruz/.test(d)) && /Existing client/.test(t) && !/Possible match, please confirm/.test(t) && /existing client/.test(await p.locator('.aichat-list').innerText()), dialogs.at(-1));
  // 3. unlink
  await p.getByRole('button', { name: 'Unlink' }).click(); await p.waitForTimeout(400); t = await txt();
  ok('UNLINK: a confirmation question is asked, and the contact goes back to "Previous contact" (no client used)', dialogs.some((d) => /Unlink this chat/.test(d)) && /Previous contact/.test(t) && !/Existing client/.test(t), dialogs.at(-1));
  // 4. two clients fit (same phone): staff choose one
  await row('Carla').click(); await p.waitForTimeout(300); t = await txt();
  ok('MULTIPLE MATCHES: "More than one client has this contact\'s mobile number" with both candidates and a button for each; nobody is linked', /More than one client has this contact's mobile number/.test(t) && /Carla Lim/.test(t) && /Carlo Lim/.test(t) && await p.getByRole('button', { name: 'This is the client' }).count() === 2 && /Previous contact/.test(t));
  await p.getByRole('button', { name: 'This is the client' }).nth(1).click(); await p.waitForTimeout(400); t = await txt();
  ok('MULTIPLE MATCHES: choosing the second candidate (Carlo Lim) asks for confirmation naming that client and links only that one', dialogs.some((d) => /Link this chat to client Carlo Lim/.test(d)) && /Existing client/.test(t) && !/More than one client/.test(t));
  // 5. a previous contact with no suggestion: search a client by hand and link
  await row('Dina').click(); await p.waitForTimeout(300); t = await txt();
  ok('previous contact with no suggestion: explained, no client records shown, and a manual-link search is offered', /Previous contact/.test(t) && /ManyChat contact since 2026-05-02/.test(t) && /Link to a TopMop client by hand/.test(t) && !/Possible match/.test(t));
  await p.getByText('Link to a TopMop client by hand').click(); await p.getByPlaceholder('Search a client by name or mobile').fill('x'); await p.waitForTimeout(150);
  ok('manual search: one character finds nothing (a name needs at least two characters)', !(await txt()).includes('Bayview'));
  await p.getByPlaceholder('Search a client by name or mobile').fill('bayview'); await p.waitForTimeout(250); t = await txt();
  ok('MANUAL LINK (search): typing a client name lists the matching client with a Link button', /Bayview Suites/.test(t) && await p.getByRole('button', { name: 'Link', exact: true }).count() >= 1);
  await p.getByRole('button', { name: 'Link', exact: true }).first().click(); await p.waitForTimeout(400); t = await txt();
  ok('MANUAL LINK (search): after confirming, the contact is an existing client and the Bayview client is named with an "Open client" link', dialogs.some((d) => /Link this chat to client Bayview/.test(d)) && /Existing client: Bayview Suites/.test(t) && await p.getByRole('link', { name: 'Open client' }).count() === 1);
  // 6. re-check buttons
  await p.getByRole('button', { name: /Re-check this contact/ }).click(); await p.waitForTimeout(300); let toastTxt = await p.locator('body').innerText();
  ok('RE-CHECK this contact: the button answers (the live function re-reads ManyChat and re-runs the matching)', /contact re-checked/i.test(toastTxt), '');
  await p.getByRole('button', { name: /Re-check old contacts/ }).click(); await p.waitForTimeout(300); toastTxt = await p.locator('body').innerText();
  ok('RE-CHECK old contacts: the header button exists and answers', /contacts re-checked/i.test(toastTxt), '');
  await p.screenshot({ path: '/tmp/uitest/aichat-existing.png' });
  await row('Maria').click(); await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/uitest/aichat-linked.png' });
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed`); await b.close(); process.exit(failed ? 1 : 0);
})();
