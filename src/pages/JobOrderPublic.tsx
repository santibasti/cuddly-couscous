// The page a client opens from the Job Order share link (no sign-in). Shows only the client-facing document.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { CLOUD, supabase } from '@/lib/cloud';
import { JobOrderDocument } from '@/components/JobOrderDocument';
import { buildJobOrderPdf, jobOrderFilename } from '@/lib/joborderpdf';
import type { JobOrder } from '@/lib/types';

type Shown = Pick<JobOrder, 'number' | 'version' | 'status' | 'issued_on' | 'content'>;

export default function JobOrderPublic() {
  const { token } = useParams();
  const { db } = useAuth();
  useEffect(() => { document.body.classList.remove('dark'); }, []);   // the client's page is always the light, printable look
  const [o, setO] = useState<Shown | null | undefined>(undefined);
  const [setup, setSetup] = useState('');
  useEffect(() => {
    let live = true;
    if (CLOUD) {
      supabase().rpc('get_job_order_public', { p_token: token }).then(({ data, error }) => { if (!live) return; if (error) setSetup(error.message); setO((data as Shown | null) ?? null); });
    } else {
      const f = db.job_orders.find((x) => x.share_token === token && ['Sent to Client', 'Superseded'].includes(x.status) && !x.deleted_at);
      setO(f ?? null);
    }
    return () => { live = false; };
  }, [token, db.job_orders]);
  const download = async () => {
    if (!o) return;
    const blob = await buildJobOrderPdf(o as JobOrder); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = jobOrderFilename(o); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  return (
    <div className="pubpage">
      {o === undefined && <p className="muted">Loading…</p>}
      {o === null && <div className="alert warn"><b>This link is not available.</b> It may have expired, or the Job Order was not sent yet. Please contact us for a new link.{setup && <div className="small" style={{ marginTop: 6 }}>Technical detail for the TopMop administrator: {setup}. Run the latest database update (supabase db push, migration 0021).</div>}</div>}
      {o && <>
        <div className="pubbar no-print"><span className="muted small">Job Order Confirmation</span><span className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => window.print()}>Print</button><button className="btn primary sm" onClick={download}>Download PDF</button></span></div>
        <div className="pubsheet"><JobOrderDocument order={o} /></div>
      </>}
    </div>
  );
}
