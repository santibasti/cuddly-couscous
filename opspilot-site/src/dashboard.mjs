// Illustrative dashboard component. Every figure is SAMPLE DATA and is labelled as such.
import { icon } from './icons.mjs';

export const peso = (n) => '₱' + n.toLocaleString('en-PH');

const kpis = [
  { label: 'Jobs today', value: '18', note: '12 in progress' },
  { label: 'Crew attendance', value: '42 / 46', note: '4 awaiting verification' },
  { label: 'Equipment issued', value: '31', note: '3 past return date' },
  { label: 'Recorded sales', value: peso(186400), note: 'Today' },
  { label: 'Payments recorded', value: peso(142750), note: 'Today' },
  { label: 'Outstanding balances', value: peso(318900), note: '9 open bills' },
];

const weeks = {
  labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
  billed: [210, 185, 240, 220, 260, 235, 280, 250],
  paid: [160, 175, 190, 205, 215, 220, 230, 245],
};

const jobs = [
  ['J-1042', 'Sample Office Tower', 'Makati', 'Crew A', 'In progress', 0],
  ['J-1043', 'Sample Warehouse', 'Cavite', 'Crew C', 'Scheduled', 28500],
  ['J-1040', 'Sample Café', 'Quezon City', 'Crew B', 'Awaiting sign-off', 12400],
  ['J-1038', 'Sample School', 'Cebu', 'Crew D', 'Completed', 54200],
  ['J-1036', 'Sample Clinic', 'Davao', 'Crew E', 'Completed', 0],
];
const statusClass = { 'In progress': 'st-progress', Scheduled: 'st-sched', 'Awaiting sign-off': 'st-wait', Completed: 'st-done' };

const attention = [
  ['Equipment past return date', '3 items issued to Crew B and Crew D'],
  ['Added work not yet billed', 'J-1042 has an approved change not on the bill'],
  ['Past-due balances', '3 bills are past their due date'],
  ['Attendance to verify', '4 crew entries awaiting supervisor check'],
];

// --- Schematic map of recorded client/job locations (not live tracking) -----
const islands = [
  // [lon, lat] rough, simplified outlines for a schematic view
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
  ['Metro Manila', 121.0, 14.6, 9], ['Cavite', 120.9, 14.3, 3], ['Pampanga', 120.7, 15.1, 2],
  ['Baguio', 120.6, 16.4, 1], ['Iloilo', 122.6, 10.7, 2], ['Cebu', 123.9, 10.3, 4],
  ['Cagayan de Oro', 124.6, 8.5, 2], ['Davao', 125.5, 7.1, 3],
];
const px = (lon) => ((lon - 116.8) * 24).toFixed(1);
const py = (lat) => ((19 - lat) * 24).toFixed(1);

const mapSvg = () => `
<svg viewBox="0 0 260 345" role="img" aria-label="Schematic map of the Philippines showing sample recorded job-site locations, with the most sample sites in Metro Manila, then Cebu, Cavite and Davao.">
  <g class="map-land">${islands.map((poly) => `<polygon points="${poly.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}"/>`).join('')}</g>
  <g>${sites.map(([name, lon, lat, n]) => `<g><circle class="map-halo" cx="${px(lon)}" cy="${py(lat)}" r="${6 + n * 1.6}"/><circle class="map-dot" cx="${px(lon)}" cy="${py(lat)}" r="${3 + Math.min(n, 5) * 0.5}"><title>${name}: ${n} sample sites</title></circle></g>`).join('')}</g>
</svg>`;

// --- Collection trend chart -------------------------------------------------
const chartSvg = () => {
  const W = 420, H = 190, L = 34, B = 24, T = 10, max = 300;
  const plotH = H - B - T, gw = (W - L) / weeks.labels.length;
  const y = (v) => T + plotH - (v / max) * plotH;
  const grid = [0, 100, 200, 300].map((v) => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="ch-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="ch-axis">${v}</text>`).join('');
  const bars = weeks.labels.map((lab, i) => {
    const x0 = L + i * gw + gw * 0.14, bw = gw * 0.34;
    return `<rect class="ch-billed" x="${x0.toFixed(1)}" y="${y(weeks.billed[i])}" width="${bw.toFixed(1)}" height="${(plotH - (y(weeks.billed[i]) - T)).toFixed(1)}" rx="2"/>` +
      `<rect class="ch-paid" style="--d:${i * 60}ms" x="${(x0 + bw + 3).toFixed(1)}" y="${y(weeks.paid[i])}" width="${bw.toFixed(1)}" height="${(plotH - (y(weeks.paid[i]) - T)).toFixed(1)}" rx="2"/>` +
      `<text x="${(L + i * gw + gw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ch-axis">${lab}</text>`;
  }).join('');
  const desc = `Sample data, in thousands of pesos. Billed: ${weeks.billed.join(', ')}. Collected: ${weeks.paid.join(', ')}, across eight weeks.`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly billed versus collected amounts. ${desc}">${grid}${bars}</svg>`;
};

const panel = (title, body, cls = '') => `<section class="dash-panel ${cls}"><h3 class="dash-h">${title}</h3>${body}</section>`;

const table = (rows) => `
<div class="table-wrap"><table class="dash-table">
  <thead><tr><th scope="col">Job</th><th scope="col">Client</th><th scope="col" class="hide-sm">Site</th><th scope="col" class="hide-sm">Crew</th><th scope="col">Status</th><th scope="col" class="num">Balance</th></tr></thead>
  <tbody>${rows.map(([id, c, s, crew, st, bal]) => `<tr><th scope="row">${id}</th><td>${c}</td><td class="hide-sm">${s}</td><td class="hide-sm">${crew}</td><td><span class="status ${statusClass[st]}">${st}</span></td><td class="num">${bal ? peso(bal) : '—'}</td></tr>`).join('')}</tbody>
</table></div>`;

const header = () => `
<div class="dash-top">
  <div><p class="dash-title">Operations overview</p><p class="dash-sub">Illustrative dashboard</p></div>
  <span class="badge-sample">Sample data</span>
</div>`;

const kpiGrid = (list) => `<div class="kpis">${list.map((k) => `<div class="kpi"><p class="kpi-label">${k.label}</p><p class="kpi-value">${k.value}</p><p class="kpi-note">${k.note}</p></div>`).join('')}</div>`;

const legend = `<ul class="legend"><li><i class="sw sw-billed"></i>Billed</li><li><i class="sw sw-paid"></i>Collected</li><li class="legend-unit">₱ thousands, sample</li></ul>`;

export const heroDashboard = () => `
<div class="dash dash-hero" role="group" aria-label="Illustrative dashboard preview with sample data">
  ${header()}
  ${kpiGrid([kpis[0], kpis[1], kpis[3], kpis[5]])}
  <div class="dash-row">
    ${panel('Collection trend', chartSvg() + legend)}
  </div>
  ${panel('Job status', table(jobs.slice(0, 3)))}
</div>`;

export const fullDashboard = () => `
<div class="dash dash-full" role="group" aria-label="Illustrative dashboard with sample data">
  ${header()}
  ${kpiGrid(kpis)}
  <div class="dash-grid">
    ${panel('Collection trend', chartSvg() + legend, 'span-chart')}
    ${panel('Recorded job-site locations', `<div class="map">${mapSvg()}</div><p class="map-note">Schematic view of recorded client and job locations. Not live tracking of staff.</p>`, 'span-map')}
    ${panel('Job status', table(jobs), 'span-table')}
    ${panel(`${icon('alert', 18)} Items needing attention`, `<ul class="attention">${attention.map(([t, d]) => `<li><strong>${t}</strong><span>${d}</span></li>`).join('')}</ul>`, 'span-attn')}
  </div>
</div>`;
