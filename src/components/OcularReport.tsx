// Ocular report: the estimator's recommendation + the client's signed acknowledgement of the findings.
import { useState } from 'react';
import { live, useAuth } from '@/lib/store';
import { Badge, Field, SignaturePad, ask, attempt } from '@/components/ui';
import { reopenOcularReport, saveOcularReport, signOcularReport } from '@/lib/ocular';
import { ocularReportPdf } from '@/lib/export';
import { defaultCrew } from '@/lib/quote-text';
import { fmtDate } from '@/lib/util';
import type { OcularVisit, ServiceCode } from '@/lib/types';

export function OcularReport({ visit }: { visit: OcularVisit }) {
  const { db, can, user } = useAuth();
  const v = db.ocular_visits.find((x) => x.id === visit.id) ?? visit;
  const manager = can('ocular.schedule'); const mine = can('ocular.complete') && !!user?.employee_id && v.assignee_id === user.employee_id;
  const canEdit = (manager || mine) && !v.client_sig;
  const [f, setF] = useState({ report_surface: v.report_surface ?? '', report_hazards: v.report_hazards ?? '', report_recommendation: v.report_recommendation ?? '', report_services: (v.report_services?.length ? v.report_services : v.service_codes) as ServiceCode[], report_days: v.report_days ?? 1, report_crew: v.report_crew ?? defaultCrew(db.settings) });
  const [name, setName] = useState(v.contact_person ?? ''); const [sig, setSig] = useState<string | undefined>(); const [sig2, setSig2] = useState<string | undefined>(); const [sign, setSign] = useState(false);
  const who = db.employees.find((e) => e.id === v.assignee_id)?.full_name;
  const toggle = (c: ServiceCode) => setF({ ...f, report_services: f.report_services.includes(c) ? f.report_services.filter((x) => x !== c) : [...f.report_services, c] });
  const save = () => attempt(() => saveOcularReport(v.id, f), 'Report saved');
  const pdf = () => attempt(() => ocularReportPdf(db, v));
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}><b>Ocular report</b>{v.client_sig ? <Badge tone="green">Signed by {v.client_sig_name} · {fmtDate(v.client_sig_at!.slice(0, 10))}</Badge> : v.report_at ? <Badge tone="amber">Prepared — awaiting client signature</Badge> : <Badge>Not prepared</Badge>}</div>
      <div className="form-grid" style={{ marginTop: 8 }}>
        <Field label="Surface and site condition" className="full"><textarea rows={2} disabled={!canEdit} value={f.report_surface} onChange={(e) => setF({ ...f, report_surface: e.target.value })} placeholder="e.g. Heavy hard-water spots on 3rd–5th floor glass; light dust on the rest" /></Field>
        <Field label="Hazards, safety and access requirements" className="full"><textarea rows={2} disabled={!canEdit} value={f.report_hazards} onChange={(e) => setF({ ...f, report_hazards: e.target.value })} placeholder="e.g. Work at height from roof anchors; barricade the sidewalk; client to provide water" /></Field>
        <div className="full"><div className="small muted" style={{ fontWeight: 600, marginBottom: 4 }}>Recommended service</div><div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>{live(db.services).filter((s) => !s.deleted_at).map((s) => <label key={s.code} className="check"><input type="checkbox" disabled={!canEdit} checked={f.report_services.includes(s.code)} onChange={() => toggle(s.code)} /> {s.name}</label>)}</div></div>
        <Field label="Estimated working days"><input type="number" min={1} disabled={!canEdit} value={f.report_days} onChange={(e) => setF({ ...f, report_days: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></Field>
        <Field label="Recommended crew"><input disabled={!canEdit} value={f.report_crew} onChange={(e) => setF({ ...f, report_crew: e.target.value })} placeholder="6-7" /></Field>
        <Field label="Recommendation / notes to the client" className="full"><textarea rows={3} disabled={!canEdit} value={f.report_recommendation} onChange={(e) => setF({ ...f, report_recommendation: e.target.value })} placeholder="What we recommend and why" /></Field>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {canEdit && <button className="btn" onClick={save}>Save report</button>}
        <button className="btn" onClick={pdf} disabled={!v.report_at && !v.client_sig}>Download report (PDF)</button>
        {canEdit && v.report_at && !sign && <button className="btn primary" onClick={() => setSign(true)}>Client signs…</button>}
        {manager && v.client_sig && <button className="btn danger" onClick={async () => { const r = await ask('Reopen the signed report? The signature is removed so it can be corrected and signed again.', 'Reason', { okLabel: 'Reopen' }); if (r) attempt(() => reopenOcularReport(v.id, r), 'Report reopened'); }}>Reopen</button>}
      </div>
      {!v.report_at && canEdit && <div className="small muted" style={{ marginTop: 6 }}>Save the report first; then the client can review and sign it. {who ? `Inspected by ${who}.` : ''}</div>}
      {sign && canEdit && (
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="alert info small">Hand the device to the client. They confirm that the site was inspected with them and that the findings and recommended service in the report are correct. The report is locked once signed.</div>
          <Field label="Client representative — printed name" required><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid g2"><div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Client signature</div><SignaturePad value={sig} onChange={setSig} /></div><div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Inspected by {who ?? 'estimator'} (optional)</div><SignaturePad value={sig2} onChange={setSig2} /></div></div>
          <div className="row"><button className="btn primary" onClick={() => { if (attempt(() => signOcularReport(v.id, { name, client_sig: sig ?? '', assessor_sig: sig2 }), 'Report signed')) setSign(false); }}>Save signature</button><button className="btn" onClick={() => setSign(false)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}
