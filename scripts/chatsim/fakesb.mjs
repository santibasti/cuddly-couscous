// An in-memory stand-in for Supabase, just enough for chat-brain. Test only.
export const DB = {};
export const flags = { noMigration: false, crashBeforeAnswer: false };   // simulates a database where migration 0133 has not been applied
let seq = 0; const now = () => new Date(Date.now() + (seq++)).toISOString();
const uid = () => `id-${++seq}`;
const T = (n) => (DB[n] ??= []);
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.ord = null; this.lim = null; this.one = null; this.opts = {}; this.sel = null; }
  select(cols, opts = {}) { if (flags.noMigration && /context/.test(String(cols))) this.err = { message: 'column context does not exist' }; if (this.op === 'select') { this.opts = opts; } this.sel = cols; return this; }
  insert(r) { this.op = 'insert'; this.pl = r; return this; }
  update(p) { this.op = 'update'; this.pl = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(k, v) { this.f.push((r) => r[k] === v); return this; }
  is(k, v) { if (flags.noMigration && k === 'handled_at') this.err = { message: 'column chat_messages.handled_at does not exist' }; this.f.push((r) => (v === null ? r[k] == null : r[k] === v)); return this; }
  in(k, a) { this.f.push((r) => a.includes(r[k])); return this; }
  not(k, op, v) { if (op === 'in') { const a = String(v).replace(/[()"]/g, '').split(','); this.f.push((r) => !a.includes(r[k])); } else if (op === 'is' && v === null) this.f.push((r) => r[k] != null); return this; }
  lt(k, v) { this.f.push((r) => r[k] < v); return this; }
  gte(k, v) { this.f.push((r) => r[k] >= v); return this; }
  lte(k, v) { this.f.push((r) => r[k] <= v); return this; }
  or() { return this; }
  not_(k) { return this; }
  order(k, o = {}) { this.ord = [k, o.ascending !== false]; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
  run() {
    if (this.err) return { data: null, error: this.err };
    const rows = T(this.t);
    if (this.op === 'insert') {
      const list = Array.isArray(this.pl) ? this.pl : [this.pl]; const out = [];
      for (const r of list) {
        if (this.t === 'chat_conversations' && rows.some((x) => x.channel === r.channel && x.subscriber_id === r.subscriber_id)) return { data: null, error: { code: '23505', message: 'duplicate' } };
        if (this.t === 'chat_messages' && r.external_id && rows.some((x) => x.conversation_id === r.conversation_id && x.external_id === r.external_id)) return { data: null, error: { code: '23505', message: 'duplicate key chat_messages_external' } };
        const row = { id: uid(), created_at: now(), ...r }; if (this.t === 'chat_conversations') Object.assign(row, { status: 'Open', returning_customer: false, context: {}, busy_until: null, ...r, created_at: row.created_at }); if (this.t === 'chat_messages' && row.direction === 'in') row.handled_at = row.handled_at ?? null; rows.push(row); out.push(row);
      }
      return this.one ? { data: out[0], error: null } : { data: this.sel ? out : null, error: null };
    }
    let m = rows.filter((r) => this.f.every((fn) => fn(r)));
    if (this.op === 'update') { m.forEach((r) => Object.assign(r, this.pl)); return { data: null, error: null }; }
    if (this.ord) { const [k, asc] = this.ord; m = [...m].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1)); }
    if (this.lim != null) m = m.slice(0, this.lim);
    if (this.opts.head) return { data: null, count: m.length, error: null };
    if (this.one) return { data: m[0] ?? null, error: null };
    return { data: m.map((r) => ({ ...r })), count: m.length, error: null };
  }
}
// the two lock functions of migration 0133
const rpc = async (name, a) => {
  if (flags.noMigration) return { data: null, error: { message: 'function does not exist' } };
  if (name === 'chat_lock') { const c = T('chat_conversations').find((x) => x.id === a.p_conv); const t = Date.now(); if (!c) return { data: false, error: null }; if (c.busy_until && c.busy_until > t) return { data: false, error: null }; c.busy_until = t + (a.p_secs ?? 90) * 1000; return { data: true, error: null }; }
  if (name === 'chat_answer') { if (flags.crashBeforeAnswer) throw new Error('worker crashed before saving the answer'); const row = { id: uid(), created_at: now(), direction: 'out', ...a.p_row }; T('chat_messages').push(row); for (const m of T('chat_messages')) if (a.p_ids.includes(m.id) && m.direction === 'in' && !m.handled_at) m.handled_at = now(); return { data: row.id, error: null }; }
  if (name === 'chat_clients_by_mobile') { const d = (x) => String(x ?? '').replace(/\D/g, '').slice(-10); return { data: T('clients').filter((c) => !c.deleted_at && d(c.mobile).length === 10 && d(c.mobile) === d(a.p_mobile)).slice(0, 5).map((c) => ({ id: c.id, name: c.name, mobile: c.mobile })), error: null }; }
  if (name === 'can_manage_inbox') return { data: true, error: null };
  if (name === 'chat_unlock') { const c = T('chat_conversations').find((x) => x.id === a.p_conv); if (c) c.busy_until = null; return { data: null, error: null }; }
  return { data: null, error: { message: `unknown function ${name}` } };
};
export const createClient = () => ({ from: (t) => new Q(t), rpc, auth: { getUser: async () => ({ data: { user: { id: 'staff-1' } } }) } });
