// "Can you make it?" — shown to a team leader / crew member from 7 PM the evening before a service until they answer, and the job's crew list for managers.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { confirmAvailability } from '@/lib/actions';
import { answerOf, isAsking, opensAt, pendingFor, summary, teamOf } from '@/lib/crew-confirm-core';
import { ask, attempt, Badge, Card } from '@/components/ui';
import { PriceLine, useCanSeePrice } from '@/components/ServicePrice';
import { fmtDate, fmtStamp, nowLocal } from '@/lib/util';
import type { Job } from '@/lib/types';

const t12 = (hm: string) => { const h = +hm.slice(0, 2); return `${((h + 11) % 12) + 1}:${hm.slice(3, 5)} ${h >= 12 ? 'PM' : 'AM'}`; };
const useNow = () => { const [n, setN] = useState(nowLocal()); useEffect(() => { const t = setInterval(() => setN(nowLocal()), 30000); return () => clearInterval(t); }, []); return n; };

/** Where the job is, what the service is and what the team must use and bring — so they know before they confirm. */
function JobBrief({ job }: { job: Job }) {
  const { db } = useAuth();
  const site = db.sites.find((x) => x.id === job.site_id); const client = db.clients.find((x) => x.id === job.client_id);
  const services = job.service_codes.map((c) => db.services.find((x) => x.code === c)?.name ?? c);
  const gear = job.equipment_ids.map((id) => db.assets.find((a) => a.id === id)?.name).filter(Boolean) as string[];
  const vehicle = job.vehicle_id ? db.assets.find((a) => a.id === job.vehicle_id)?.name : undefined;
  const mats = job.materials.map((m) => { const it = db.items.find((i) => i.id === m.item_id); return it ? `${it.name} × ${m.planned_qty} ${it.uom}` : ''; }).filter(Boolean);
  const team = teamOf(job).map((id) => db.employees.find((e) => e.id === id)?.full_name).filter(Boolean) as string[];
  const showPrice = useCanSeePrice();
  const row = (k: string, v: React.ReactNode) => <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 8 }}><span className="muted">{k}</span><span>{v}</span></div>;
  return (
    <div className="small" style={{ display: 'grid', gap: 5, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      {row('Location', <><b>{site?.name ?? '—'}</b>{site?.address ? <>, {site.address} <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`}>Map ↗</a></> : null}</>)}
      {client && row('Client', client.name)}
      {(site?.contact_person || site?.access_instructions) && row('Site contact', <>{site?.contact_person}{site?.contact_mobile ? ` · ${site.contact_mobile}` : ''}{site?.access_instructions ? <div className="muted">{site.access_instructions}</div> : null}</>)}
      {row('Service', <><b>{services.join(', ') || '—'}</b>{job.scope ? <div>{job.scope}</div> : null}</>)}
      {showPrice && row('Service price', <PriceLine job={job} />)}
      {row('Equipment', gear.length ? gear.join(', ') : <span className="muted">none listed — Operations prepares it at HQ</span>)}
      {vehicle && row('Vehicle', vehicle)}
      {mats.length > 0 && row('Materials', mats.join(' · '))}
      {job.ppe.length > 0 && row('PPE to wear', job.ppe.join(', '))}
      {team.length > 0 && row('Team', team.join(', '))}
    </div>
  );
}

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
        const day = j.start_at.slice(0, 10) === now.slice(0, 10) ? 'Today' : 'Tomorrow';
        return (
          <div key={j.id} className="alert warn" role="alert" style={{ display: 'grid', gap: 8 }}>
            <div><b style={{ fontSize: 15 }}>Please confirm your availability — {day}, {fmtDate(j.start_at.slice(0, 10))} at {t12(j.start_at.slice(11))}</b></div>
            <div className="small">{j.number}{j.leader_id === emp ? ' · you are the Team Leader' : ''}</div>
            <JobBrief job={j} />
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
