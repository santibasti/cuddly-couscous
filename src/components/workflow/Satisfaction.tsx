import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, attempt } from '@/components/ui';
import { acknowledgeFeedback, type SatisfactionInput } from '@/lib/workflow';
import { ISSUE_CATEGORIES, RATING_EMOJI, RATING_LABEL, SAT_QUESTIONS, needsFollowUp, overallFromAnswers, satisfactionStats } from '@/lib/business';
import { addDays, fmtDate, fmtDateTime } from '@/lib/util';
import type { ClientFeedback, IssueCategory, SatisfactionRating } from '@/lib/types';

const RATINGS: SatisfactionRating[] = [1, 2, 3];
const RECOMMEND: ['yes' | 'maybe' | 'no', string, string, string][] = [['yes', '👍', 'Yes, definitely', 'good'], ['maybe', '🤔', 'Maybe', 'mid'], ['no', '👎', 'No', 'bad']];
export const RECOMMEND_LABEL = { yes: 'Yes, definitely', maybe: 'Maybe', no: 'No' } as const;
const TONE: Record<SatisfactionRating, string> = { 1: 'bad', 2: 'mid', 3: 'good' };

/**
 * Client Satisfaction Check: six categories, each a tap on 1–5 stars, with a live progress bar and mood.
 * Any 1–2 star answer needs an issue category from the Team Leader and creates an Admin follow-up.
 */
const STAR_WORD = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const STAR_COLOR = ['#ef5b5b', '#f08a4b', '#f5b83d', '#7bd88f', '#2ee59d'];
const MOODS = ['🫥', '😞', '😕', '🙂', '😊', '🤩'];
export function SatisfactionCheck({ value, onChange, disabled, clientMode }: { value: Partial<SatisfactionInput>; onChange: (v: Partial<SatisfactionInput>) => void; disabled?: boolean; clientMode?: boolean }) {
  const given = SAT_QUESTIONS.map((q) => (value[q.key] as number | undefined) ?? 0);
  const done = given.filter(Boolean).length;
  const answered = done === SAT_QUESTIONS.length;
  const avg = done ? given.reduce((a, x) => a + x, 0) / done : 0;
  const low = needsFollowUp(value);
  const set = (key: (typeof SAT_QUESTIONS)[number]['key'], n: number) => {
    const next = { ...value, [key]: n };
    const all = SAT_QUESTIONS.every((q) => !!next[q.key]);
    onChange({ ...next, rating: all ? overallFromAnswers(next as Record<string, number>) : value.rating });
  };
  const allFive = () => { const next: Partial<SatisfactionInput> = { ...value }; for (const q of SAT_QUESTIONS) (next as Record<string, number>)[q.key] = 5; onChange({ ...next, rating: overallFromAnswers(next as Record<string, number>) }); };
  return (
    <div className="card satcheck" style={{ padding: 14 }}>
      {!clientMode && <div className="satq">How was our service today?</div>}
      <div className="sat-prog">
        <span className="sat-mood" aria-hidden="true">{MOODS[done ? Math.round(avg) : 0]}</span>
        <div className="sat-track" role="progressbar" aria-valuemin={0} aria-valuemax={SAT_QUESTIONS.length} aria-valuenow={done} aria-label="Questions rated"><i style={{ width: `${(done / SAT_QUESTIONS.length) * 100}%` }} /></div>
        <b className="small">{done} of {SAT_QUESTIONS.length}</b>
      </div>
      <div className="sat-rows">
        {SAT_QUESTIONS.map((q) => {
          const v = (value[q.key] as number | undefined) ?? 0;
          return (
            <div key={q.key} className={`sat-row ${v ? 'done' : ''}`}>
              <div className="sat-ic" aria-hidden="true">{q.icon}</div>
              <div className="sat-tx"><b>{q.text}</b><span className="small muted">{q.hint}</span></div>
              <div className="sat-stars" role="radiogroup" aria-label={q.text}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n} ${STAR_WORD[n - 1]}`} disabled={disabled} className={`sat-star ${n <= v ? 'on' : ''}`} style={n <= v ? { color: STAR_COLOR[v - 1] } : undefined} onClick={() => set(q.key, n)}>★</button>
                ))}
              </div>
              <div className="sat-word" style={{ color: v ? STAR_COLOR[v - 1] : undefined }}>{v ? STAR_WORD[v - 1] : ''}</div>
            </div>
          );
        })}
      </div>
      {!answered && <button type="button" className="btn sm sat-all" disabled={disabled} onClick={allFive}>🤩 Everything was excellent!</button>}
      {answered && (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="sat-thanks">{low ? 'Thank you for telling us — we will make it right. 🙏' : avg >= 4.5 ? 'Wow, thank you! 🎉 We love hearing that.' : 'Thank you for your feedback! 😊'}</div>
          <div>
            <div className="satq" style={{ marginBottom: 6 }}>Would you recommend TopMop? <span className="small muted">(optional)</span></div>
            <div className="smileys" role="radiogroup" aria-label="Would you recommend us">
              {RECOMMEND.map(([k, emo, label, tone]) => (
                <button key={k} type="button" role="radio" aria-checked={value.recommend === k} disabled={disabled} className={`smiley ${tone} ${value.recommend === k ? 'on' : ''}`} onClick={() => onChange({ ...value, recommend: value.recommend === k ? undefined : k })}>
                  <span className="emo" aria-hidden="true">{emo}</span><span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <Field label="Anything we should know? (optional)"><input disabled={disabled} value={value.comment ?? ''} onChange={(e) => onChange({ ...value, comment: e.target.value })} /></Field>
          {low && !clientMode && (
            <div className="alert err">
              <b>Team Leader: choose the issue</b> (the client gave a low rating — the Owner / Admin is notified and a follow-up is created)
              <div className="chips" role="group" aria-label="Issue category">{ISSUE_CATEGORIES.map((c) => <button key={c} type="button" disabled={disabled} className={value.issue_category === c ? 'on' : ''} onClick={() => onChange({ ...value, issue_category: c })}>{c}</button>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
/** Team Leader only: the issue category that goes with a low rating (the client is not shown this). */
export function IssuePicker({ value, onChange }: { value: Partial<SatisfactionInput>; onChange: (v: Partial<SatisfactionInput>) => void }) {
  return (
    <div className="alert err">
      <b>Team Leader: choose the issue</b> (the client was not satisfied — the Owner / Admin is notified and a follow-up is created)
      <div className="chips" role="group" aria-label="Issue category">{ISSUE_CATEGORIES.map((c) => <button key={c} type="button" className={value.issue_category === c ? 'on' : ''} onClick={() => onChange({ ...value, issue_category: c as IssueCategory })}>{c}</button>)}</div>
    </div>
  );
}
/** Everything the handover needs before the report can be signed. */
export const satisfactionComplete = (s: Partial<SatisfactionInput>) => SAT_QUESTIONS.every((q) => !!s[q.key]) && !!s.rating && (!needsFollowUp(s) || !!s.issue_category);

export function FeedbackSummary({ fb }: { fb: ClientFeedback }) {
  return (
    <div className="small">
      <b>{RATING_EMOJI[fb.rating]} {RATING_LABEL[fb.rating]}</b>
      {SAT_QUESTIONS.map((q) => (fb[q.key] ? ` · ${q.text.split(' ')[0].toLowerCase()} ${fb[q.key]}/5` : '')).join('')}{fb.recommend ? ` · would recommend: ${RECOMMEND_LABEL[fb.recommend]}` : ''}{fb.issue_category ? ` · ${fb.issue_category}` : ''}{fb.aspects.length ? ` · ${fb.aspects.join(', ')}` : ''}{fb.comment ? ` · “${fb.comment}”` : ''}
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
    <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>{first}</th><th className="num">Jobs</th><th>Average</th><th>Cleaning · Crew · Comm.</th><th className="num">😞</th><th className="num">😐</th><th className="num">😊</th></tr></thead><tbody>
      {rows.map((a) => <tr key={a.key}><td>{a.label}</td><td className="num">{a.n}</td><td><b>{a.avg.toFixed(2)}</b> {bar(a.avg)}</td><td className="small">{a.quality ? `${a.quality} · ${a.professionalism} · ${a.communication}` : '—'}</td><td className="num">{a.notSat || '—'}</td><td className="num">{a.sat || '—'}</td><td className="num">{a.very || '—'}</td></tr>)}
      {!rows.length && <tr><td colSpan={7} className="muted">No feedback in this period.</td></tr>}
    </tbody></table></div>
  );
  return (
    <Card title="Client satisfaction" actions={<span className="small muted">{fmtDate(from)} – {fmtDate(to)} · 1 = Not Satisfied, 3 = Very Satisfied</span>}>
      <div className="grid g4 keep2" style={{ marginBottom: 12 }}>
        <div className="stat navy"><div className="k">Average rating</div><div className="v">{st.n ? st.avg.toFixed(2) : '—'} <span className="small">/ 3</span></div><div className="s">{st.n} response{st.n === 1 ? '' : 's'}</div></div>
        <div className="stat good"><div className="k">😊 Very Satisfied</div><div className="v">{st.dist[3]}</div><div className="s">{st.n ? Math.round((st.dist[3] / st.n) * 100) : 0}%</div></div>
        <div className="stat"><div className="k">😐 Satisfied</div><div className="v">{st.dist[2]}</div><div className="s">{st.n ? Math.round((st.dist[2] / st.n) * 100) : 0}%</div></div>
        <div className="stat"><div className="k">👍 Would recommend us</div><div className="v">{st.recommendN ? `${st.recommendPct}%` : '—'}</div><div className="s">{st.recommendN} answered</div></div>
        <div className="stat"><div className="k">Question averages (1–5)</div><div className="v small" style={{ fontSize: 15 }}>Cleaning {st.questions.quality || '—'} · Crew {st.questions.professionalism || '—'} · Comm. {st.questions.communication || '—'}</div><div className="s">quality · professionalism · communication</div></div>
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
