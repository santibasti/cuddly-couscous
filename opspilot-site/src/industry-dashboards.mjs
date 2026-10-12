// Premium animated sample dashboards, one per extra industry. Every figure and name is SAMPLE DATA.
import { icon } from './icons.mjs';
import { areaChart, kpiTile } from './dashboard.mjs';

const peso = (n) => '₱' + n.toLocaleString('en-PH');
const chip = (cls, t) => `<span class="status ${cls}"><i aria-hidden="true"></i>${t}</span>`;
const P = 'st-progress', S = 'st-sched', W = 'st-wait', D = 'st-done';
const wk = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
const days = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];
const k = (label, value, note, spark, count, money) => ({ label, value, note, spark, count, money });

// ---------- specialty visuals ----------
const timeline = (hours, rows, now) => `
<div class="tl" role="img" aria-label="Sample appointment timeline by doctor">
  <div class="tl-labels"><span></span>${rows.map(([l]) => `<b>${l}</b>`).join('')}</div>
  <div class="tl-area">
    <div class="tl-hours">${hours.map((h) => `<span>${h}</span>`).join('')}</div>
    ${rows.map(([, blocks]) => `<div class="tl-track">${blocks.map(([l, w, st], i) => `<i class="tl-b ${st}" style="left:${l}%;width:${w}%;--d:${(i * 0.14).toFixed(2)}s"></i>`).join('')}</div>`).join('')}
    <span class="tl-now" style="left:${now}%"><em>Now</em></span>
  </div>
</div>
<ul class="legend"><li><i class="lg lg-done"></i>Done</li><li><i class="lg lg-live"></i>In progress</li><li><i class="lg lg-next"></i>Upcoming</li></ul>`;

const chairs = (items) => `
<div class="chairs">${items.map(([name, state, cls, pct, label], i) => `
  <div class="chair" style="--d:${(i * 0.1).toFixed(1)}s">
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle class="rg-bg" cx="22" cy="22" r="17" pathLength="100"/><circle class="rg-fg" cx="22" cy="22" r="17" pathLength="100" style="--p:${pct}" transform="rotate(-90 22 22)"/></svg>
    <div><strong>${name}</strong><small>${label}</small></div>${chip(cls, state)}
  </div>`).join('')}</div>`;

const fleet = (rows) => `
<ul class="fl">${rows.map(([code, route, pct, cls, state, eta], i) => `
  <li><div class="fl-h"><b>${code}</b><span>${route}</span>${chip(cls, state)}</div>
  <span class="prog prog-live"><i style="--w:${pct}%;--d:${(i * 0.15).toFixed(2)}s"></i></span><small>${eta}</small></li>`).join('')}</ul>`;

const bars = (items, target, max) => `
<div class="bars" role="img" aria-label="Sample collections by vehicle against a target of ${peso(target)}">
  <div class="bars-plot">
    <span class="bars-target" style="bottom:${((target / max) * 100).toFixed(1)}%"><em>Target ${peso(target)}</em></span>
    ${items.map(([, v], i) => `<div class="bar" style="--h:${((v / max) * 100).toFixed(1)}%;--d:${(i * 0.08).toFixed(2)}s"><b>₱${(v / 1000).toFixed(1)}k</b><i class="${v >= target ? 'ok' : 'low'}"></i></div>`).join('')}
  </div>
  <div class="bars-x">${items.map(([l]) => `<span>${l}</span>`).join('')}</div>
</div>
<ul class="legend"><li><i class="lg lg-done"></i>On or above target</li><li><i class="lg lg-low"></i>Below target</li></ul>`;

const heat = (hours, rows) => `
<div class="heat" role="img" aria-label="Sample stylist schedule: booked, free, break and current slots">
  <div class="heat-h"><span></span>${hours.map((h) => `<span>${h}</span>`).join('')}</div>
  ${rows.map(([n, cells], ri) => `<div class="heat-r"><b>${n}</b>${[...cells].map((c, ci) => `<i class="hc ${{ b: 'booked', f: 'free', x: 'break', n: 'now' }[c]}" style="--d:${((ri * 8 + ci) * 0.035).toFixed(2)}s"></i>`).join('')}</div>`).join('')}
</div>
<ul class="legend"><li><i class="lg lg-live"></i>Booked</li><li><i class="lg lg-now"></i>In service</li><li><i class="lg lg-next"></i>Free</li><li><i class="lg lg-brk"></i>Break</li></ul>`;

const pipeline = (cols, moving) => `
<div class="pl" role="img" aria-label="Sample laundry job pipeline by stage">
  ${cols.map(([t, c, tk]) => `<div class="pl-c"><p><span>${t}</span><b>${c}</b></p>${tk.map((x) => `<em class="pl-t">${x}</em>`).join('')}</div>`).join('')}
  <em class="pl-move">${moving}</em>
</div>`;

const bays = (rows) => `
<ul class="bays">${rows.map(([b, v, m, pct, cls, l], i) => `
  <li><div><b>${b}</b><span>${v}${m !== '—' ? ' · ' + m : ''}</span></div>${chip(cls, l)}<span class="prog"><i style="--w:${pct}%;--d:${(i * 0.15).toFixed(2)}s"></i></span></li>`).join('')}</ul>`;

// ---------- table / attention ----------
const table = (cols, rows) => `
<div class="table-wrap"><table class="dash-table">
  <thead><tr>${cols.map(([c, cl]) => `<th scope="col"${cl ? ` class="${cl}"` : ''}>${c}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => (Array.isArray(cell) ? `<td>${chip(cell[0], cell[1])}</td>` : i === 0 ? `<th scope="row">${cell}</th>` : `<td${cols[i][1] ? ` class="${cols[i][1]}"` : ''}>${cell}</td>`)).join('')}</tr>`).join('')}</tbody>
</table></div>`;

const attention = (items) => `<ul class="attention ind-att">${items.map(([tag, title, text, ic]) => `<li><span class="att-ico">${icon(ic, 20)}</span><div><span class="att-tag">${tag}</span><strong>${title}</strong><span class="att-text">${text}</span></div></li>`).join('')}</ul>`;

const panel = (title, body, cls) => `<section class="dash-panel ${cls}"><div class="dash-h-row"><h3 class="dash-h">${title}</h3></div>${body}</section>`;


// ---------- extra panels: breakdown + recent activity (SAMPLE DATA) ----------
const mixPanel = (title, rows) => `
<ul class="mix" role="img" aria-label="${title}, sample data: ${rows.map(([l, v]) => `${l} ${v}%`).join(', ')}">
  ${rows.map(([l, v], i) => `<li><span>${l}</span><span class="mix-bar"><i style="--w:${v}%;--d:${(i * 0.12).toFixed(2)}s"></i></span><b>${v}%</b></li>`).join('')}
</ul>`;
const feedPanel = (items) => `
<ol class="feed">
  ${items.map(([t, text], i) => `<li style="--d:${(i * 0.12).toFixed(2)}s"><time>${t}</time><span>${text}</span></li>`).join('')}
</ol>`;
const extras = {
  'service-contractors': { mix: ['Revenue by service', [['Janitorial', 46], ['Building maintenance', 28], ['Deep cleaning', 16], ['Other jobs', 10]]], feed: [['9:42 AM', 'Crew A checked in · Sample Office Tower'], ['10:15 AM', 'Equipment issued · Floor polisher #3 · Crew A'], ['11:20 AM', 'Service report signed off · Sample School'], ['12:05 PM', 'Payment recorded · ₱28,500 · Sample Warehouse']] },
  maintenance: { mix: ['Visits by type', [['Scheduled cleaning', 42], ['Preventive maintenance', 30], ['Repairs', 18], ['Inspections', 10]]], feed: [['8:10 AM', 'Visit started · Sample Mall · Tech A'], ['9:35 AM', 'Checklist completed · 14 of 14 items'], ['10:20 AM', 'Client acknowledged · Sample School'], ['11:45 AM', 'Billed · ₱18,400 · Sample Clinic']] },
  construction: { mix: ['Spend by category', [['Labor', 38], ['Materials', 34], ['Equipment', 14], ['Subcontractors', 14]]], feed: [['7:15 AM', 'Crew A checked in · Sample Tower Fit-out'], ['9:40 AM', 'Materials issued · Cement ×40 · Sample Warehouse'], ['11:05 AM', 'Variation order approved · VO-07'], ['1:30 PM', 'Progress billing recorded · ₱485,000']] },
  'driving-ranges': { mix: ['Sales mix', [['Range buckets', 64], ['Food', 21], ['Beverages', 15]]], feed: [['1:05 PM', 'Bay 4 checked out · ₱420'], ['1:12 PM', 'Bucket ×2 added · Bay 6'], ['1:20 PM', 'Café order ready · Bay 2'], ['1:31 PM', 'Bay 5 reserved for 3:00 PM']] },
  'car-washes': { mix: ['Sales by service', [['Full wash', 44], ['Exterior wash', 26], ['Wax and polish', 18], ['Interior clean', 12]]], feed: [['12:40 PM', 'Bay 2 started · Full wash'], ['12:52 PM', 'Paid ₱450 · Sample Pickup'], ['1:03 PM', 'Low stock flagged · Wax'], ['1:15 PM', 'Bay 1 ready · Sample Sedan']] },
  clinics: { mix: ['Billing by visit type', [['Consultation', 48], ['Follow-up', 27], ['Procedures', 17], ['Other', 8]]], feed: [['9:05 AM', 'Appointment completed · Doctor B'], ['10:30 AM', 'Payment recorded · ₱1,200'], ['11:15 AM', 'Supplies reorder flagged · Gloves'], ['12:02 PM', 'Appointment confirmed · tomorrow 9:00 AM']] },
  dental: { mix: ['Billing by treatment', [['Cleaning', 30], ['Fillings', 26], ['Check-ups', 24], ['Other treatments', 20]]], feed: [['12:50 PM', 'Chair 4 ready'], ['1:10 PM', 'Payment recorded · ₱3,500'], ['1:25 PM', 'Appointment confirmed · Dentist C'], ['1:40 PM', 'Sterilization batch started · 12 sets']] },
  'tourist-buses': { mix: ['Billed by trip type', [['Day tours', 40], ['Airport and hotel transfers', 30], ['Multi-day charters', 22], ['Other', 8]]], feed: [['10:20 AM', 'Trip completed · Bus 11'], ['11:00 AM', 'Deposit recorded · ₱15,000 · T-118'], ['12:30 PM', 'Bus 05 boarding · Subic'], ['1:10 PM', 'Maintenance logged · Bus 09']] },
  'taxi-fleets': { mix: ['Collected by vehicle type', [['Taxis', 62], ['Vans', 28], ['Shuttles', 10]]], feed: [['6:05 AM', 'Shift started · Van 12'], ['2:10 PM', 'Remittance recorded · Taxi 01'], ['2:25 PM', 'Short remittance flagged · Taxi 04'], ['2:40 PM', 'Service reminder · Taxi 04']] },
  salons: { mix: ['Sales by service', [['Hair', 52], ['Color', 22], ['Nails', 14], ['Products', 12]]], feed: [['12:30 PM', 'Appointment booked · Stylist C'], ['12:45 PM', 'Payment recorded · ₱1,800'], ['1:00 PM', 'Checked in · Color · Stylist C'], ['1:15 PM', 'Low stock flagged · Developer']] },
  laundry: { mix: ['Sales by service', [['Wash and fold', 54], ['Dry cleaning', 20], ['Ironing', 18], ['Bedding', 8]]], feed: [['11:05 AM', 'Ticket #L-2064 ready'], ['11:40 AM', 'Payment recorded · ₱450'], ['12:10 PM', 'Pickup reminder queued · 5 tickets'], ['12:50 PM', 'Detergent stock updated · 72%']] },
  'auto-repair': { mix: ['Revenue by job type', [['Maintenance', 38], ['Repairs', 34], ['Parts', 20], ['Diagnostics', 8]]], feed: [['9:30 AM', 'Quote approved · J-3305'], ['11:10 AM', 'Parts arrived · J-3309'], ['12:20 PM', 'Payment recorded · ₱6,400'], ['1:05 PM', 'Vehicle ready · J-3299']] },
};

const render = (d, x) => `
<div class="app app-ind ind-dash" role="group" aria-label="Illustrative ${d.name} dashboard with sample data">
  <div class="app-main">
    <div class="app-top">
      <div><p class="dash-title">${d.title}</p><p class="dash-sub">${d.sub}</p></div>
      <div class="dash-badges"><span class="badge-illus">Illustrative dashboard</span><span class="badge-sample"><i aria-hidden="true"></i>Sample data</span></div>
    </div>
    <div class="ind-toasts" aria-hidden="true">${d.toasts.map((t, i) => `<span class="ind-toast" style="animation-delay:${i * 4}s"><i></i>${t}</span>`).join('')}</div>
    <div class="kpis kpis-full">${d.kpis.map(kpiTile).join('')}</div>
    <div class="dash-grid ind-grid">
      ${panel(d.chart.title, areaChart({ ...d.chart, tableView: true }), 'ind-chart chart-panel')}
      ${panel(d.special.title, d.special.html, 'ind-special')}
      ${panel(d.table.title, table(d.table.cols, d.table.rows), 'ind-table')}
      ${panel(`${icon('alert', 18)} Items needing attention`, attention(d.attn), 'ind-attn')}
      ${panel(x.mix[0], mixPanel(x.mix[0], x.mix[1]), 'ind-mix')}
      ${panel('Recent activity', feedPanel(x.feed), 'ind-feed')}
    </div>
  </div>
</div>`;

// ---------- sample data per industry ----------
const data = {
  'service-contractors': {
    name: 'cleaning and maintenance contractor', title: 'Contractor operations', sub: 'Today · all sites',
    toasts: ['Crew A checked in · Sample Office Tower · sample', 'Equipment returned · Crew B · sample', 'Service report signed off · sample'],
    kpis: [k('Jobs today', '18', '12 in progress', [9, 11, 10, 13, 12, 15, 14, 18], 18), k('Crew present', '42 / 46', '4 awaiting verification', [38, 40, 41, 39, 43, 42, 44, 42]), k('Equipment out', '31', '3 past return date', [22, 25, 24, 28, 27, 30, 29, 31], 31),
      k('Recorded sales', peso(186400), 'Today', [120, 150, 138, 170, 160, 182, 175, 186], 186400, true), k('Payments recorded', peso(142750), 'Today', [90, 110, 120, 118, 130, 128, 140, 143], 142750, true), k('Outstanding', peso(318900), '9 open bills', [290, 300, 310, 305, 322, 315, 320, 319], 318900, true)],
    chart: { title: 'Billed vs collected · 8 weeks', labels: wk, a: [210, 185, 240, 220, 260, 235, 280, 250], b: [160, 175, 190, 205, 215, 220, 230, 245], max: 300, note: '₱ thousands · sample data', noun: 'Week' },
    special: { title: 'Crews on site', html: fleet([['Crew A', 'Sample Office Tower', 65, P, 'On site', 'Finishes 4:30 PM'], ['Crew B', 'Sample Café', 90, W, 'Awaiting sign-off', 'Report pending'], ['Crew C', 'Sample Warehouse', 0, S, 'Scheduled', 'Starts 1:00 PM'], ['Crew D', 'Sample School', 100, D, 'Completed', 'Done 11:20 AM']]) },
    table: { title: 'Job status', cols: [['Job'], ['Client', 'hide-sm'], ['Crew', 'hide-sm'], ['Status']], rows: [['J-1042', 'Sample Office Tower', 'Crew A', [P, 'In progress']], ['J-1043', 'Sample Warehouse', 'Crew C', [S, 'Scheduled']], ['J-1040', 'Sample Café', 'Crew B', [W, 'Awaiting sign-off']], ['J-1038', 'Sample School', 'Crew D', [D, 'Completed']], ['J-1036', 'Sample Clinic', 'Crew E', [D, 'Completed']]] },
    attn: [['Overdue', 'Equipment past return date', '3 items issued to Crew B and Crew D', 'box'], ['Unbilled', 'Added work not yet billed', 'J-1042 has an approved change not on the bill', 'quote'], ['Past due', 'Balances past due date', '3 bills are past their due date', 'wallet'], ['To verify', 'Attendance to verify', '4 crew entries awaiting supervisor check', 'users']],
  },
  maintenance: {
    name: 'maintenance contractor', title: 'Maintenance visits', sub: 'Today · all client sites',
    toasts: ['Checklist completed · Sample Mall · sample', 'Client acknowledged · Sample School · sample', 'Visit billed · ₱18,400 · sample'],
    kpis: [k('Visits today', '24', '9 completed', [14, 16, 18, 20, 19, 22, 23, 24], 24), k('Checklists done', '96%', 'items completed today', [88, 90, 92, 91, 94, 95, 95, 96]), k('Awaiting sign-off', '5', 'client acknowledgement', [2, 3, 3, 4, 4, 5, 4, 5], 5),
      k('Technicians on site', '14 / 16', '2 not yet checked in', [12, 13, 13, 14, 15, 14, 14, 14]), k('Billed this month', peso(612000), 'Sample data', [300, 380, 430, 470, 520, 560, 590, 612], 612000, true), k('Outstanding', peso(204500), '7 invoices', [180, 190, 210, 200, 215, 208, 206, 204.5], 204500, true)],
    chart: { title: 'Visits planned vs completed · 8 weeks', labels: wk, a: [120, 124, 130, 128, 136, 140, 138, 144], b: [112, 120, 124, 126, 130, 136, 134, 140], max: 160, nameA: 'Planned', nameB: 'Completed', pre: '', suf: '', note: 'visits per week · sample data', noun: 'Week' },
    special: { title: 'Visits in progress', html: fleet([['Tech A', 'Sample Mall', 70, P, 'On site', 'Finishes 11:30 AM'], ['Tech B', 'Sample School', 100, W, 'Awaiting sign-off', 'Client to acknowledge'], ['Tech C', 'Sample Clinic', 35, P, 'On site', 'Finishes 1:15 PM'], ['Tech D', 'Sample Office', 0, S, 'Scheduled', 'Starts 2:00 PM']]) },
    table: { title: 'Scheduled visits', cols: [['Visit'], ['Site', 'hide-sm'], ['Technician', 'hide-sm'], ['Status']], rows: [['V-2210', 'Sample Mall', 'Tech A', [P, 'In progress']], ['V-2211', 'Sample Office', 'Tech D', [S, 'Scheduled']], ['V-2208', 'Sample School', 'Tech B', [W, 'Awaiting sign-off']], ['V-2204', 'Sample Clinic', 'Tech C', [P, 'In progress']], ['V-2199', 'Sample Hotel', 'Tech E', [D, 'Completed']]] },
    attn: [['Sign-off', '5 visits awaiting acknowledgement', 'Remind clients', 'quote'], ['Overdue', '3 visits past schedule', 'Reassign technicians', 'clock'], ['Unbilled', '4 completed visits not billed', 'Prepare invoices', 'wallet'], ['Check-in', '2 technicians not checked in', 'Verify attendance', 'users']],
  },
  construction: {
    name: 'construction business', title: 'Construction operations', sub: 'Today · all active projects',
    toasts: ['Crew A checked in · Sample Tower Fit-out · sample', 'Variation order approved · VO-07 · sample', 'Progress billing recorded · sample'],
    kpis: [k('Active projects', '7', '2 behind schedule', [4, 5, 5, 6, 6, 7, 7, 7], 7), k('Workers on site', '86 / 94', '8 awaiting verification', [70, 78, 80, 84, 82, 88, 85, 86]), k('Equipment deployed', '38', '4 due for return', [30, 32, 34, 33, 36, 37, 38, 38], 38),
      k('Billed to date', peso(8450000), 'Sample data', [5.2, 5.8, 6.4, 6.9, 7.4, 7.8, 8.1, 8.45], 8450000, true), k('Collected', peso(6120000), 'Payments recorded', [3.8, 4.3, 4.8, 5.1, 5.5, 5.8, 6, 6.12], 6120000, true), k('Outstanding', peso(2330000), '5 progress bills open', [1.9, 2, 2.1, 2.3, 2.2, 2.4, 2.3, 2.33], 2330000, true)],
    chart: { title: 'Billed vs collected · 8 weeks', labels: wk, a: [610, 540, 720, 680, 790, 740, 860, 810], b: [450, 500, 560, 600, 650, 690, 720, 745], max: 900, note: '₱ thousands · sample data', noun: 'Week' },
    special: { title: 'Project progress', html: fleet([['P-101', 'Sample Tower Fit-out', 72, P, 'On track', 'Handover in 3 weeks'], ['P-104', 'Sample Warehouse', 45, W, 'Behind schedule', 'Awaiting materials'], ['P-107', 'Sample Retail Store', 90, P, 'Final works', 'Punch list open'], ['P-110', 'Sample Residence', 20, S, 'Mobilizing', 'Crew starts Monday']]) },
    table: { title: 'Variation orders', cols: [['VO'], ['Project', 'hide-sm'], ['Added value', 'hide-sm'], ['Status']], rows: [['VO-07', 'Sample Tower Fit-out', peso(185000), [D, 'Approved']], ['VO-08', 'Sample Warehouse', peso(92000), [W, 'Awaiting approval']], ['VO-05', 'Sample Retail Store', peso(64500), [D, 'Billed']], ['VO-09', 'Sample Residence', peso(138000), [S, 'Drafted']], ['VO-06', 'Sample Tower Fit-out', peso(47000), [W, 'Awaiting approval']]] },
    attn: [['Approval', '2 variation orders awaiting approval', 'Total ₱139,000 not yet billable', 'quote'], ['Materials', 'Cement low at Sample Warehouse', 'Reorder to avoid delay', 'box'], ['Past due', '₱740,000 past due date', '2 progress bills', 'wallet'], ['To verify', '8 crew entries to verify', 'Supervisor check before payroll prep', 'users']],
  },
  'driving-ranges': {
    name: 'driving range', title: 'Driving range operations', sub: 'Today · 8 bays and café',
    toasts: ['Bay 4 checked out · ₱420 · sample', 'Bucket ×2 added · Bay 6 · sample', 'Café order ready · Bay 2 · sample'],
    kpis: [k('Bays open', '5 of 8', '3 in use', [3, 4, 4, 6, 5, 5, 6, 5]), k('Open player tabs', '3', 'to check out', [2, 3, 3, 4, 3, 2, 3, 3], 3), k('Buckets sold', '164', 'Today', [60, 85, 100, 120, 135, 148, 158, 164], 164),
      k('Café orders', '12', 'Today', [4, 6, 7, 9, 10, 11, 12, 12], 12), k('Sales today', peso(38200), 'Range and café', [18, 22, 26, 30, 33, 36, 37, 38.2], 38200, true), k('Open tabs value', peso(2860), '3 tabs', [1.2, 1.8, 2.2, 3, 2.6, 2.4, 3, 2.86], 2860, true)],
    chart: { title: 'Daily sales · this week vs last', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], a: [22, 25, 24, 30, 36, 52, 48], b: [24, 27, 26, 33, 41, 58, 53], max: 60, nameA: 'Last week', nameB: 'This week', note: '₱ thousands per day · sample data', noun: 'Day' },
    special: { title: 'Bay board', html: bays([['Bay 1', 'Sample player', '2 buckets', 60, P, 'In use'], ['Bay 2', 'Sample player', 'café order', 25, P, 'In use'], ['Bay 3', 'Open bay', '—', 0, D, 'Available'], ['Bay 4', 'Sample player', 'checkout', 100, W, 'Checking out'], ['Bay 5', 'Reserved', '3:00 PM', 0, S, 'Reserved'], ['Bay 6', 'Open bay', '—', 0, D, 'Available']]) },
    table: { title: 'Player tabs', cols: [['Tab'], ['Player', 'hide-sm'], ['Bay'], ['Status']], rows: [['T-2041', 'Player A', 'Bay 4', [W, '₱420 · Checkout']], ['T-2042', 'Player B', 'Bay 1', [P, '₱300 · Open']], ['T-2043', 'Player C', 'Bay 2', [P, '₱620 · Open']], ['T-2039', 'Player D', 'Bay 6', [D, 'Paid']], ['T-2038', 'Player E', 'Bay 3', [D, 'Paid']]] },
    attn: [['Open tabs', '3 tabs not yet checked out', '₱2,860 open', 'wallet'], ['Reserved', 'Bay 5 reserved at 3:00 PM', 'Keep it free', 'calendar'], ['Stock', 'Café stock low', 'Iced tea and bottled water', 'box'], ['Shift', 'Shift report due at closing', 'Totals are ready', 'clock']],
  },
  'car-washes': {
    name: 'car wash', title: 'Car wash operations', sub: 'Today · 3 bays',
    toasts: ['Bay 2 started · Full wash · sample', 'Paid ₱450 · Pickup · sample', 'Low stock flagged · wax · sample'],
    kpis: [k('Vehicles today', '24', '9 still to come', [10, 13, 15, 18, 20, 22, 23, 24], 24), k('In queue', '3', 'waiting', [1, 2, 4, 3, 2, 3, 4, 3], 3), k('Sales today', peso(18600), 'Cash and e-wallet', [6, 9, 11, 13, 15, 16, 18, 18.6], 18600, true),
      k('Average wash', '28 min', 'bay time', [34, 32, 31, 30, 29, 29, 28, 28]), k('Supplies low', '2', 'items', [1, 1, 2, 1, 2, 2, 2, 2], 2), k('Unpaid', peso(1250), '2 vehicles', [0.5, 0.9, 1.3, 1.1, 1.4, 1.2, 1.3, 1.25], 1250, true)],
    chart: { title: 'Daily sales · this week vs last', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], a: [12, 13, 12, 15, 17, 24, 22], b: [13, 14, 13, 17, 19, 27, 25], max: 30, nameA: 'Last week', nameB: 'This week', note: '₱ thousands per day · sample data', noun: 'Day' },
    special: { title: 'Job queue', html: pipeline([['Waiting', 3, ['#C-118', '#C-119']], ['Washing', 3, ['#C-114', '#C-115']], ['Drying', 2, ['#C-110', '#C-111']], ['Ready', 5, ['#C-104', '#C-105']]], '#C-121') },
    table: { title: 'Service records', cols: [['Job'], ['Vehicle', 'hide-sm'], ['Service'], ['Status']], rows: [['C-115', 'Sample Sedan', 'Full wash', [P, 'Washing']], ['C-114', 'Sample SUV', 'Wash and wax', [P, 'Washing']], ['C-111', 'Sample Pickup', 'Interior clean', [W, 'Drying']], ['C-105', 'Sample Hatchback', 'Exterior wash', [D, 'Ready']], ['C-104', 'Sample Van', 'Full wash', [D, 'Paid']]] },
    attn: [['Low stock', 'Wax and shampoo low', 'Reorder suggested', 'box'], ['Unpaid', '2 vehicles unpaid', '₱1,250 to collect', 'wallet'], ['Queue', '3 vehicles waiting', 'Bay 3 opens in 6 minutes', 'clock'], ['Ready', '5 vehicles ready', 'Notify owners', 'users']],
  },

  clinics: {
    name: 'clinic', title: 'Clinic operations', sub: 'Today · all rooms',
    toasts: ['Appointment completed · Doctor B · sample', 'Payment recorded · ₱1,200 · sample', 'Supplies reorder flagged · sample'],
    kpis: [k('Appointments today', '42', '18 completed', [30, 34, 32, 38, 36, 40, 41, 42], 42), k('Patients waiting', '5', 'in the waiting area', [2, 4, 3, 6, 5, 4, 6, 5], 5), k('Doctors on duty', '6', '2 on break', [5, 6, 6, 5, 6, 6, 6, 6], 6),
      k('Collections', peso(38600), 'Today', [20, 26, 24, 30, 28, 34, 36, 38.6], 38600, true), k('Unpaid balances', peso(92400), '14 accounts', [80, 84, 88, 90, 86, 91, 93, 92.4], 92400, true), k('Low supplies', '3', 'items to reorder', [1, 2, 2, 3, 2, 3, 3, 3], 3)],
    chart: { title: 'Scheduled vs completed · 8 weeks', labels: wk, a: [210, 224, 198, 236, 250, 242, 260, 248], b: [196, 208, 186, 220, 236, 228, 246, 238], max: 300, nameA: 'Scheduled', nameB: 'Completed', pre: '', suf: '', note: 'appointments per week · sample data', noun: 'Week' },
    special: { title: 'Appointments by doctor', html: timeline(['8', '9', '10', '11', '12', '1', '2', '3', '4', '5'], [['Doctor A', [[0, 16, 'done'], [18, 14, 'done'], [40, 16, 'live'], [60, 12, 'next'], [76, 16, 'next']]], ['Doctor B', [[4, 14, 'done'], [22, 18, 'done'], [44, 12, 'live'], [62, 16, 'next']]], ['Doctor C', [[0, 10, 'done'], [14, 16, 'done'], [34, 14, 'done'], [56, 14, 'next'], [74, 18, 'next']]]], 47) },
    table: { title: "Today's schedule", cols: [['Time'], ['Doctor', 'hide-sm'], ['Visit'], ['Status']], rows: [['9:00 AM', 'Doctor A', 'Consultation', [D, 'Completed']], ['10:30 AM', 'Doctor B', 'Follow-up', [D, 'Completed']], ['12:00 PM', 'Doctor A', 'Check-up', [P, 'In progress']], ['1:30 PM', 'Doctor C', 'Consultation', [S, 'Scheduled']], ['2:00 PM', 'Doctor B', 'Follow-up', [W, 'To confirm']]] },
    attn: [['Reorder', 'Supplies running low', '3 items below reorder level', 'box'], ['Unpaid', 'Balances past 30 days', '2 accounts need follow-up', 'wallet'], ['To confirm', 'Appointments to confirm', '5 for tomorrow', 'calendar'], ['Schedule', 'Doctor C gap, 2–3 PM', 'Open slot can be offered', 'clock']],
  },
  dental: {
    name: 'dental practice', title: 'Dental practice', sub: 'Today · 6 chairs',
    toasts: ['Chair 4 ready · sample', 'Payment recorded · ₱3,500 · sample', 'Appointment confirmed · Dentist C · sample'],
    kpis: [k('Chairs in use', '4 of 6', '1 available', [3, 4, 4, 5, 4, 4, 5, 4]), k('Appointments today', '28', '11 completed', [20, 24, 22, 26, 25, 27, 28, 28], 28), k('Collections', peso(54200), 'Today', [30, 36, 40, 44, 42, 50, 52, 54.2], 54200, true),
      k('Outstanding', peso(126300), '9 open accounts', [110, 118, 120, 124, 122, 128, 127, 126.3], 126300, true), k('Instrument sets', '12', 'in sterilization', [8, 10, 9, 12, 11, 12, 13, 12], 12), k('Low stock', '2', 'items to reorder', [1, 1, 2, 1, 2, 2, 3, 2], 2)],
    chart: { title: 'Billed vs collected · 8 weeks', labels: wk, a: [120, 132, 118, 140, 150, 146, 160, 155], b: [104, 118, 110, 126, 138, 134, 148, 142], max: 180, note: '₱ thousands · sample data', noun: 'Week' },
    special: { title: 'Chair status', html: chairs([['Chair 1', 'In treatment', P, 70, '12 min left'], ['Chair 2', 'In treatment', P, 35, '28 min left'], ['Chair 3', 'Cleaning', W, 80, 'Ready in 4 min'], ['Chair 4', 'Available', D, 100, 'Next: 2:30 PM'], ['Chair 5', 'In treatment', P, 55, '18 min left'], ['Chair 6', 'Reserved', S, 0, 'Starts 3:00 PM']]) },
    table: { title: 'Next appointments', cols: [['Time'], ['Dentist', 'hide-sm'], ['Procedure'], ['Status']], rows: [['1:00 PM', 'Dentist A', 'Cleaning', [P, 'In progress']], ['1:30 PM', 'Dentist B', 'Filling', [P, 'In progress']], ['2:30 PM', 'Dentist A', 'Check-up', [S, 'Scheduled']], ['3:00 PM', 'Dentist C', 'Consultation', [S, 'Scheduled']], ['3:30 PM', 'Dentist B', 'Adjustment', [W, 'To confirm']]] },
    attn: [['Low stock', 'Gloves and masks low', 'Reorder suggested', 'box'], ['Unpaid', 'Installments due this week', '3 accounts', 'wallet'], ['Sterilization', 'Batch due at 2:00 PM', '12 instrument sets', 'clock'], ['To confirm', 'Appointments to confirm', '4 for tomorrow', 'calendar']],
  },
  'tourist-buses': {
    name: 'tourist bus fleet', title: 'Fleet operations', sub: 'Today · 12 buses',
    toasts: ['Trip completed · Bus 11 · sample', 'Deposit recorded · ₱15,000 · sample', 'Bus 05 boarding · sample'],
    kpis: [k('Trips today', '14', '5 completed', [9, 11, 10, 13, 12, 14, 13, 14], 14), k('Buses on road', '9 of 12', '1 in maintenance', [7, 8, 8, 9, 9, 8, 9, 9]), k('Drivers on duty', '18', 'drivers and conductors', [14, 16, 15, 18, 17, 18, 18, 18], 18),
      k('Bookings, next 7 days', '23', '4 awaiting deposit', [15, 17, 18, 20, 19, 22, 21, 23], 23), k('Collections', peso(212500), 'This week', [120, 140, 150, 170, 168, 190, 200, 212.5], 212500, true), k('Deposits due', peso(146000), '6 charters', [120, 126, 130, 140, 138, 142, 148, 146], 146000, true)],
    chart: { title: 'Billed vs expenses · 8 weeks', labels: wk, a: [380, 360, 410, 430, 470, 450, 520, 500], b: [210, 205, 230, 240, 262, 251, 288, 275], max: 600, nameA: 'Billed', nameB: 'Expenses', note: '₱ thousands · sample data', noun: 'Week' },
    special: { title: 'Trips in progress', html: fleet([['Bus 03', 'Manila → Tagaytay', 72, P, 'On the road', 'Arrives 2:40 PM'], ['Bus 07', 'Manila → Baguio', 38, P, 'On the road', 'Arrives 6:15 PM'], ['Bus 11', 'Pasay → Batangas', 92, P, 'Arriving', 'Arrives 1:20 PM'], ['Bus 05', 'Quezon City → Subic', 0, S, 'Boarding', 'Departs 3:00 PM'], ['Bus 09', 'Maintenance bay', 0, W, 'In service', 'Back tomorrow']]) },
    table: { title: 'Upcoming charters', cols: [['Booking'], ['Group', 'hide-sm'], ['Date'], ['Status']], rows: [['T-118', 'Sample School', 'Oct 14', [W, 'Deposit due']], ['T-121', 'Sample Company', 'Oct 15', [D, 'Confirmed']], ['T-124', 'Sample Family', 'Oct 18', [S, 'Quoted']], ['T-126', 'Sample Church Group', 'Oct 20', [D, 'Confirmed']], ['T-129', 'Sample Company', 'Oct 22', [S, 'Quoted']]] },
    attn: [['Maintenance', 'Bus 09 service due', 'Out until tomorrow', 'gear'], ['Deposit', 'Deposit due · T-118', '₱15,000 pending', 'wallet'], ['Long day', 'Driver C has long hours today', 'Consider swapping a driver', 'users'], ['Renewal', 'Bus 04 registration renewal', 'Due in 12 days', 'calendar']],
  },
  'taxi-fleets': {
    name: 'taxi and van fleet', title: 'Fleet collections', sub: 'Today · 45 vehicles',
    toasts: ['Remittance recorded · Taxi 01 · sample', 'Shift started · Van 12 · sample', 'Service reminder · Taxi 04 · sample'],
    kpis: [k('Vehicles on shift', '38 of 45', '7 resting or in service', [34, 36, 35, 38, 37, 38, 39, 38]), k('Collected today', peso(61400), 'Boundary and rental', [48, 54, 52, 58, 57, 60, 62, 61.4], 61400, true), k('Remitted on time', '34 of 38', '4 still to remit', [30, 32, 31, 35, 33, 34, 36, 34]),
      k('Drivers present', '41', '3 absent', [38, 40, 39, 42, 41, 40, 42, 41], 41), k('Maintenance due', '4', 'vehicles', [2, 3, 3, 4, 3, 4, 5, 4], 4), k('Unremitted', peso(6600), '2 drivers', [3, 5, 4, 7, 6, 5, 7, 6.6], 6600, true)],
    chart: { title: 'Collected vs expected · 8 days', labels: days, a: [66, 66, 68, 68, 70, 70, 68, 68], b: [60, 61, 63, 62, 66, 64, 62, 61], max: 80, nameA: 'Expected', nameB: 'Collected', note: '₱ thousands per day · sample data', noun: 'Day' },
    special: { title: 'Collections by vehicle', html: bars([['T01', 1750], ['T02', 1400], ['T03', 1620], ['T04', 900], ['T05', 1580], ['T06', 1210], ['T07', 1700], ['T08', 1340]], 1400, 2000) },
    table: { title: 'Shift remittance', cols: [['Vehicle'], ['Driver', 'hide-sm'], ['Shift'], ['Status']], rows: [['Taxi 04', 'Driver A', 'AM', [W, 'Short ₱500']], ['Taxi 06', 'Driver B', 'AM', [W, 'Short ₱190']], ['Taxi 01', 'Driver C', 'PM', [D, 'Remitted']], ['Van 12', 'Driver D', 'AM', [D, 'Remitted']], ['Taxi 09', 'Driver E', 'PM', [S, 'On shift']]] },
    attn: [['Maintenance', '4 vehicles due for service', 'Taxi 04 first', 'gear'], ['Unremitted', '₱6,600 not yet remitted', '2 drivers to follow up', 'wallet'], ['Attendance', '3 drivers absent', 'Spare vehicles available', 'users'], ['Review', 'Taxi 04 below target 3 days', 'Check with the driver', 'alert']],
  },
  salons: {
    name: 'salon', title: 'Salon operations', sub: 'Today · 7 stylists',
    toasts: ['Appointment booked · Stylist C · sample', 'Payment recorded · ₱1,800 · sample', 'Low stock flagged · developer · sample'],
    kpis: [k('Appointments', '31', '12 completed', [18, 22, 20, 26, 28, 30, 29, 31], 31), k('Stylists in', '7', '1 on break', [5, 6, 6, 7, 6, 7, 7, 7], 7), k('Service sales', peso(24850), 'Today', [14, 17, 16, 20, 21, 24, 23, 24.85], 24850, true),
      k('Product sales', peso(6200), 'Today', [3, 4, 4, 5, 5, 6, 6, 6.2], 6200, true), k('No-shows', '2', 'today', [1, 2, 1, 3, 2, 1, 2, 2], 2), k('Low stock', '3', 'items to reorder', [1, 1, 2, 2, 3, 2, 3, 3], 3)],
    chart: { title: 'Daily sales · this week vs last', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], a: [16, 19, 18, 22, 23, 28, 26], b: [18, 21, 19, 24, 27, 31, 29], max: 40, nameA: 'Last week', nameB: 'This week', note: '₱ thousands per day · sample data', noun: 'Day' },
    special: { title: 'Stylist schedule', html: heat(['10', '11', '12', '1', '2', '3', '4', '5'], [['Stylist A', 'bbxnbbff'], ['Stylist B', 'bbbnbfbb'], ['Stylist C', 'fbbnbbbx'], ['Stylist D', 'bfbnffbb'], ['Stylist E', 'bbbnbbfb']]) },
    table: { title: 'Next appointments', cols: [['Time'], ['Stylist', 'hide-sm'], ['Service'], ['Status']], rows: [['1:00 PM', 'Stylist A', 'Haircut', [P, 'In service']], ['1:00 PM', 'Stylist B', 'Treatment', [P, 'In service']], ['1:30 PM', 'Stylist C', 'Color', [W, 'Checked in']], ['2:00 PM', 'Stylist E', 'Haircut', [S, 'Booked']], ['2:30 PM', 'Stylist A', 'Manicure', [S, 'Booked']]] },
    attn: [['Low stock', 'Color developer low', 'Reorder suggested', 'box'], ['No-show', '2 no-shows today', 'Follow up by message', 'users'], ['Open slots', 'Stylist D free, 2–4 PM', 'Offer to walk-ins', 'calendar'], ['Unpaid', '2 open tabs', 'Collect at checkout', 'wallet']],
  },
  laundry: {
    name: 'laundry shop', title: 'Laundry operations', sub: 'Today · main shop',
    toasts: ['Ticket #L-2064 ready · sample', 'Payment recorded · ₱450 · sample', 'Pickup reminder queued · sample'],
    kpis: [k('Jobs in shop', '64', 'across 4 stages', [48, 52, 55, 58, 60, 62, 63, 64], 64), k('Ready for pickup', '18', '5 over 3 days', [10, 12, 14, 15, 17, 16, 18, 18], 18), k('Due today', '22', '8 not started', [14, 16, 18, 20, 21, 20, 22, 22], 22),
      k('Sales today', peso(9850), 'Cash and e-wallet', [5, 6, 7, 8, 8.5, 9, 9.5, 9.85], 9850, true), k('Unpaid', peso(14300), '9 tickets', [11, 12, 13, 12, 14, 13, 14.5, 14.3], 14300, true), k('Detergent stock', '72%', 'about 4 days left', [95, 90, 86, 82, 80, 77, 74, 72])],
    chart: { title: 'Kilos processed · 8 days', labels: days, a: [200, 200, 210, 210, 230, 230, 240, 240], b: [182, 196, 188, 210, 224, 215, 238, 229], max: 300, nameA: 'Planned', nameB: 'Processed', pre: '', suf: ' kg', note: 'kilograms per day · sample data', noun: 'Day' },
    special: { title: 'Job pipeline', html: pipeline([['Received', 16, ['#L-2087', '#L-2088']], ['Washing', 21, ['#L-2079', '#L-2080']], ['Drying / ironing', 9, ['#L-2071', '#L-2072']], ['Ready', 18, ['#L-2064', '#L-2065']]], '#L-2091') },
    table: { title: 'Claim tickets', cols: [['Ticket'], ['Customer', 'hide-sm'], ['Due'], ['Status']], rows: [['L-2064', 'Customer A', 'Today', [D, 'Ready']], ['L-2071', 'Customer B', 'Today', [P, 'Ironing']], ['L-2079', 'Customer C', 'Tomorrow', [P, 'Washing']], ['L-2085', 'Customer D', 'Tomorrow', [S, 'Received']], ['L-2060', 'Customer E', 'Overdue', [W, 'Unclaimed']]] },
    attn: [['Unclaimed', '5 tickets over 3 days', 'Send a reminder', 'clock'], ['Unpaid', '₱14,300 unpaid', '9 tickets', 'wallet'], ['Stock', 'Detergent at 72%', 'Reorder in about 4 days', 'box'], ['Due', '22 jobs due today', '8 not started', 'alert']],
  },
  'auto-repair': {
    name: 'auto repair shop', title: 'Repair shop operations', sub: 'Today · 6 bays',
    toasts: ['Quote approved · J-3305 · sample', 'Payment recorded · ₱6,400 · sample', 'Parts arrived · J-3309 · sample'],
    kpis: [k('Vehicles in shop', '11', '4 awaiting parts or approval', [8, 9, 10, 9, 11, 10, 12, 11], 11), k('Completed today', '6', 'of 9 planned', [3, 4, 4, 5, 5, 6, 6, 6], 6), k('Awaiting approval', '3', 'quotations', [1, 2, 2, 4, 3, 3, 4, 3], 3),
      k('Parts on order', '5', '2 arriving today', [3, 4, 5, 4, 6, 5, 5, 5], 5), k('Sales today', peso(43700), 'Parts and labor', [20, 26, 30, 34, 36, 40, 42, 43.7], 43700, true), k('Outstanding', peso(88900), '6 invoices', [70, 76, 80, 82, 85, 84, 90, 88.9], 88900, true)],
    chart: { title: 'Billed vs collected · 8 weeks', labels: wk, a: [180, 170, 210, 200, 240, 225, 260, 250], b: [150, 158, 176, 182, 205, 198, 226, 218], max: 300, note: '₱ thousands · sample data', noun: 'Week' },
    special: { title: 'Bay board', html: bays([['Bay 1', 'Sample Sedan', 'Mechanic A', 65, P, 'In repair'], ['Bay 2', 'Sample SUV', 'Mechanic B', 30, P, 'Diagnosis'], ['Bay 3', 'Sample Pickup', 'Mechanic C', 90, P, 'Final checks'], ['Bay 4', 'Sample Van', 'Mechanic A', 0, W, 'Awaiting approval'], ['Bay 5', 'Open bay', '—', 0, D, 'Available'], ['Bay 6', 'Sample Hatchback', 'Mechanic D', 100, D, 'Ready']]) },
    table: { title: 'Job orders', cols: [['Job'], ['Vehicle', 'hide-sm'], ['Mechanic', 'hide-sm'], ['Status']], rows: [['J-3308', 'Sample Sedan', 'Mechanic A', [P, 'In repair']], ['J-3309', 'Sample SUV', 'Mechanic B', [P, 'Diagnosis']], ['J-3305', 'Sample Van', 'Mechanic A', [W, 'Quote approval']], ['J-3301', 'Sample Pickup', 'Mechanic C', [P, 'Final checks']], ['J-3299', 'Sample Hatchback', 'Mechanic D', [D, 'Ready']]] },
    attn: [['Approval', '3 quotes awaiting approval', 'Follow up with customers', 'quote'], ['Parts', '5 parts on order', '2 arriving today', 'box'], ['Unpaid', '₱88,900 outstanding', '6 invoices', 'wallet'], ['Pickup', '2 vehicles ready', 'Notify customers', 'users']],
  },
};

export const industryDashboard = (id) => render(data[id], extras[id]);
