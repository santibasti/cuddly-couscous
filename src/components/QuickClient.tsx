// Quick add client: paste the customer's details from the chat, check what was picked out, save. Looks for an existing client with the same mobile, email or name first.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, useAuth, live } from '@/lib/store';
import { Field, Modal, attempt } from '@/components/ui';
import { normMobile, parseQuickClient, quickNotes, type QuickClient } from '@/lib/quickclient';
import type { Client, ClientType } from '@/lib/types';

export function QuickClientModal({ onClose }: { onClose: () => void }) {
  const { db } = useAuth(); const nav = useNavigate();
  const [text, setText] = useState(''); const [edit, setEdit] = useState<Partial<QuickClient>>({}); const [type, setType] = useState<ClientType>('Residential');
  const q: QuickClient = useMemo(() => ({ ...parseQuickClient(text), ...edit }), [text, edit]);
  const set = (p: Partial<QuickClient>) => setEdit({ ...edit, ...p });
  const dup = useMemo(() => {
    const mob = q.mobile ? normMobile(q.mobile) : '', mail = q.email.trim().toLowerCase(), nm = q.name.trim().toLowerCase();
    return live(db.clients).find((c) => (mob && normMobile(c.mobile) === mob) || (mail && c.email.trim().toLowerCase() === mail) || (nm.length > 3 && c.name.trim().toLowerCase() === nm));
  }, [db.clients, q.mobile, q.email, q.name]);
  const ready = q.name.trim() && (q.mobile.trim() || q.email.trim()) && q.address.trim();
  const save = () => {
    const r = attempt(() => {
      if (!q.name.trim()) throw new Error('Enter the client name.');
      if (!q.mobile.trim() && !q.email.trim()) throw new Error('Enter a mobile number or an email.');
      if (q.email && !/^\S+@\S+\.\S+$/.test(q.email.trim())) throw new Error('Enter a valid email address.');
      if (!q.address.trim()) throw new Error('Enter the address.');
      const c = store.insert('clients', { name: q.name.trim(), contact_person: q.name.trim(), mobile: normMobile(q.mobile), email: q.email.trim(), address: q.address.trim(), billing_address: q.address.trim(), type, status: 'Prospect', notes: quickNotes(q), access_instructions: '', tin: '', vat_status: 'Non-VAT', withholding_rate: 0, withholding_notes: '', branch_id: db.branches[0].id } as never, `Quick add: ${q.name.trim()}`) as Client;
      store.insert('sites', { client_id: c.id, name: 'Main site', address: q.address.trim(), contact_person: q.name.trim(), contact_mobile: normMobile(q.mobile), access_instructions: '' } as never);
      return c;
    }, 'Client added');
    if (r) { onClose(); nav(`/clients/${(r as Client).id}`); }
  };
  return (
    <Modal title="Quick add client" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ready} onClick={save}>{dup ? 'Add anyway' : 'Add client'}</button></>}>
      <div className="stack">
        <Field label="Paste the details from the chat" hint="The filled-in booking form works best (Name, Address, Contact Number, Email …). Free text is fine too: the mobile number and email are picked out by themselves."><textarea rows={7} value={text} onChange={(e) => { setText(e.target.value); setEdit({}); }} placeholder={'Name: Maria Santos\nAddress: 12 Maple St, Quezon City\nContact Number: 0917 123 4567\nEmail: maria@example.com\nNo. of House Storey: 2\nReservation Date: Saturday\nService: Window'} /></Field>
        {dup && <div className="alert warn">This looks like an existing client: <b>{dup.name}</b>{dup.mobile ? ` · ${dup.mobile}` : ''}. <button className="btn sm" onClick={() => { onClose(); nav(`/clients/${dup.id}`); }}>Open that client instead</button></div>}
        {text.trim() && <div className="form-grid">
          <Field label="Client name" required><input value={q.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Mobile number" required><input value={q.mobile} onChange={(e) => set({ mobile: e.target.value })} placeholder="09XX XXX XXXX" /></Field>
          <Field label="Email"><input value={q.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Client type"><select value={type} onChange={(e) => setType(e.target.value as ClientType)}><option>Residential</option><option>Commercial</option></select></Field>
          <Field label="Address (with city)" required className="full"><input value={q.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="Service wanted"><input value={q.service} onChange={(e) => set({ service: e.target.value })} /></Field>
          <Field label="No. of storeys"><input value={q.storeys} onChange={(e) => set({ storeys: e.target.value })} /></Field>
          <Field label="Reservation date asked"><input value={q.date} onChange={(e) => set({ date: e.target.value })} /></Field>
        </div>}
        <div className="small muted">The client is added as a Prospect with a main service site. The service, storeys and date go into the client's notes. A booking or quotation is made afterwards from the client page.</div>
      </div>
    </Modal>
  );
}
