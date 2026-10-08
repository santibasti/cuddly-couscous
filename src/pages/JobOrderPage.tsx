// Review of a Job Order Confirmation as a proper page: the document on a centred sheet, with print / PDF / send actions above it.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, attempt } from '@/components/ui';
import { JobOrderDocument } from '@/components/JobOrderDocument';
import { downloadJobOrder, printJobOrder, shareLink } from '@/components/JobOrderPanel';
import { logJobOrderEvent } from '@/lib/joborders';
import { orderLabel } from '@/lib/joborder-core';
import { fmtStamp } from '@/lib/util';

export default function JobOrderPage() {
  const { id } = useParams(); const nav = useNavigate();
  const { db, can, user } = useAuth();
  const o = db.job_orders.find((x) => x.id === id && !x.deleted_at);
  const job = o ? db.jobs.find((j) => j.id === o.job_id) : undefined;
  const manager = can('joborders.manage') || can('jobs.all');
  const myEmp = user?.employee_id; const mine = !!job && !!myEmp && can('dispatch.run') && (job.leader_id === myEmp || job.crew_ids.includes(myEmp));   // the Team Leader on the job may show it on site
  if (!manager && !mine) return <div className="alert warn">You do not have access to this Job Order.</div>;
  if (!o) return <div className="alert warn">Job Order not found. <Link to="/jobs">Back to jobs</Link></div>;
  const who = user?.name;
  const sent = o.status === 'Sent to Client' || o.status === 'Superseded';
  const logIt = (a: string) => { if (manager) logJobOrderEvent(o.id, a); };
  const copy = async () => { try { await navigator.clipboard.writeText(shareLink(o)); logIt('Share link copied'); attempt(() => true, 'Share link copied'); } catch { window.prompt('Copy this link', shareLink(o)); } };
  return (
    <div className="jopage">
      <div className="jopage-bar">
        <button className="btn" onClick={() => (job ? nav(`/jobs/${job.id}`) : nav(-1))}>← Back to job{job ? ` ${job.number}` : ''}</button>
        <div className="grow"><b>{orderLabel(o)}</b> <Badge>{o.status}</Badge><div className="small muted">Issued {o.issued_on}{o.sent_at ? ` · sent ${fmtStamp(o.sent_at)}` : ' · not sent yet'}</div></div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => attempt(() => printJobOrder(o, who))}>Print</button>
          <button className="btn primary" onClick={() => attempt(() => downloadJobOrder(o, who))}>Download PDF</button>
          {sent && manager && <button className="btn" onClick={() => void copy()}>Copy client link</button>}
        </div>
      </div>
      {!sent && manager && <div className="alert info" style={{ margin: '0 auto 12px', maxWidth: 860 }}>This is a draft — the client link opens only after it is marked as sent to the client (on the job card).</div>}
      <div className="jopage-sheet"><JobOrderDocument order={o} /></div>
    </div>
  );
}
