// On-screen version of the client Job Order Confirmation (preview for Admin / Operations, and the page the client opens from the share link).
import { LOGO_SMALL_URL } from '@/lib/logo';
import type { JobOrder, JobOrderContent } from '@/lib/types';
import { CHANGE_NOTE, PREPARE, WEATHER_NOTE, orderLabel } from '@/lib/joborder-core';
import { fmtDate, money } from '@/lib/util';

const t12 = (hm: string) => { const h = +hm.slice(0, 2); return `${((h + 11) % 12) + 1}:${hm.slice(3, 5)} ${h >= 12 ? 'PM' : 'AM'}`; };
type View = Pick<JobOrder, 'number' | 'version' | 'status' | 'issued_on'> & { content: JobOrderContent };

export function JobOrderDocument({ order }: { order: View }) {
  const c = order.content;
  const lines = (rows: JobOrderContent['items']) => (
    <table className="tbl"><thead><tr><th>Description</th><th className="num">Qty / unit</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td>{r.description}</td><td className="num">{r.qty.toLocaleString('en-PH')} {r.unit}</td><td className="num">{money(r.rate)}</td><td className="num">{money(r.amount)}</td></tr>)}</tbody></table>
  );
  return (
    <div className="joc">
      <div className="joc-head">
        <div className="row" style={{ gap: 12, alignItems: 'center' }}><img src={LOGO_SMALL_URL} alt="TopMop" width={54} height={54} /><div><b className="joc-co">{c.company.name}</b><div className="small">{c.company.tagline}</div><div className="small">{c.company.address}</div><div className="small">{c.company.phone} · {c.company.email}{c.company.tin ? ` · TIN ${c.company.tin}` : ''}</div></div></div>
        <div className="joc-title"><b>JOB ORDER<br />CONFIRMATION</b><div>{orderLabel(order)}</div><div className="small">Issued {fmtDate(order.issued_on)}</div></div>
      </div>
      {order.status === 'Superseded' && <div className="alert warn"><b>Superseded.</b> A newer version of this Job Order has been issued. Please use the latest version.</div>}
      {(order.status === 'Draft' || order.status === 'Revised') && <div className="alert warn"><b>Draft — not yet sent to the client.</b></div>}
      <p className="muted small">This document confirms your scheduled service. It is not an invoice, an official receipt or a new quotation.</p>
      <div className="grid g2">
        <div><div className="joc-k">Client</div><b>{c.client.name}</b><div>{c.client.contact_person && `Attention: ${c.client.contact_person}`}</div></div>
        <div><div className="joc-k">Service location</div><b>{c.location.name}</b><div>{c.location.address}</div>{c.location.contact_mobile && <div>Contact number: {c.location.contact_mobile}</div>}</div>
      </div>
      <div className="grid g4 keep2" style={{ margin: '12px 0' }}>
        <div className="stat"><div className="k">Booking date</div><div className="v" style={{ fontSize: 16 }}>{fmtDate(c.booking_date)}</div></div>
        <div className="stat"><div className="k">Service date</div><div className="v" style={{ fontSize: 16 }}>{fmtDate(c.service_date)}</div></div>
        <div className="stat"><div className="k">Arrival window</div><div className="v" style={{ fontSize: 16 }}>{t12(c.arrival_from)} – {t12(c.arrival_to)}</div></div>
        <div className="stat"><div className="k">Estimated duration</div><div className="v" style={{ fontSize: 16 }}>about {c.duration_hours} h</div></div>
      </div>
      <div className="joc-k">Service</div><b>{c.service_types.join(', ') || '—'}</b>
      <div className="joc-k" style={{ marginTop: 10 }}>Approved scope of work</div><p style={{ marginTop: 2 }}>{c.scope || 'As per the approved quotation.'}</p>
      {c.items.length > 0 && <><div className="joc-k">Approved services</div>{lines(c.items)}</>}
      {c.additions.map((a) => <div key={a.number} style={{ marginTop: 10 }}><div className="joc-k">Approved additional work {a.number}{a.reason ? ` — ${a.reason}` : ''}</div>{lines(a.items)}</div>)}
      <table className="tbl joc-tot"><tbody>
        {c.discounts.map((d, i) => <tr key={i}><td>{d.label}</td><td className="num">− {money(d.amount)}</td></tr>)}
        <tr><td>Subtotal (before VAT)</td><td className="num">{money(c.subtotal)}</td></tr>
        <tr><td>{c.vat_label}</td><td className="num">{money(c.vat)}</td></tr>
        <tr className="joc-final"><td>Final approved total</td><td className="num">{money(c.total)}</td></tr>
      </tbody></table>
      <div className="joc-k">Payment terms and payment status</div><p style={{ marginTop: 2 }}>{c.payment_terms}<br /><b>Payment status:</b> {c.payment_status}</p>
      <div className="joc-k">Your team</div><p style={{ marginTop: 2 }}>{c.team.leader ? <>Team Leader: <b>{c.team.leader}</b>{c.team.crew.length ? <><br />Crew: {c.team.crew.join(', ')}</> : null}</> : 'Team assignment to follow.'}</p>
      {c.access_notes.length > 0 && <><div className="joc-k">Safety and access notes / your requirements</div><ul style={{ marginTop: 2 }}>{c.access_notes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
      <div className="joc-k">What to prepare</div><ul style={{ marginTop: 2 }}>{PREPARE.map((n) => <li key={n}>{n}</li>)}</ul>
      <div className="joc-k">Please note</div><ul style={{ marginTop: 2 }}><li>{CHANGE_NOTE}</li><li>{WEATHER_NOTE}</li></ul>
    </div>
  );
}
