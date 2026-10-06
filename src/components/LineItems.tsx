// Priced lines for the client-facing pages: each line stacks (description, then qty × rate and the amount) so nothing is clipped on a phone.
import { money } from '@/lib/util';

export interface Line { description: string; qty: number; unit: string; rate: number; amount: number }

export function LineItems({ rows }: { rows: Line[] }) {
  return (
    <div className="jl">
      {rows.map((r, i) => (
        <div className="jl-row" key={i}>
          <div className="jl-desc">{r.description}</div>
          <div className="jl-calc">{r.qty.toLocaleString('en-PH')} {r.unit} × {money(r.rate)}</div>
          <div className="jl-amt">{money(r.amount)}</div>
        </div>
      ))}
    </div>
  );
}

/** "1. Prices … 2. 50% … 3. …" typed as one paragraph becomes a readable numbered list. */
export function TermsList({ text }: { text: string }) {
  const parts = text.trim().split(/\s+(?=\d{1,2}\.\s)/).map((t) => t.replace(/^\d{1,2}\.\s*/, '').trim()).filter(Boolean);
  if (parts.length < 2) return <p className="small" style={{ marginTop: 2 }}>{text}</p>;
  return <ol className="small jl-terms">{parts.map((t, i) => <li key={i}>{t}</li>)}</ol>;
}
