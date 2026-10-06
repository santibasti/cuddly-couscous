import { OcularReport } from '@/components/OcularReport';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, live } from '@/lib/store';
import { Badge, Field, Modal, Stat, attempt, ask } from '@/components/ui';
import { Stepper } from '@/components/touch';
import { useDraft } from '@/lib/useDraft';
import { confirmLeave } from '@/lib/sync';
import { OCULAR_STATUSES, isOcularActive, ocularConflicts, ocularEnd, ocularStats, panelTotals } from '@/lib/business';
import { PANEL_AREAS, PANEL_SIDES } from '@/lib/workflow';
import { cancelOcularVisit, completeOcularVisit, confirmOcularVisit, createQuotationFromOcular, scheduleOcularVisit, updateOcularVisit, type OcularForm } from '@/lib/ocular';
import { addDays, fmtDate, fmtDateTime, fmtTime, today, uid } from '@/lib/util';
import type { Measurement, OcularVisit, PanelRow, ServiceCode } from '@/lib/types';

export const OCULAR_TONE: Record<OcularVisit['status'], string> = { Scheduled: 'amber', Confirmed: 'teal', Completed: 'blue', Cancelled: 'gray', 'Converted to Quotation': 'green' };
const DURATIONS: [number, string][] = [[30, '30 min'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours'], [240, 'Half day']];
export const svcNames = (db: ReturnType<typeof useAuth>['db'], codes: string[]) => codes.map((c) => db.services.find((s) => s.code === c)?.name ?? c).join(', ');

/** Schedule or reschedule an ocular visit (Admin / Operations). */
export function OcularFormModal({ initial, start, onClose }: { initial?: OcularVisit; start?: string; onClose: () => void }) {
  const { db } = useAuth();
  const clients = live(db.clients).filter((c) => c.status === 'Active' || c.id === initial?.client_id);
  const [clientId, setClientId] = useState(initial?.client_id ?? '');
  const sites = live(db.sites).filter((s) => s.client_id === clientId);
  const [siteId, setSiteId] = useState(initial?.site_id ?? '');
  const [contact, setContact] = useState(initial?.contact_person ?? '');
  const [mobile, setMobile] = useState(initial?.contact_mobile ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [codes, setCodes] = useState<ServiceCode[]>(initial?.service_codes ?? []);
  const [day, setDay] = useState((initial?.start_at ?? `${start ?? addDays(today(), 1)}T09:00`).slice(0, 10));
  const [time, setTime] = useState((initial?.start_at ?? '').slice(11) || '09:00');
  const [dur, setDur] = useState(initial?.duration_min ?? 60);
  const [assignee, setAssignee] = useState(initial?.assignee_id ?? '');
  const [concerns, setConcerns] = useState(initial?.concerns ?? '');
  const [access, setAccess] = useState(initial?.access_notes ?? '');
  const people = live(db.employees).filter((e) => e.status !== 'inactive' && (e.tier === 'Team Leader' || e.tier === 'Senior Technician' || e.tier === 'Supervisor' || e.department === 'Operations'));
  const dr = useDraft(`d:ocular:${initial?.id ?? 'new'}`, { clientId, siteId, contact, mobile, location, codes, day, time, dur, assignee, concerns, access }, (d) => { setClientId(d.clientId); setSiteId(d.siteId); setContact(d.contact); setMobile(d.mobile); setLocation(d.location); setCodes(d.codes); setDay(d.day); setTime(d.time); setDur(d.dur); setAssignee(d.assignee); setConcerns(d.concerns); setAccess(d.access); }, !initial);
  const form = (): OcularForm => ({ client_id: clientId, contact_person: contact, contact_mobile: mobile || undefined, site_id: siteId || undefined, location, service_codes: codes, start_at: `${day}T${time}`, duration_min: dur, assignee_id: assignee || undefined, concerns, access_notes: access });
  const clash = useMemo(() => ocularConflicts(db, { start_at: `${day}T${time}`, duration_min: dur, assignee_id: assignee || undefined, id: initial?.id }), [db, day, time, dur, assignee, initial?.id]);
  const pickClient = (id: string) => { setClientId(id); const s = live(db.sites).find((x) => x.client_id === id); const c = db.clients.find((x) => x.id === id); setSiteId(s?.id ?? ''); setLocation(s?.address ?? ''); setContact(s?.contact_person || c?.contact_person || ''); setMobile(s?.contact_mobile || c?.mobile || ''); setAccess(s?.access_instructions || c?.access_instructions || ''); };
  const pickSite = (id: string) => { setSiteId(id); const s = db.sites.find((x) => x.id === id); if (s) { setLocation(s.address); setContact(s.contact_person || contact); setMobile(s.contact_mobile || mobile); setAccess(s.access_instructions || access); } };
  const close = () => { if (dr.dirty && !confirmLeave()) return; onClose(); };
  const save = () => { if (attempt(() => (initial ? updateOcularVisit(initial.id, form()) : scheduleOcularVisit(form())), initial ? 'Ocular visit updated' : 'Ocular visit scheduled')) { dr.markSaved(); onClose(); } };
  return (
    <Modal title={initial ? `Edit ${initial.number}` : 'Schedule ocular visit'} size="wide" onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary lg" onClick={save}>{initial ? 'Save changes' : 'Schedule visit'}</button></>}>
      <div className="stack">
        {!initial && <div className="alert info">A site inspection before quoting. It appears in the same calendar as jobs. No photos are needed.</div>}
        <div className="form-grid">
          <Field label="Client" required><select value={clientId} onChange={(e) => pickClient(e.target.value)}><option value="">— choose —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Site"><select value={siteId} onChange={(e) => pickSite(e.target.value)}><option value="">— other location —</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Contact person" required><input value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
          <Field label="Contact mobile"><input inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
          <Field label="Service location" required className="full"><input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        </div>
        <Field label="Requested service type" required><div className="chips" role="group" aria-label="Services">{db.services.map((s) => <button key={s.code} type="button" className={codes.includes(s.code) ? 'on' : ''} onClick={() => setCodes(codes.includes(s.code) ? codes.filter((c) => c !== s.code) : [...codes, s.code])}>{s.name}</button>)}</div></Field>
        <div className="form-grid">
          <Field label="Proposed date" required><input type="date" min={today()} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
          <Field label="Proposed time" required><input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Expected duration"><div className="chips" role="group" aria-label="Duration">{DURATIONS.map(([m, l]) => <button key={m} type="button" className={dur === m ? 'on' : ''} onClick={() => setDur(m)}>{l}</button>)}</div></Field>
          <Field label="Assigned Team Leader / estimator" required><select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">— choose —</option>{people.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.position}</option>)}</select></Field>
        </div>
        {clash.length > 0 && <div className="alert err">The estimator is already booked then: {[...new Set(clash)].join(', ')}.</div>}
        <Field label="Client concerns / requested scope"><textarea value={concerns} onChange={(e) => setConcerns(e.target.value)} placeholder="What the client wants priced or is worried about" /></Field>
        <Field label="Access notes"><input value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Guard house, permits, parking, working hours" /></Field>
      </div>
    </Modal>
  );
}

const newPanel = (): PanelRow => ({ id: uid(), area: PANEL_AREAS[0], side: PANEL_SIDES[0], external: 0, internal: 0 });
const newMeasure = (code?: ServiceCode): Measurement => ({ id: uid(), label: '', service_code: code, qty: 0, unit: 'sqm' });

/** View an ocular visit; confirm, reschedule, cancel, complete (panel count, measurements, notes) and create the quotation. */
export function OcularDetailModal({ visit, onClose }: { visit: OcularVisit; onClose: () => void }) {
  const { db, can, user } = useAuth();
  const nav = useNavigate();
  const v = db.ocular_visits.find((x) => x.id === visit.id) ?? visit;
  const client = db.clients.find((c) => c.id === v.client_id); const who = db.employees.find((e) => e.id === v.assignee_id);
  const manager = can('ocular.schedule');
  const mine = can('ocular.complete') && !!user?.employee_id && v.assignee_id === user.employee_id;
  const [edit, setEdit] = useState(false);
  const [rec, setRec] = useState(false);
  const [panels, setPanels] = useState<PanelRow[]>(v.panels.length ? v.panels : []);
  const [meas, setMeas] = useState<Measurement[]>(v.measurements);
  const [notes, setNotes] = useState(v.findings);
  const glass = v.service_codes.some((c) => c === 'GLASS_EXT' || c === 'GLASS_INT');
  const dr = useDraft(`d:ocular:${v.id}:result`, { panels, meas, notes }, (d) => { setPanels(d.panels); setMeas(d.meas); setNotes(d.notes); }, rec);
  const pt = panelTotals(panels);
  const setP = (id: string, p: Partial<PanelRow>) => setPanels(panels.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setM = (id: string, p: Partial<Measurement>) => setMeas(meas.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const save = () => { if (attempt(() => completeOcularVisit(v.id, { panels, measurements: meas, findings: notes }), 'Ocular visit completed')) { dr.markSaved(); setRec(false); } };
  const toQuote = () => { const q = attempt(() => createQuotationFromOcular(v.id), 'Draft quotation created from the ocular visit'); if (q) { onClose(); if (can('sales.edit')) nav(`/sales/quote/${q.id}`); } };
  if (edit) return <OcularFormModal initial={v} onClose={() => setEdit(false)} />;
  const canAct = (manager || mine);
  return (
    <Modal title={<>{v.number} <Badge tone={OCULAR_TONE[v.status]}>{v.status}</Badge></>} size="wide" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="stack">
        <dl className="kv">
          <dt>Client</dt><dd><b>{client?.name}</b> · {v.contact_person}{v.contact_mobile ? <> · <a href={`tel:${v.contact_mobile}`}>{v.contact_mobile}</a></> : ''}</dd>
          <dt>Location</dt><dd>{v.location} <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.location)}`}>Map ↗</a></dd>
          <dt>Service</dt><dd>{svcNames(db, v.service_codes)}</dd>
          <dt>When</dt><dd>{fmtDateTime(v.start_at)} – {fmtTime(ocularEnd(v))} ({v.duration_min} min)</dd>
          <dt>Assigned to</dt><dd>{who?.full_name ?? '—'}</dd>
          <dt>Client concerns</dt><dd>{v.concerns || '—'}</dd><dt>Access notes</dt><dd>{v.access_notes || '—'}</dd>
          {v.cancel_reason && <><dt>Cancelled because</dt><dd>{v.cancel_reason}</dd></>}
        </dl>
        {v.status === 'Completed' || v.status === 'Converted to Quotation' || rec ? null : null}
        {(v.panels.length > 0 || v.measurements.length > 0 || v.findings) && !rec && (
          <div className="card" style={{ padding: 12 }}><b>What was found</b>
            {v.panels.length > 0 && <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Floor / area</th><th>Side</th><th className="num">External</th><th className="num">Internal</th></tr></thead><tbody>{v.panels.map((p) => <tr key={p.id}><td>{p.area}</td><td>{p.side}</td><td className="num">{p.external}</td><td className="num">{p.internal}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Total</th><th className="num">{panelTotals(v.panels).external}</th><th className="num">{panelTotals(v.panels).internal}</th></tr></tfoot></table></div>}
            {v.measurements.length > 0 && <ul className="small" style={{ margin: '6px 0' }}>{v.measurements.map((m) => <li key={m.id}>{m.label}: <b>{m.qty} {m.unit}</b>{m.service_code ? ` (${svcNames(db, [m.service_code])})` : ''}</li>)}</ul>}
            {v.findings && <div className="small">{v.findings}</div>}
          </div>
        )}
        {(v.status === 'Completed' || v.status === 'Converted to Quotation') && !rec && <OcularReport visit={v} />}
        {v.quotation_id && <div className="alert info">Converted to quotation <Link to={`/sales/quote/${v.quotation_id}`}>{db.quotations.find((q) => q.id === v.quotation_id)?.number}</Link> · {db.quotations.find((q) => q.id === v.quotation_id)?.status}</div>}

        {rec && (
          <div className="stack card" style={{ padding: 12 }}>
            <DraftHint />
            {glass && (
              <div><b>Glass panel count</b> <span className="small muted">floor, side, external, internal</span>
                <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Floor / area</th><th>Side</th><th>External</th><th>Internal</th><th /></tr></thead><tbody>
                  {panels.map((p) => <tr key={p.id}><td><select value={p.area} onChange={(e) => setP(p.id, { area: e.target.value })}>{PANEL_AREAS.map((a) => <option key={a}>{a}</option>)}</select></td><td><select value={p.side} onChange={(e) => setP(p.id, { side: e.target.value })}>{PANEL_SIDES.map((a) => <option key={a}>{a}</option>)}</select></td>
                    <td><Stepper label="External panels" min={0} value={p.external} onChange={(n) => setP(p.id, { external: n ?? 0 })} /></td><td><Stepper label="Internal panels" min={0} value={p.internal} onChange={(n) => setP(p.id, { internal: n ?? 0 })} /></td>
                    <td><button className="btn sm danger" onClick={() => setPanels(panels.filter((x) => x.id !== p.id))}>✕</button></td></tr>)}
                </tbody><tfoot><tr><th colSpan={2}>Total</th><th>{pt.external}</th><th>{pt.internal}</th><th /></tr></tfoot></table></div>
                <button className="btn sm" onClick={() => setPanels([...panels, newPanel()])}>+ Add area</button>
              </div>
            )}
            <div><b>Measurements</b>
              {meas.map((m) => <div key={m.id} className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                <input aria-label="Label" placeholder="e.g. Driveway" value={m.label} onChange={(e) => setM(m.id, { label: e.target.value })} style={{ flex: '2 1 160px' }} />
                <select aria-label="Service" value={m.service_code ?? ''} onChange={(e) => setM(m.id, { service_code: (e.target.value || undefined) as ServiceCode | undefined })} style={{ flex: '1 1 140px' }}><option value="">— service —</option>{v.service_codes.map((c) => <option key={c} value={c}>{svcNames(db, [c])}</option>)}</select>
                <input aria-label="Quantity" type="number" inputMode="decimal" min="0" value={m.qty || ''} onChange={(e) => setM(m.id, { qty: +e.target.value })} style={{ width: 100 }} />
                <input aria-label="Unit" value={m.unit} onChange={(e) => setM(m.id, { unit: e.target.value })} style={{ width: 80 }} />
                <button className="btn sm danger" onClick={() => setMeas(meas.filter((x) => x.id !== m.id))}>✕</button></div>)}
              <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setMeas([...meas, newMeasure(v.service_codes.find((c) => c !== 'GLASS_EXT' && c !== 'GLASS_INT'))])}>+ Add measurement</button>
            </div>
            <Field label="Notes / findings"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition, access, hazards, what the client agreed to" /></Field>
            <div className="row"><button className="btn primary lg" onClick={save}>Mark visit completed</button><button className="btn lg" onClick={() => setRec(false)}>Cancel</button></div>
          </div>
        )}

        {!rec && canAct && (
          <div className="row">
            {manager && v.status === 'Scheduled' && <button className="btn" onClick={() => attempt(() => confirmOcularVisit(v.id), 'Confirmed with the client')}>Confirm with client</button>}
            {manager && isOcularActive(v) && <button className="btn" onClick={() => setEdit(true)}>Reschedule / edit</button>}
            {(isOcularActive(v) || v.status === 'Completed') && !v.client_sig && v.start_at.slice(0, 10) <= today() && <button className="btn primary" onClick={() => setRec(true)}>{v.status === 'Completed' ? 'Update findings' : 'Complete visit'}</button>}
            {v.status === 'Completed' && <button className="btn primary" onClick={toQuote}>Create quotation from this visit</button>}
            {manager && isOcularActive(v) && <button className="btn danger" onClick={async () => { const r = await ask('Cancel ocular visit', 'Reason for cancelling'); if (r) attempt(() => cancelOcularVisit(v.id, r), 'Ocular visit cancelled'); }}>Cancel visit</button>}
          </div>
        )}
        {isOcularActive(v) && v.start_at.slice(0, 10) > today() && canAct && <div className="small muted">The visit can be marked completed on the day it happens.</div>}
      </div>
    </Modal>
  );
}
const DraftHint = () => <div className="small muted">Record the glass panel count and measurements here. No photos or odometer needed.</div>;

/** Dashboard widget: today, upcoming, awaiting quotation, converted. */
export function OcularWidget() {
  const { db, can, user } = useAuth();
  const [open, setOpen] = useState<OcularVisit | null>(null);
  if (!can('ocular.view')) return null;
  const only = can('jobs.all') ? undefined : user?.employee_id ?? '-';
  const st = ocularStats(db, only);
  const row = (list: OcularVisit[], empty: string) => (
    <ul className="list">{list.slice(0, 4).map((v) => <li key={v.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(v)}><div><b>{db.clients.find((c) => c.id === v.client_id)?.name}</b><div className="small muted">{v.number} · {fmtDate(v.start_at.slice(0, 10))} {fmtTime(v.start_at)} · {db.employees.find((e) => e.id === v.assignee_id)?.full_name ?? '—'}</div></div><Badge tone={OCULAR_TONE[v.status]}>{v.status}</Badge></li>)}{!list.length && <li className="muted small">{empty}</li>}</ul>
  );
  return (
    <div className="card" style={{ padding: 12, marginBottom: 14 }}>
      <div className="row between"><b>Ocular visits</b><Link to="/jobs" className="small">Open calendar →</Link></div>
      <div className="grid g4 keep2" style={{ margin: '8px 0' }}>
        <Stat k="Ocular Visits Today" v={st.today.length} tone={st.today.length ? 'navy' : undefined} />
        <Stat k="Upcoming Ocular Visits" v={st.upcoming.length} />
        <Stat k="Awaiting Quotation" v={st.awaiting.length} tone={st.awaiting.length ? 'warn' : undefined} />
        <Stat k="Converted to Quotation" v={st.converted.length} tone="good" />
      </div>
      <div className="grid g2">
        <div><div className="small muted" style={{ fontWeight: 700 }}>TODAY &amp; UPCOMING</div>{row([...st.today, ...st.upcoming], 'No ocular visits scheduled.')}</div>
        <div><div className="small muted" style={{ fontWeight: 700 }}>AWAITING QUOTATION</div>{row(st.awaiting, 'Nothing waiting.')}</div>
      </div>
      {open && <OcularDetailModal visit={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
void OCULAR_STATUSES;
