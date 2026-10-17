// Quotation helper for a client we have served before: the previous bills and quotations at a glance, "repeat this quotation" in one tap,
// and a one-tap thank-you line (with the last bill) for the quotation's introduction.
import { useAuth } from '@/lib/store';
import { Badge, Card } from '@/components/ui';
import { docTotals, invoiceTotals } from '@/lib/business';
import { fmtDate, money } from '@/lib/util';
import type { Quotation } from '@/lib/types';

export function RepeatClientCard({ clientId, currentId, readOnly, hasItems, onRepeat, onMention }: { clientId: string; currentId?: string; readOnly: boolean; hasItems: boolean; onRepeat: (q: Quotation) => void; onMention: (text: string) => void }) {
  const { db } = useAuth();
  const client = db.clients.find((c) => c.id === clientId);
  const quotes = db.quotations.filter((q) => q.client_id === clientId && q.id !== currentId && !q.deleted_at && q.status === 'Approved').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const bills = db.invoices.filter((i) => i.client_id === clientId && !i.deleted_at && i.status === 'Approved').sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  if (!client || (!quotes.length && !bills.length && !client.vip)) return null;
  const last = bills[0];
  const names = (q: Quotation) => [...new Set(q.items.map((i) => db.services.find((s) => s.code === i.service_code)?.name ?? i.service_code))].join(', ');
  const lastLine = last ? `Thank you for choosing TopMop again. Your last service was billed on ${fmtDate(last.issue_date)} (${last.number}) for ${money(invoiceTotals(last).total)}.` : quotes[0] ? `Thank you for choosing TopMop again. Your last approved quotation was ${quotes[0].number} dated ${fmtDate(quotes[0].created_at.slice(0, 10))}.` : '';
  return (
    <Card title={<span className="row" style={{ gap: 8 }}>{client.vip ? <Badge tone="amber">⭐ VIP client</Badge> : null}<span>Repeat client</span></span>} actions={<span className="small muted">{bills.length} bill{bills.length === 1 ? '' : 's'} · {quotes.length} approved quotation{quotes.length === 1 ? '' : 's'}</span>}>
      <div className="stack">
        {client.vip && client.vip_note && <div className="alert info">⭐ VIP note: {client.vip_note}</div>}
        {last && <div className="small"><b>Last bill:</b> {last.number} · {fmtDate(last.issue_date)} · <b>{money(invoiceTotals(last).total)}</b></div>}
        {quotes.slice(0, 3).map((q) => (
          <div key={q.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 220 }}><b>{q.number}</b> · {fmtDate(q.created_at.slice(0, 10))} · <b>{money(docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total)}</b><div className="small muted">{names(q)}</div></div>
            {!readOnly && <button type="button" className="btn sm navy" onClick={() => { if (!hasItems || confirm('Replace the line items below with the ones from this quotation?')) onRepeat(q); }}>Repeat this quotation</button>}
          </div>
        ))}
        {!readOnly && lastLine && <div><button type="button" className="btn sm" onClick={() => onMention(lastLine)}>＋ Add a thank-you with the last bill to the introduction</button></div>}
        <div className="small muted">“Repeat” copies the services, quantities and rates from that quotation; change the rates or quantities in the table if prices or the job have changed.</div>
      </div>
    </Card>
  );
}
