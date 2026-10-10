// On-screen Quotation — the same premium layout as the PDF (letter, scope, prices, methodology, project plan, terms, disclaimer).
// Used for the page the client opens from the share link and for the preview inside the app.
import { LOGO_SMALL_URL } from '@/lib/logo';
import { docTotals } from '@/lib/business';
import { DEFAULT_DISCLAIMER, DEFAULT_INTRO, DEFAULT_METHODOLOGY, DEFAULT_TECHNOLOGY, durationText, manpowerText, quoteShowsAmounts, RATES_NOTE, paymentLabel, paymentSentence, parseMethodology } from '@/lib/quote-text';
import { fmtDate, money } from '@/lib/util';
import { LineItems, TermsList } from './LineItems';
import type { Quotation, Settings } from '@/lib/types';

export interface QuoteBundle {
  quotation: Quotation; client: { name: string; contact_person?: string; address?: string }; site?: { name: string; address: string } | null;
  company: Settings['company']; defaults?: { intro?: string; methodology?: string; disclaimer?: string; crew?: string };
}

export function QuotationDocument({ b }: { b: QuoteBundle }) {
  const q = b.quotation; const c = b.company; const t = docTotals(q.items, q.discount, q.vat_mode, q.vat_rate);
  const intro = q.intro?.trim() || b.defaults?.intro?.trim() || DEFAULT_INTRO;
  const method = parseMethodology(q.methodology?.trim() || b.defaults?.methodology?.trim() || DEFAULT_METHODOLOGY);
  const disclaimer = q.disclaimer?.trim() || b.defaults?.disclaimer?.trim() || '';
  const manpower = manpowerText(q); const duration = durationText(q);
  const amounts = quoteShowsAmounts(q);
  const pay = paymentSentence(q.payment_option);
  const hello = b.client.contact_person?.trim();
  return (
    <div className="pd">
      <div className="pd-head">
        <div className="pd-brand"><img src={LOGO_SMALL_URL} alt="TopMop" width={58} height={58} />
          <div><div className="pd-co">{c.name}</div><div className="s">{c.tagline}</div><div className="s">{c.address}</div><div className="s">{c.phone} · {c.email}{c.tin ? ` · TIN ${c.tin}` : ''}</div></div></div>
        <div className="pd-title"><div className="t1">QUOTATION</div><div className="no">{q.number}</div><div className="s">Issued {fmtDate(q.issue_date)} · Valid until {fmtDate(q.valid_until)}</div></div>
      </div>

      <div className="pd-two">
        <div className="pd-card"><div className="pd-k">Prepared for</div><b className="n">{b.client.name}</b>{b.client.address && <div>{b.client.address}</div>}{hello && <div>Attention: {hello}</div>}</div>
        <div className="pd-card"><div className="pd-k">Service location</div>{b.site ? <><b className="n">{b.site.name}</b><div>{b.site.address}</div></> : <span className="pd-small">As discussed</span>}</div>
      </div>

      <p style={{ marginTop: 6 }}><b>Dear Sir/Ma'am,</b></p>
      {intro.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.replace(/\s*\n\s*/g, ' ')}</p>)}

      <div className="pd-h">Scope of work</div>
      <p className="pd-scope">{q.scope}</p>
      <LineItems rows={q.items.map((r) => ({ description: r.description, qty: r.qty, unit: r.unit, rate: r.rate, amount: r.qty * r.rate - r.discount }))} title="Services" ratesOnly={!amounts} rateLabel="Agreed rate" />
      {!amounts && <div className="pd-pay" style={{ marginTop: 10 }}>{RATES_NOTE}{t.discount > 0 ? ' The agreed discount applies to the final amount.' : ''}</div>}
      {amounts && <div className="pd-tot">
        <div className="row"><span>Subtotal</span><span>{money(t.gross)}</span></div>
        {t.discount > 0 && <div className="row"><span>Discount</span><span>− {money(t.discount)}</span></div>}
        {q.vat_mode !== 'none' && <div className="row"><span>VAT {q.vat_rate}%{q.vat_mode === 'inclusive' ? ' (included)' : ''}</span><span>{money(t.vat)}</span></div>}
        <div className="fin"><span>TOTAL</span><span>{money(t.total)}</span></div>
      </div>}

      <div className="pd-h">Our cleaning system methodology</div>
      <div className="pd-tech"><b>{DEFAULT_TECHNOLOGY}</b><span>Water-Fed Pole · Deionized Water Technology · No harsh chemicals</span></div>
      {method.paragraphs.slice(0, method.stepsAfter || method.paragraphs.length).map((p, i) => <p key={i}>{p}</p>)}
      {method.steps.length > 0 && <><div className="pd-k" style={{ marginTop: 6 }}>The process</div><div className="pd-steps">{method.steps.map((s, i) => <div className="pd-step" key={i}><i>{i + 1}</i><div>{s.name && <b>{s.name}</b>}<div>{s.text}</div></div></div>)}</div></>}
      {method.stepsAfter > 0 && method.paragraphs.slice(method.stepsAfter).map((p, i) => <p key={`a${i}`}>{p}</p>)}
      {method.note && <div className="pd-note" style={{ marginTop: 8 }}><div className="pd-k">Note</div>{method.note}</div>}

      {(manpower || duration) && <><div className="pd-h">Project plan</div>
        <div className="pd-two">{manpower && <div className="pd-card"><div className="pd-k">Manpower deployment</div>{manpower}</div>}{duration && <div className="pd-card"><div className="pd-k">Estimated duration</div>{duration}</div>}</div></>}

      {pay && <><div className="pd-h">Payment terms</div><div className="pd-pay">{paymentLabel(q.payment_option)} — {pay}</div></>}
      {q.terms?.trim() && <><div className="pd-h">Terms &amp; conditions</div><TermsList text={q.terms} /></>}
      {disclaimer && <><div className="pd-h">Service disclaimer</div>{disclaimer.split(/\n\s*\n/).map((p, i) => <p key={i} className="pd-small">{p}</p>)}</>}
      <div className="pd-foot"><span>{q.number} · {c.name}</span><span>{c.phone} · {c.email}</span></div>
    </div>
  );
}
void DEFAULT_DISCLAIMER;
