import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SMS_LABEL, smsText } from '../lib/crm';
import { fmtDate } from '../lib/dates';
import { useStore } from '../lib/store';
import type { Customer, Project, SmsKind } from '../lib/types';

/** Draft a text, let the user edit it, then put it in the outbox. Demo only: nothing leaves the browser. */
export function SmsAction({ customer, project, kind, label, primary }: { customer: Customer; project?: Project; kind: SmsKind; label?: string; primary?: boolean }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <>
      <button className={`sm ${primary ? 'primary' : ''}`} onClick={() => { setText(smsText(kind, customer, project)); setSent(false); setOpen(!open); }}>{label ?? SMS_LABEL[kind]}</button>
      {open && (
        <div className="smsbox" style={{ flexBasis: '100%' }}>
          <div className="small muted">To {customer.name} · {customer.phone}</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          <div className="row">
            <button className="sm primary" disabled={!text.trim() || sent} onClick={() => { dispatch({ type: 'sendSms', customerId: customer.id, projectId: project?.id, kind, text: text.trim() }); setSent(true); }}>{sent ? 'Added to outbox' : 'Send'}</button>
            <button className="sm ghost" onClick={() => setOpen(false)}>{sent ? 'Close' : 'Cancel'}</button>
            <span className="small muted">Demo only. No text message is really sent.</span>
          </div>
        </div>
      )}
    </>
  );
}

export function Outbox({ customerId, projectId, limit = 8 }: { customerId?: string; projectId?: string; limit?: number }) {
  const { data } = useStore();
  const rows = data.messages.filter((m) => (!customerId || m.customerId === customerId) && (!projectId || m.projectId === projectId)).slice(0, limit);
  if (!rows.length) return <div className="small muted">No texts sent yet.</div>;
  return (
    <div>
      {rows.map((m) => {
        const c = data.customers.find((x) => x.id === m.customerId);
        const p = data.projects.find((x) => x.id === m.projectId);
        return (
          <div key={m.id} className="timeline-e">
            <div className="small muted">{fmtDate(m.date)} · {SMS_LABEL[m.kind]} · to {c ? <Link to={`/customers/${c.id}`}>{c.name}</Link> : 'customer'}{p ? ` · ${p.code}` : ''}</div>
            <div className="small">{m.text}</div>
          </div>
        );
      })}
    </div>
  );
}

/** A suggested text after a stage changes. One tap to send, or dismiss. Demo only. */
export function StageNudge({ customer, project, kind, extra, onClose }: { customer: Customer; project: Project; kind: SmsKind; extra?: string; onClose: () => void }) {
  const { dispatch } = useStore();
  const [text, setText] = useState(() => smsText(kind, customer, project, extra));
  const [sent, setSent] = useState(false);
  return (
    <div className="nudge" role="status">
      <div className="small"><b>Tell {customer.name.split(' ')[0]}?</b> <span className="muted">A text is ready. Edit it if you like.</span></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      <div className="row">
        <button className="sm primary" disabled={!text.trim() || sent} onClick={() => { dispatch({ type: 'sendSms', customerId: customer.id, projectId: project.id, kind, text: text.trim() }); setSent(true); }}>{sent ? 'Added to outbox' : 'Send'}</button>
        <button className="sm ghost" onClick={onClose}>{sent ? 'Close' : 'Not now'}</button>
        <span className="small muted">Demo only. No text message is really sent.</span>
      </div>
    </div>
  );
}
