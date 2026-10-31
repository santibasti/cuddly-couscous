import { Link, useParams } from 'react-router-dom';
import { Outbox, SmsAction } from '../components/Sms';
import { Card, HealthPill, Pill, ServicePill, carName } from '../components/ui';
import { SOURCES, SOURCE_KEYS, customerStats, daysToBirthday, missingItems } from '../lib/crm';
import { fmtDate, todayIso } from '../lib/dates';
import { moneyC, projectHealth } from '../lib/logic';
import { useRole } from '../lib/role';
import { useStore } from '../lib/store';
import type { LeadSource } from '../lib/types';

export default function CustomerDetail() {
  const { id } = useParams();
  const { data, dispatch } = useStore();
  const { role } = useRole();
  const today = todayIso();
  const c = data.customers.find((x) => x.id === id);
  if (!c) return <p>Customer not found. <Link to="/customers">Back to customers</Link></p>;
  const st = customerStats(data, c);
  const set = (patch: Partial<typeof c>) => dispatch({ type: 'updateCustomer', id: c.id, patch });
  const bd = c.birthday ? daysToBirthday(c.birthday, today) : null;
  const open = st.jobs.find((p) => p.status === 'active' || p.status === 'completed');
  const owing = st.jobs.reduce((s, p) => s + (p.status === 'delivered' ? 0 : Math.max(0, p.budget - p.payments.reduce((a, x) => a + x.amount, 0))), 0);

  return (
    <>
      <Link to="/customers" className="crumb">← Customers</Link>
      <div className="head">
        <div>
          <div className="eyebrow">{st.kind === 'past' ? 'Past client' : 'New client'}{c.source ? ` · came from ${SOURCES[c.source].toLowerCase()}` : ''}</div>
          <h1>{c.name}</h1>
          <p>{st.jobs.length} {st.jobs.length === 1 ? 'job' : 'jobs'}{st.last ? `, last one on ${fmtDate(st.last)}` : ''}{role !== 'leader' && <> · lifetime value <b>{moneyC(st.ltv)}</b></>}{owing > 0 && role !== 'leader' ? <> · <b>{moneyC(owing)}</b> still to collect</> : ''}.</p>
        </div>
        <div className="row">
          {open && <SmsAction customer={c} project={open} kind="ready" />}
          {open && <SmsAction customer={c} project={open} kind="payment" />}
          {bd !== null && bd <= 14 && <SmsAction customer={c} kind="birthday" primary label={bd === 0 ? 'Birthday today: send greeting' : 'Send birthday greeting'} />}
        </div>
      </div>

      <div className="grid g2">
        <Card title="Contact and background">
          <div className="form" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <label>Name<input value={c.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label>Phone<input value={c.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
            <label>Email<input value={c.email} onChange={(e) => set({ email: e.target.value })} /></label>
            <label>Birthday<input type="date" value={c.birthday ?? ''} onChange={(e) => set({ birthday: e.target.value || undefined })} /></label>
            <label className="full">Where did they come from?
              <select value={c.source ?? ''} onChange={(e) => set({ source: (e.target.value || undefined) as LeadSource | undefined })}><option value="">Not sure</option>{SOURCE_KEYS.map((k) => <option key={k} value={k}>{SOURCES[k]}</option>)}</select>
            </label>
          </div>
          {bd !== null && <div className="small muted" style={{ marginTop: 12 }}>Birthday {bd === 0 ? 'is today' : bd === 1 ? 'is tomorrow' : `in ${bd} days`}.</div>}
        </Card>
        <Card title="Cars" action={<span className="muted small">{st.cars.length}</span>}>
          {st.cars.length === 0 && <div className="muted small">No cars yet.</div>}
          {st.cars.map((p) => <div key={p.id} className="row spread" style={{ padding: '6px 0' }}><b>{carName(p)}</b><span className="muted small">{p.color}{p.vin ? ` · ${p.vin}` : ''}</span></div>)}
        </Card>
      </div>

      <Card className="mt" title="Past and current jobs" flush>
        <table>
          <thead><tr><th>Job</th><th>Service</th><th>Received</th><th>Out</th><th>Status</th>{role !== 'leader' && <th style={{ textAlign: 'right' }}>Paid</th>}</tr></thead>
          <tbody>
            {st.jobs.map((p) => {
              const m = missingItems(p);
              return (
                <tr key={p.id}>
                  <td><Link to={`/projects/${p.id}`} className="plink"><strong>{p.code} · {carName(p)}</strong><span>{p.packageName ?? p.title}{p.backjobOf ? ' · back job' : ''}</span></Link></td>
                  <td><ServicePill s={p.service} /></td>
                  <td className="num">{fmtDate(p.receivedOn ?? p.startDate)}</td>
                  <td className="num">{p.releasedOn ? fmtDate(p.releasedOn) : <span className="muted">—</span>}</td>
                  <td><HealthPill h={projectHealth(p, data, today).health} />{m.length > 0 && p.status !== 'delivered' && <div style={{ marginTop: 4 }}><Pill tone="orange">{m.length} missing</Pill></div>}</td>
                  {role !== 'leader' && <td className="num" style={{ textAlign: 'right' }}>{moneyC(p.payments.reduce((s, x) => s + x.amount, 0))}</td>}
                </tr>
              );
            })}
            {st.jobs.length === 0 && <tr><td colSpan={6} className="empty">No jobs yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="mt" title="Texts sent to this customer" action={<span className="muted small">Demo only</span>}><Outbox customerId={c.id} /></Card>
    </>
  );
}
