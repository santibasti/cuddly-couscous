// Generates OpsPilot ad creatives (HTML -> PNG) into ads/out/. Run: node ads/build-ads.mjs
// Needs Playwright with Chromium available (see README in this folder). Dashboards are SAMPLE DATA and labelled as such.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { logoMark, icon } from '../src/icons.mjs';

const root = import.meta.dirname;
const out = join(root, 'out');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const sizes = {
  square: { w: 1080, h: 1080, cls: 'v sq' },
  portrait: { w: 1080, h: 1350, cls: 'v pt' },
  story: { w: 1080, h: 1920, cls: 'v story' },
  landscape: { w: 1200, h: 628, cls: 'h' },
};

const css = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#060d1f}
body{font-family:"Inter","Liberation Sans",Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;color:#dbe5ff}
.ad{position:relative;overflow:hidden;color:#dbe5ff;background:
 radial-gradient(900px 600px at 85% -10%,rgba(37,99,255,.55),transparent 60%),
 radial-gradient(700px 500px at -10% 105%,rgba(182,242,58,.16),transparent 60%),
 linear-gradient(165deg,#0b1a3d,#060d1f 70%)}
.ad::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(143,176,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(143,176,255,.07) 1px,transparent 1px);background-size:54px 54px;-webkit-mask-image:radial-gradient(ellipse at 70% 30%,#000 10%,transparent 70%);mask-image:radial-gradient(ellipse at 70% 30%,#000 10%,transparent 70%)}
.in{position:relative;height:100%;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:14px;color:#fff}
.brand svg{width:54px;height:54px;color:#fff;--blue:#4d86ff;--lime:#b6f23a}
.brand b{font-size:34px;letter-spacing:-.02em}.brand b i{font-style:normal;color:#6f9bff}
.brand small{display:block;font:600 12px ui-monospace,Consolas,monospace;letter-spacing:.22em;color:#93a4c8;margin-top:2px}
.eyebrow{display:inline-flex;align-items:center;gap:10px;align-self:flex-start;padding:10px 20px;border-radius:99px;border:1px solid rgba(143,176,255,.35);background:rgba(255,255,255,.05);font:700 20px ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#cfe0ff}
.eyebrow::before{content:"";width:10px;height:10px;border-radius:50%;background:#b6f23a;box-shadow:0 0 12px #b6f23a}
h1{color:#fff;letter-spacing:-.035em;line-height:1.02;font-weight:800}
h1 em{font-style:normal;background:linear-gradient(90deg,#8db2ff,#b6f23a);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#b9c6e2;line-height:1.4}
.cta{display:inline-flex;align-items:center;gap:14px;background:#b6f23a;color:#0a1630;font-weight:800;border-radius:99px;box-shadow:0 14px 40px rgba(182,242,58,.28)}
.url{font:700 28px ui-monospace,Consolas,monospace;color:#cfe0ff;letter-spacing:.02em}
.pill{display:inline-block;padding:8px 18px;border-radius:99px;background:rgba(37,99,255,.22);border:1px solid rgba(111,155,255,.4);color:#cfe0ff;font-weight:700;font-size:22px}
/* dashboard card */
.dash{position:relative;border-radius:28px;padding:26px;background:linear-gradient(160deg,rgba(26,49,95,.92),rgba(11,23,51,.95));border:1px solid rgba(143,176,255,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 40px 90px rgba(0,0,0,.55),0 0 80px rgba(37,99,255,.2)}
.dash-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.dash-h b{color:#fff;font-size:24px}.dash-h small{display:block;color:#93a4c8;font-size:16px;margin-top:2px}
.samp{font:700 14px ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;padding:7px 14px;border-radius:99px;border:1px solid rgba(255,196,61,.45);color:#ffd98a;background:rgba(255,196,61,.1);white-space:nowrap}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.kpi{padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(143,176,255,.18)}
.kpi small{display:block;color:#93a4c8;font-weight:700;font-size:15px}
.kpi b{display:block;color:#fff;font-size:34px;letter-spacing:-.02em;margin-top:4px}
.kpi span{color:#7fe3b0;font-size:14px;font-weight:700}
.chart{margin-top:14px;border-radius:16px;padding:14px 16px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(143,176,255,.14)}
.chart small{color:#93a4c8;font-weight:700;font-size:15px}
.rows{margin-top:14px;display:grid;gap:10px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(143,176,255,.14)}
.row b{color:#fff;font-size:18px}.row span.d{color:#93a4c8;font-size:15px;margin-left:8px}
.st{padding:5px 12px;border-radius:99px;font-size:14px;font-weight:800;white-space:nowrap}
.st.p{background:rgba(61,123,255,.22);color:#aac4ff}.st.w{background:rgba(255,196,61,.16);color:#ffd98a}.st.d{background:rgba(60,207,130,.16);color:#86e8ae}.st.s{background:rgba(255,255,255,.1);color:#cbd6ee}
.glow{position:absolute;border-radius:50%;filter:blur(70px);pointer-events:none}
.foot{display:flex;align-items:center;justify-content:space-between;gap:20px}
.fine{color:#7f92b8;font-size:15px;line-height:1.35}
.chips{display:flex;flex-wrap:wrap;gap:12px}
.chip{display:flex;align-items:center;gap:10px;padding:14px 20px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(143,176,255,.22);color:#e6eeff;font-weight:700;font-size:24px}
.chip i{width:12px;height:12px;border-radius:50%;background:#b6f23a;display:block}
.stack{display:grid;gap:16px}
.x{display:flex;gap:18px;align-items:flex-start;padding:22px 26px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(143,176,255,.2)}
.x .n{flex:none;width:44px;height:44px;border-radius:12px;background:#b6f23a;color:#0a1630;font-weight:900;font-size:24px;display:grid;place-items:center}
.x b{display:block;color:#fff;font-size:28px}.x span{color:#b9c6e2;font-size:22px;line-height:1.35}
.bad{color:#ff9d9d}

/* light concept (E) */
.light{background:radial-gradient(900px 700px at 100% 100%,rgba(37,99,255,.18),transparent 60%),radial-gradient(800px 600px at 0% 0%,rgba(182,242,58,.22),transparent 55%),linear-gradient(160deg,#f7faff,#e9f0ff 70%)!important;color:#435068}
.light::before{background-image:linear-gradient(rgba(37,99,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(37,99,255,.06) 1px,transparent 1px)!important}
.light .brand{color:#0a1630}.light .brand b{color:#0a1630}.light .brand b i{color:#2563ff}.light .brand small{color:#5d6a82}.light .brand svg{color:#0a1630;--blue:#2563ff}
.light h1{color:#0a1630}.light h1 em{background:linear-gradient(90deg,#2563ff,#18b6a0);-webkit-background-clip:text;background-clip:text;color:transparent}
.light .sub{color:#435068}
.light .cta{background:linear-gradient(90deg,#1f4fe0,#2563ff);color:#fff;box-shadow:0 16px 40px rgba(37,99,255,.35)}
.light .url{color:#1f3a7a}
.tag{position:absolute;right:56px;top:84px;text-align:right;font:700 18px ui-monospace,Consolas,monospace;letter-spacing:.22em;color:#5d6a82;line-height:1.7}
.devs{position:absolute;width:900px;height:520px;transform-origin:100% 100%}
.laptop{position:absolute;left:0;bottom:0;width:650px}
.lscreen{height:410px;border-radius:22px 22px 6px 6px;background:#0b1633;border:10px solid #1b2440;border-bottom-width:14px;overflow:hidden;box-shadow:0 30px 70px rgba(10,22,48,.35)}
.lscreen .dash{zoom:.62;margin:0;border-radius:0;border:0;box-shadow:none;height:100%}
.lbase{height:20px;margin:0 -40px;border-radius:0 0 26px 26px;background:linear-gradient(#d9e1f2,#aab6d0);box-shadow:0 18px 30px rgba(10,22,48,.25)}
.phone{position:absolute;right:0;bottom:6px;width:250px;height:490px;border-radius:40px;background:#0b1633;border:9px solid #151d38;box-shadow:0 34px 60px rgba(10,22,48,.4);padding:20px 16px;overflow:hidden}
.phone .notch{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:80px;height:20px;border-radius:12px;background:#151d38}
.phone b.t{display:block;margin-top:24px;color:#fff;font-size:22px}.phone small.t{display:block;color:#93a4c8;font-size:12px}
.ptiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.ptile{border-radius:14px;padding:12px 10px;background:rgba(255,255,255,.07);border:1px solid rgba(143,176,255,.2);color:#cfe0ff;font-size:12px;font-weight:700;text-align:center}
.ptile svg{margin:0 auto 6px;color:#8db2ff}
.pk{margin-top:12px;border-radius:14px;padding:12px;background:rgba(255,255,255,.06);border:1px solid rgba(143,176,255,.18)}
.pk small{color:#93a4c8;font-size:11px;font-weight:700}.pk b{display:block;color:#fff;font-size:24px}.pk span{color:#7fe3b0;font-size:11px;font-weight:700}
.bens{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-radius:22px;background:rgba(255,255,255,.7);border:1px solid rgba(37,99,255,.15);box-shadow:0 12px 40px rgba(10,22,48,.08)}
.ben{display:flex;align-items:center;gap:16px;padding:20px 22px;font-weight:800;color:#0a1630;font-size:24px;line-height:1.15}
.ben+.ben{border-left:1px solid rgba(37,99,255,.15)}
.ben i{flex:none;width:58px;height:58px;border-radius:50%;background:#e1eaff;color:#2563ff;display:grid;place-items:center}
.ltag{font:700 15px ui-monospace,Consolas,monospace;letter-spacing:.14em;color:#5d6a82}
.v.light .in{padding:70px 70px 56px}
.v.light h1{font-size:104px;margin-top:34px;line-height:.98}
.v.light .sub{width:46%}
.v.light .devs{right:44px}
.sq.light .sub,.sq.light .tag,.pt.light .sub,.pt.light .tag{display:none}
.light .lscreen .chart{display:block!important}.light .lscreen .row{display:flex!important}
.v.light .bens{margin-top:auto}
.v.light .foot{margin-top:26px;justify-content:center}
.v.light .cta{font-size:34px;padding:24px 54px}
.sq.light .in{padding:56px 62px 46px}
.sq.light h1{font-size:84px;margin-top:22px}
.sq.light .sub{font-size:26px;width:44%;margin-top:18px}
.sq.light .devs{bottom:252px;transform:scale(.86)}
.sq.light .ben{font-size:20px;padding:14px 16px;gap:12px}.sq.light .ben i{width:46px;height:46px}.sq.light .ben i svg{width:24px;height:24px}
.sq.light .cta{font-size:28px;padding:20px 44px}.sq.light .foot{margin-top:18px}
.pt.light .devs{bottom:318px;transform:scale(1.04)}
.pt.light h1{font-size:100px}
.story.light .in{padding:140px 70px 130px}
.story.light h1{font-size:112px}.story.light .sub{font-size:36px}.story.light .devs{bottom:400px;transform:scale(1.1)}
.story.light .ben{font-size:26px}
.h.light .in{grid-template-columns:1fr 1fr}
.h.light h1{font-size:50px;margin-top:20px}
.h.light .devs{position:relative;transform:scale(.6);transform-origin:50% 50%;margin:-90px -170px}
.h.light .cta{font-size:20px;padding:15px 28px}

/* layouts */
.pt .in{padding:70px 76px 60px}.pt h1{font-size:80px;margin-top:26px}.pt .sub{font-size:31px;margin-top:20px}.pt .eyebrow{margin-top:40px!important}
.pt .dash{margin-top:34px}.pt .chart{display:none}.pt .cta{font-size:32px;padding:24px 42px}
.sq .in{padding:64px 70px 56px}
.sq h1{font-size:64px;margin-top:30px}.sq .sub{font-size:27px;margin-top:14px}
.sq .eyebrow{display:none}
.sq .dash{margin-top:30px;padding:22px}.sq .chart{display:none}.sq .row:nth-child(n+2){display:none}.sq .kpi b{font-size:30px}
.sq .cta{font-size:30px;padding:22px 38px}.sq .foot{padding-top:24px}
.hub{margin-top:30px;width:100%;height:auto;display:block;flex:none;max-height:330px}
.story .hub{margin-top:auto;margin-bottom:auto;max-height:none}
.h .hub{margin:0}
.v .in{padding:84px 76px 70px}
.v h1{font-size:92px;margin-top:34px}
.v .sub{font-size:34px;margin-top:26px}
.v .dash{margin-top:44px}
.v .foot{margin-top:auto;padding-top:34px}
.v .cta{font-size:34px;padding:26px 44px}
.story .in{padding:150px 76px 150px}
.story h1{font-size:104px}.story .sub{font-size:38px}
.story .dash{margin-top:60px}
.h .in{padding:48px 56px;display:grid;grid-template-columns:1.05fr .95fr;gap:38px;align-items:center}
.h .l{display:flex;flex-direction:column;height:100%;justify-content:space-between}
.h .brand svg{width:40px;height:40px}.h .brand b{font-size:26px}.h .brand small{font-size:10px}
.h h1{font-size:52px;margin-top:22px}
.h .sub{font-size:22px;margin-top:14px}
.h .cta{font-size:22px;padding:16px 30px}.h .url{font-size:20px}
.h .eyebrow{font-size:14px;padding:7px 14px}
.h .dash{padding:18px;border-radius:22px}
.h .dash-h b{font-size:18px}.h .dash-h small{font-size:12px}.h .samp{font-size:11px;padding:5px 10px}
.h .kpi{padding:10px 12px}.h .kpi small{font-size:12px}.h .kpi b{font-size:24px}.h .kpi span{font-size:11px}
.h .chart{padding:10px 12px 4px;margin-top:10px}.h .chart small{font-size:12px}
.h .rows{margin-top:10px;gap:8px}.h .row{padding:9px 12px}.h .row b{font-size:14px}.h .row span.d{font-size:12px}.h .st{font-size:11px;padding:4px 9px}
.h .fine{font-size:12px}
.h .chip{font-size:16px;padding:9px 14px}.h .x{padding:14px 16px}.h .x b{font-size:19px}.h .x span{font-size:15px}.h .x .n{width:32px;height:32px;font-size:17px}
.h .stack{gap:10px}
.h .foot{margin-top:0}
`;

// ---- sample dashboard (all figures invented sample data) ----
const area = (a, b, w, h) => {
  const pts = (arr) => arr.map((v, i) => [(i / (arr.length - 1)) * w, h - (v / 100) * (h - 8) - 4]);
  const line = (arr) => pts(arr).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const fill = `${line(b)} L${w},${h} L0,${h} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" style="display:block;height:auto"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27d3b0" stop-opacity=".55"/><stop offset="1" stop-color="#27d3b0" stop-opacity="0"/></linearGradient></defs>
  <path d="${fill}" fill="url(#g)"/><path d="${line(b)}" fill="none" stroke="#27d3b0" stroke-width="3.5" stroke-linecap="round"/><path d="${line(a)}" fill="none" stroke="#6f9bff" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/></svg>`;
};
const dash = ({ title, sub, kpis, chart, rows, compact }) => `
<div class="dash">
  <div class="dash-h"><div><b>${title}</b><small>${sub}</small></div><span class="samp">Sample data</span></div>
  <div class="kpis">${kpis.map(([l, v, n]) => `<div class="kpi"><small>${l}</small><b>${v}</b><span>${n}</span></div>`).join('')}</div>
  <div class="chart"><small>${chart.title}</small>${area(chart.a, chart.b, 600, compact ? 70 : 110)}</div>
  <div class="rows">${rows.map(([t, d, c, s]) => `<div class="row"><div><b>${t}</b><span class="d">${d}</span></div><span class="st ${c}">${s}</span></div>`).join('')}</div>
</div>`;

const contractor = dash({
  title: 'Contractor operations', sub: 'Today · all sites',
  kpis: [['Jobs today', '18', '12 in progress'], ['Crew present', '42/46', '4 to verify'], ['Outstanding', '₱318,900', '9 open bills']],
  chart: { title: 'Billed vs collected · 8 weeks', a: [62, 54, 74, 68, 82, 74, 90, 80], b: [48, 54, 60, 66, 70, 73, 78, 82] },
  rows: [['Crew A', 'Sample Office Tower', 'p', 'On site'], ['Crew B', 'Sample Café', 'w', 'Awaiting sign-off'], ['Crew D', 'Sample School', 'd', 'Completed']],
});
const dashFor = {
  contractors: contractor,
  carwash: dash({ title: 'Car wash operations', sub: 'Today · 5 bays', kpis: [['Cars today', '64', '8 in queue'], ['Sales today', '₱28,600', 'sample'], ['Supplies', '2 low', 'reorder']], chart: { title: 'Daily sales · this week', a: [50, 56, 52, 64, 70, 88, 82], b: [46, 52, 55, 61, 74, 92, 86] }, rows: [['Bay 1', 'Full wash', 'p', 'In service'], ['Bay 2', 'Exterior', 'p', 'In service'], ['Bay 3', 'Wax and polish', 'd', 'Ready']] }),
  clinics: dash({ title: 'Clinic operations', sub: 'Today · 3 doctors', kpis: [['Appointments', '26', '17 done'], ['Waiting', '3', 'in clinic'], ['Unpaid', '₱41,200', '7 accounts']], chart: { title: 'Billed vs collected · 8 weeks', a: [58, 62, 60, 70, 68, 76, 74, 82], b: [50, 56, 55, 63, 62, 70, 70, 76] }, rows: [['9:00 AM', 'Doctor A · Consultation', 'd', 'Completed'], ['10:30 AM', 'Doctor B · Follow-up', 'p', 'In progress'], ['11:00 AM', 'Doctor C · Check-up', 's', 'Scheduled']] }),
  fleets: dash({ title: 'Fleet operations', sub: 'Today · 12 vehicles', kpis: [['On the road', '9', '3 in garage'], ['Collected', '₱64,300', 'sample'], ['Short', '2', 'to review']], chart: { title: 'Collections · 8 days', a: [60, 58, 66, 64, 72, 70, 78, 74], b: [56, 55, 60, 63, 66, 69, 72, 75] }, rows: [['Bus 03', 'Manila → Tagaytay', 'p', 'On the road'], ['Taxi 04', 'Short remittance', 'w', 'Flagged'], ['Van 12', 'Shift started', 'd', 'Active']] }),
  construction: dash({ title: 'Construction operations', sub: 'Today · 7 projects', kpis: [['Active projects', '7', '2 behind'], ['On site', '86/94', '8 to verify'], ['Outstanding', '₱2.33M', '5 bills']], chart: { title: 'Billed vs collected · 8 weeks', a: [60, 52, 74, 68, 80, 74, 88, 82], b: [44, 50, 56, 60, 65, 69, 72, 75] }, rows: [['P-101', 'Sample Tower Fit-out', 'p', 'On track'], ['P-104', 'Sample Warehouse', 'w', 'Behind schedule'], ['VO-08', 'Awaiting approval', 's', 'Variation order']] }),
};

const hub = () => {
  const nodes = [['Attendance', 130, 70], ['Inventory', 450, 38], ['Jobs and crews', 770, 70], ['Quotations', 130, 350], ['Billing', 450, 382], ['Dashboards', 770, 350]];
  const cx = 450, cy = 210;
  return `<svg class="hub" viewBox="0 0 900 420" role="img" aria-label="Modules connected into one system">
  <defs><radialGradient id="hg"><stop offset="0" stop-color="#2563ff" stop-opacity=".55"/><stop offset="1" stop-color="#2563ff" stop-opacity="0"/></radialGradient></defs>
  <circle cx="${cx}" cy="${cy}" r="230" fill="url(#hg)"/>
  <circle cx="${cx}" cy="${cy}" r="150" fill="none" stroke="rgba(143,176,255,.25)" stroke-dasharray="4 10"/>
  <circle cx="${cx}" cy="${cy}" r="205" fill="none" stroke="rgba(143,176,255,.14)"/>
  ${nodes.map(([l, x, y]) => `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(143,176,255,.4)" stroke-width="2"/>`).join('')}
  ${nodes.map(([l, x, y]) => `<g><rect x="${x - 130}" y="${y - 30}" width="260" height="60" rx="30" fill="#0f2250" stroke="rgba(143,176,255,.5)"/><circle cx="${x - 100}" cy="${y}" r="8" fill="#b6f23a"/><text x="${x - 80}" y="${y + 9}" fill="#fff" font-size="26" font-weight="700" font-family="Inter,Liberation Sans,Arial,sans-serif">${l}</text></g>`).join('')}
  <circle cx="${cx}" cy="${cy}" r="74" fill="#0a1630" stroke="#4d86ff" stroke-width="3"/>
  <g transform="translate(${cx - 40},${cy - 40}) scale(1.25)" style="color:#fff"><circle cx="32" cy="32" r="22" fill="none" stroke="#4d86ff" stroke-width="4.5"/><path d="M32 16l10.5 32L32 41l-10.5 7z" fill="#fff"/><circle cx="32" cy="9.5" r="4" fill="#b6f23a"/></g>
</svg>`;
};
const header = (extra = '') => `<div style="display:flex;justify-content:space-between;align-items:center"><div class="brand">${logoMark(54)}<div><b>Ops<i>Pilot</i></b><small>CUSTOM BUSINESS SYSTEMS</small></div></div>${extra}</div>`;
const ctaBlock = (label) => `<div class="foot"><span class="cta">${label} <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0a1630" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span><span class="url">opspilot.ph</span></div>`;
const finePrint = '<p class="fine">Dashboards are illustrative and use sample data. Results depend on your business and agreed scope.</p>';

// ---- concepts: each returns {v, h} inner HTML for vertical and horizontal layouts ----
const concepts = {
  'A-spreadsheets': {
    v: () => `${header()}<span class="eyebrow" style="margin-top:56px">For Philippine MSMEs</span>
<h1>Still running your business on <em>Excel and chat threads?</em></h1>
<p class="sub">One clear system for attendance, jobs, stock and billing, built around how you actually work.</p>
${contractor}${ctaBlock('Request a demo')}`,
    h: () => `<div class="l">${header()}<div><span class="eyebrow">For Philippine MSMEs</span><h1>Still running on <em>Excel and chat threads?</em></h1><p class="sub">One clear system for attendance, jobs, stock and billing.</p></div><div class="foot"><span class="cta">Request a demo →</span><span class="url">opspilot.ph</span></div></div><div>${contractor}</div>`,
  },
  'B-one-system': {
    v: () => `${header()}<span class="eyebrow" style="margin-top:56px">Custom business systems</span>
<h1>Your business. <em>One clear system.</em></h1>
<p class="sub">Jobs, people, equipment, sales and collections in one place, so you see what is happening today.</p>
${hub()}
<div style="margin-top:auto"></div>${ctaBlock('Talk to us')}`,
    h: () => `<div class="l">${header()}<div><span class="eyebrow">Custom business systems</span><h1>Your business. <em>One clear system.</em></h1><p class="sub">Jobs, people, equipment, sales and collections in one place.</p></div><div class="foot"><span class="cta">Talk to us →</span><span class="url">opspilot.ph</span></div></div><div>${hub()}</div>`,
  },
  'C-bring-a-workflow': {
    v: () => `${header()}<span class="eyebrow" style="margin-top:56px">Workflow consultation</span>
<h1>Bring one workflow. <em>We'll show how it could run.</em></h1>
<p class="sub">Tell us what slows your team down. We will map it and show what a system could look like.</p>
<div class="stack" style="margin-top:44px">
<div class="x"><span class="n">1</span><div><b>Understand</b><span>We walk through how work really happens.</span></div></div>
<div class="x"><span class="n">2</span><div><b>Define</b><span>Scope, roles and reports agreed in writing.</span></div></div>
<div class="x"><span class="n">3</span><div><b>Build and pilot</b><span>Tested with your own sample records first.</span></div></div></div>
<div style="margin-top:auto"></div>${ctaBlock('Request a consultation')}`,
    h: () => `<div class="l">${header()}<div><span class="eyebrow">Workflow consultation</span><h1>Bring one workflow. <em>We'll show how it could run.</em></h1></div><div class="foot"><span class="cta">Request a consultation →</span><span class="url">opspilot.ph</span></div></div><div class="stack"><div class="x"><span class="n">1</span><div><b>Understand</b><span>We walk through how work really happens.</span></div></div><div class="x"><span class="n">2</span><div><b>Define</b><span>Scope, roles and reports agreed in writing.</span></div></div><div class="x"><span class="n">3</span><div><b>Build and pilot</b><span>Tested with your own sample records first.</span></div></div></div>`,
  },
};


const devices = () => `<div class="devs">
  <div class="laptop"><div class="lscreen">${dash({ title: 'Operations overview', sub: 'Today · all sites', kpis: [['Jobs today', '18', '12 in progress'], ['Crew present', '42/46', '4 to verify'], ['Outstanding', '₱318,900', '9 open bills']], chart: { title: 'Billed vs collected · 8 weeks', a: [62, 54, 74, 68, 82, 74, 90, 80], b: [48, 54, 60, 66, 70, 73, 78, 82] }, rows: [['Crew A', 'Sample Office Tower', 'p', 'On site'], ['Crew B', 'Sample Café', 'w', 'Awaiting sign-off']] })}</div><div class="lbase"></div></div>
  <div class="phone"><span class="notch"></span><b class="t">Good morning!</b><small class="t">Today at a glance · sample data</small>
    <div class="ptiles">${[['clock', 'Attendance'], ['calendar', 'Jobs'], ['box', 'Inventory'], ['wallet', 'Billing']].map(([i, l]) => `<div class="ptile">${icon(i, 26)}${l}</div>`).join('')}</div>
    <div class="pk"><small>Collected today</small><b>₱142,750</b><span>Sample data</span></div>
    <div class="pk"><small>Open requests</small><b>9</b><span>3 awaiting quotation</span></div></div>
</div>`;
const benefits = () => `<div class="bens">${[['gear', 'Tailored to<br>your business'], ['quote', 'Scope agreed<br>in writing'], ['shield', 'Support<br>as agreed']].map(([i, t]) => `<div class="ben"><i>${icon(i, 30)}</i><span>${t}</span></div>`).join('')}</div>`;
concepts['E-custom-system'] = {
  light: true,
  v: () => `${header()}<span class="tag">CUSTOM<br>SYSTEMS<br>REAL WORKFLOWS</span>
<h1>We Build Your<br><em>Custom Business<br>System</em></h1>
<p class="sub">Tailor-fit systems for attendance, jobs, stock and billing, set up around how your business runs.</p>
${devices()}${benefits()}${ctaBlock('Request a demo')}`,
  h: () => `<div class="l">${header()}<div><h1>We Build Your <em>Custom Business System</em></h1><p class="sub">Tailor-fit systems built around how your business runs.</p></div><div class="foot"><span class="cta">Request a demo →</span><span class="url">opspilot.ph</span></div></div>${devices()}`,
};

// ---- carousel: one card per industry (square only) ----
const carousel = [
  ['contractors', 'Cleaning and maintenance contractors', 'Know who is on site, what equipment is out and what is still unbilled.', 'Cleaning · Maintenance · Janitorial'],
  ['carwash', 'Car washes', 'Bay queue, per-vehicle records, supplies and daily sales in one view.', 'Bays · Supplies · Sales'],
  ['clinics', 'Clinics and dental practices', 'Appointments by doctor or chair, supplies, billing and balances.', 'Appointments · Billing · Supplies'],
  ['fleets', 'Bus, taxi and van fleets', 'Vehicles, drivers, trips, remittances and maintenance records.', 'Trips · Remittances · Maintenance'],
  ['construction', 'Construction businesses', 'Projects, crews, materials, variation orders and progress billing.', 'Projects · Crews · Billing'],
];

const html = (inner, size, light) => `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="ad ${size.cls}${light ? ' light' : ''}" style="width:${size.w}px;height:${size.h}px"><div class="in">${inner}</div></div>`;

const jobs = [];
for (const [name, c] of Object.entries(concepts)) {
  for (const [sn, size] of Object.entries(sizes)) jobs.push([`${name}_${sn}`, html(size.cls.startsWith('h') ? c.h() : c.v(), size, c.light), size]);
}
carousel.forEach(([key, title, text, tags], i) => {
  const inner = `${header(`<span class="pill">${i + 1} / ${carousel.length}</span>`)}<span class="eyebrow" style="margin-top:46px">Built for</span>
<h1 style="font-size:78px;margin-top:54px">${title}</h1><p class="sub" style="font-size:32px;margin-top:20px">${text}</p>
<div style="margin-top:36px">${dashFor[key].replace('<div class="chart">', '<div class="chart" style="display:none">')}</div>
<div style="margin-top:auto;padding-top:26px">${ctaBlock('Request a demo')}</div>`;
  jobs.push([`D-carousel-${i + 1}-${key}_square`, html(inner, sizes.square), sizes.square]);
});

const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
for (const [name, markup, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
  await page.setContent(markup);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `${name}.png`) });
  await writeFile(join(out, `${name}.html`), markup);
  await page.close();
}
await browser.close();
console.log(`Wrote ${jobs.length} creatives to ads/out/`);
