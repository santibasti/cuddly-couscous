// "Can you make it?" — shown to a team leader / crew member from 7 PM the evening before a service until they answer, and the job's crew list for managers.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { confirmAvailability } from '@/lib/actions';
import { answerOf, isAsking, opensAt, pendingFor, summary, teamOf } from '@/lib/crew-confirm-core';
import { ask, attempt, Badge, Card } from '@/components/ui';
import { fmtDate, fmtStamp, nowLocal } from '@/lib/util';
import type { Job } from '@/lib/types';

const t12 = (hm: string) => { const h = +hm.slice(0, 2); return `${((h + 11) % 12) + 1}:${hm.slice(3, 5)} ${h >= 12 ? 'PM' : 'AM'}`; };
const useNow = () => { const [n, setN] = useState(nowLocal()); useEffect(() => { const t = setInterval(() => setN(nowLocal()), 30000); return () => clearInterval(t); }, []); return n; };

/** Banner at the top of the app for the signed-in employee: one card per job still waiting for their answer. */
export function AvailabilityPrompt() {
  const { db, user } = useAuth(); const now = useNow();
  const emp = user?.employee_id;
  if (!emp) return null;
  const jobs = pendingFor(db.jobs, emp, now);
  if (!jobs.length) return null;
  return (
    <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
      {jobs.map((j) => {
        const c = db.clients.find((x) => x.id === j.client_id); const site = db.sites.find((x) => x.id === j.site_id);
        const day = j.start_at.slice(0, 10) === now.slice(0, 10) ? 'Today' : 'Tomorrow';
        return (
          <div key={j.id} className="alert warn" role="alert" style={{ display: 'grid', gap: 8 }}>
            <div><b style={{ fontSize: 15 }}>Please confirm your availability — {day}, {fmtDate(j.start_at.slice(0, 10))} at {t12(j.start_at.slice(11))}</b></div>
            <div className="small">{c?.name}{site ? ` · ${site.name}` : ''}{site?.address ? ` · ${site.address}` : ''} · {j.number}{j.leader_id === emp ? ' · you are the Team Leader' : ''}</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => attempt(() => confirmAvailability(j.id, 'confirmed'), 'Thank you — confirmed')}>✔ I'm available</button>
              <button className="btn danger" onClick={async () => { const r = await ask('I cannot make it', 'Reason (the Operations team will be told)', { required: true, okLabel: 'Send' }); if (r) attempt(() => confirmAvailability(j.id, 'declined', r), 'Operations has been told'); }}>✖ I can't make it</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** On the job card: who confirmed, who cannot make it, who has not answered. */
export function CrewAvailability({ job }: { job: Job }) {
  const { db, user } = useAuth(); const now = useNow();
  if (!['Confirmed', 'Dispatch Checklist Pending'].includes(job.status)) return null;
  const sm = summary(job); if (!sm.team.length) return null;
  const nm = (id: string) => db.employees.find((e) => e.id === id)?.full_name ?? id;
  const asking = isAsking(job, now);
  const mine = user?.employee_id && teamOf(job).includes(user.employee_id) ? user.employee_id : undefined;
  return (
    <Card title="Crew availability" actions={<span className="small muted">{sm.confirmed.length} confirmed · {sm.declined.length} declined · {sm.waiting.length} waiting</span>}>
      {!asking && !sm.confirmed.length && !sm.declined.length && <div className="small muted" style={{ marginBottom: 8 }}>The team is asked to confirm from {t12(opensAt(job).slice(11))} the evening before ({fmtDate(opensAt(job).slice(0, 10))}), in their own account.</div>}
      <ul className="list">
        {sm.team.map((id) => { const a = answerOf(job, id); return (
          <li key={id}><div><b>{nm(id)}</b> <span className="muted small">{id === job.leader_id ? 'Team Leader' : 'Crew'}</span>{a?.note && <div className="small" style={{ color: 'var(--red)' }}>“{a.note}”</div>}</div>
            <div className="row" style={{ gap: 6 }}>{a ? <><Badge tone={a.status === 'confirmed' ? 'green' : 'red'}>{a.status === 'confirmed' ? 'Confirmed' : "Can't make it"}</Badge><span className="small muted">{fmtStamp(a.at)}</span></> : <Badge tone="amber">{asking ? 'Waiting' : 'Not asked yet'}</Badge>}
              {id === mine && asking && !a && <button className="btn sm primary" onClick={() => attempt(() => confirmAvailability(job.id, 'confirmed'), 'Thank you — confirmed')}>Confirm</button>}</div></li>
        ); })}
      </ul>
    </Card>
  );
}
