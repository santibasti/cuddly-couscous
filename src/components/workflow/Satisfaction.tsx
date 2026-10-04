import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, attempt } from '@/components/ui';
import { acknowledgeFeedback, type SatisfactionInput } from '@/lib/workflow';
import { FEEDBACK_ASPECTS, ISSUE_CATEGORIES, RATING_EMOJI, RATING_LABEL, satisfactionStats } from '@/lib/business';
import { addDays, fmtDate, fmtDateTime } from '@/lib/util';
import type { ClientFeedback, IssueCategory, SatisfactionRating } from '@/lib/types';

const RATINGS: SatisfactionRating[] = [1, 2, 3];
const TONE: Record<SatisfactionRating, string> = { 1: 'bad', 2: 'mid', 3: 'good' };

/** Short Client Satisfaction Check: one tap, optional ticks, optional comment. Designed to take the client under 15 seconds. */
export function SatisfactionCheck({ value, onChange, disabled }: { value: Partial<SatisfactionInput>; onChange: (v: Partial<SatisfactionInput>) => void; disabled?: boolean }) {
  const r = value.rating;
  const toggle = (a: string) => { const cur = value.aspects ?? []; onChange({ ...value, aspects: cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a] }); };
  return (
    <div className="card satcheck" style={{ padding: 14 }}>
      <div className="satq">How satisfied are you with today’s service?</div>
      <div className="smileys" role="radiogroup" aria-label="Satisfaction rating">
        {RATINGS.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={r === n} disabled={disabled} className={`smiley ${TONE[n]} ${r === n ? 'on' : ''}`} onClick={() => onChange({ ...value, rating: n, ...(n !== 1 ? { issue_category: undefined } : {}) })}>
            <span className="emo" aria-hidden="true">{RATING_EMOJI[n]}</span><span>{RATING_LABEL[n]}</span>
          </button>
        ))}
      </div>
      {r && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="small muted" style={{ fontWeight: 600 }}>Anything you’d like to mention? (optional)</div>
          <div className="ticks">
            {FEEDBACK_ASPECTS.map((a) => <label key={a} className={`tick ${value.aspects?.includes(a) ? 'on' : ''}`}><input type="checkbox" disabled={disabled} checked={!!value.aspects?.includes(a)} onChange={() => toggle(a)} />{a}</label>)}
          </div>
          <Field label="Additional comment (optional)"><input disabled={disabled} value={value.comment ?? ''} onChange={(e) => onChange({ ...value, comment: e.target.value })} /></Field>
          {r === 1 && (
            <div className="alert err">
              <b>Team Leader: choose the issue</b> (the Owner / Admin will be notified and a follow-up is created)
              <div className="chips" role="group" aria-label="Issue category">{ISSUE_CATEGORIES.map((c) => <button key={c} type="button" disabled={disabled} className={value.issue_category === c ? 'on' : ''} onClick={() => onChange({ ...value, issue_category: c as IssueCategory })}>{c}</button>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FeedbackSummary({ fb }: { fb: ClientFeedback }) {
  return (
    <div className="small">
      <b>{RATING_EMOJI[fb.rating]} {RATING_LABEL[fb.rating]}</b>{fb.issue_category ? ` · ${fb.issue_category}` : ''}{fb.aspects.length ? ` · ${fb.aspects.join(', ')}` : ''}{fb.comment ? ` · “${fb.comment}”` : ''}
      {fb.follow_up === 'Required' && <> <Badge tone="red">Follow-up required</Badge></>}{fb.follow_up === 'Acknowledged' && <> <Badge tone="green">Acknowledged</Badge></>}
    </div>
  );
}

function AckModal({ fb, onClose }: { fb: ClientFeedback; onClose: () => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal title="Acknowledge client feedback" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (attempt(() => acknowledgeFeedback(fb.id, note), 'Acknowledged — the job can now be closed')) onClose(); }}>Acknowledge</button></>}>
      <div className="stack"><FeedbackSummary fb={fb} />
        <Field label="Follow-up note" required hint="What was done or agreed with the client (call, re-clean, credit …)."><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
    </Modal>
  );
}

/** Shown on the Job Card while negative feedback still needs the Admin. */
export function FollowUpBanner({ jobId }: { jobId: string }) {
  const { db, can } = useAuth();
  const [ack, setAck] = useState(false);
  const fb = db.client_feedback.find((f) => f.job_id === jobId && !f.deleted_at && f.follow_up === 'Required');
  if (!fb) return null;
  return (
    <div className="alert err" style={{ marginBottom: 12 }}>
      <b>Follow-Up Required — the client was not satisfied.</b> <FeedbackSummary fb={fb} />
      <div className="small" style={{ marginTop: 4 }}>The job cannot be fully closed until the Owner / Admin acknowledges this feedback.</div>
      {can('feedback.acknowledge') && <div style={{ marginTop: 8 }}><button className="btn primary" onClick={() => setAck(true)}>Acknowledge &amp; add follow-up note</button></div>}
      {ack && <AckModal fb={fb} onClose={() => setAck(false)} />}
    </div>
  );
}

/** Dashboard section: average rating, by team leader / crew, by service type, follow-ups, monthly trend. */
export function SatisfactionDashboard({ from, to }: { from: string; to: string }) {
  const { db, can } = useAuth();
  const [who, setWho] = useState<'leader' | 'crew'>('leader');
  const [ack, setAck] = useState<ClientFeedback | null>(null);
  const st = satisfactionStats(db, from, to);
  const trend = satisfactionStats(db, addDays(to, -180), to).monthly;   // the trend always looks back six months
  const people = who === 'leader' ? st.byLeader : st.byCrew;
  const month = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
  const bar = (v: number) => <span className="satbar"><i style={{ width: `${(v / 3) * 100}%`, background: v >= 2.6 ? 'var(--green)' : v >= 2 ? 'var(--amber)' : 'var(--red)' }} /></span>;
  const table = (rows: typeof people, first: string) => (
    <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>{first}</th><th className="num">Jobs</th><th>Average</th><th className="num">😞</th><th className="num">😐</th><th className="num">😊</th></tr></thead><tbody>
      {rows.map((a) => <tr key={a.key}><td>{a.label}</td><td className="num">{a.n}</td><td><b>{a.avg.toFixed(2)}</b> {bar(a.avg)}</td><td className="num">{a.notSat || '—'}</td><td className="num">{a.sat || '—'}</td><td className="num">{a.very || '—'}</td></tr>)}
      {!rows.length && <tr><td colSpan={6} className="muted">No feedback in this period.</td></tr>}
    </tbody></table></div>
  );
  return (
    <Card title="Client satisfaction" actions={<span className="small muted">{fmtDate(from)} – {fmtDate(to)} · 1 = Not Satisfied, 3 = Very Satisfied</span>}>
      <div className="grid g4 keep2" style={{ marginBottom: 12 }}>
        <div className="stat navy"><div className="k">Average rating</div><div className="v">{st.n ? st.avg.toFixed(2) : '—'} <span className="small">/ 3</span></div><div className="s">{st.n} response{st.n === 1 ? '' : 's'}</div></div>
        <div className="stat good"><div className="k">😊 Very Satisfied</div><div className="v">{st.dist[3]}</div><div className="s">{st.n ? Math.round((st.dist[3] / st.n) * 100) : 0}%</div></div>
        <div className="stat"><div className="k">😐 Satisfied</div><div className="v">{st.dist[2]}</div><div className="s">{st.n ? Math.round((st.dist[2] / st.n) * 100) : 0}%</div></div>
        <div className={`stat ${st.dist[1] ? 'bad' : ''}`}><div className="k">😞 Not Satisfied</div><div className="v">{st.dist[1]}</div><div className="s">{st.followUps.length} follow-up{st.followUps.length === 1 ? '' : 's'} open</div></div>
      </div>
      {st.followUps.length > 0 && (
        <div className="alert err" style={{ marginBottom: 12 }}>
          <b>Negative-feedback jobs requiring follow-up</b>
          <ul className="list" style={{ marginTop: 6 }}>
            {st.followUps.map((f) => { const j = db.jobs.find((x) => x.id === f.job_id); return (
              <li key={f.id}><div><a href={`#/jobs/${f.job_id}`}><b>{j?.number}</b></a> · {db.clients.find((c) => c.id === f.client_id)?.name} · {f.issue_category}<div className="small muted">{fmtDateTime(f.submitted_at)}{f.comment ? ` · “${f.comment}”` : ''} · TL {db.employees.find((e) => e.id === f.leader_id)?.full_name}</div></div>
                {can('feedback.acknowledge') ? <button className="btn sm primary" onClick={() => setAck(f)}>Acknowledge</button> : <Badge tone="red">Waiting for Admin</Badge>}</li>
            ); })}
          </ul>
        </div>
      )}
      <div className="grid g2">
        <div>
          <div className="row between" style={{ marginBottom: 6 }}><b>By {who === 'leader' ? 'team leader' : 'crew member'}</b>
            <div className="chips" style={{ margin: 0 }} role="group"><button type="button" className={who === 'leader' ? 'on' : ''} onClick={() => setWho('leader')}>Team leader</button><button type="button" className={who === 'crew' ? 'on' : ''} onClick={() => setWho('crew')}>Crew</button></div></div>
          {table(people, who === 'leader' ? 'Team leader' : 'Employee')}
        </div>
        <div><b>By service type</b><div style={{ marginTop: 6 }}>{table(st.byService, 'Service')}</div></div>
      </div>
      <div style={{ marginTop: 14 }}><b>Monthly rating trend</b> <span className="small muted">(last 6 months)</span>
        {trend.length > 1 ? (
          <div style={{ width: '100%', height: 190 }}><ResponsiveContainer><LineChart data={trend.map((m) => ({ ...m, label: month(m.month) }))} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e9f0" /><XAxis dataKey="label" fontSize={12} /><YAxis domain={[1, 3]} ticks={[1, 2, 3]} fontSize={12} /><Tooltip formatter={(v) => [Number(v).toFixed(2), 'Average']} />
            <Line type="monotone" dataKey="avg" stroke="#12a1a7" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart></ResponsiveContainer></div>
        ) : <div className="muted small" style={{ marginTop: 4 }}>{trend.length ? `${month(trend[0].month)}: ${trend[0].avg.toFixed(2)} (${trend[0].n} responses). More months will draw the trend.` : 'No feedback yet.'}</div>}
      </div>
      {ack && <AckModal fb={ack} onClose={() => setAck(null)} />}
    </Card>
  );
}
