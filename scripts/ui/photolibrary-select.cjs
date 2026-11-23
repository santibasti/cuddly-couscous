// Browser test of the Photo Library multi-select in the app's DEMO mode (sample pictures, nothing stored). Needs Playwright and the built app on port 4173:
//   npm run build && npx vite preview --port 4173 &   then   node scripts/ui/photolibrary-select.cjs
const { chromium } = require('playwright');
const results = []; const ok = (name, pass, ev = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${ev ? `\n      ${ev}` : ''}`); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } }); const dialogs = [];
  p.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await p.goto('http://localhost:4173/#/photos'); await p.waitForTimeout(700);
  const o = p.getByText(/owner/i).first(); if (await o.count()) { await o.click().catch(() => {}); await p.waitForTimeout(700); }
  await p.goto('http://localhost:4173/#/photos'); await p.waitForTimeout(900);
  const boxes = () => p.locator('input.pcsel'); const bar = () => p.locator('.bulkbar'); const cells = () => p.locator('.pcwrap .photocell');
  const count = async () => boxes().count(); const barText = async () => ((await bar().count()) ? await bar().innerText() : '');
  const jobSel = () => bar().locator('select'); const toastTxt = async () => await p.locator('body').innerText();
  ok('every photo has its own tick box (14 sample photos), and no action bar is shown while nothing is ticked', (await count()) === 14 && (await bar().count()) === 0, `boxes=${await count()}`);
  await boxes().nth(0).click(); await p.waitForTimeout(150);
  ok('ticking one photo shows the bar "1 selected" and highlights that photo', /1 selected/.test(await barText()) && (await p.locator('.pcwrap.on').count()) === 1);
  await boxes().nth(2).click({ modifiers: ['Shift'] }); await p.waitForTimeout(150);
  ok('Shift-click ticks the whole range (photos 1 to 3 = 3 selected)', /3 selected/.test(await barText()) && (await p.locator('.pcwrap.on').count()) === 3);
  await boxes().nth(1).click(); await p.waitForTimeout(150);
  ok('ticking a ticked photo again unticks it (2 selected)', /2 selected/.test(await barText()));
  ok('"Add to this job" is disabled until a job is chosen', await bar().getByRole('button', { name: 'Add to this job' }).isDisabled());
  await cells().nth(4).click(); await p.waitForTimeout(250);
  ok('tapping the photo itself (not its tick box) does NOT change the selection (on the live system it opens the photo; the demo shows a note)', /Demo: on the live system this opens the photo/.test(await toastTxt()) && /2 selected/.test(await barText()) && (await p.locator('.pcwrap.on').count()) === 2);
  const opts = await jobSel().locator('option').allInnerTexts(); const target = opts[1];
  ok('the bar offers the jobs by number and client', opts.length > 5 && /JOB|·/.test(target), target);
  await jobSel().selectOption({ index: 1 }); await p.waitForTimeout(100);
  await bar().getByRole('button', { name: 'Add to this job' }).click(); await p.waitForTimeout(500); let t = await toastTxt();
  ok('FILING: the photos are filed to the chosen job, a message names the job and the count, and the selection is cleared', /2 photos filed to/.test(t) && (await bar().count()) === 0 && (await p.locator('.pcwrap.on').count()) === 0, (t.match(/2 photos filed to[^\n]*/) ?? [''])[0]);
  await p.getByLabel('Unsorted (no job yet)').check(); await p.waitForTimeout(300);
  const unsortedBefore = await count();
  ok('"Unsorted" now shows only the photos that still have no job (10 - 2 filed = 8)', unsortedBefore === 8, `shown=${unsortedBefore}`);
  await boxes().nth(0).click(); await boxes().nth(1).click(); await boxes().nth(2).click(); await jobSel().selectOption({ index: 2 }); await bar().getByRole('button', { name: 'Add to this job' }).click(); await p.waitForTimeout(500);
  ok('FILING from the Unsorted view: the 3 filed photos leave the screen (5 left), because they are sorted now', (await count()) === 5 && (await bar().count()) === 0, `shown=${await count()}`);
  await boxes().nth(0).click(); await p.waitForTimeout(100); const had = /1 selected/.test(await barText());
  await p.getByLabel('Unsorted (no job yet)').uncheck(); await p.waitForTimeout(300);
  ok('changing the filter starts a new view: the old selection is dropped (no hidden selection that a click could still file)', had && (await bar().count()) === 0 && (await count()) === 14, `shown=${await count()}`);
  const filedIdx = await p.evaluate(() => [...document.querySelectorAll('.pcwrap .photocell')].findIndex((c) => (c.getAttribute('title') || '').startsWith('JOB')));
  ok('photos already filed to a job show it (their tooltip names the job)', filedIdx >= 0, `index=${filedIdx}`);
  if (filedIdx >= 0) {
    const n0 = dialogs.length; await boxes().nth(filedIdx).click(); await jobSel().selectOption({ index: 6 }); await bar().getByRole('button', { name: 'Add to this job' }).click(); await p.waitForTimeout(500);
    ok('MOVING a photo that is already on another job asks for confirmation first, naming the new job', dialogs.length === n0 + 1 && /already filed to another job\. Move it to/.test(dialogs.at(-1)), dialogs.at(-1));
  }
  await p.getByRole('button', { name: /Select all \d+ shown/ }).click(); await p.waitForTimeout(150);
  ok('"Select all shown" ticks every photo on screen', /14 selected/.test(await barText()), (await barText()).slice(0, 30));
  await bar().getByRole('button', { name: 'Clear' }).click(); await p.waitForTimeout(100);
  ok('"Clear" drops the selection', (await bar().count()) === 0);
  await boxes().nth(3).click(); await jobSel().selectOption({ index: 0 }); await p.waitForTimeout(100);
  ok('with no job chosen the button stays disabled (nothing can be filed to "no job" by accident)', await bar().getByRole('button', { name: 'Add to this job' }).isDisabled());
  await p.screenshot({ path: '/tmp/uitest/photolibrary-select.png' });
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed`); await b.close(); process.exit(failed ? 1 : 0);
})();
