// On-screen Job Order Confirmation — the same premium layout as the PDF. Used for the review page and for the page the client opens from the share link.
import { LOGO_SMALL_URL } from '@/lib/logo';
import type { JobOrder, JobOrderContent } from '@/lib/types';
import { CHANGE_NOTE, PREPARE, WEATHER_NOTE, orderLabel } from '@/lib/joborder-core';
import { DEFAULT_TECHNOLOGY } from '@/lib/quote-text';
import { fmtDate, money } from '@/lib/util';
import { LineItems, TermsList } from './LineItems';

const t12 = (hm: string) => { const h = +hm.slice(0, 2); return `${((h + 11) % 12) + 1}:${hm.slice(3, 5)} ${h >= 12 ? 'PM' : 'AM'}`; };
type View = Pick<JobOrder, 'number' | 'version' | 'status' | 'issued_on'> & { content: JobOrderContent };

export function JobOrderDocument({ order }: { order: View }) {
  const c = order.content;
  return (
    <div className="pd">
      <div className="pd-head">
        <div className="pd-brand"><img src={LOGO_SMALL_URL} alt="TopMop" width={58} height={58} />
          <div><div className="pd-co">{c.company.name}</div><div className="s">{c.company.tagline}</div><div className="s">{c.company.address}</div><div className="s">{c.company.phone} · {c.company.email}{c.company.tin ? ` · TIN ${c.company.tin}` : ''}</div></div></div>
        <div className="pd-title"><div className="t1">JOB ORDER</div><div className="t2">CONFIRMATION</div><div className="no">{orderLabel(order)}</div><div className="s">Issued {fmtDate(order.issued_on)}</div></div>
      </div>
      {order.status === 'Superseded' && <div className="pd-banner bad">SUPERSEDED — a newer version of this Job Order has been issued. Please use the latest version.</div>}
      {(order.status === 'Draft' || order.status === 'Revised') && <div className="pd-banner">DRAFT — not yet sent to the client</div>}
      <p className="pd-lead">This document confirms your scheduled service. It is not an invoice, an official receipt or a new quotation.</p>

      <div className="pd-two">
        <div className="pd-card"><div className="pd-k">Client</div><b className="n">{c.client.name}</b>{c.client_address && <div>{c.client_address}</div>}{c.client.contact_person && <div>Attention: {c.client.contact_person}</div>}</div>
        <div className="pd-card"><div className="pd-k">Service location</div><b className="n">{c.location.name}</b><div>{c.location.address}</div>{c.location.contact_mobile && <div>Contact number: {c.location.contact_mobile}</div>}</div>
      </div>
      <div className="pd-tiles">
        <div className="pd-tile"><div className="pd-k">Booking date</div><div className="v">{fmtDate(c.booking_date)}</div></div>
        <div className="pd-tile hl"><div className="pd-k">Service date</div><div className="v">{fmtDate(c.service_date)}</div></div>
        <div className="pd-tile"><div className="pd-k">Arrival window</div><div className="v">{t12(c.arrival_from)} – {t12(c.arrival_to)}</div></div>
        <div className="pd-tile"><div className="pd-k">Estimated duration</div><div className="v">about {c.duration_hours} {c.duration_hours === 1 ? 'hour' : 'hours'}</div></div>
      </div>

      <div className="pd-h" style={{ marginTop: 6 }}>Service</div>
      <div className="pd-svc">{c.service_types.join(', ') || '—'}</div>
      <div className="pd-tech"><b>{DEFAULT_TECHNOLOGY}</b><span>Pre-Rinse › Deep Cleaning › Final Rinse · Water-Fed Pole, deionized water</span></div>
      <div className="pd-k">Approved scope of work</div><p className="pd-scope">{c.scope || 'As per the approved quotation.'}</p>

      {!c.crew_copy && c.items.length > 0 && <LineItems rows={c.items} title="Approved services" />}
      {!c.crew_copy && c.additions.map((a) => <div key={a.number} style={{ marginTop: 12 }}><div className="pd-k">Approved additional work {a.number}{a.reason ? ` — ${a.reason}` : ''}</div><LineItems rows={a.items} title="Additional work" /></div>)}
      {!c.crew_copy && <div className="pd-tot">
        {c.discounts.map((d, i) => <div className="row" key={i}><span>{d.label}</span><span>− {money(d.amount)}</span></div>)}
        <div className="row"><span>Subtotal (before VAT)</span><span>{money(c.subtotal)}</span></div>
        <div className="row"><span>{c.vat_label}</span><span>{money(c.vat)}</span></div>
        <div className="fin"><span>FINAL APPROVED TOTAL</span><span>{money(c.total)}</span></div>
      </div>}

      {!c.crew_copy && <><div className="pd-h">Payment terms and status</div>
      <TermsList text={c.payment_terms} />
      <div className="pd-pay">{c.payment_status}</div></>}

      <div className="pd-h">Your team</div>
      <div className="pd-card">{c.team.leader ? <><div>Team Leader: <b>{c.team.leader}</b></div>{c.team.crew.length > 0 && <div>Crew: {c.team.crew.join(', ')}</div>}</> : 'Team assignment to follow.'}</div>

      {c.access_notes.length > 0 && <><div className="pd-h">Safety and access notes / your requirements</div><ul className="pd-bul">{c.access_notes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
      <div className="pd-h">What to prepare</div>
      <ul className="pd-bul">{PREPARE.map((n) => <li key={n}>{n}</li>)}</ul>
      {c.disclaimer?.trim() && <><div className="pd-h">Service disclaimer</div>{c.disclaimer.trim().split(/\n\s*\n/).map((t, i) => <p key={i} className="pd-small">{t}</p>)}</>}
      <div className="pd-note"><div className="pd-k">Please note</div><ul><li>{CHANGE_NOTE}</li><li>{WEATHER_NOTE}</li></ul></div>
      <div className="pd-foot"><span>{orderLabel(order)} · {c.company.name}</span><span>{c.company.phone} · {c.company.email}</span></div>
    </div>
  );
}
