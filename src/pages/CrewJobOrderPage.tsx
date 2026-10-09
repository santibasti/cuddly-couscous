// The crew's copy of the Job Order (no prices, no payment terms): shown to security / the client on site.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { CLOUD, supabase } from '@/lib/cloud';
import { Badge, attempt } from '@/components/ui';
import { JobOrderDocument } from '@/components/JobOrderDocument';
import { crewContentFromServer, headOrder, orderLabel, stripForCrew } from '@/lib/joborder-core';
import { buildJobOrderPdf, jobOrderFilename } from '@/lib/joborderpdf';
import type { JobOrder } from '@/lib/types';

/** The crew copy of the latest sent Job Order of a job (cloud: made by the database, so prices never reach the phone). */
export function useCrewJobOrder(jobId: string): JobOrder | null | undefined {
  const { db, user } = useAuth();
  const [o, setO] = useState<JobOrder | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (CLOUD) { supabase().rpc('crew_job_order', { p_job: jobId }).then(({ data }) => { if (!live) return; const d = data as (Omit<JobOrder, 'content'> & { content: Partial<JobOrder['content']> }) | null; setO(d ? ({ ...d, content: crewContentFromServer(d.content) } as JobOrder) : null); }); }
    else {
      const job = db.jobs.find((j) => j.id === jobId); const me = user?.employee_id;
      const ok = !!job && !!me && (job.leader_id === me || job.crew_ids.includes(me));
      const head = ok ? headOrder(db, jobId) : undefined;
      setO(head && head.status === 'Sent to Client' ? { ...head, content: stripForCrew(head.content) } : null);
    }
    return () => { live = false; };
  }, [jobId, db.job_orders, user?.employee_id]); // eslint-disable-line react-hooks/exhaustive-deps
  return o;
}

export default function CrewJobOrderPage() {
  const { jobId } = useParams(); const nav = useNavigate();
  const { db } = useAuth();
  const o = useCrewJobOrder(jobId ?? '');
  const job = db.jobs.find((j) => j.id === jobId);
  const download = async () => { if (!o) return; const blob = await buildJobOrderPdf(o); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = jobOrderFilename(o); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
  return (
    <div className="jopage">
      <div className="jopage-bar">
        <button className="btn" onClick={() => (job ? nav(`/jobs/${job.id}`) : nav(-1))}>← Back to job{job ? ` ${job.number}` : ''}</button>
        <div className="grow">{o && <><b>{orderLabel(o)}</b> <Badge>Crew copy</Badge></>}</div>
        {o && <button className="btn primary" onClick={() => attempt(download)}>Download PDF</button>}
      </div>
      {o === undefined && <p className="muted">Loading…</p>}
      {o === null && <div className="alert info" style={{ maxWidth: 860, margin: '0 auto' }}>The Job Order for this job has not been sent to the client yet, or you are not assigned to it. <Link to="/jobs">Back to jobs</Link></div>}
      {o && <div className="jopage-sheet"><JobOrderDocument order={o} /></div>}
    </div>
  );
}
