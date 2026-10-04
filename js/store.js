const KEY = 'ccc-ops-v2'; // v2: 15 bays, PHP currency, Manila-time audit trail (resets older demo data)
export const BAY_COUNT = 15;
export const TZ = 'Asia/Manila'; // UTC+8, no DST
const H = 3600e3, D = 24 * H, TZ_OFFSET = 8 * H;
const now = () => Date.now();
const r2 = n => +(+n).toFixed(2);
export const ctx = { user: 'System' };

// ISO-8601 string in Manila local time (e.g. 2026-10-04T13:51:00.000+08:00) for unambiguous storage.
export const manilaISO = t => new Date(t + TZ_OFFSET).toISOString().replace('Z', '+08:00');

function seed() {
  const t = now();
  const bays = Array.from({ length: BAY_COUNT }, (_, i) => ({ id: i + 1, status: 'available', note: '' }));
  [3, 6, 7, 13].forEach(n => { bays[n - 1].status = 'occupied'; });
  [11, 12].forEach(n => { bays[n - 1].status = 'reserved'; });
  bays[13].status = 'maintenance'; // Bay 14
  const members = [
    { id: 'm1', name: 'Eleanor Whitfield', tier: 'Full Golf', phone: '555-0141', email: 'e.whitfield@example.com' },
    { id: 'm2', name: 'Marcus Delaney', tier: 'Full Golf', phone: '555-0172', email: 'm.delaney@example.com' },
    { id: 'm3', name: 'Priya Raman', tier: 'Social', phone: '555-0109', email: 'p.raman@example.com' },
    { id: 'm4', name: 'Tom Hargrove', tier: 'Junior', phone: '555-0190', email: 't.hargrove@example.com' },
    { id: 'm5', name: 'Sofia Alvarez', tier: 'Corporate', phone: '555-0166', email: 's.alvarez@example.com' },
  ];
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
  const tab = (id, player, memberId, created, items) => ({ id, player, memberId, status: 'open', created, discount: null, items: items.map(([name, cat, price, qty]) => ({ name, cat, price, qty, addedAt: created, updatedAt: created })) });
  const tabs = [
    tab('t1', 'Marcus Delaney', 'm2', t - 3 * D, [['Large Bucket (110)', 'Range', 350, 2], ['Draft Beer', 'Beverage', 130, 3]]),
    tab('t2', 'Eleanor Whitfield', 'm1', t - 2 * H, [['Medium Bucket (75)', 'Range', 250, 1], ['Latte', 'Beverage', 140, 1]]),
    tab('t3', 'Guest – R. Chen', null, t - 30 * H, [['Club Burger', 'Food', 320, 1], ['Soda', 'Beverage', 65, 2]]),
  ];
  const sessions = [
    { id: 's1', bayId: 3, player: 'Eleanor Whitfield', tabId: 't2', bucket: 'Medium Bucket (75)', start: t - 38 * 60e3, end: null },
    { id: 's2', bayId: 6, player: 'Walk-in', tabId: null, bucket: 'Small Bucket (40)', start: t - 12 * 60e3, end: null },
    { id: 's3', bayId: 7, player: 'Marcus Delaney', tabId: 't1', bucket: 'Large Bucket (110)', start: t - 55 * 60e3, end: null },
    { id: 's4', bayId: 13, player: 'Sofia Alvarez', tabId: null, bucket: 'Medium Bucket (75)', start: t - 21 * 60e3, end: null },
  ].map(s => ({ ...s, startISO: manilaISO(s.start) }));
  const sale = (id, time, lines, tender) => {
    const ls = lines.map(([name, cat, price, qty]) => ({ name, cat, price, qty }));
    const subtotal = ls.reduce((a, l) => a + l.price * l.qty, 0), tax = r2(subtotal * 0.07);
    return { id, time, iso: manilaISO(time), lines: ls, subtotal, discount: null, tax, total: r2(subtotal + tax), tender, tabId: null, voided: false };
  };
  const sales = [
    sale('x1', t - 5 * H, [['Large Bucket (110)', 'Range', 350, 1], ['Bottled Water', 'Beverage', 40, 1]], 'card'),
    sale('x2', t - 4 * H, [['Latte', 'Beverage', 140, 2], ['Fresh Pastry', 'Food', 95, 2]], 'cash'),
    sale('x3', t - 3 * H, [['Club Burger', 'Food', 320, 1], ['Draft Beer', 'Beverage', 130, 1]], 'card'),
    sale('x4', t - 1 * H, [['Medium Bucket (75)', 'Range', 250, 2]], 'cash'),
  ];
  return {
    settings: { tax: 0.07, overdueHours: 24, cashier: 'Front Counter', floatAmt: 5000, currency: 'PHP', varianceLimit: 100 },
    bays, members, inventory, products, tabs, sessions, sales, closeouts: [], audit: [], seq: 100,
  };
}

let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { state = seed(); }
// Safety net: the range has exactly 15 bays.
state.bays = state.bays.filter(b => b.id >= 1 && b.id <= BAY_COUNT);
state.settings.currency = 'PHP';
const subs = new Set();
export const get = () => state;
export const subscribe = f => subs.add(f);
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
persist();
export function commit(fn) { fn(state); persist(); subs.forEach(f => f()); }
export function resetDemo() { state = seed(); persist(); subs.forEach(f => f()); }

// ---- audit trail: every entry carries an epoch (UTC) and a Manila-time ISO string ----
export function log(s, type, msg) {
  const ts = now();
  s.audit.push({ id: 'a' + (++s.seq), ts, iso: manilaISO(ts), type, user: ctx.user, msg });
  if (s.audit.length > 1000) s.audit.splice(0, s.audit.length - 1000);
}

// ---- formatting (PHP) ----
const nf = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Totals and balances: ₱31,450.00
export const money = n => { const v = Math.round((+n || 0) * 100) / 100; return (v < 0 ? '-' : '') + '₱' + nf.format(Math.abs(v)); };
// Unit/list prices: ₱180, ₱1,060 (decimals only when needed)
export const price = n => { const v = +n || 0; return Number.isInteger(v) ? (v < 0 ? '-' : '') + '₱' + Math.abs(v).toLocaleString('en-PH') : money(v); };

// ---- Manila time ----
const fmt = (t, o) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o }).format(new Date(t));
export const fmtTime = t => fmt(t, { hour: 'numeric', minute: '2-digit' });
export const fmtDate = t => fmt(t, { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtDT = t => `${fmtDate(t)}, ${fmtTime(t)}`;
export const longDate = t => fmt(t, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); // Saturday, October 4, 2026
export const startOfDay = () => Math.floor((now() + TZ_OFFSET) / D) * D - TZ_OFFSET; // Manila midnight

// ---- helpers ----
export const tabGross = tb => tb.items.reduce((a, i) => a + i.price * i.qty, 0);
export const discAmount = (sub, d) => (d ? r2(d.type === 'pct' ? sub * Math.min(100, d.value) / 100 : Math.min(sub, d.value)) : 0);
export const tabTotal = tb => tabGross(tb) - discAmount(tabGross(tb), tb.discount); // net of discount, before tax
export const isOverdue = tb => tb.status === 'open' && now() - tb.created > state.settings.overdueHours * H;
export const stockLevel = i => (i.qty <= i.critical ? 'critical' : i.qty < i.par * 0.5 ? 'low' : 'ok');
export const todaySales = () => state.sales.filter(s => s.time >= startOfDay() && !s.voided);
export const elapsed = t => { const m = Math.max(0, Math.floor((now() - t) / 60e3)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

export function deduct(s, name, qty) {
  const p = s.products.find(x => x.name === name);
  if (!p || !p.stock) return;
  const inv = s.inventory.find(i => i.id === p.stock);
  if (inv) inv.qty = Math.max(0, +(inv.qty - p.per * qty).toFixed(3));
}
export function makeSale(s, lines, tender, tabId = null, disc = null) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0), da = discAmount(subtotal, disc);
  const tax = r2((subtotal - da) * s.settings.tax), time = now();
  const sale = {
    id: 'r' + (++s.seq), time, iso: manilaISO(time), lines: lines.map(l => ({ name: l.name, cat: l.cat, price: l.price, qty: l.qty })),
    subtotal, discount: disc ? { ...disc, amount: da } : null, tax, total: r2(subtotal - da + tax), tender, tabId, voided: false,
  };
  s.sales.push(sale);
  log(s, 'payment', `${tender.toUpperCase()} payment ${money(sale.total)} (receipt ${sale.id})${tabId ? ' · tab settlement' : ''}`);
  if (da) log(s, 'discount', `Discount ${money(da)} applied to receipt ${sale.id} — ${disc.reason} (approved by ${disc.approvedBy})`);
  return sale;
}
