// SMS: everything about text messages in one place. Client reminders (the day before and the service morning), the owner alert texts,
// test and sample sends, what was sent lately, and what to do when a text does not arrive.
import { useCallback, useEffect, useState } from 'react';
import { store, useAuth } from '@/lib/store';
import { Badge, Card, Field, PageHead, attempt, toast } from '@/components/ui';
import { CLOUD } from '@/lib/cloud';
import { loadSmsLogs, sendSampleReminder, sendTestSms, type AlertRow, type ClientSmsRow } from '@/lib/alerts';
import { fmtDateTime } from '@/lib/util';

const mask = (n?: string | null) => (n && n.length > 6 ? `${n.slice(0, 4)}***${n.slice(-4)}` : n || '—');

export default function Sms() {
  const { db } = useAuth();
  const cfg = db.settings.client_sms ?? { enabled: false, day_before_time: '17:00', morning_time: '07:00' };
  const [on, setOn] = useState(!!cfg.enabled); const [before, setBefore] = useState(cfg.day_before_time || '17:00'); const [morning, setMorning] = useState(cfg.morning_time || '07:00');
  const dirty = on !== !!cfg.enabled || before !== (cfg.day_before_time || '17:00') || morning !== (cfg.morning_time || '07:00');
  const save = () => attempt(() => { store.require('admin.settings'); store.patchSettings({ client_sms: { enabled: on, day_before_time: before, morning_time: morning } }, `Client SMS reminders ${on ? 'on' : 'off'} (${before} / ${morning})`); }, 'Saved');

  const [logs, setLogs] = useState<{ clients: ClientSmsRow[]; alerts: AlertRow[]; missing: boolean }>({ clients: [], alerts: [], missing: false }); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const reload = useCallback(() => { setLoading(true); loadSmsLogs().then((r) => { setLogs(r); setErr(''); }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the log')).finally(() => setLoading(false)); }, []);
  useEffect(reload, [reload]);

  const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ ok: boolean; text: string; message?: string } | null>(null);
  const test = async () => { setBusy(true); setRes({ ok: true, text: 'Sending…' }); try { const r = await sendTestSms(false); setRes({ ok: r.state === 'sent', text: r.detail }); } catch (e) { setRes({ ok: false, text: e instanceof Error ? e.message : 'Could not send' }); } finally { setBusy(false); reload(); } };
  const sample = async (k: 'day_before' | 'morning') => { setBusy(true); setRes({ ok: true, text: 'Sending the sample…' }); try { const r = await sendSampleReminder(k); setRes({ ok: true, text: `Sent to ${r.to}${r.job ? ` (using booking ${r.job})` : ' (no upcoming booking, so a made-up one)'}. It should reach your phone within a minute. It reads:`, message: r.message }); } catch (e) { setRes({ ok: false, text: e instanceof Error ? e.message : 'Could not send the sample' }); } finally { setBusy(false); } };

  const job = (id: string) => db.jobs.find((j) => j.id === id); const clientOf = (id: string) => { const j = job(id); return db.clients.find((c) => c.id === j?.client_id)?.name ?? '—'; };
  const status = (r: { sent_at: string | null; error: string | null }) => (r.sent_at ? <Badge tone="green">Sent</Badge> : r.error ? <Badge tone="red">Failed / skipped</Badge> : <Badge tone="amber">Waiting</Badge>);

  return (
    <>
      <PageHead icon="💬" title="SMS" sub="Reminders to clients and alert texts to the owner: switch them on, test them, and see what was sent." />
      {!CLOUD && <div className="alert info" style={{ marginBottom: 12 }}>Demo mode: there is no SMS service here. On the live site this page sends and shows real texts.</div>}

      <div className="grid g2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, marginBottom: 14 }}>
        <Card title="1 · Reminders to clients" actions={<Badge tone={cfg.enabled ? 'green' : 'gray'}>{cfg.enabled ? 'On' : 'Off'}</Badge>}>
          <div className="stack">
            <label className="check"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />Text clients before their service</label>
            <div className="small muted">Each client gets two texts: <b>the day before</b> and <b>the morning of the service</b>. It greets them by name (Sir / Mam), gives the arrival time (ETA) from the Job Order, the team's first names and the vehicle, says not to reply to that number, and points them to Facebook Messenger. It goes to the site contact's mobile number, or the client's if the site has none. No link is included.</div>
            <div className="form-grid">
              <Field label="Day before — send at"><input type="time" value={before} onChange={(e) => setBefore(e.target.value)} /></Field>
              <Field label="Service day — send at"><input type="time" value={morning} onChange={(e) => setMorning(e.target.value)} /></Field>
            </div>
            <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={!dirty} onClick={save}>Save</button>{dirty && <span className="small" style={{ color: 'var(--amber)' }}>Unsaved changes</span>}</div>
            <div className="small muted">Each text is about 2 SMS credits (4 per booking for both). A client with no valid mobile number is skipped and shown below.</div>
          </div>
        </Card>

        <Card title="2 · Try it on your own phone">
          <div className="stack">
            <div className="small muted">These go to <b>your alert number only</b>, never to a client.</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={busy} onClick={() => void sample('day_before')}>Sample: day-before reminder</button>
              <button className="btn" disabled={busy} onClick={() => void sample('morning')}>Sample: service-day reminder</button>
              <button className="btn" disabled={busy} onClick={() => void test()}>Plain test text</button>
            </div>
            <div className="small muted">A sample uses the real details of your next upcoming booking, marked SAMPLE (about 2 credits). The plain test is one short text (1 credit) that checks your alert number works.</div>
            {res && <div className={`alert ${res.ok ? 'info' : 'warn'}`}>{res.ok ? '✅ ' : '⚠ '}{res.text}{res.message && <div className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>“{res.message}”</div>}</div>}
          </div>
        </Card>
      </div>

      <Card title="3 · Owner alert texts" actions={<span className="small muted">Sent to the alert number set for the system</span>}>
        <div className="small muted" style={{ marginBottom: 8 }}>You are texted when: a client approves or signs a <b>quotation</b>, signs the scope or final quote <b>on site</b>, <b>additional work</b> is approved, or a <b>discount is requested</b>. They are kept to one SMS and carry no link; open the app to act on them.</div>
        {err && <div className="alert warn">{err}</div>}
        {logs.missing && <div className="alert warn">The SMS log tables are not in the database yet. Run the latest database update.</div>}
        <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>When</th><th>Alert</th><th>Status</th><th>Detail</th></tr></thead><tbody>
          {logs.alerts.map((a) => <tr key={a.id}><td>{fmtDateTime(a.created_at)}</td><td><b>{a.title}</b><div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div></td><td>{status(a)}</td><td className="small">{a.error ? <span style={{ color: 'var(--red)' }}>{a.error}</span> : a.sent_at ? `Sent ${fmtDateTime(a.sent_at)}` : a.attempts ? `${a.attempts} attempt(s)` : ''}</td></tr>)}
          {!logs.alerts.length && <tr><td colSpan={4} className="muted">{loading ? 'Loading…' : 'No alerts yet.'}</td></tr>}
        </tbody></table></div>
      </Card>

      <div style={{ height: 14 }} />
      <Card title="4 · Reminders sent to clients">
        <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Sent</th><th>Booking / client</th><th>Which</th><th>To</th><th>Status</th><th>Text</th></tr></thead><tbody>
          {logs.clients.map((r) => { const j = job(r.job_id); return <tr key={r.id}>
            <td>{fmtDateTime(r.sent_at ?? r.created_at)}</td><td><b>{j?.number ?? '—'}</b><div className="small muted">{clientOf(r.job_id)}</div></td>
            <td>{r.kind === 'day_before' ? 'Day before' : 'Service morning'}<div className="small muted">for {r.service_date}</div></td><td className="mono">{mask(r.to_number)}</td><td>{status(r)}{r.error && <div className="small" style={{ color: 'var(--red)' }}>{r.error}</div>}</td>
            <td className="small" style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>{r.message}</td></tr>; })}
          {!logs.clients.length && <tr><td colSpan={6} className="muted">{loading ? 'Loading…' : 'No client reminders yet. They appear here once the reminders are on and a booking is due.'}</td></tr>}
        </tbody></table></div>
      </Card>

      <div style={{ height: 14 }} />
      <Card title="If a text does not arrive">
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li><b>Check the number first.</b> Alerts go to the alert number set for the system; client texts go to the site contact's number (or the client's). It must be a Philippine mobile, like 0917 123 4567.</li>
          <li><b>No links.</b> Philippine phone companies often drop texts that contain a link, so these texts never include one.</li>
          <li><b>Credits are used when Semaphore accepts a text,</b> even if the phone company blocks it. If texts show as Sent here but do not arrive, ask Semaphore for the delivery status of that time.</li>
          <li><b>Not texted?</b> The booking must be Confirmed, Dispatch Checklist Pending or Dispatched, and due the next day (after the day-before time) or today (after the morning time, before it starts). Each is sent once per booking.</li>
          <li><b>Greeting.</b> Sir / Mam comes from a Mr. / Ms. in the name or the “Call them in texts” setting on the client. A name is never guessed.</li>
        </ul>
      </Card>
    </>
  );
}
