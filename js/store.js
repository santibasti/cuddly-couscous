import { sha256, randomSalt, hashSecret } from './sha.js';
const KEY = 'ccc-ops-v3'; // v3: accounts, roles, approvals, attendance, hash-chained audit log
export const BAY_COUNT = 15;
export const TZ = 'Asia/Manila'; // UTC+8, no DST
const H = 3600e3, D = 24 * H, TZ_OFFSET = 8 * H;
export const now = () => Date.now();
export const r2 = n => +(+n).toFixed(2);

// current signed-in actor ({id,name,role,sessionId,device}); set by auth.js
export const ctx = { actor: null };

// ---------- Manila time ----------
export const manilaISO = t => new Date(t + TZ_OFFSET).toISOString().replace('Z', '+08:00');
export const dayKey = t => manilaISO(t).slice(0, 10);                 // 2026-10-04
export const hourOf = t => +manilaISO(t).slice(11, 13);
export const dowOf = t => new Date(t + TZ_OFFSET).getUTCDay();         // 0=Sun
export const manilaTs = (date, hhmm = '00:00') => Date.parse(`${date}T${hhmm}:00+08:00`);
export const dayStart = (t = now()) => Math.floor((t + TZ_OFFSET) / D) * D - TZ_OFFSET;
export const startOfDay = () => dayStart();
export const addDays = (key, n) => dayKey(manilaTs(key) + n * D + 12 * H);

// ---------- seed ----------
function rng(seedN) { let a = seedN; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
function wpick(rand, arr, w) { const tot = arr.reduce((a, x) => a + w(x), 0); let r = rand() * tot; for (const x of arr) { r -= w(x); if (r <= 0) return x; } return arr[arr.length - 1]; }

function mkUser(t, id, username, name, role, position, empNo, sched, pw, pin) {
  const pwSalt = randomSalt(), pinSalt = randomSalt();
  return { id, username, name, role, position, employeeNo: empNo, active: true, schedule: sched, pwSalt, pwHash: hashSecret(pwSalt, pw), pinSalt, pinHash: hashSecret(pinSalt, pin), createdAt: t - 60 * D, createdBy: 'system', failed: 0, lockUntil: 0, lastLogin: null };
}
export const DEMO_PASSWORD = 'Cattle@2026', ADMIN_PASSWORD = 'Admin@2026';

function seed() {
  const t = now(), todayStart = dayStart(t), rand = rng(20261004);
  const sch = (start, end, rest) => ({ start, end, hours: 8, restDays: rest });
  const users = [
    mkUser(t, 'u_admin', 'admin', 'Rosa Villanueva', 'admin', 'Club Manager', 'CC-001', sch('09:00', '18:00', [0]), ADMIN_PASSWORD, '9090'),
    mkUser(t, 'u_cashier1', 'cashier1', 'Maria Santos', 'cashier', 'Counter / Cashier', 'CC-011', sch('08:00', '17:00', [2]), DEMO_PASSWORD, '1111'),
    mkUser(t, 'u_cashier2', 'cashier2', 'Jose Reyes', 'cashier', 'Counter / Cashier', 'CC-012', sch('11:00', '20:00', [3]), DEMO_PASSWORD, '2222'),
    mkUser(t, 'u_attendant1', 'attendant1', 'Carlo Mendoza', 'attendant', 'Range Attendant', 'CC-021', sch('06:00', '15:00', [1]), DEMO_PASSWORD, '3333'),
    mkUser(t, 'u_attendant2', 'attendant2', 'Liza Navarro', 'attendant', 'Range Attendant', 'CC-022', sch('12:00', '21:00', [4]), DEMO_PASSWORD, '4444'),
    mkUser(t, 'u_server1', 'server1', 'Ana Dizon', 'server', 'Café / Server', 'CC-031', sch('07:00', '16:00', [5]), DEMO_PASSWORD, '5555'),
    mkUser(t, 'u_server2', 'server2', 'Paolo Cruz', 'server', 'Café / Server', 'CC-032', sch('11:00', '20:00', [6]), DEMO_PASSWORD, '6666'),
  ];
  const bays = Array.from({ length: BAY_COUNT }, (_, i) => ({ id: i + 1, status: 'available', note: '' }));
  [3, 6, 7, 13].forEach(n => { bays[n - 1].status = 'occupied'; });
  [11, 12].forEach(n => { bays[n - 1].status = 'reserved'; });
  bays[13].status = 'maintenance';
  const members = [
    { id: 'm1', name: 'Eleanor Whitfield', tier: 'Full Golf', phone: '0917-555-0141', email: 'e.whitfield@example.com' },
    { id: 'm2', name: 'Marcus Delaney', tier: 'Full Golf', phone: '0917-555-0172', email: 'm.delaney@example.com' },
    { id: 'm3', name: 'Priya Raman', tier: 'Social', phone: '0917-555-0109', email: 'p.raman@example.com' },
    { id: 'm4', name: 'Tom Hargrove', tier: 'Junior', phone: '0917-555-0190', email: 't.hargrove@example.com' },
    { id: 'm5', name: 'Sofia Alvarez', tier: 'Corporate', phone: '0917-555-0166', email: 's.alvarez@example.com' },
    { id: 'm6', name: 'Diego Ramos', tier: 'Full Golf', phone: '0917-555-0120', email: 'd.ramos@example.com' },
    { id: 'm7', name: 'Hannah Lim', tier: 'Social', phone: '0917-555-0131', email: 'h.lim@example.com' },
    { id: 'm8', name: 'Gabriel Tan', tier: 'Corporate', phone: '0917-555-0152', email: 'g.tan@example.com' },
  ];
  const playerDefs = [['m1', 7], ['m2', 6], ['m3', 3], ['m4', 2], ['m5', 4], ['m6', 5], ['m7', 2], ['m8', 3], [null, 1, 'Guest – R. Chen'], [null, 1, 'Guest – K. Park'], [null, 2, 'Guest – L. Ocampo'], [null, 1, 'Guest – D. Uy'], [null, 1, 'Guest – S. Bautista'], [null, 1, 'Guest – A. Flores']];
  const players = playerDefs.map(([mid, w, nm], i) => ({ id: 'pl' + (i + 1), name: mid ? members.find(m => m.id === mid).name : nm, memberId: mid, createdAt: t - 60 * D, w }));
  // cost = unit cost (PHP), retail = expected sales value per unit (PHP)
  const inventory = [
    { id: 'i1', name: 'Range balls (cases)', unit: 'case', qty: 14, par: 20, critical: 6, cost: 1800, retail: 3300 },
    { id: 'i2', name: 'Coffee beans', unit: 'lb', qty: 18, par: 25, critical: 8, cost: 700, retail: 3000 },
    { id: 'i3', name: 'Bottled water', unit: 'btl', qty: 96, par: 120, critical: 36, cost: 18, retail: 40 },
    { id: 'i4', name: 'Soda cans', unit: 'can', qty: 60, par: 144, critical: 48, cost: 30, retail: 65 },
    { id: 'i5', name: 'Draft beer (kegs)', unit: 'keg', qty: 2, par: 4, critical: 1, cost: 6500, retail: 13000 },
    { id: 'i6', name: 'Burger patties', unit: 'ea', qty: 22, par: 60, critical: 20, cost: 95, retail: 320 },
    { id: 'i7', name: 'Chicken sandwiches', unit: 'ea', qty: 30, par: 40, critical: 12, cost: 85, retail: 290 },
    { id: 'i8', name: 'Pastries', unit: 'ea', qty: 9, par: 24, critical: 8, cost: 35, retail: 95 },
    { id: 'i9', name: 'Golf gloves', unit: 'ea', qty: 12, par: 12, critical: 3, cost: 480, retail: 1060 },
  ];
  const products = [
    { id: 'p1', name: 'Small Bucket (40)', cat: 'Range', price: 150, stock: 'i1', per: 0.04, available: true },
    { id: 'p2', name: 'Medium Bucket (75)', cat: 'Range', price: 250, stock: 'i1', per: 0.075, available: true },
    { id: 'p3', name: 'Large Bucket (110)', cat: 'Range', price: 350, stock: 'i1', per: 0.11, available: true },
    { id: 'p4', name: 'Drip Coffee', cat: 'Beverage', price: 90, stock: 'i2', per: 0.03, available: true },
    { id: 'p5', name: 'Latte', cat: 'Beverage', price: 140, stock: 'i2', per: 0.04, available: true },
    { id: 'p6', name: 'Bottled Water', cat: 'Beverage', price: 40, stock: 'i3', per: 1, available: true },
    { id: 'p7', name: 'Soda', cat: 'Beverage', price: 65, stock: 'i4', per: 1, available: true },
    { id: 'p8', name: 'Draft Beer', cat: 'Beverage', price: 130, stock: 'i5', per: 0.01, available: true },
    { id: 'p9', name: 'Club Burger', cat: 'Food', price: 320, stock: 'i6', per: 1, available: true },
    { id: 'p10', name: 'Chicken Sandwich', cat: 'Food', price: 290, stock: 'i7', per: 1, available: true },
    { id: 'p11', name: 'Fresh Pastry', cat: 'Food', price: 95, stock: 'i8', per: 1, available: true },
    { id: 'p12', name: 'Golf Glove', cat: 'Pro Shop', price: 1060, stock: 'i9', per: 1, available: true },
  ];
  const s = {
    v: 3, seq: 1000,
    settings: { tax: 0.07, overdueHours: 24, floatAmt: 5000, currency: 'PHP', idleMinutes: 10, att: { graceMin: 10, absentAfterMin: 120 } },
    holidays: [{ date: '2026-08-21', name: 'Ninoy Aquino Day' }, { date: '2026-08-31', name: 'National Heroes Day' }, { date: '2026-11-01', name: "All Saints' Day" }, { date: '2026-11-30', name: 'Bonifacio Day' }, { date: '2026-12-25', name: 'Christmas Day' }],
    roles: null, users, bays, members, players, inventory, products,
    tabs: [], sessions: [], sales: [], closeouts: [], approvals: [], moves: [], attendance: [], corrections: [], logins: [], audit: [],
  };
  genHistory(s, rand, todayStart, t);
  genToday(s, t);
  genClosingsAndApprovals(s, rand, todayStart, t);
  genAttendance(s, rand, todayStart, t);
  return s;
}

const FNB = ['p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11'];
function buildSale(s, lines, tender, tabId, disc, o = {}) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0), da = discAmount(subtotal, disc);
  const tax = r2((subtotal - da) * s.settings.tax), time = o.time || now();
  const cashier = o.cashier || ctx.actor?.id || 'system';
  return {
    id: 'r' + (++s.seq), time, iso: manilaISO(time), lines: lines.map(l => ({ name: l.name, cat: l.cat, price: l.price, qty: l.qty, ...(l.comp ? { comp: true, listPrice: l.listPrice } : {}) })),
    subtotal, discount: disc ? { ...disc, amount: da } : null, tax, total: r2(subtotal - da + tax), tender, tabId, playerId: o.playerId || null, memberId: o.memberId || null,
    cashier, cashierName: s.users?.find(u => u.id === cashier)?.name || cashier, refunded: null, edits: [],
    compValue: lines.reduce((a, l) => a + (l.comp ? (l.listPrice || 0) * l.qty : 0), 0),
  };
}
function histMove(s, name, qty, ts, ref, by) { const p = s.products.find(x => x.name === name); if (p?.stock) s.moves.push({ id: 'mv' + (++s.seq), ts, invId: p.stock, delta: -r2(p.per * qty), type: 'sale', ref, by, note: '' }); }

function genHistory(s, rand, todayStart, t) {
  const busy = {}; const cashiers = ['u_cashier1', 'u_cashier2'];
  const prod = id => s.products.find(p => p.id === id);
  const approver = 'u_admin';
  for (let d = 45; d >= 1; d--) {
    const dayTs = todayStart - d * D, dow = dowOf(dayTs + 12 * H), n = (dow === 0 || dow === 6) ? 6 + Math.floor(rand() * 5) : 3 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const hr = rand() < .45 ? 7 + rand() * 3 : rand() < .6 ? 15 + rand() * 3.5 : 10 + rand() * 5;
      const start = dayTs + Math.floor(hr * H / 60e3) * 60e3, dur = Math.floor(25 + rand() * 70) * 60e3, end = start + dur;
      const pl = wpick(rand, s.players, p => p.w);
      let bay = 0; for (let k = 0; k < 15 && !bay; k++) { const b = 1 + Math.floor(rand() * 15); if (!(busy[b] || []).some(([a, z]) => start < z && end > a)) bay = b; }
      if (!bay) continue; (busy[bay] = busy[bay] || []).push([start, end]);
      const att = hr < 12 ? 'u_attendant1' : 'u_attendant2', srv = hr < 12 ? 'u_server1' : 'u_server2';
      const cashier = rand() < (hr < 14 ? .7 : .25) ? 'u_cashier1' : 'u_cashier2';
      const bp = wpick(rand, ['p1', 'p2', 'p3'], x => ({ p1: .3, p2: .45, p3: .25 }[x]));
      const items = [{ ...mk(prod(bp)), qty: 1, addedAt: start, updatedAt: start, by: att }];
      if (rand() < .35) items[0].qty = 2, items[0].updatedAt = start + dur / 2;
      if (rand() < .55) { const k = 1 + Math.floor(rand() * 3); for (let j = 0; j < k; j++) { const p = prod(pick(rand, FNB)); const ex = items.find(x => x.name === p.name); const at = start + Math.floor(rand() * dur); if (ex) { ex.qty++; ex.updatedAt = at; } else items.push({ ...mk(p), qty: 1, addedAt: at, updatedAt: at, by: srv }); } }
      let comp = false; const fi = items.find(x => x.cat !== 'Range');
      if (fi && rand() < .06) { fi.listPrice = fi.price; fi.price = 0; fi.comp = true; comp = true; }
      const disc = rand() < .07 ? { type: 'pct', value: pick(rand, [5, 10, 10, 15]), reason: pick(rand, ['Member promo', 'Loyalty discount', 'Service recovery']), approvedBy: approver, approvedByName: 'Rosa Villanueva', at: end } : null;
      const tender = (() => { const r = rand(); return r < .4 ? 'cash' : r < .7 ? 'gcash' : r < .92 ? 'card' : (pl.memberId ? 'member' : 'card'); })();
      const tid = 't' + (++s.seq), paidAt = end + 3 * 60e3;
      const sale = buildSale(s, items, tender, tid, disc, { time: paidAt, cashier, playerId: pl.id, memberId: pl.memberId });
      if (rand() < .018) sale.refunded = { kind: rand() < .5 ? 'refund' : 'void', at: paidAt + 20 * 60e3, atISO: manilaISO(paidAt + 20 * 60e3), by: cashier, approvedBy: approver, reason: pick(rand, ['Customer complaint', 'Wrong order rung up', 'Duplicate charge']), amount: sale.total };
      s.sales.push(sale);
      s.tabs.push({ id: tid, player: pl.name, playerId: pl.id, memberId: pl.memberId, status: 'paid', created: start, createdISO: manilaISO(start), openedBy: att, bayId: bay, discount: disc, items, voids: [], paid: paidAt, paidISO: manilaISO(paidAt), saleId: sale.id });
      s.sessions.push({ id: 's' + (++s.seq), bayId: bay, player: pl.name, playerId: pl.id, tabId: tid, bucket: prod(bp).name, start, startISO: manilaISO(start), end: paidAt, endISO: manilaISO(paidAt), startedBy: att });
      items.forEach(x => { if (!x.comp) histMove(s, x.name, x.qty, x.addedAt, sale.id, x.by); else histMove(s, x.name, x.qty, x.addedAt, sale.id, x.by); });
      if (disc) s.approvals.push(mkApproval(s, 'discount', tid, `${pl.name}'s tab`, sale.subtotal * (disc.type === 'pct' ? disc.value / 100 : 0), cashier, disc.reason, { type: disc.type, value: disc.value }, 'approved', approver, end - 5 * 60e3, end));
      if (comp) s.approvals.push(mkApproval(s, 'comp', tid, `${pl.name}'s tab`, fi.listPrice * fi.qty, cashier, 'Complimentary — guest of management', { itemName: fi.name }, 'approved', approver, end - 8 * 60e3, end - 4 * 60e3));
      if (sale.refunded) s.approvals.push(mkApproval(s, 'refund', sale.id, `Receipt ${sale.id}`, sale.total, cashier, sale.refunded.reason, { kind: sale.refunded.kind }, 'approved', approver, sale.refunded.at - 6 * 60e3, sale.refunded.at));
    }
  }
  // weekly deliveries so inventory movement reconciles (receipts ≈ consumption)
  for (const inv of s.inventory) for (let w = 0; w < 7; w++) {
    const from = todayStart - (45 - w * 7) * D, to = from + 7 * D, used = -s.moves.filter(m => m.invId === inv.id && m.ts >= from && m.ts < to).reduce((a, m) => a + m.delta, 0);
    const q = Math.round(used * 100) / 100; if (q > 0) s.moves.push({ id: 'mv' + (++s.seq), ts: from + 9 * H, invId: inv.id, delta: Math.round(used), type: 'receive', ref: 'DEL-' + (w + 1), by: 'u_admin', note: 'Weekly delivery' });
  }
  function mk(p) { return { name: p.name, cat: p.cat, price: p.price }; }
}
function mkApproval(s, type, ref, refLabel, amount, by, reason, payload, status, decider, reqAt, decAt) {
  const u = id => s.users.find(x => x.id === id)?.name || id;
  return { id: 'ap' + (++s.seq), type, ref, refLabel, amount: r2(amount), requestedBy: by, requestedByName: u(by), requestedAt: reqAt, requestedISO: manilaISO(reqAt), reason, payload, status, direct: false,
    decidedBy: decider || null, decidedByName: decider ? u(decider) : null, decidedAt: decAt || null, decidedISO: decAt ? manilaISO(decAt) : null, decisionNote: status === 'approved' ? 'Approved' : '' };
}

function genToday(s, t) {
  const mkTab = (id, player, playerId, memberId, created, items, by, bayId) => ({ id, player, playerId, memberId, status: 'open', created, createdISO: manilaISO(created), openedBy: by, bayId: bayId || null, discount: null, voids: [], items: items.map(([name, cat, price, qty]) => ({ name, cat, price, qty, addedAt: created, updatedAt: created, by })) });
  const pid = n => s.players.find(p => p.name === n)?.id || null;
  s.tabs.push(
    mkTab('t1', 'Marcus Delaney', pid('Marcus Delaney'), 'm2', t - 3 * D, [['Large Bucket (110)', 'Range', 350, 2], ['Draft Beer', 'Beverage', 130, 3]], 'u_attendant1', null),
    mkTab('t2', 'Eleanor Whitfield', pid('Eleanor Whitfield'), 'm1', t - 2 * H, [['Medium Bucket (75)', 'Range', 250, 1], ['Latte', 'Beverage', 140, 1]], 'u_attendant1', 3),
    mkTab('t3', 'Guest – R. Chen', pid('Guest – R. Chen'), null, t - 30 * H, [['Club Burger', 'Food', 320, 1], ['Soda', 'Beverage', 65, 2]], 'u_cashier1', null),
    mkTab('t4', 'Priya Raman', pid('Priya Raman'), 'm3', t - 25 * 60e3, [['Small Bucket (40)', 'Range', 150, 1]], 'u_attendant2', 6),
    mkTab('t5', 'Sofia Alvarez', pid('Sofia Alvarez'), 'm5', t - 21 * 60e3, [['Medium Bucket (75)', 'Range', 250, 1], ['Bottled Water', 'Beverage', 40, 1]], 'u_attendant2', 13),
  );
  const sess = (id, bayId, tabId, player, bucket, mins, by) => { const start = t - mins * 60e3; return { id, bayId, player, playerId: s.players.find(p => p.name === player)?.id || null, tabId, bucket, start, startISO: manilaISO(start), end: null, startedBy: by }; };
  s.sessions.push(sess('s1', 3, 't2', 'Eleanor Whitfield', 'Medium Bucket (75)', 38, 'u_attendant1'), sess('s2', 6, 't4', 'Priya Raman', 'Small Bucket (40)', 25, 'u_attendant2'),
    sess('s3', 7, 't1', 'Marcus Delaney', 'Large Bucket (110)', 55, 'u_attendant1'), sess('s4', 13, 't5', 'Sofia Alvarez', 'Medium Bucket (75)', 21, 'u_attendant2'));
  s.tabs.find(x => x.id === 't1').bayId = 7;
  const sale = (time, lines, tender, cashier) => { const ls = lines.map(([name, cat, price, qty]) => ({ name, cat, price, qty })); const x = buildSale(s, ls, tender, null, null, { time, cashier }); s.sales.push(x); ls.forEach(l => histMove(s, l.name, l.qty, time, x.id, cashier)); return x; };
  const dayS = dayStart(t), early = t - 5 * H > dayS ? t - 5 * H : dayS + 3 * H;
  sale(Math.min(t - 60e3, early), [['Large Bucket (110)', 'Range', 350, 1], ['Bottled Water', 'Beverage', 40, 1]], 'card', 'u_cashier1');
  sale(Math.min(t - 60e3, early + H), [['Latte', 'Beverage', 140, 2], ['Fresh Pastry', 'Food', 95, 2]], 'cash', 'u_cashier1');
  sale(Math.min(t - 60e3, early + 2 * H), [['Club Burger', 'Food', 320, 1], ['Draft Beer', 'Beverage', 130, 1]], 'gcash', 'u_cashier2');
  sale(Math.min(t - 60e3, early + 3 * H), [['Medium Bucket (75)', 'Range', 250, 2]], 'cash', 'u_cashier2');
  s.bays.forEach(b => { if (b.status === 'occupied' && !s.sessions.some(x => !x.end && x.bayId === b.id)) b.status = 'available'; });
}

function genClosingsAndApprovals(s, rand, todayStart, t) {
  const U = id => s.users.find(u => u.id === id);
  for (let d = 45; d >= 1; d--) {
    const dayTs = todayStart - d * D, key = dayKey(dayTs + 12 * H);
    for (const cid of ['u_cashier1', 'u_cashier2']) {
      const ss = s.sales.filter(x => x.cashier === cid && dayKey(x.time) === key && !x.refunded);
      if (!ss.length) continue;
      const sum = tn => r2(ss.filter(x => x.tender === tn).reduce((a, x) => a + x.total, 0));
      const cash = sum('cash'), expected = r2(s.settings.floatAmt + cash);
      let variance = rand() < .78 ? 0 : pick(rand, [-150, -60, -20, 20, 45, 80, 120]);
      let status = variance ? 'approved' : 'ok';
      if (d === 1 && cid === 'u_cashier2') { variance = -120; status = 'pending_approval'; }
      const time = dayTs + 21 * H + 5 * 60e3, c = { id: 'c' + (++s.seq), cashier: cid, cashierName: U(cid).name, time, timeISO: manilaISO(time), date: key, expectedCash: expected, counted: r2(expected + variance), variance, cash, gcash: sum('gcash'), card: sum('card'), member: sum('member'), n: ss.length, refunds: 0, disc: r2(ss.reduce((a, x) => a + (x.discount?.amount || 0), 0)), float: s.settings.floatAmt, status, reason: variance ? (variance < 0 ? 'Short — change given in error' : 'Over — customer left change') : '' };
      if (variance) { const ap = mkApproval(s, 'cash_variance', c.id, `Closeout ${key} · ${U(cid).name}`, Math.abs(variance), cid, c.reason, { variance }, status === 'approved' ? 'approved' : 'pending', status === 'approved' ? 'u_admin' : null, time + 5 * 60e3, status === 'approved' ? time + 60 * 60e3 : null); c.approvalId = ap.id; s.approvals.push(ap); }
      s.closeouts.push(c);
    }
  }
  const t2 = s.tabs.find(x => x.id === 't2'), t3 = s.tabs.find(x => x.id === 't3'), x3 = s.sales.filter(x => dayKey(x.time) === dayKey(t) && x.cashier === 'u_cashier2').slice(-2)[0];
  s.approvals.push(mkApproval(s, 'discount', 't2', "Eleanor Whitfield's tab", 59.5, 'u_cashier1', 'Loyal member — 15% courtesy discount', { type: 'pct', value: 15 }, 'pending', null, t - 30 * 60e3, null));
  s.approvals.push(mkApproval(s, 'tab_close_unpaid', 't3', "Guest – R. Chen's tab", 450, 'u_cashier1', 'Guest left without paying; could not be reached', {}, 'pending', null, t - 90 * 60e3, null));
  if (x3) s.approvals.push(mkApproval(s, 'refund', x3.id, `Receipt ${x3.id}`, x3.total, 'u_cashier2', 'Customer complaint — order was cold', { kind: 'refund' }, 'pending', null, t - 20 * 60e3, null));
  s.approvals.push(mkApproval(s, 'comp', 't2', "Eleanor Whitfield's tab", 140, 'u_cashier1', 'Complimentary latte — birthday', { itemName: 'Latte' }, 'pending', null, t - 15 * 60e3, null));
  s.approvals.sort((a, b) => a.requestedAt - b.requestedAt);
}

function genAttendance(s, rand, todayStart, t) {
  const devs = { u_cashier1: 'Counter Tablet 1', u_cashier2: 'Counter Tablet 1', u_attendant1: 'Range Tablet', u_attendant2: 'Range Tablet', u_server1: 'Café Tablet', u_server2: 'Café Tablet', u_admin: 'Office PC' };
  const hol = new Set(s.holidays.map(h => h.date));
  const add = (u, date, rec) => s.attendance.push({ id: 'at' + (++s.seq), userId: u.id, date, timeIn: null, timeOut: null, breaks: [], remarks: '', status: null, device: devs[u.id], locked: false, history: [], ...rec });
  for (const u of s.users) {
    for (let d = 45; d >= 0; d--) {
      const dayTs = todayStart - d * D, date = dayKey(dayTs + 12 * H), dow = dowOf(dayTs + 12 * H);
      if (hol.has(date) || u.schedule.restDays.includes(dow)) continue;
      const st = manilaTs(date, u.schedule.start), en = manilaTs(date, u.schedule.end);
      if (d === 0) {
        if (t < st) continue;
        const inAt = Math.min(t - 60e3, st + Math.floor((rand() < .25 ? 18 : -4 + rand() * 8) * 60e3));
        const rec = { timeIn: inAt, timeInISO: manilaISO(inAt), breaks: [], remarks: '' };
        if (t >= en) { // shift already over: completed record
          rec.timeOut = Math.min(t - 60e3, en + Math.floor(rand() * 20) * 60e3); rec.timeOutISO = manilaISO(rec.timeOut);
          rec.breaks.push({ start: inAt + 4 * H, end: inAt + 4 * H + 50 * 60e3 });
        } else if (u.id === 'u_cashier2' || u.id === 'u_attendant2') { if (t - st > 3 * H) rec.breaks.push({ start: t - 15 * 60e3, end: null }); }
        else if (t - st > 4 * H) rec.breaks.push({ start: st + 4 * H, end: st + 4 * H + 50 * 60e3 });
        add(u, date, rec); continue;
      }
      const r = rand();
      if (r < .03) { add(u, date, { status: 'Absent', remarks: 'No call, no show', locked: true }); continue; }
      if (r < .06) { add(u, date, { status: 'Leave', remarks: 'Approved vacation leave', locked: true }); continue; }
      const late = rand() < .16, inAt = st + Math.floor((late ? 12 + rand() * 30 : -8 + rand() * 12) * 60e3);
      const o = rand(); let outAt = en + Math.floor((o < .10 ? -(70 + rand() * 40) : o < .24 ? 55 + rand() * 70 : -5 + rand() * 20) * 60e3);
      let status = null; if (rand() < .025) { outAt = inAt + 4.5 * H; status = 'Half Day'; }
      const bs = inAt + 4 * H + Math.floor(rand() * 20) * 60e3, bm = (45 + Math.floor(rand() * 16)) * 60e3;
      add(u, date, { timeIn: inAt, timeInISO: manilaISO(inAt), timeOut: outAt, timeOutISO: manilaISO(outAt), breaks: status ? [] : [{ start: bs, end: bs + bm }], status, remarks: '' });
    }
  }
  const find = (uid, back) => s.attendance.find(a => a.userId === uid && a.date === dayKey(todayStart - back * D + 12 * H) && a.timeIn);
  const c2 = find('u_cashier2', 3) || find('u_cashier2', 4);
  if (c2) s.corrections.push({ id: 'cr' + (++s.seq), userId: 'u_cashier2', date: c2.date, requested: { timeIn: '10:58' }, reason: 'Tablet was offline; clocked in verbally with the supervisor', note: 'Supervisor: Rosa V.', status: 'pending', requestedAt: t - 5 * H, requestedISO: manilaISO(t - 5 * H), decidedBy: null, decidedAt: null, decisionNote: '', before: null });
  const a1 = find('u_server1', 6);
  if (a1) { const before = { timeIn: a1.timeIn, timeOut: a1.timeOut, status: a1.status, breakMin: 50 }, newOut = manilaTs(a1.date, '16:30'); a1.history.push({ at: t - 5 * D, by: 'u_admin', type: 'correction', before, after: { timeOut: newOut }, reason: 'Forgot to clock out' }); a1.timeOut = newOut; a1.timeOutISO = manilaISO(newOut); a1.locked = true; a1.corrected = true;
    s.corrections.push({ id: 'cr' + (++s.seq), userId: 'u_server1', date: a1.date, requested: { timeOut: '16:30' }, reason: 'Forgot to clock out', note: '', status: 'approved', requestedAt: t - 6 * D, requestedISO: manilaISO(t - 6 * D), decidedBy: 'u_admin', decidedByName: 'Rosa Villanueva', decidedAt: t - 5 * D, decidedISO: manilaISO(t - 5 * D), decisionNote: 'Verified with CCTV', before }); }
  const a2 = find('u_attendant1', 9);
  if (a2) s.corrections.push({ id: 'cr' + (++s.seq), userId: 'u_attendant1', date: a2.date, requested: { timeOut: '12:00' }, reason: 'Left early without approval request', note: '', status: 'rejected', requestedAt: t - 9 * D, requestedISO: manilaISO(t - 9 * D), decidedBy: 'u_admin', decidedByName: 'Rosa Villanueva', decidedAt: t - 8 * D, decidedISO: manilaISO(t - 8 * D), decisionNote: 'Not supported by the shift log', before: null });
}

// ---------- state ----------
let state;
function seedAndLog() { const s = seed(); log(s, 'system', 'Demo data loaded: 7 staff accounts, 45 days of sample visits, sales and attendance', { id: 'system', name: 'System', role: 'system' }); return s; }
const subs = new Set();
export const get = () => state;
export const subscribe = f => subs.add(f);
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('persist failed', e); } }
export function commit(fn) { fn(state); persist(); subs.forEach(f => f()); }
export const save = persist;
export function init() { // called once by app.js after roles are available
  persist();
}
export function resetOperational(defaultRoles) {
  const keep = { users: state.users, roles: state.roles, audit: state.audit, logins: state.logins, settings: state.settings, holidays: state.holidays };
  const fresh = seed(); Object.assign(fresh, keep); fresh.roles = state.roles || defaultRoles;
  state = fresh; persist(); subs.forEach(f => f());
}

// ---------- audit trail: append-only, hash-chained ----------
export function log(s, type, msg, actor = ctx.actor) {
  const ts = now(), a = actor || { id: 'system', name: 'System', role: 'system' }, seq = s.audit.length + 1;
  const prev = s.audit.length ? s.audit[s.audit.length - 1].hash : 'GENESIS';
  const e = { id: 'a' + seq, seq, ts, iso: manilaISO(ts), type, userId: a.id, user: a.name, role: a.role, sessionId: a.sessionId || null, device: a.device || null, msg, prev };
  e.hash = sha256([prev, seq, ts, type, a.id, a.sessionId || '', msg].join('|'));
  s.audit.push(Object.freeze(e));
  return e;
}
export function verifyAudit(s = state) {
  let prev = 'GENESIS';
  for (let i = 0; i < s.audit.length; i++) {
    const e = s.audit[i];
    if (e.prev !== prev || e.seq !== i + 1 || e.hash !== sha256([e.prev, e.seq, e.ts, e.type, e.userId, e.sessionId || '', e.msg].join('|'))) return { ok: false, brokenAt: i + 1, total: s.audit.length };
    prev = e.hash;
  }
  return { ok: true, total: s.audit.length };
}

// ---------- formatting (PHP) ----------
const nf = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = n => { const v = Math.round((+n || 0) * 100) / 100; return (v < 0 ? '-' : '') + '₱' + nf.format(Math.abs(v)); };
export const price = n => { const v = +n || 0; return Number.isInteger(v) ? (v < 0 ? '-' : '') + '₱' + Math.abs(v).toLocaleString('en-PH') : money(v); };
export const num = n => (+n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
export const hrs = min => (Math.round(min / 60 * 100) / 100).toFixed(2) + ' h';
export const durFmt = min => { const m = Math.round(min); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

const fmt = (t, o) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o }).format(new Date(t));
export const fmtTime = t => fmt(t, { hour: 'numeric', minute: '2-digit' });
export const fmtDate = t => fmt(t, { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtDT = t => t ? `${fmtDate(t)}, ${fmtTime(t)}` : '—';
export const longDate = t => fmt(t, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const fmtKey = k => fmtDate(manilaTs(k, '12:00'));

// ---------- helpers ----------
export const discAmount = (sub, d) => (d ? r2(d.type === 'pct' ? sub * Math.min(100, d.value) / 100 : Math.min(sub, d.value)) : 0);
export const tabGross = tb => tb.items.reduce((a, i) => a + i.price * i.qty, 0);
export const tabTotal = tb => tabGross(tb) - discAmount(tabGross(tb), tb.discount);
export const isOverdue = tb => tb.status === 'open' && now() - tb.created > state.settings.overdueHours * H;
export const stockLevel = i => (i.qty <= 0 ? 'out' : i.qty <= i.critical ? 'critical' : i.qty < i.par * 0.5 ? 'low' : 'ok');
export const elapsed = t => { const m = Math.max(0, Math.floor((now() - t) / 60e3)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
export const userById = id => state.users.find(u => u.id === id);
export const userName = id => userById(id)?.name || (id === 'system' ? 'System' : id || '—');
export const saleNet = x => (x.refunded ? 0 : x.total);

export function deduct(s, name, qty, ref = '', type = 'sale') {
  const p = s.products.find(x => x.name === name);
  if (!p || !p.stock) return;
  const inv = s.inventory.find(i => i.id === p.stock); if (!inv) return;
  const before = inv.qty; inv.qty = Math.max(0, +(inv.qty - p.per * qty).toFixed(3));
  s.moves.push({ id: 'mv' + (++s.seq), ts: now(), invId: inv.id, delta: +(inv.qty - before).toFixed(3), type, ref, by: ctx.actor?.id || 'system', note: '' });
}
export function restock(s, name, qty, ref = '', type = 'void') {
  const p = s.products.find(x => x.name === name); if (!p?.stock) return;
  const inv = s.inventory.find(i => i.id === p.stock); if (!inv) return;
  inv.qty = +(inv.qty + p.per * qty).toFixed(3);
  s.moves.push({ id: 'mv' + (++s.seq), ts: now(), invId: inv.id, delta: +(p.per * qty).toFixed(3), type, ref, by: ctx.actor?.id || 'system', note: '' });
}
export function makeSale(s, lines, tender, tabId = null, disc = null, o = {}) {
  const sale = buildSale(s, lines, tender, tabId, disc, o);
  s.sales.push(sale);
  log(s, 'payment', `${tender.toUpperCase()} payment ${money(sale.total)} (receipt ${sale.id})${tabId ? ' · tab settlement' : ' · walk-in sale'}`);
  if (sale.discount?.amount) log(s, 'discount', `Discount ${money(sale.discount.amount)} applied to receipt ${sale.id} — ${disc.reason} (approved by ${disc.approvedByName || disc.approvedBy})`);
  return sale;
}
export function mkApprovalRecord(s, type, ref, refLabel, amount, reason, payload) {
  const a = ctx.actor, ts = now();
  return { id: 'ap' + (++s.seq), type, ref, refLabel, amount: r2(amount), requestedBy: a.id, requestedByName: a.name, requestedAt: ts, requestedISO: manilaISO(ts), reason, payload, status: 'pending', direct: false, decidedBy: null, decidedByName: null, decidedAt: null, decidedISO: null, decisionNote: '' };
}
export { randomSalt, hashSecret };

// ---------- boot (runs last so every helper above is initialised) ----------
try { state = JSON.parse(localStorage.getItem(KEY)) || seedAndLog(); } catch { state = seedAndLog(); }
state.bays = state.bays.filter(b => b.id >= 1 && b.id <= BAY_COUNT);
state.settings.currency = 'PHP';
persist();
