// Quotation helper for a client we have served before: previous bills (in the system, and ones entered by hand from before it started), "repeat this" in one tap,
// and a one-tap thank-you line (with the last bill) for the quotation's introduction.
import { useAuth } from '@/lib/store';
import { Badge, Card } from '@/components/ui';
import { docTotals, invoiceTotals } from '@/lib/business';
import { fmtDate, money } from '@/lib/util';
import type { QuoteItem } from '@/lib/types';

export interface RepeatSource { label: string; items: QuoteItem[]; scope?: string; payment_option?: string }

export function RepeatClientCard({ clientId, currentId, readOnly, hasItems, onRepeat, onMention }: { clientId: string; currentId?: string; readOnly: boolean; hasItems: boolean; onRepeat: (s: RepeatSource) => void; onMention: (text: string) => void }) {
  const { db } = useAuth();
  const client = db.clients.find((c) => c.id === clientId);
  const quotes = db.quotations.filter((q) => q.client_id === clientId && q.id !== currentId && !q.deleted_at && q.status === 'Approved').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const invoices = db.invoices.filter((i) => i.client_id === clientId && !i.deleted_at && i.status === 'Approved');
  const past = [...(client?.past_bills ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  if (!client || (!quotes.length && !invoices.length && !past.length && !client.vip)) return null;
  // the latest bill overall: from the system or from before it
  const bills = [...invoices.map((i) => ({ date: i.issue_date, ref: i.number, total: invoiceTotals(i).total })), ...past.map((p) => ({ date: p.date, ref: p.ref, total: p.total }))].sort((a, b) => b.date.localeCompare(a.date));
  const last = bills[0];
  const names = (items: QuoteItem[]) => [...new Set(items.map((i) => db.services.find((s) => s.code === i.service_code)?.name ?? i.service_code))].join(', ');
  const lastLine = last ? `Thank you for choosing TopMop again. Your last service was billed on ${fmtDate(last.date)}${last.ref ? ` (${last.ref})` : ''} for ${money(last.total)}.` : quotes[0] ? `Thank you for choosing TopMop again. Your last approved quotation was ${quotes[0].number} dated ${fmtDate(quotes[0].created_at.slice(0, 10))}.` : '';
  const row = (key: string, head: React.ReactNode, sub: string, src: RepeatSource | null) => (
    <div key={key} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 220 }}>{head}{sub && <div className="small muted">{sub}</div>}</div>
      {!readOnly && src && <button type="button" className="btn sm navy" onClick={() => { if (!hasItems || confirm('Replace the line items below with the ones from this one?')) onRepeat(src); }}>Repeat this</button>}
    </div>
  );
  return (
    <Card title={<span className="row" style={{ gap: 8 }}>{client.vip ? <Badge tone="amber">⭐ VIP client</Badge> : null}<span>Repeat client</span></span>} actions={<span className="small muted">{bills.length} bill{bills.length === 1 ? '' : 's'} on record · {quotes.length} approved quotation{quotes.length === 1 ? '' : 's'}</span>}>
      <div className="stack">
        {client.vip && client.vip_note && <div className="alert info">⭐ VIP note: {client.vip_note}</div>}
        {last && <div className="small"><b>Last bill:</b> {fmtDate(last.date)}{last.ref ? ` · ${last.ref}` : ''} · <b>{money(last.total)}</b></div>}
        {quotes.slice(0, 3).map((q) => row(q.id, <><b>{q.number}</b> · {fmtDate(q.created_at.slice(0, 10))} · <b>{money(docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total)}</b></>, names(q.items), { label: q.number, items: q.items, scope: q.scope, payment_option: q.payment_option }))}
        {past.slice(0, 3).map((p) => row(p.id, <><b>Before the system</b> · {fmtDate(p.date)}{p.ref ? ` · ${p.ref}` : ''} · <b>{money(p.total)}</b></>, p.items.length ? names(p.items) : (p.notes || 'No line items entered'), p.items.length ? { label: `the bill of ${fmtDate(p.date)}`, items: p.items } : null))}
        {!readOnly && lastLine && <div><button type="button" className="btn sm" onClick={() => onMention(lastLine)}>＋ Add a thank-you with the last bill to the introduction</button></div>}
        <div className="small muted">“Repeat” copies the services, quantities and rates; change them in the table if prices or the job have changed. Bills from before the system are added on the client's page (Overview → Previous bills).</div>
      </div>
    </Card>
  );
}
