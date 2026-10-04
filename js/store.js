const KEY = 'ccc-ops-v1';
const H = 3600e3, D = 24 * H;
const now = () => Date.now();

function seed() {
  const t = now();
  const bays = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, status: 'available', note: '' }));
  bays[2].status = 'occupied'; bays[5].status = 'occupied'; bays[6].status = 'occupied';
  bays[10].status = 'reserved'; bays[11].status = 'reserved'; bays[19].status = 'maintenance'; bays[20].status = 'occupied';
  const members = [
    { id: 'm1', name: 'Eleanor Whitfield', tier: 'Full Golf', phone: '555-0141', email: 'e.whitfield@example.com' },
    { id: 'm2', name: 'Marcus Delaney', tier: 'Full Golf', phone: '555-0172', email: 'm.delaney@example.com' },
    { id: 'm3', name: 'Priya Raman', tier: 'Social', phone: '555-0109', email: 'p.raman@example.com' },
    { id: 'm4', name: 'Tom Hargrove', tier: 'Junior', phone: '555-0190', email: 't.hargrove@example.com' },
    { id: 'm5', name: 'Sofia Alvarez', tier: 'Corporate', phone: '555-0166', email: 's.alvarez@example.com' },
  ];
  const inventory = [
    { id: 'i1', name: 'Range balls (cases)', unit: 'case', qty: 14, par: 20, critical: 6 },
    { id: 'i2', name: 'Coffee beans', unit: 'lb', qty: 18, par: 25, critical: 8 },
    { id: 'i3', name: 'Bottled water', unit: 'btl', qty: 96, par: 120, critical: 36 },
    { id: 'i4', name: 'Soda cans', unit: 'can', qty: 60, par: 144, critical: 48 },
    { id: 'i5', name: 'Draft beer (kegs)', unit: 'keg', qty: 2, par: 4, critical: 1 },
    { id: 'i6', name: 'Burger patties', unit: 'ea', qty: 22, par: 60, critical: 20 },
    { id: 'i7', name: 'Chicken sandwiches', unit: 'ea', qty: 30, par: 40, critical: 12 },
    { id: 'i8', name: 'Pastries', unit: 'ea', qty: 9, par: 24, critical: 8 },
    { id: 'i9', name: 'Golf gloves', unit: 'ea', qty: 12, par: 12, critical: 3 },
  ];
  const products = [
    { id: 'p1', name: 'Small Bucket (40)', cat: 'Range', price: 8, stock: 'i1', per: 0.04, available: true },
    { id: 'p2', name: 'Medium Bucket (75)', cat: 'Range', price: 12, stock: 'i1', per: 0.075, available: true },
    { id: 'p3', name: 'Large Bucket (110)', cat: 'Range', price: 16, stock: 'i1', per: 0.11, available: true },
    { id: 'p4', name: 'Drip Coffee', cat: 'Beverage', price: 3, stock: 'i2', per: 0.03, available: true },
    { id: 'p5', name: 'Latte', cat: 'Beverage', price: 5, stock: 'i2', per: 0.04, available: true },
    { id: 'p6', name: 'Bottled Water', cat: 'Beverage', price: 2, stock: 'i3', per: 1, available: true },
    { id: 'p7', name: 'Soda', cat: 'Beverage', price: 2.5, stock: 'i4', per: 1, available: true },
    { id: 'p8', name: 'Draft Beer', cat: 'Beverage', price: 7, stock: 'i5', per: 0.01, available: true },
    { id: 'p9', name: 'Club Burger', cat: 'Food', price: 14, stock: 'i6', per: 1, available: true },
    { id: 'p10', name: 'Chicken Sandwich', cat: 'Food', price: 13, stock: 'i7', per: 1, available: true },
    { id: 'p11', name: 'Fresh Pastry', cat: 'Food', price: 4, stock: 'i8', per: 1, available: true },
    { id: 'p12', name: 'Golf Glove', cat: 'Pro Shop', price: 24, stock: 'i9', per: 1, available: true },
  ];
  const tabs = [
    { id: 't1', player: 'Marcus Delaney', memberId: 'm2', status: 'open', created: t - 3 * D, items: [{ name: 'Large Bucket (110)', cat: 'Range', price: 16, qty: 2 }, { name: 'Draft Beer', cat: 'Beverage', price: 7, qty: 3 }] },
    { id: 't2', player: 'Eleanor Whitfield', memberId: 'm1', status: 'open', created: t - 2 * H, items: [{ name: 'Medium Bucket (75)', cat: 'Range', price: 12, qty: 1 }, { name: 'Latte', cat: 'Beverage', price: 5, qty: 1 }] },
    { id: 't3', player: 'Guest – R. Chen', memberId: null, status: 'open', created: t - 30 * H, items: [{ name: 'Club Burger', cat: 'Food', price: 14, qty: 1 }, { name: 'Soda', cat: 'Beverage', price: 2.5, qty: 2 }] },
  ];
  const sessions = [
    { id: 's1', bayId: 3, player: 'Eleanor Whitfield', tabId: 't2', bucket: 'Medium Bucket (75)', start: t - 38 * 60e3, end: null },
    { id: 's2', bayId: 6, player: 'Walk-in', tabId: null, bucket: 'Small Bucket (40)', start: t - 12 * 60e3, end: null },
    { id: 's3', bayId: 7, player: 'Marcus Delaney', tabId: 't1', bucket: 'Large Bucket (110)', start: t - 55 * 60e3, end: null },
    { id: 's4', bayId: 21, player: 'Sofia Alvarez', tabId: null, bucket: 'Medium Bucket (75)', start: t - 21 * 60e3, end: null },
  ];
  const sales = [
    mk('x1', t - 5 * H, [['Large Bucket (110)', 'Range', 16, 1], ['Bottled Water', 'Beverage', 2, 1]], 'card'),
    mk('x2', t - 4 * H, [['Latte', 'Beverage', 5, 2], ['Fresh Pastry', 'Food', 4, 2]], 'cash'),
    mk('x3', t - 3 * H, [['Club Burger', 'Food', 14, 1], ['Draft Beer', 'Beverage', 7, 1]], 'card'),
    mk('x4', t - 1 * H, [['Medium Bucket (75)', 'Range', 12, 2]], 'cash'),
  ];
  return { settings: { tax: 0.07, overdueHours: 24, cashier: 'Front Counter', floatAmt: 200 }, bays, members, inventory, products, tabs, sessions, sales, closeouts: [], seq: 100 };
}
function mk(id, time, lines, tender) {
  const ls = lines.map(([name, cat, price, qty]) => ({ name, cat, price, qty }));
  const subtotal = ls.reduce((a, l) => a + l.price * l.qty, 0);
  const tax = +(subtotal * 0.07).toFixed(2);
  return { id, time, lines: ls, subtotal, tax, total: +(subtotal + tax).toFixed(2), tender, tabId: null, voided: false };
}

let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { state = seed(); }
const subs = new Set();
export const get = () => state;
export const subscribe = f => subs.add(f);
export function commit(fn) {
  fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  subs.forEach(f => f());
}
export const uid = p => { let n; commit(s => { n = ++s.seq; }); return p + n; };
export function resetDemo() { state = seed(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} subs.forEach(f => f()); }

// ---- helpers ----
export const money = n => (n < 0 ? '-$' : '$') + Math.abs(+n).toFixed(2);
export const tabTotal = tb => tb.items.reduce((a, i) => a + i.price * i.qty, 0);
export const isOverdue = tb => tb.status === 'open' && now() - tb.created > state.settings.overdueHours * H;
export const stockLevel = i => (i.qty <= i.critical ? 'critical' : i.qty < i.par * 0.5 ? 'low' : 'ok');
export const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const todaySales = () => state.sales.filter(s => s.time >= startOfDay() && !s.voided);
export const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDate = t => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
export const elapsed = t => { const m = Math.max(0, Math.floor((now() - t) / 60e3)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

export function deduct(s, name, qty) {
  const p = s.products.find(x => x.name === name);
  if (!p || !p.stock) return;
  const inv = s.inventory.find(i => i.id === p.stock);
  if (inv) inv.qty = Math.max(0, +(inv.qty - p.per * qty).toFixed(3));
}
export function makeSale(s, lines, tender, tabId = null) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const tax = +(subtotal * s.settings.tax).toFixed(2);
  const sale = { id: 'r' + (++s.seq), time: now(), lines: lines.map(l => ({ ...l })), subtotal, tax, total: +(subtotal + tax).toFixed(2), tender, tabId, voided: false };
  s.sales.push(sale);
  return sale;
}
