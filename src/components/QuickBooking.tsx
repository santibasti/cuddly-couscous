// Quick booking: paste the booking details from Messenger, check them, and the client, an approved quotation and a booked job order are created in one go.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Card, Field, attempt } from '@/components/ui';
import { RATES, findRate, parseBooking, planQuote, quickBook, type Booking, type QuickResult } from '@/lib/quickbooking';
import { docTotals } from '@/lib/business';
import { fmtDate, fmtTime, money } from '@/lib/util';

const EMPTY: Booking = { name: '', address: '', mobile: '', email: '', storeys: '', date: '', time: '08:00', service: '', home: '' };

export function QuickBooking() {
  const { db } = useAuth();
  const [text, setText] = useState(''); const [b, setB] = useState<Booking | null>(null);
  const [city, setCity] = useState(''); const [done, setDone] = useState<QuickResult | null>(null);
  const read = () => { const p = parseBooking(text); setB(p); setCity(findRate(p.address)?.place ?? ''); setDone(null); };
  const rate = useMemo(() => RATES.find((r) => r.place === city), [city]);
  const plan = useMemo(() => (b ? planQuote(db, b, rate) : null), [db, b, rate]);
  const total = plan?.items.length ? docTotals(plan.items, 0, 'none', 0).total : 0;
  const set = (k: keyof Booking, v: string) => setB((x) => ({ ...(x ?? EMPTY), [k]: v }));
  const missing = b ? [!b.name.trim() && 'name', !b.address.trim() && 'address', !/^\d{4}-\d{2}-\d{2}$/.test(b.date) && 'reservation date', !plan?.items.length && 'city'].filter(Boolean) as string[] : [];
  const create = () => { if (!b) return; const r = attempt(() => quickBook(b, rate), 'Booked — quotation approved and job order created') as QuickResult | undefined; if (r) { setDone(r); setText(''); setB(null); } };
  return (
    <>
      <Card title="Quick booking from Messenger">
        <p className="muted" style={{ marginTop: 0 }}>Paste the booking details the client sent. This adds the client, makes the quotation (approved already) and books the job. Arrange the team and vehicle on the job order afterwards.</p>
        <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name:\nAddress:\nContact Number:\nEmail:\nNo. of House Storey:\nReservation Date:\nService Type:\nHome or Residential:'} style={{ width: '100%' }} />
        <div className="row" style={{ marginTop: 8 }}><button className="btn primary" disabled={!text.trim()} onClick={read}>Read details</button></div>
      </Card>
      {b && plan && (
        <Card title="Check before booking">
          <div className="form-grid">
            <Field label="Name"><input value={b.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Contact number"><input value={b.mobile} onChange={(e) => set('mobile', e.target.value)} /></Field>
            <Field label="Email"><input value={b.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Storeys"><input value={b.storeys} onChange={(e) => set('storeys', e.target.value)} /></Field>
            <Field label="Address" className="full"><input value={b.address} onChange={(e) => { set('address', e.target.value); const r = findRate(e.target.value); if (r) setCity(r.place); }} /></Field>
            <Field label="City / area for the rate" hint={city ? undefined : 'The city was not found in the address: pick it from the list.'}><select value={city} onChange={(e) => setCity(e.target.value)}><option value="">— choose —</option>{[...new Set(RATES.map((r) => r.group))].map((g) => <optgroup key={g} label={g}>{RATES.filter((r) => r.group === g).map((r) => <option key={r.place} value={r.place}>{r.place}</option>)}</optgroup>)}</select></Field>
            <Field label="Service"><input value={b.service} onChange={(e) => set('service', e.target.value)} placeholder="Glass cleaning" /></Field>
            <Field label="Reservation date"><input type="date" value={b.date} onChange={(e) => set('date', e.target.value)} /></Field>
            <Field label="Start time"><input type="time" value={b.time} onChange={(e) => set('time', e.target.value)} /></Field>
          </div>
          {b.home && !/home|residen|house/i.test(b.home) && <div className="alert warn" style={{ marginTop: 8 }}>This says “{b.home}”. The rate list is for homes; check the price on the quotation.</div>}
          <div className="alert" style={{ marginTop: 8 }}>
            {plan.items.length ? <><b>{money(total)}</b> · {plan.note}{b.date && <> · {fmtDate(b.date)} {fmtTime(`${b.date}T${b.time || '08:00'}`)}</>}</> : <>Missing: {missing.join(', ')}.</>}
          </div>
          <div className="row" style={{ marginTop: 8 }}><button className="btn primary" disabled={!!missing.length} onClick={create}>Create client, approve quotation & book</button></div>
        </Card>
      )}
      {done && (
        <Card title="Booked">
          <p style={{ margin: 0 }}>{done.newClient ? 'New client' : 'Existing client'} <b>{done.client.name}</b> · quotation <b>{done.quote.number}</b> approved · job <b>{done.job.number}</b> booked for {fmtDate(done.job.start_at)}.</p>
          <div className="row" style={{ marginTop: 8 }}>
            <Link className="btn primary" to={`/jobs/${done.job.id}`}>Open job — add team & vehicle</Link>
            <Link className="btn" to={`/sales/quote/${done.quote.id}`}>Quotation</Link>
            <Link className="btn" to={`/clients/${done.client.id}`}>Client</Link>
          </div>
        </Card>
      )}
    </>
  );
}
