// The page a client opens from the Quotation share link (no sign-in): read the quotation, then accept it with a drawn signature.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { CLOUD, emptyDB, supabase } from '@/lib/cloud';
import { Field, SignaturePad } from '@/components/ui';
import { LOGO_SMALL_URL } from '@/lib/logo';
import { docTotals } from '@/lib/business';
import { paymentLabel, paymentSentence } from '@/lib/quote-text';
import { acceptQuoteByLink } from '@/lib/actions';
import { quotationPdf } from '@/lib/export';
import { fmtDate, fmtDateTime, money } from '@/lib/util';
import type { Quotation, Settings } from '@/lib/types';

interface Bundle {
  quotation: Quotation; client: { name: string; contact_person?: string; address?: string }; site?: { name: string; address: string } | null;
  company: Settings['company']; defaults?: { intro?: string; methodology?: string; disclaimer?: string; crew?: string };
}

export default function QuotePublic() {
  const { token } = useParams();
  const { db } = useAuth();
  useEffect(() => { document.body.classList.remove('dark'); }, []);   // the client's page is always the light, printable look
  const [b, setB] = useState<Bundle | null | undefined>(undefined);
  const [name, setName] = useState(''); const [sig, setSig] = useState<string | undefined>(); const [agree, setAgree] = useState(false);
  const [setup, setSetup] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const load = () => {
    if (CLOUD) return supabase().rpc('get_quotation_public', { p_token: token }).then(({ data, error }) => { if (error) setSetup(error.message); setB((data as Bundle | null) ?? null); });
    const q = db.quotations.find((x) => x.share_token === token && ['Sent', 'Approved'].includes(x.status) && !x.deleted_at); const c = q && db.clients.find((x) => x.id === q.client_id);
    const site = q?.site_id ? db.sites.find((x) => x.id === q.site_id) : undefined;
    setB(q && c ? { quotation: q, client: { name: c.name, contact_person: c.contact_person, address: c.address || c.billing_address }, site: site ? { name: site.name, address: site.address } : null, company: db.settings.company } : null);
    return Promise.resolve();
  };
  useEffect(() => { void load(); }, [token, db.quotations]); // eslint-disable-line react-hooks/exhaustive-deps
  if (b === undefined) return <div style={{ padding: 24 }} className="muted">Loading…</div>;
  if (b === null) return <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}><div className="alert warn"><b>This link is not available.</b> It may have expired, or the quotation was not sent yet. Please contact us for a new link.{setup && <div className="small" style={{ marginTop: 6 }}>Technical detail for the TopMop administrator: the online quotation link is not set up on the server yet ({setup}). Run the latest database update (supabase db push, migration 0033).</div>}</div></div>;
  const q = b.quotation; const t = docTotals(q.items, q.discount, q.vat_mode, q.vat_rate); const signed = !!q.client_sig;
  const expired = q.valid_until < new Date().toISOString().slice(0, 10);
  const download = async () => {
    const d = { ...emptyDB(), settings: { company: b.company, default_intro: b.defaults?.intro, default_methodology: b.defaults?.methodology, default_disclaimer: b.defaults?.disclaimer, default_crew_size: b.defaults?.crew, counters: {} } as unknown as Settings, clients: [{ name: b.client.name, contact_person: b.client.contact_person ?? '', address: b.client.address ?? '', billing_address: b.client.address ?? '' } as never], sites: b.site ? [{ name: b.site.name, address: b.site.address } as never] : [] };
    const full = { ...q, id: 'public', client_id: undefined, site_id: undefined } as unknown as Quotation;
    d.clients[0] = { ...(d.clients[0] as object), id: 'c' } as never; full.client_id = 'c'; if (b.site) { d.sites[0] = { ...(d.sites[0] as object), id: 's' } as never; full.site_id = 's'; }
    const blob = await quotationPdf(d, full, { blob: true });
    if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${q.number}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  };
  const accept = async () => {
    setErr('');
    if (!name.trim()) return setErr('Please type your full name.');
    if (!sig) return setErr('Please sign in the signature box.');
    if (!agree) return setErr('Please tick the box to confirm you accept this quotation.');
    setBusy(true);
    try {
      if (CLOUD) { const { error } = await supabase().rpc('accept_quotation_public', { p_token: token, p_name: name.trim(), p_sig: sig }); if (error) throw new Error(error.message); }
      else acceptQuoteByLink(token!, name, sig);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 14px 40px', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      <div className="row between no-print" style={{ marginBottom: 12 }}><span className="muted small">Quotation</span><span className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => window.print()}>Print</button><button className="btn primary sm" onClick={() => void download()}>Download PDF</button></span></div>
      <div className="joc">
        <div className="joc-head">
          <div className="row" style={{ gap: 12, alignItems: 'center' }}><img src={LOGO_SMALL_URL} alt="TopMop" width={54} height={54} /><div><b className="joc-co">{b.company.name}</b><div className="small">{b.company.tagline}</div><div className="small">{b.company.address}</div><div className="small">{b.company.phone} · {b.company.email}</div></div></div>
          <div className="joc-title"><b>QUOTATION</b><div>{q.number}</div><div className="small">Issued {fmtDate(q.issue_date)} · Valid until {fmtDate(q.valid_until)}</div></div>
        </div>
        <div className="grid g2">
          <div><div className="joc-k">Prepared for</div><b>{b.client.name}</b>{b.client.address && <div>{b.client.address}</div>}{b.client.contact_person && <div>Attention: {b.client.contact_person}</div>}</div>
          <div><div className="joc-k">Service location</div>{b.site ? <><b>{b.site.name}</b><div>{b.site.address}</div></> : <span className="muted">As discussed</span>}</div>
        </div>
        <div className="joc-k" style={{ marginTop: 12 }}>Scope of work</div><p style={{ marginTop: 2 }}>{q.scope}</p>
        <table className="tbl"><thead><tr><th>Description</th><th className="num">Qty / unit</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
          <tbody>{q.items.map((r, i) => <tr key={i}><td>{r.description}</td><td className="num">{r.qty.toLocaleString('en-PH')} {r.unit}</td><td className="num">{money(r.rate)}</td><td className="num">{money(r.qty * r.rate - r.discount)}</td></tr>)}</tbody></table>
        <table className="tbl" style={{ marginTop: 6, maxWidth: 360, marginLeft: 'auto' }}><tbody>
          <tr><td>Subtotal</td><td className="num">{money(t.gross)}</td></tr>
          {t.discount > 0 && <tr><td>Discount</td><td className="num">− {money(t.discount)}</td></tr>}
          {q.vat_mode !== 'none' && <tr><td>VAT {q.vat_rate}%{q.vat_mode === 'inclusive' ? ' (included)' : ''}</td><td className="num">{money(t.vat)}</td></tr>}
          <tr><td><b>Total</b></td><td className="num"><b style={{ fontSize: 17 }}>{money(t.total)}</b></td></tr></tbody></table>
        {(q.crew_size || q.work_days) && <p className="small" style={{ marginTop: 10 }}><b>Manpower and duration:</b> {q.crew_size ? `${q.crew_size} personnel${q.safety_officer ? ' including a designated safety officer' : ''}` : ''}{q.work_days ? `${q.crew_size ? ' · ' : ''}${q.work_days} working day${q.work_days > 1 ? 's' : ''}` : ''}.</p>}
        {paymentSentence(q.payment_option) && <p className="small" style={{ marginTop: 10 }}><b>Payment terms:</b> {paymentLabel(q.payment_option)}. {paymentSentence(q.payment_option)}</p>}
        {q.terms && <><div className="joc-k">Terms and conditions</div><p className="small" style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{q.terms}</p></>}
        {q.disclaimer?.trim() && <><div className="joc-k">Service disclaimer</div>{q.disclaimer.trim().split(/\n\s*\n/).map((p, i) => <p key={i} className="small" style={{ marginTop: 2 }}>{p}</p>)}</>}
      </div>

      <div className="card no-print" style={{ marginTop: 16, padding: 16 }}>
        {signed ? <>
          <div className="alert info"><b>Accepted and signed.</b> Thank you{q.client_sig_name ? `, ${q.client_sig_name}` : ''}. {b.company.name} has received your acceptance{q.client_sig_at ? ` (${fmtDateTime(q.client_sig_at)})` : ''} and will contact you to schedule the service.</div>
          <img src={q.client_sig} alt="Your signature" style={{ background: '#fff', borderRadius: 8, maxWidth: 320, marginTop: 10, border: '1px solid var(--line)' }} />
        </> : q.status !== 'Sent' ? <div className="alert warn">This quotation is not open for acceptance. Please contact us.</div>
          : expired ? <div className="alert warn">This quotation was valid until {fmtDate(q.valid_until)} and has expired. Please contact us for an updated quotation.</div>
          : <>
            <b style={{ fontSize: 16 }}>Accept this quotation</b>
            <p className="small muted" style={{ margin: '4px 0 10px' }}>Type your name and sign below to accept the scope, price, terms and disclaimer above. Your acceptance is sent to {b.company.name} immediately.</p>
            <Field label="Full name" required><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" /></Field>
            <div style={{ marginTop: 10 }}><SignaturePad value={sig} onChange={setSig} /></div>
            <label className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-start' }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} /><span className="small">I have read and accept this quotation, including the scope of work, price, terms and service disclaimer.</span></label>
            {err && <div className="alert warn" style={{ marginTop: 10 }}>{err}</div>}
            <button className="btn primary lg" style={{ marginTop: 12, width: '100%' }} disabled={busy} onClick={() => void accept()}>{busy ? 'Sending…' : 'Accept and sign'}</button>
          </>}
      </div>
    </div>
  );
}
