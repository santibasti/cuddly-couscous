// Job Order Confirmation section on the booking (job) page: status, sent date / time, version history and the send / download actions.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, attempt, useObj } from '@/components/ui';
import { JobOrderDocument } from '@/components/JobOrderDocument';
import { SEND_VIA, logJobOrderEvent, markJobOrderSent, resendJobOrder, syncJobOrders } from '@/lib/joborders';
import { ORDER_JOB_STATUSES, headOrder, ordersOf, orderLabel } from '@/lib/joborder-core';
import { buildJobOrderPdf, jobOrderFilename } from '@/lib/joborderpdf';
import { fmtDate, fmtStamp } from '@/lib/util';
import type { Job, JobOrder, JobOrderStatus } from '@/lib/types';

const TONE: Record<JobOrderStatus, string> = { Draft: 'amber', 'Sent to Client': 'green', Revised: 'amber', Superseded: 'gray' };
export const shareLink = (o: JobOrder) => `${location.origin}${location.pathname.replace(/index\.html$/, '')}#/jo/${o.share_token}`;

async function pdfOf(o: JobOrder, name?: string) { return { blob: await buildJobOrderPdf(o, { generatedBy: name }), file: jobOrderFilename(o) }; }
export async function downloadJobOrder(o: JobOrder, who?: string) {
  const { blob, file } = await pdfOf(o, who); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
export async function printJobOrder(o: JobOrder, who?: string) {
  const { blob } = await pdfOf(o, who); const url = URL.createObjectURL(blob); const w = window.open(url, '_blank');
  if (!w) throw new Error('Allow pop-ups to print, or use Download PDF.');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function SendModal({ order, resend, onClose }: { order: JobOrder; resend: boolean; onClose: () => void }) {
  const f = useObj({ via: 'Email' as string, note: '' });
  const go = () => { if (attempt(() => (resend ? resendJobOrder(order.id, f.v.via, f.v.note) : markJobOrderSent(order.id, f.v.via, f.v.note)), resend ? 'Job Order resent — recorded' : 'Job Order marked as sent to the client')) onClose(); };
  return (
    <Modal title={resend ? `Resend ${orderLabel(order)}` : `Mark ${orderLabel(order)} as sent`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go}>{resend ? 'Record resend' : 'Mark as sent'}</button></>}>
      <p className="small muted" style={{ marginTop: 0 }}>Use Download PDF, Email or Copy link to deliver it, then record it here. The date and time are saved in the Job Order's trail.</p>
      <div className="form-grid">
        <Field label="Sent via"><select {...f.bind('via')}>{SEND_VIA.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Note (optional)" className="full"><input {...f.bind('note')} placeholder="e.g. Sent to Ms. Reyes" /></Field>
      </div>
    </Modal>
  );
}

export function JobOrderPanel({ job }: { job: Job }) {
  const { db, can, user } = useAuth();
  const [preview, setPreview] = useState<JobOrder | null>(null);
  const [send, setSend] = useState<{ order: JobOrder; resend: boolean } | null>(null);
  const manage = can('joborders.manage');
  useEffect(() => { if (manage && ORDER_JOB_STATUSES.includes(job.status)) syncJobOrders(job.id); }, [manage, job.id, job.status, job.start_at, job.end_at, job.leader_id, job.crew_ids.join(), job.quotation_id, db.variations, db.discount_requests]); // eslint-disable-line react-hooks/exhaustive-deps
  const head = headOrder(db, job.id); const all = ordersOf(db, job.id);
  const client = db.clients.find((c) => c.id === job.client_id);
  if (!can('joborders.manage') && !can('jobs.all')) return null;
  if (!head) {
    return <Card title="Job Order Confirmation"><p className="muted small" style={{ margin: 0 }}>{['Cancelled', 'Rescheduled'].includes(job.status) ? 'No Job Order was issued for this booking.' : 'A Job Order Confirmation is created automatically when the booking is confirmed. Admin / Operations review it here and send it to the client.'}</p></Card>;
  }
  const who = user?.name;
  const log = (o: JobOrder, a: string) => logJobOrderEvent(o.id, a);
  // the client can open the link only after the Job Order is sent (a Draft is never shown to a client): ask to mark it as sent first
  const needSend = (o: JobOrder) => { if (o.status === 'Sent to Client' || o.status === 'Superseded') return false; attempt(() => { throw new Error(manage ? 'Mark the Job Order as sent to the client first — the link opens only after that.' : 'This Job Order has not been sent yet. Ask Admin / Operations to mark it as sent first.'); }); if (manage && !o.content.blocker) setSend({ order: o, resend: false }); return true; };
  const mail = (o: JobOrder) => {
    if (needSend(o)) return;
    const c = o.content;
    const body = `Hello ${c.client.contact_person || c.client.name},\n\nPlease find the confirmation of your scheduled service.\n\nJob Order: ${orderLabel(o)}\nService: ${c.service_types.join(', ')}\nDate: ${fmtDate(c.service_date)}\nLocation: ${c.location.name}, ${c.location.address}\n\nView or download it here:\n${shareLink(o)}\n\nThank you,\n${c.company.name}\n${c.company.phone}`;
    location.href = `mailto:${client?.email ?? ''}?subject=${encodeURIComponent(`Job Order Confirmation ${orderLabel(o)} – ${fmtDate(c.service_date)}`)}&body=${encodeURIComponent(body)}`;
    log(o, 'E-mail opened for the client');
  };
  const copy = async (o: JobOrder) => { if (needSend(o)) return; try { await navigator.clipboard.writeText(shareLink(o)); log(o, 'Share link copied'); attempt(() => true, 'Share link copied'); } catch { window.prompt('Copy this link', shareLink(o)); } };
  const sentOk = head.status === 'Sent to Client';
  return (
    <Card title="Job Order Confirmation" actions={<Badge tone={TONE[head.status]}>{head.status}</Badge>}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div><b style={{ fontSize: 16 }}>{orderLabel(head)}</b>
          <div className="small muted">Issued {fmtDate(head.issued_on)}{head.sent_at ? ` · Sent ${fmtStamp(head.sent_at)} via ${head.sent_via}${head.sent_count > 1 ? ` · resent ${head.sent_count - 1}×, last ${fmtStamp(head.last_sent_at)}` : ''}` : ' · not sent yet'}</div>
          {head.revision_reason && <div className="small" style={{ color: 'var(--amber)' }}>Revised: {head.revision_reason}</div>}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => setPreview(head)}>Review</button>
          <button className="btn sm" onClick={() => attempt(async () => { await downloadJobOrder(head, who); log(head, 'PDF downloaded'); })}>Download PDF</button>
          <button className="btn sm" onClick={() => attempt(async () => { await printJobOrder(head, who); log(head, 'Opened for printing'); })}>Print</button>
          <button className="btn sm" onClick={() => mail(head)}>Email</button>
          <button className="btn sm" onClick={() => copy(head)}>Copy link</button>
          {manage && !sentOk && <button className="btn sm primary" onClick={() => setSend({ order: head, resend: false })} disabled={!!head.content.blocker}>Mark as sent to client</button>}
          {manage && sentOk && <button className="btn sm primary" onClick={() => setSend({ order: head, resend: true })}>Resend</button>}
        </div>
      </div>
      {head.content.blocker && !sentOk && <div className="alert warn" style={{ marginTop: 10 }}>{head.content.blocker}</div>}
      <div className="small muted" style={{ marginTop: 8 }}>Prices, scope, discount and terms come from the approved quotation and approved additions; they cannot be changed here. If the schedule, scope, price or team changes after sending, a revised version is created and this one is marked Superseded — a sent Job Order is never overwritten.</div>
      <div className="joc-k" style={{ marginTop: 12 }}>Version history</div>
      <table className="tbl"><thead><tr><th>Version</th><th>Status</th><th>Issued</th><th>Sent</th><th>What changed</th><th></th></tr></thead>
        <tbody>{all.map((o) => <tr key={o.id}><td><b>{orderLabel(o)}</b></td><td><Badge tone={TONE[o.status]}>{o.status}</Badge></td><td>{fmtDate(o.issued_on)}</td><td>{o.sent_at ? fmtStamp(o.sent_at) : '—'}</td><td className="small">{o.revision_reason ?? (o.version === 1 ? 'First version' : '—')}</td>
          <td><button className="btn sm" onClick={() => setPreview(o)}>Open</button> <button className="btn sm" onClick={() => attempt(() => downloadJobOrder(o, who))}>PDF</button></td></tr>)}</tbody></table>
      <details style={{ marginTop: 8 }}><summary className="small" style={{ cursor: 'pointer' }}>Audit trail ({head.history.length})</summary>
        <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{[...head.history].reverse().map((h, i) => <li key={i}>{fmtStamp(h.at)} · {h.by} · {h.action}{h.note ? ` — ${h.note}` : ''}</li>)}</ul></details>
      {preview && <Modal size="wide" title={`${orderLabel(preview)} · ${preview.status}`} onClose={() => setPreview(null)} footer={<><button className="btn" onClick={() => setPreview(null)}>Close</button><button className="btn" onClick={() => attempt(() => printJobOrder(preview, who))}>Print</button><button className="btn primary" onClick={() => attempt(() => downloadJobOrder(preview, who))}>Download PDF</button></>}><JobOrderDocument order={preview} /></Modal>}
      {send && <SendModal order={send.order} resend={send.resend} onClose={() => setSend(null)} />}
    </Card>
  );
}
