// Illustrative dashboard component. Every figure is SAMPLE DATA and is labelled as such.
// Chart colours (series blue #3d7bff, series teal #12a594) were checked with the dataviz
// validator against the dark panel surface; lime is reserved for highlights, not series.
import { icon, logoMark } from './icons.mjs';

export const peso = (n) => '₱' + n.toLocaleString('en-PH');

let uid = 0;

// ---------- Sample data ----------
const weeks = {
  labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
  billed: [210, 185, 240, 220, 260, 235, 280, 250], // ₱ thousands
  paid: [160, 175, 190, 205, 215, 220, 230, 245],
};
const sum = (a) => a.reduce((x, y) => x + y, 0);
const collectedPct = Math.round((sum(weeks.paid) / sum(weeks.billed)) * 100);

const kpis = [
  { label: 'Jobs today', value: '18', count: 18, note: '12 in progress', spark: [9, 11, 10, 13, 12, 15, 14, 18] },
  { label: 'Crew attendance', value: '42 / 46', note: '4 awaiting verification', spark: [38, 40, 41, 39, 43, 42, 44, 42] },
  { label: 'Equipment issued', value: '31', count: 31, note: '3 past return date', spark: [22, 25, 24, 28, 27, 30, 29, 31] },
  { label: 'Recorded sales', value: peso(186400), count: 186400, money: true, note: 'Today', spark: [120, 150, 138, 170, 160, 182, 175, 186] },
  { label: 'Payments recorded', value: peso(142750), count: 142750, money: true, note: 'Today', spark: [90, 110, 120, 118, 130, 128, 140, 143] },
  { label: 'Outstanding balances', value: peso(318900), count: 318900, money: true, note: '9 open bills', spark: [290, 300, 310, 305, 322, 315, 320, 319] },
];

const jobs = [
  ['J-1042', 'Sample Office Tower', 'Makati', 'Crew A', 'In progress', 65, 0],
  ['J-1043', 'Sample Warehouse', 'Cavite', 'Crew C', 'Scheduled', 0, 28500],
  ['J-1040', 'Sample Café', 'Quezon City', 'Crew B', 'Awaiting sign-off', 90, 12400],
  ['J-1038', 'Sample School', 'Cebu', 'Crew D', 'Completed', 100, 54200],
  ['J-1036', 'Sample Clinic', 'Davao', 'Crew E', 'Completed', 100, 0],
];
const statusClass = { 'In progress': 'st-progress', Scheduled: 'st-sched', 'Awaiting sign-off': 'st-wait', Completed: 'st-done' };

const attention = [
  { tag: 'Overdue', icon: 'box', title: 'Equipment past return date', text: '3 items issued to Crew B and Crew D' },
  { tag: 'Unbilled', icon: 'quote', title: 'Added work not yet billed', text: 'J-1042 has an approved change not on the bill' },
  { tag: 'Past due', icon: 'wallet', title: 'Balances past due date', text: '3 bills are past their due date' },
  { tag: 'To verify', icon: 'users', title: 'Attendance to verify', text: '4 crew entries awaiting supervisor check' },
];

// ---------- Sparkline ----------
const spark = (vals) => {
  const w = 84, h = 28, min = Math.min(...vals), max = Math.max(...vals);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const id = `sp${++uid}`;
  const [lx, ly] = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3d7bff" stop-opacity=".45"/><stop offset="1" stop-color="#3d7bff" stop-opacity="0"/></linearGradient></defs><path d="${line} L${w},${h} L0,${h} Z" fill="url(#${id})"/><path class="spark-line" d="${line}" pathLength="1"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" class="spark-dot"/></svg>`;
};

const kpiTile = (k) => `
<div class="kpi">
  <div class="kpi-head"><p class="kpi-label">${k.label}</p></div>
  <p class="kpi-value"${k.count ? ` data-count="${k.count}"${k.money ? ' data-money="1"' : ''}` : ''}>${k.value}</p>
  <div class="kpi-foot"><p class="kpi-note">${k.note}</p>${spark(k.spark)}</div>
</div>`;

// ---------- Interactive area chart ----------
const smooth = (pts) => {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};

const chart = (compact = false) => {
  const id = `ch${++uid}`;
  const W = 640, H = compact ? 200 : 260, L = 40, R = 14, T = 14, B = 28, max = 300;
  const n = weeks.labels.length, step = (W - L - R) / (n - 1), plotH = H - T - B;
  const x = (i) => L + i * step, y = (v) => T + plotH - (v / max) * plotH;
  const bp = weeks.billed.map((v, i) => [x(i), y(v)]), pp = weeks.paid.map((v, i) => [x(i), y(v)]);
  const grid = [0, 100, 200, 300].map((v) => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const xl = weeks.labels.map((l, i) => `<text class="ch-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${l}</text>`).join('');
  const area = `${smooth(pp)} L${x(n - 1)},${T + plotH} L${x(0)},${T + plotH} Z`;
  const meta = JSON.stringify({ labels: weeks.labels, billed: weeks.billed, paid: weeks.paid, W, H, L, R, T, B, max });
  const desc = `Sample data, ₱ thousands per week. Billed: ${weeks.billed.join(', ')}. Collected: ${weeks.paid.join(', ')}.`;
  return `
<div class="chart" data-chart='${meta}' tabindex="0" role="group" aria-label="Weekly billed versus collected, sample data. Use left and right arrow keys to read each week.">
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart. ${desc}">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#12a594" stop-opacity=".42"/><stop offset="1" stop-color="#12a594" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xl}
    <path class="ch-area" d="${area}" fill="url(#${id})"/>
    <path class="ch-billed" d="${smooth(bp)}"/>
    <path class="ch-paid" d="${smooth(pp)}" pathLength="1"/>
    <circle class="ch-end ch-end-b" cx="${x(n - 1)}" cy="${y(weeks.billed[n - 1])}" r="4.5"/>
    <circle class="ch-end ch-end-p" cx="${x(n - 1)}" cy="${y(weeks.paid[n - 1])}" r="4.5"/>
    <g class="ch-hover" hidden><line class="ch-cross" y1="${T}" y2="${T + plotH}"/><circle class="ch-hot ch-hot-b" r="5"/><circle class="ch-hot ch-hot-p" r="5"/></g>
  </svg>
  <div class="ch-tip" hidden role="status"></div>
</div>
<ul class="legend"><li><i class="sw sw-billed"></i>Billed <small>(dashed)</small></li><li><i class="sw sw-paid"></i>Collected</li><li class="legend-unit">₱ thousands · sample data</li></ul>
${compact ? '' : `<details class="tbl-view"><summary>View chart data as a table</summary><div class="table-wrap"><table class="dash-table"><caption class="sr-only">Billed and collected per week, ₱ thousands, sample data</caption><thead><tr><th scope="col">Week</th><th scope="col" class="num">Billed</th><th scope="col" class="num">Collected</th></tr></thead><tbody>${weeks.labels.map((l, i) => `<tr><th scope="row">${l}</th><td class="num">${weeks.billed[i]}</td><td class="num">${weeks.paid[i]}</td></tr>`).join('')}</tbody></table></div></details>`}`;
};

// ---------- Gauge rings ----------
const ring = (pct, big, label) => `
<div class="ring">
  <svg viewBox="0 0 84 84" role="img" aria-label="${label}: ${pct} percent, sample data">
    <defs><linearGradient id="rg${++uid}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#3d7bff"/><stop offset="1" stop-color="#b6f23a"/></linearGradient></defs>
    <circle class="ring-bg" cx="42" cy="42" r="34" pathLength="100"/>
    <circle class="ring-fg" cx="42" cy="42" r="34" pathLength="100" style="--p:${pct}" stroke="url(#rg${uid})" transform="rotate(-90 42 42)"/>
    <text x="42" y="47" text-anchor="middle" class="ring-num">${pct}%</text>
  </svg>
  <p class="ring-label">${label}</p><p class="ring-sub">${big}</p>
</div>`;

// ---------- Outstanding balances by age (sample; segments sum to the ₱318,900 KPI) ----------
const aging = [['Not yet due', 142000], ['1–30 days', 98000], ['31+ days', 78900]];
const agingBar = () => {
  const total = sum(aging.map((a) => a[1]));
  return `<div class="aging"><p class="aging-h">Outstanding by age <small>${peso(total)}</small></p><div class="aging-bar" role="img" aria-label="${aging.map(([l, v]) => `${l}: ${peso(v)}`).join(', ')}. Sample data.">${aging.map(([l, v], i) => `<i class="ag${i}" style="flex:${v}"></i>`).join('')}</div><ul class="aging-key">${aging.map(([l, v], i) => `<li><i class="ag${i}"></i>${l}<b>${peso(v)}</b></li>`).join('')}</ul></div>`;
};

// ---------- Dot-matrix map of recorded locations (schematic) ----------
const islands = [
  [[120.4,18.5],[121.9,18.5],[122.3,17.2],[122.0,16.0],[121.6,15.4],[121.7,14.4],[122.4,14.2],[123.3,13.9],[124.1,12.6],[123.6,12.5],[123.0,13.2],[122.0,13.6],[121.0,13.7],[120.6,14.4],[120.0,14.8],[120.2,16.0],[120.4,16.8],[120.3,17.8]],
  [[120.3,13.5],[121.5,13.4],[121.4,12.3],[120.8,12.2]],
  [[117.3,8.4],[118.0,9.6],[119.3,11.3],[119.6,10.6],[118.5,9.0],[117.8,8.2]],
  [[122.0,11.6],[122.7,11.7],[123.0,10.5],[122.4,10.0],[122.0,10.5]],
  [[122.4,10.9],[123.2,10.7],[123.2,9.4],[122.7,9.1],[122.4,9.8]],
  [[123.6,11.1],[124.2,11.4],[125.2,11.0],[125.5,9.8],[125.1,9.9],[124.6,10.3],[124.2,10.5]],
  [[124.8,12.5],[125.6,12.2],[125.5,11.3],[124.8,11.5]],
  [[123.4,10.8],[124.0,10.6],[123.7,9.6],[123.3,9.9]],
  [[122.1,7.0],[123.4,8.6],[124.6,8.6],[125.6,9.7],[126.3,8.9],[126.4,7.2],[125.6,5.8],[125.2,6.3],[124.2,6.3],[123.6,7.4]],
];
const sites = [
  ['Metro Manila', 121.0, 14.6, 9], ['Cebu', 123.9, 10.3, 4], ['Cavite', 120.9, 14.3, 3], ['Davao', 125.5, 7.1, 3],
  ['Pampanga', 120.7, 15.1, 2], ['Iloilo', 122.6, 10.7, 2], ['Cagayan de Oro', 124.6, 8.5, 2], ['Baguio', 120.6, 16.4, 1],
];
const K = 24, px = (lon) => (lon - 116.8) * K, py = (lat) => (19 - lat) * K;
const inside = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

const mapSvg = () => {
  const polys = islands.map((p) => p.map(([lo, la]) => [px(lo), py(la)]));
  const dots = [];
  for (let gy = 2; gy < 345; gy += 5.2) for (let gx = 2; gx < 260; gx += 5.2) if (polys.some((p) => inside(gx, gy, p))) dots.push(`<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="1.3"/>`);
  const hot = sites.map(([name, lo, la, n], i) => `<g class="hot" style="--i:${i}"><circle class="hot-halo" cx="${px(lo).toFixed(1)}" cy="${py(la).toFixed(1)}" r="${7 + n * 1.5}"/><circle class="hot-core" cx="${px(lo).toFixed(1)}" cy="${py(la).toFixed(1)}" r="${2.6 + Math.min(n, 6) * 0.45}"><title>${name}: ${n} sample sites</title></circle></g>`).join('');
  return `<svg viewBox="0 0 260 345" role="img" aria-label="Dot-matrix schematic map of the Philippines with sample recorded job-site locations. Most sample sites: Metro Manila, then Cebu, Cavite and Davao."><g class="map-dots">${dots.join('')}</g>${hot}</svg>`;
};

const siteList = () => {
  const top = sites.slice(0, 5), max = top[0][3];
  return `<ol class="site-list">${top.map(([name, , , n]) => `<li><span>${name}</span><span class="site-bar"><i style="--w:${Math.round((n / max) * 100)}%"></i></span><b>${n}</b></li>`).join('')}</ol>`;
};

// ---------- Tables / panels ----------
const table = (rows, compact = false) => `
<div class="table-wrap"><table class="dash-table">
  <thead><tr><th scope="col">Job</th><th scope="col">Client</th>${compact ? '' : '<th scope="col" class="hide-sm">Site</th><th scope="col" class="hide-sm">Crew</th><th scope="col" class="hide-md">Progress</th>'}<th scope="col">Status</th><th scope="col" class="num">Balance</th></tr></thead>
  <tbody>${rows.map(([id, c, s, crew, st, pr, bal]) => `<tr><th scope="row">${id}</th><td>${c}</td>${compact ? '' : `<td class="hide-sm">${s}</td><td class="hide-sm">${crew}</td><td class="hide-md"><span class="prog" role="img" aria-label="${pr}% complete"><i style="--w:${pr}%"></i></span></td>`}<td><span class="status ${statusClass[st]}"><i aria-hidden="true"></i>${st}</span></td><td class="num">${bal ? peso(bal) : '—'}</td></tr>`).join('')}</tbody>
</table></div>`;

const panel = (title, body, cls = '', extra = '') => `<section class="dash-panel ${cls}"><div class="dash-h-row"><h3 class="dash-h">${title}</h3>${extra}</div>${body}</section>`;

const badges = () => `<div class="dash-badges"><span class="badge-illus">Illustrative dashboard</span><span class="badge-sample"><i aria-hidden="true"></i>Sample data</span></div>`;

const sideNav = () => `
<nav class="app-side" aria-hidden="true">
  <span class="app-logo">${logoMark(26)}</span>
  ${['dashboard', 'calendar', 'users', 'box', 'wallet', 'report'].map((n, i) => `<span class="side-ico${i === 0 ? ' is-on' : ''}">${icon(n, 19)}</span>`).join('')}
</nav>`;

export const heroDashboard = () => `
<div class="app app-hero" role="group" aria-label="Illustrative dashboard preview with sample data">
  <div class="app-main">
    <div class="app-top"><div><p class="dash-title">Operations overview</p><p class="dash-sub">Today · all sites</p></div>${badges()}</div>
    <div class="kpis kpis-hero">${[kpis[0], kpis[1], kpis[3], kpis[5]].map(kpiTile).join('')}</div>
    ${panel('Billed vs collected', chart(true), 'chart-panel')}
    ${panel('Job status', table(jobs.slice(0, 3), true))}
  </div>
</div>`;

export const fullDashboard = () => `
<div class="app app-full" role="group" aria-label="Illustrative dashboard with sample data">
  ${sideNav()}
  <div class="app-main">
    <div class="app-top">
      <div><p class="dash-title">Operations overview</p><p class="dash-sub">Today · all sites</p></div>
      <div class="app-search" aria-hidden="true">${icon('search', 16)}<span>Search jobs, crews, equipment…</span></div>
      ${badges()}
    </div>
    <div class="kpis kpis-full">${kpis.map(kpiTile).join('')}</div>
    <div class="dash-grid">
      ${panel('Billed vs collected · last 8 weeks', chart(false), 'span-chart chart-panel')}
      ${panel('Health at a glance', `<div class="rings">${ring(Math.round((42 / 46) * 100), '42 of 46 crew', 'Crew present')}${ring(Math.round((28 / 31) * 100), '28 of 31 items', 'Equipment on time')}${ring(collectedPct, '8-week total', 'Collected vs billed')}</div>${agingBar()}`, 'span-rings')}
      ${panel('Recorded job-site locations', `<div class="map-wrap"><div class="map">${mapSvg()}</div>${siteList()}</div><p class="map-note">Schematic view of recorded client and job locations. Not live tracking of staff.</p>`, 'span-map')}
      ${panel('Job status', table(jobs), 'span-table')}
      ${panel(`${icon('alert', 18)} Items needing attention`, `<ul class="attention">${attention.map((a) => `<li><span class="att-ico">${icon(a.icon, 20)}</span><div><span class="att-tag">${a.tag}</span><strong>${a.title}</strong><span class="att-text">${a.text}</span></div></li>`).join('')}</ul>`, 'span-attn')}
    </div>
  </div>
</div>`;
