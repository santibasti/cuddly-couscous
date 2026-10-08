// Preview of a quotation exactly as the client sees it (same layout as the PDF and the client link).
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, attempt } from '@/components/ui';
import { QuotationDocument, type QuoteBundle } from '@/components/QuotationDocument';
import { quoteLink } from '@/lib/actions';
import { quotationPdf } from '@/lib/export';
import { fmtStamp } from '@/lib/util';

export default function QuotePreviewPage() {
  const { id } = useParams(); const nav = useNavigate();
  const { db, can } = useAuth();
  const q = db.quotations.find((x) => x.id === id && !x.deleted_at);
  if (!can('sales.view')) return <div className="alert warn">You do not have access to quotations.</div>;
  if (!q) return <div className="alert warn">Quotation not found. <Link to="/sales">Back to quotations</Link></div>;
  const c = db.clients.find((x) => x.id === q.client_id); const site = q.site_id ? db.sites.find((x) => x.id === q.site_id) : undefined;
  const s = db.settings;
  const bundle: QuoteBundle = { quotation: q, client: { name: c?.name ?? '', contact_person: c?.contact_person, address: c?.address || c?.billing_address }, site: site ? { name: site.name, address: site.address } : null, company: s.company, defaults: { intro: s.default_intro, methodology: s.default_methodology, disclaimer: s.default_disclaimer, crew: s.default_crew_size } };
  const shared = ['Sent', 'Approved'].includes(q.status);
  const copy = async () => { const url = quoteLink(q.id); try { await navigator.clipboard.writeText(url); attempt(() => true, 'Client link copied'); } catch { window.prompt('Copy this link for the client', url); } };
  return (
    <div className="jopage">
      <div className="jopage-bar">
        <button className="btn" onClick={() => nav(`/sales/quote/${q.id}`)}>← Back to quotation</button>
        <div className="grow"><b>{q.number}</b> <Badge>{q.status}</Badge><div className="small muted">{q.client_sig_at ? `Signed by ${q.client_sig_name} · ${fmtStamp(q.client_sig_at)}` : `Issued ${q.issue_date} · valid until ${q.valid_until}`}</div></div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => attempt(() => quotationPdf(db, q))}>Download PDF</button>
          {shared && <button className="btn" onClick={() => void copy()}>Copy client link</button>}
        </div>
      </div>
      {!shared && <div className="alert info" style={{ margin: '0 auto 12px', maxWidth: 860 }}>This is a preview. Mark the quotation as sent to get a link the client can sign.</div>}
      <div className="jopage-sheet"><QuotationDocument b={bundle} /></div>
    </div>
  );
}
