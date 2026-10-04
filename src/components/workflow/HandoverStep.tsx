import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, SignaturePad, attempt } from '@/components/ui';
import { DraftBar, PresetChips } from '@/components/touch';
import { Confirm } from './shared';
import { signServiceReport } from '@/lib/workflow';
import { useDraft } from '@/lib/useDraft';
import { PRESETS } from '@/lib/presets';
import { fmtDateTime } from '@/lib/util';
import { serviceReportPdf } from '@/lib/export';
import type { Job, JobWorkflow } from '@/lib/types';

/** Client Handover: the Service Accomplishment Report, pre-filled from the job, scope, variations, crew and equipment. */
export function HandoverStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db, user } = useAuth();
  const signed = !!wf.rep_at;
  const q = db.quotations.find((x) => x.id === job.quotation_id);
  const adds = db.variations.filter((v) => v.job_id === job.id && v.status === 'Approved' && !v.deleted_at);
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const equip = wf.items.filter((i) => (i.loaded_qty ?? 0) > 0 && i.kind !== 'material' && i.kind !== 'ppe').map((i) => i.label);
  const site = db.sites.find((s) => s.id === job.site_id);
  const autoScope = `${q?.scope ?? job.scope}${adds.length ? `\nAdditional work (approved): ${adds.flatMap((v) => v.items.map((i) => `${i.description} (${i.qty} ${i.unit})`)).join('; ')}` : ''}`;
  const [f, setF] = useState({ scope: autoScope, findings: '', recs: '', limits: '', complimentary: '', client_name: wf.conf_name ?? site?.contact_person ?? '', tm_name: emp(job.leader_id) !== '—' ? emp(job.leader_id) : user?.name ?? '', rating: undefined as number | undefined });
  const [csig, setCsig] = useState<string>(); const [tsig, setTsig] = useState<string>(); const [ok, setOk] = useState(false);
  const dr = useDraft(`d:${wf.id}:rep`, { f, csig, tsig }, (d) => { setF(d.f); setCsig(d.csig); setTsig(d.tsig); }, run && !signed);
  if (signed) {
    return (
      <div className="stack">
        <dl className="kv"><dt>Signed by client</dt><dd>{wf.rep_client_name} · {fmtDateTime(wf.rep_client_at)}{wf.rep_rating ? ` · rating ${wf.rep_rating}/5` : ''}</dd><dt>TopMop team leader</dt><dd>{wf.rep_tm_name}</dd>
          <dt>Work completed</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{wf.rep_scope}</dd><dt>Findings</dt><dd>{wf.rep_findings || '—'}</dd><dt>Recommendations</dt><dd>{wf.rep_recs || '—'}</dd><dt>Limitations / exclusions</dt><dd>{wf.rep_limits || '—'}</dd>{wf.rep_complimentary && <><dt>Complimentary</dt><dd>{wf.rep_complimentary}</dd></>}</dl>
        <div className="row">{wf.rep_client_sig && <img src={wf.rep_client_sig} alt="Client signature" style={{ maxHeight: 80, border: '1px solid var(--line)', borderRadius: 6 }} />}{wf.rep_tm_sig && <img src={wf.rep_tm_sig} alt="Team leader signature" style={{ maxHeight: 80, border: '1px solid var(--line)', borderRadius: 6 }} />}</div>
        <div><button className="btn" onClick={() => attempt(() => serviceReportPdf(db, job))}>Download Service Accomplishment Report (PDF)</button></div>
      </div>
    );
  }
  const ready = [{ ok: !!wf.finish_at, t: 'Work finished (step 5)' }];
  return (
    <div className="stack">
      {run && <DraftBar d={dr} />}
      <ul className="list" style={{ border: '1px solid var(--line-2)', borderRadius: 6 }}>{ready.map((r) => <li key={r.t}><span>{r.ok ? '✅' : '⬜'} {r.t}</span><Badge tone={r.ok ? 'green' : 'amber'}>{r.ok ? 'Ready' : 'Needed'}</Badge></li>)}</ul>
      <div className="card" style={{ padding: 12 }}>
        <div className="small muted" style={{ marginBottom: 6 }}>Filled in from the job — nothing to retype</div>
        <dl className="kv"><dt>Client / site</dt><dd>{db.clients.find((c) => c.id === job.client_id)?.name} · {site?.name}</dd><dt>Job ref</dt><dd>{job.number}</dd>
          <dt>Work period</dt><dd>{fmtDateTime(wf.start_at)} → {fmtDateTime(wf.finish_at)}</dd><dt>Crew</dt><dd>{[job.leader_id, ...job.crew_ids].filter(Boolean).map((e) => emp(e)).join(', ')}</dd>
          <dt>Equipment used</dt><dd>{equip.join(', ') || '—'}</dd>{wf.work_notes && <><dt>Work notes</dt><dd>{wf.work_notes}</dd></>}</dl>
      </div>
      <Field label="Work completed" required><textarea disabled={!run} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></Field>
      <Field label="Findings" required><textarea disabled={!run} value={f.findings} onChange={(e) => setF({ ...f, findings: e.target.value })} placeholder="Tap a finding below, type, or enter “None”" /><PresetChips replace options={PRESETS.findings} value={f.findings} onChange={(v) => setF({ ...f, findings: v })} disabled={!run} /></Field>
      <div className="form-grid">
        <Field label="Recommendations" required><textarea disabled={!run} value={f.recs} onChange={(e) => setF({ ...f, recs: e.target.value })} /><PresetChips options={[...PRESETS.recs, 'None']} value={f.recs} onChange={(v) => setF({ ...f, recs: v })} disabled={!run} /></Field>
        <Field label="Limitations / exclusions" required><textarea disabled={!run} value={f.limits} onChange={(e) => setF({ ...f, limits: e.target.value })} /><PresetChips options={[...PRESETS.limits, 'None']} value={f.limits} onChange={(v) => setF({ ...f, limits: v })} disabled={!run} /></Field>
        <Field label="Client name" required><input disabled={!run} value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} /></Field>
        <Field label="TopMop team leader" required><input disabled={!run} value={f.tm_name} onChange={(e) => setF({ ...f, tm_name: e.target.value })} /></Field>
      </div>
      <details><summary className="small" style={{ cursor: 'pointer' }}>Optional: complimentary services, client rating</summary>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <Field label="Complimentary services"><input disabled={!run} value={f.complimentary} onChange={(e) => setF({ ...f, complimentary: e.target.value })} /></Field>
          <Field label="Client rating"><select disabled={!run} value={f.rating ?? ''} onChange={(e) => setF({ ...f, rating: e.target.value ? +e.target.value : undefined })}><option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></Field>
        </div></details>
      {run && <div className="form-grid"><div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Client signature</div><SignaturePad value={csig} onChange={setCsig} /></div><div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>TopMop team leader signature</div><SignaturePad value={tsig} onChange={setTsig} /></div></div>}
      {run && <Confirm checked={ok} onChange={setOk}>The work and findings above were reviewed with the client.</Confirm>}
      {run && <button className="btn primary lg" disabled={!ok} onClick={() => attempt(() => signServiceReport(wf.id, { ...f, client_sig: csig, tm_sig: tsig }), 'Handover signed — Work Completed')}>Sign &amp; complete handover</button>}
    </div>
  );
}
