import { useState } from 'react';
import { Link } from 'react-router-dom';
import { store, useDB } from '@/lib/store';
import { Badge, Card, Field, Stat, Tabs, attempt, toast } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { docTotals, invoiceBalance, invoiceState, invoiceTotals, isDone, isOpen } from '@/lib/business';
import { invoicePdf, quotationPdf, serviceReportPdf, statementPdf } from '@/lib/export';
import { fmtDate, fmtDateTime, money, sum, today } from '@/lib/util';

const KEY = 'topmop-portal-client';

/** Client portal (Phase 3). Demo: sign in as any client contact using password topmop123.
 *  Production: a Supabase Auth user with `client_id` claim; RLS restricts every table to that client. */
export default function Portal() {
  const db = useDB();
  const [cid, setCid] = useState<string | null>(() => { try { return sessionStorage.getItem(KEY); } catch { return null; } });
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [tab, setTab] = useState<'overview' | 'quotes' | 'jobs' | 'invoices'>('overview');
  const client = db.clients.find((c) => c.id === cid && !c.deleted_at);

  if (!client) {
    return (
      <div className="login" style={{ gridTemplateColumns: '1fr' }}>
        <section className="form">
          <div className="row" style={{ marginBottom: 16 }}><Logo size={40} /><div><b style={{ letterSpacing: '.04em' }}>TOPMOP CLIENT PORTAL</b><div className="small muted">Quotations · Bookings · Invoices · Service reports</div></div></div>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); const c = db.clients.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && !x.deleted_at); if (!c || pw !== 'topmop123') return toast('Invalid client email or password.', 'err'); try { sessionStorage.setItem(KEY, c.id); } catch { /* noop */ } setCid(c.id); }}>
            <Field label="Contact email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required list="demo-clients" /></Field>
            <Field label="Password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
            <button className="btn primary lg">Sign in</button>
          </form>
          <datalist id="demo-clients">{db.clients.filter((c) => c.status === 'Active').map((c) => <option key={c.id} value={c.email}>{c.name}</option>)}</datalist>
          <div className="alert info" style={{ marginTop: 14 }}><b>Demo:</b> pick a client contact email from the suggestions (start typing) and use password <code>topmop123</code>.</div>
          <p className="small muted"><Link to="/login">← Staff sign in</Link></p>
        </section>
      </div>
    );
  }

  const quotes = db.quotations.filter((q) => q.client_id === client.id && !q.deleted_at && q.status !== 'Draft');
  const jobs = db.jobs.filter((j) => j.client_id === client.id && !j.deleted_at && !['Cancelled'].includes(j.status)).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const invs = db.invoices.filter((i) => i.client_id === client.id && i.status === 'Approved' && !i.deleted_at);
  const balance = sum(invs, (i) => invoiceBalance(db, i));
  const decide = (id: string, ok: boolean) => attempt(() => { store.update('quotations', id, { status: ok ? 'Approved' : 'Rejected', decided_at: new Date().toISOString(), reject_reason: ok ? undefined : 'Declined via client portal' }, ok ? 'approve' : 'update', `[Client portal] ${client.name} ${ok ? 'approved' : 'declined'} quotation`); }, ok ? 'Thank you — quotation approved. Our team will confirm your booking.' : 'Quotation declined.');

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <header className="topbar"><Logo size={30} /><b style={{ color: 'var(--navy)' }}>TopMop Client Portal</b><span className="grow" /><span className="muted small">{client.name}</span><button className="btn sm" onClick={() => { try { sessionStorage.removeItem(KEY); } catch { /* noop */ } setCid(null); }}>Sign out</button></header>
      <div className="content">
        <h1 style={{ marginBottom: 12 }}>Welcome, {client.contact_person}</h1>
        <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
          <Stat k="Open quotations" v={quotes.filter((q) => q.status === 'Sent').length} tone="warn" /><Stat k="Upcoming services" v={jobs.filter((j) => isOpen(j.status)).length} /><Stat k="Completed services" v={jobs.filter((j) => isDone(j.status)).length} tone="good" /><Stat k="Balance due" v={money(balance)} tone={balance ? 'warn' : 'good'} />
        </div>
        <Tabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'quotes', label: 'Quotations', count: quotes.length }, { id: 'jobs', label: 'Services & reports', count: jobs.length }, { id: 'invoices', label: 'Invoices', count: invs.length }]} value={tab} onChange={setTab} />
        {tab === 'overview' && (
          <div className="grid g2">
            <Card title="Upcoming services" flush><ul className="list">{jobs.filter((j) => isOpen(j.status)).map((j) => <li key={j.id}><div><b>{fmtDateTime(j.start_at)}</b><div className="small muted">{db.sites.find((s) => s.id === j.site_id)?.name} · {j.service_codes.map((c) => db.services.find((s) => s.code === c)?.name).join(', ')}</div></div><Badge>{j.status}</Badge></li>)}{!jobs.some((j) => isOpen(j.status)) && <li className="muted">Nothing scheduled.</li>}</ul></Card>
            <Card title="Quotations awaiting your approval" flush><ul className="list">{quotes.filter((q) => q.status === 'Sent').map((q) => <li key={q.id}><div><b>{q.number}</b><div className="small muted">Valid until {fmtDate(q.valid_until)}</div></div><b>{money(docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total)}</b></li>)}{!quotes.some((q) => q.status === 'Sent') && <li className="muted">None.</li>}</ul></Card>
          </div>
        )}
        {tab === 'quotes' && (
          <Card flush><ul className="list">{quotes.map((q) => <li key={q.id}><div><b>{q.number}</b> <Badge>{q.status}</Badge><div className="small muted">{q.scope}</div><div className="small">Total {money(docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total)} · valid until {fmtDate(q.valid_until)}</div></div>
            <span className="row"><button className="btn sm" onClick={() => attempt(() => quotationPdf(db, q))}>PDF</button>{q.status === 'Sent' && <><button className="btn sm primary" onClick={() => decide(q.id, true)}>Approve</button><button className="btn sm danger" onClick={() => decide(q.id, false)}>Decline</button></>}</span></li>)}</ul></Card>
        )}
        {tab === 'jobs' && (
          <Card flush><ul className="list">{jobs.map((j) => <li key={j.id}><div><b>{j.number}</b> <Badge>{j.status}</Badge><div className="small muted">{fmtDateTime(j.start_at)} · {db.sites.find((s) => s.id === j.site_id)?.name}</div>{j.findings && <div className="small">Findings: {j.findings}</div>}</div>{isDone(j.status) && j.completed_at && <button className="btn sm" onClick={() => attempt(() => serviceReportPdf(db, j))}>Service report (PDF)</button>}</li>)}</ul></Card>
        )}
        {tab === 'invoices' && (
          <Card title="Invoices" actions={<button className="btn sm" onClick={() => attempt(() => statementPdf(db, client.id, today()))}>Statement of account (PDF)</button>} flush><ul className="list">{invs.map((i) => <li key={i.id}><div><b>{i.number}</b> <Badge>{invoiceState(db, i)}</Badge><div className="small muted">Issued {fmtDate(i.issue_date)} · due {fmtDate(i.due_date)}</div></div><span className="row"><span className="mono">{money(invoiceTotals(i).total)} <span className="muted small">bal {money(invoiceBalance(db, i))}</span></span><button className="btn sm" onClick={() => attempt(() => invoicePdf(db, i))}>PDF</button></span></li>)}</ul></Card>
        )}
      </div>
    </div>
  );
}
