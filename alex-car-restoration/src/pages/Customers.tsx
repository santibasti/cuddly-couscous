import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Outbox, SmsAction } from '../components/Sms';
import { Card, Empty, Pill, Seg } from '../components/ui';
import { SOURCES, SOURCE_KEYS, customerStats, upcomingBirthdays } from '../lib/crm';
import { addDays, fmtDate, todayIso } from '../lib/dates';
import { moneyC } from '../lib/logic';
import { useRole } from '../lib/role';
import { useStore } from '../lib/store';
import type { LeadSource } from '../lib/types';

type Kind = 'all' | 'new' | 'past';

export default function Customers() {
  const { data, dispatch } = useStore();
  const { role } = useRole();
  const today = todayIso();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [src, setSrc] = useState<'all' | LeadSource>('all');
  const [adding, setAdding] = useState(false);
  const nav = useNavigate();
  const rows = data.customers
    .map((c) => ({ c, ...customerStats(data, c) }))
    .filter((r) => (kind === 'all' || r.kind === kind) && (src === 'all' || r.c.source === src) && `${r.c.name} ${r.c.phone} ${r.cars.map((p) => `${p.make} ${p.model}`).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const birthdays = upcomingBirthdays(data, today, 14);
  const showMoney = role !== 'leader';

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const t = (k: string) => String(f.get(k) ?? '').trim();
    const id = `c${Date.now().toString(36)}`;
    dispatch({ type: 'addCustomer', customer: { id, name: t('name'), phone: t('phone'), email: t('email'), birthday: t('birthday') || undefined, source: (t('source') || undefined) as LeadSource | undefined } });
    e.currentTarget.reset();
    setAdding(false);
    // Next step for a new client: price the job and see whether to go ahead.
    nav(`/intake?customer=${id}`);
  }

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{data.customers.length} customers</div><h1>Customers</h1><p>Who they are, where they came from, what they have brought in, and when to say happy birthday.</p></div>
        <button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'New customer'}</button>
      </div>
      {adding && (
        <form className="card form" onSubmit={submit} style={{ marginBottom: 24 }}>
          <label>Name<input name="name" required /></label>
          <label>Phone<input name="phone" required /></label>
          <label>Email<input name="email" type="email" /></label>
          <label>Birthday<input name="birthday" type="date" /></label>
          <label>Where did they come from?<select name="source"><option value="">Not sure</option>{SOURCE_KEYS.map((k) => <option key={k} value={k}>{SOURCES[k]}</option>)}</select></label>
          <div style={{ alignSelf: 'end' }}><button className="primary" type="submit">Save customer</button></div>
        </form>
      )}

      <Card title="Birthdays coming up" action={<span className="muted small">Next 14 days</span>}>
        {birthdays.length === 0 && <div className="muted small">No birthdays in the next two weeks.</div>}
        {birthdays.map(({ customer: c, daysAway }) => (
          <div key={c.id} className="row spread" style={{ padding: '6px 0', flexWrap: 'wrap' }}>
            <span><Link to={`/customers/${c.id}`}><b>{c.name}</b></Link> <span className="muted small">· {fmtDate(addDays(today, daysAway))} · {daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}</span></span>
            <SmsAction customer={c} kind="birthday" label="Send greeting" />
          </div>
        ))}
      </Card>

      <div className="row spread mt" style={{ marginBottom: 14 }}>
        <div className="row">
          <Seg<Kind> value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'new', label: 'New' }, { value: 'past', label: 'Past clients' }]} />
          <select value={src} onChange={(e) => setSrc(e.target.value as 'all' | LeadSource)}><option value="all">Any source</option>{SOURCE_KEYS.map((k) => <option key={k} value={k}>{SOURCES[k]}</option>)}</select>
        </div>
        <input placeholder="Search name, phone, car…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
      </div>
      <Card flush>
        <table>
          <thead><tr><th>Customer</th><th>Type</th><th>Came from</th><th>Birthday</th><th>Cars</th><th style={{ textAlign: 'right' }}>Jobs</th>{showMoney && <th style={{ textAlign: 'right' }}>Lifetime value</th>}</tr></thead>
          <tbody>
            {rows.map(({ c, kind: k, jobs, ltv, cars }) => (
              <tr key={c.id}>
                <td><Link to={`/customers/${c.id}`} className="plink"><strong>{c.name}</strong><span>{c.phone}</span></Link></td>
                <td><Pill tone={k === 'past' ? 'violet' : 'blue'}>{k === 'past' ? 'Past client' : 'New'}</Pill></td>
                <td>{c.source ? SOURCES[c.source] : <span className="muted">—</span>}</td>
                <td className="num">{c.birthday ? fmtDate(c.birthday) : <span className="muted">—</span>}</td>
                <td className="small">{cars.map((p) => `${p.make} ${p.model}`).join(', ') || '—'}</td>
                <td className="num" style={{ textAlign: 'right' }}>{jobs.length}</td>
                {showMoney && <td className="num" style={{ textAlign: 'right' }}>{moneyC(ltv)}</td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7}><Empty>No customers match.</Empty></td></tr>}
          </tbody>
        </table>
      </Card>
      <Card className="mt" title="Text message outbox" action={<span className="muted small">Demo only</span>}><Outbox limit={6} /></Card>
    </>
  );
}
