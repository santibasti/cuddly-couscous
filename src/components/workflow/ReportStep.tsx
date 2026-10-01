import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Photos, SignaturePad, attempt } from '@/components/ui';
import { signServiceReport } from '@/lib/workflow';
import { fmtDateTime } from '@/lib/util';
import { serviceReportPdf } from '@/lib/export';
import type { Job, JobWorkflow } from '@/lib/types';

export function ReportStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db, user, can } = useAuth();
  const j = db.jobs.find((x) => x.id === job.id)!;
  const signed = !!wf.rep_at;
  const open = db.variations.filter((v) => v.job_id === job.id && v.status === 'Draft' && !v.deleted_at);
  const site = db.sites.find((s) => s.id === job.site_id);
  const equip = wf.items.filter((i) => (i.loaded_qty ?? 0) > 0 && i.kind !== 'material' && i.kind !== 'ppe').map((i) => i.label).join(', ');
  const [f, setF] = useState({
    scope: job.scope, method: `Water-fed pole and purified-water system with soft-brush agitation and squeegee finish.${equip ? ` Equipment used: ${equip}.` : ''}`,
    findings: job.findings, limits: '', recs: '', complimentary: '', client_name: site?.contact_person ?? '', tm_name: user?.name ?? '', rating: 5,
  });
  const [csig, setCsig] = useState<string>(); const [tsig, setTsig] = useState<string>();
  const before = j.photos.filter((p) => p.kind === 'before').length, after = j.photos.filter((p) => p.kind === 'after').length;
  const done = j.checklist.filter((c) => c.done).length;
  const ready = [
    { ok: done === j.checklist.length, t: `Job checklist ${done}/${j.checklist.length}` }, { ok: before > 0, t: `Before photos (${before})` }, { ok: after > 0, t: `After photos (${after})` }, { ok: open.length === 0, t: open.length ? `${open.length} variation(s) awaiting client approval` : 'No variation awaiting approval' },
  ];
  if (signed) {
    return (
      <div className="stack">
        <dl className="kv"><dt>Signed by client</dt><dd>{wf.rep_client_name} · {fmtDateTime(wf.rep_client_at)}{wf.rep_rating ? ` · rating ${wf.rep_rating}/5` : ''}</dd><dt>TopMop representative</dt><dd>{wf.rep_tm_name}</dd>
          <dt>Scope completed</dt><dd>{wf.rep_scope}</dd><dt>Methodology</dt><dd>{wf.rep_method}</dd><dt>Findings</dt><dd>{wf.rep_findings || '—'}</dd><dt>Limitations</dt><dd>{wf.rep_limits || '—'}</dd><dt>Recommendations</dt><dd>{wf.rep_recs || '—'}</dd><dt>Complimentary</dt><dd>{wf.rep_complimentary || '—'}</dd></dl>
        <div className="row">{wf.rep_client_sig && <img src={wf.rep_client_sig} alt="Client signature" style={{ maxHeight: 80, border: '1px solid var(--line)', borderRadius: 6 }} />}{wf.rep_tm_sig && <img src={wf.rep_tm_sig} alt="TopMop signature" style={{ maxHeight: 80, border: '1px solid var(--line)', borderRadius: 6 }} />}</div>
        <Photos items={j.photos.filter((p) => p.kind === 'before' || p.kind === 'after').map((p) => ({ src: p.data, caption: `${p.kind.toUpperCase()} · ${p.caption}` }))} />
        <div><button className="btn" onClick={() => attempt(() => serviceReportPdf(db, j))}>Download Service Accomplishment Report (PDF)</button></div>
      </div>
    );
  }
  return (
    <div className="stack">
      <ul className="list" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>{ready.map((r) => <li key={r.t}><span>{r.ok ? '✅' : '⬜'} {r.t}</span><Badge tone={r.ok ? 'green' : 'amber'}>{r.ok ? 'Ready' : 'Needed'}</Badge></li>)}</ul>
      <div className="small muted">Tick the job checklist and add before / after photos in the cards on this job (below). {can('jobs.complete') ? '' : 'You do not have permission to submit the report.'}</div>
      <Field label="Scope completed" required><textarea disabled={!run} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></Field>
      <Field label="Methodology & equipment used" required><textarea disabled={!run} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} /></Field>
      <Field label="Findings"><textarea disabled={!run} value={f.findings} onChange={(e) => setF({ ...f, findings: e.target.value })} /></Field>
      <div className="form-grid">
        <Field label="Limitations / exclusions"><textarea disabled={!run} value={f.limits} onChange={(e) => setF({ ...f, limits: e.target.value })} /></Field>
        <Field label="Recommendations"><textarea disabled={!run} value={f.recs} onChange={(e) => setF({ ...f, recs: e.target.value })} /></Field>
        <Field label="Complimentary services"><textarea disabled={!run} value={f.complimentary} onChange={(e) => setF({ ...f, complimentary: e.target.value })} /></Field>
        <Field label="Client rating"><select disabled={!run} value={f.rating} onChange={(e) => setF({ ...f, rating: +e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></Field>
        <Field label="Client name" required><input disabled={!run} value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} /></Field>
        <Field label="TopMop representative" required><input disabled={!run} value={f.tm_name} onChange={(e) => setF({ ...f, tm_name: e.target.value })} /></Field>
      </div>
      {run && <div className="form-grid"><div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Client signature</div><SignaturePad onChange={setCsig} /></div><div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>TopMop representative signature</div><SignaturePad onChange={setTsig} /></div></div>}
      <div className="small muted">Date and time of signing are captured automatically when you submit.</div>
      {run && <button className="btn primary lg" onClick={() => attempt(() => signServiceReport(wf.id, { ...f, client_sig: csig, tm_sig: tsig }), 'Service report signed — Work Completed')}>Sign &amp; complete service report</button>}
    </div>
  );
}
