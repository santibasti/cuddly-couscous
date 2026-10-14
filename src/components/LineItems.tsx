// Priced lines for the client-facing documents: a navy header bar and aligned columns on a computer; stacked rows on a phone.
import { money } from '@/lib/util';

export interface Line { description: string; qty: number; unit: string; rate: number; amount: number; measure?: boolean }

export function LineItems({ rows, title = 'Description', ratesOnly = false, rateLabel = 'Approved rate', hideAmounts = false }: { rows: Line[]; title?: string; ratesOnly?: boolean; rateLabel?: string; hideAmounts?: boolean }) {
  if (hideAmounts) {
    return (
      <div className="jl jl-rates">
        <div className="jl-head"><span>{title}</span><span>Quantity</span></div>
        {rows.map((r, i) => (
          <div className="jl-row" key={i}>
            <div className="jl-desc">{r.description}</div>
            <div className="jl-u">{r.measure ? `per ${r.unit}` : `${r.qty.toLocaleString('en-PH')} ${r.unit}`}</div>
          </div>
        ))}
      </div>
    );
  }
  if (ratesOnly) {
    return (
      <div className="jl jl-rates">
        <div className="jl-head"><span>{title}</span><span>Unit</span><span>{rateLabel}</span></div>
        {rows.map((r, i) => (
          <div className="jl-row" key={i}>
            <div className="jl-desc">{r.description}</div>
            <div className="jl-u">per {r.unit}</div>
            <div className="jl-amt">{money(r.rate)}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="jl">
      <div className="jl-head"><span>{title}</span><span>Qty / unit</span><span>Rate</span><span>Amount</span></div>
      {rows.map((r, i) => (
        <div className="jl-row" key={i}>
          <div className="jl-desc">{r.description}</div>
          <div className="jl-q">{r.measure ? `per ${r.unit}` : `${r.qty.toLocaleString('en-PH')} ${r.unit}`}</div>
          <div className="jl-r">{money(r.rate)}</div>
          <div className="jl-amt">{r.measure ? <span style={{ fontWeight: 600, fontSize: '.85em' }}>To be measured</span> : money(r.amount)}</div>
        </div>
      ))}
    </div>
  );
}

/** "1. Prices … 2. 50% … 3. …" typed as one paragraph becomes a readable numbered list. */
export function TermsList({ text }: { text: string }) {
  const parts = text.trim().split(/\s+(?=\d{1,2}\.\s)/).map((t) => t.replace(/^\d{1,2}\.\s*/, '').trim()).filter(Boolean);
  if (parts.length < 2) return <p className="small" style={{ marginTop: 2 }}>{text}</p>;
  return <ol className="small jl-terms pd-list">{parts.map((t, i) => <li key={i}>{t}</li>)}</ol>;
}
