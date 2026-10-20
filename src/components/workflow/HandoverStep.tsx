import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, SignaturePad, attempt } from '@/components/ui';
import { DraftBar, PresetChips } from '@/components/touch';
import { Confirm } from './shared';
import { billBase, signServiceReport, type SatisfactionInput } from '@/lib/workflow';
import { SatisfactionCheck, IssuePicker, FeedbackSummary, satisfactionComplete } from './Satisfaction';
import { PaymentMethodConfirm } from './PaymentMethodConfirm';
import { FinalSummary } from './FinalQuote';
import { discountBlock, finalQuoteSummary, needsFollowUp } from '@/lib/business';
import { useDraft } from '@/lib/useDraft';
import { PRESETS } from '@/lib/presets';
import { fmtDateTime } from '@/lib/util';
import { SAT_QUESTIONS } from '@/lib/business';
const SAT_REQ = (s: Partial<SatisfactionInput>) => SAT_QUESTIONS.every((q) => !!s[q.key]);
import { serviceReportPdf } from '@/lib/export';
import type { Job, JobWorkflow } from '@/lib/types';

const Sec = ({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) => (
  <section className="stack" style={{ gap: 8 }}>
    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}><span className="badge teal" style={{ minWidth: 22, textAlign: 'center' }}>{n}</span><b>{title}</b>{hint && <span className="small muted">{hint}</span>}</div>
    {children}
  </section>
);
const FEW = 4;   // chips shown before "More"

/** Client Handover: the Service Accomplishment Report, pre-filled from the job, scope, variations, crew and equipment. */
export function HandoverStep({ wf, job, run }: { wf: JobWorkflow; job: Job; run: boolean }) {
  const { db, user } = useAuth();
  const signed = !!wf.rep_at;
  const fbk = db.client_feedback.find((x) => x.job_id === job.id && !x.deleted_at);
  const q = db.quotations.find((x) => x.id === job.quotation_id);
  const adds = db.variations.filter((v) => v.job_id === job.id && v.status === 'Approved' && !v.deleted_at);
  const emp = (id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const equip = wf.items.filter((i) => (i.loaded_qty ?? 0) > 0 && i.kind !== 'material' && i.kind !== 'ppe').map((i) => i.label);
  const site = db.sites.find((s) => s.id === job.site_id);
  const autoScope = `${q?.scope ?? job.scope}${adds.length ? `\nAdditional work (approved): ${adds.flatMap((v) => v.items.map((i) => `${i.description} (${i.qty} ${i.unit})`)).join('; ')}` : ''}`;
  const [f, setF] = useState({ scope: autoScope, findings: '', recs: '', limits: '', complimentary: '', client_name: wf.conf_name ?? site?.contact_person ?? '', tm_name: emp(job.leader_id) !== '—' ? emp(job.leader_id) : user?.name ?? '' });
  const [sat, setSat] = useState<Partial<SatisfactionInput>>({});
  const [stage, setStage] = useState<null | 'rate' | 'tl' | 'sign'>(null);
  const [csig, setCsig] = useState<string>(); const [tsig, setTsig] = useState<string>(); const [ok, setOk] = useState(false); const [more, setMore] = useState<Record<string, boolean>>({});
  const chips = (key: string, opts: readonly string[]) => [...(more[key] ? opts : opts.slice(0, FEW))];
  const moreBtn = (key: string, opts: readonly string[]) => opts.length > FEW && <button type="button" className="btn sm" onClick={() => setMore({ ...more, [key]: !more[key] })}>{more[key] ? 'Fewer options' : `More options (${opts.length - FEW})`}</button>;
  const allGood = () => setF({ ...f, findings: 'Work completed without issues', recs: 'None', limits: 'None' });
  const dr = useDraft(`d:${wf.id}:rep`, { f, csig, tsig, sat }, (d) => { setF(d.f); setCsig(d.csig); setTsig(d.tsig); setSat(d.sat ?? {}); }, run && !signed);
  if (signed) {
    return (
      <div className="stack">
        <dl className="kv"><dt>Signed by client</dt><dd>{wf.rep_client_name} · {fmtDateTime(wf.rep_client_at)}</dd><dt>TopMop team leader</dt><dd>{wf.rep_tm_name}</dd>
          <dt>Work completed</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{wf.rep_scope}</dd><dt>Findings</dt><dd>{wf.rep_findings || '—'}</dd><dt>Recommendations</dt><dd>{wf.rep_recs || '—'}</dd><dt>Limitations / exclusions</dt><dd>{wf.rep_limits || '—'}</dd>{wf.rep_complimentary && <><dt>Complimentary</dt><dd>{wf.rep_complimentary}</dd></>}</dl>
        {fbk && <div style={{ margin: '6px 0' }}><FeedbackSummary fb={fbk} /></div>}
        <div className="row">{wf.rep_client_sig && <img src={wf.rep_client_sig} alt="Client signature" style={{ maxHeight: 80, border: '1px solid var(--line)', borderRadius: 6 }} />}{wf.rep_tm_sig && <img src={wf.rep_tm_sig} alt="Team leader signature" style={{ maxHeight: 80, border: '1px solid var(--line)', borderRadius: 6 }} />}</div>
        <div><button className="btn" onClick={() => attempt(() => serviceReportPdf(db, job))}>Download Service Accomplishment Report (PDF)</button></div>
        <PaymentMethodConfirm wf={wf} job={job} run={run} />
      </div>
    );
  }
  const ready = [{ ok: !!wf.finish_at, t: 'Work finished (step 5)' }];
  const block = discountBlock(db, job, wf, billBase(job).base);
  const sm = finalQuoteSummary(db, job, { deposit: wf.conf_deposit });
  return (
    <div className="stack">
      {run && <DraftBar d={dr} />}
      {!wf.finish_at && <div className="alert warn">Finish the work first (step 5).</div>}
      <Sec n={1} title="Check the job and the bill">
        <details className="card" style={{ padding: 12 }}><summary style={{ cursor: 'pointer' }}><b>{db.clients.find((c) => c.id === job.client_id)?.name}</b> · {site?.name} · {job.number} <span className="small muted">— filled in from the job, tap to see</span></summary>
          <dl className="kv" style={{ marginTop: 8 }}><dt>Work period</dt><dd>{fmtDateTime(wf.start_at)} → {fmtDateTime(wf.finish_at)}</dd><dt>Crew</dt><dd>{[job.leader_id, ...job.crew_ids].filter(Boolean).map((e) => emp(e)).join(', ')}</dd>
            <dt>Equipment used</dt><dd>{equip.join(', ') || '—'}</dd>{wf.work_notes && <><dt>Work notes</dt><dd>{wf.work_notes}</dd></>}</dl>
        </details>
        <div className="card" style={{ padding: 12 }}><div className="small muted" style={{ marginBottom: 6 }}>Final bill the client is signing for</div><FinalSummary sm={sm} /></div>
        {block && <div className="alert warn">{block}</div>}
        <PaymentMethodConfirm wf={wf} job={job} run={run} />
      </Sec>
      <Sec n={2} title="Write the report" hint="Work completed is filled in for you">
        <details className="card" style={{ padding: 12 }}><summary style={{ cursor: 'pointer' }}><span className="small muted">Work completed</span><div style={{ whiteSpace: 'pre-wrap' }}>{f.scope}</div></summary>
          <Field label="Edit work completed" required><textarea rows={3} disabled={!run} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></Field></details>
        {run && <button type="button" className="btn" onClick={allGood}>✨ All good — use the standard wording</button>}
        <Field label="Findings" required><textarea rows={2} disabled={!run} value={f.findings} onChange={(e) => setF({ ...f, findings: e.target.value })} placeholder="Tap a finding below, type, or enter “None”" /><PresetChips replace options={chips('f', PRESETS.findings)} value={f.findings} onChange={(v) => setF({ ...f, findings: v })} disabled={!run} />{moreBtn('f', PRESETS.findings)}</Field>
        <Field label="Recommendations" required><textarea rows={2} disabled={!run} value={f.recs} onChange={(e) => setF({ ...f, recs: e.target.value })} /><PresetChips options={chips('r', [...PRESETS.recs, 'None'])} value={f.recs} onChange={(v) => setF({ ...f, recs: v })} disabled={!run} />{moreBtn('r', [...PRESETS.recs, 'None'])}</Field>
        <Field label="Limitations / exclusions" required><textarea rows={2} disabled={!run} value={f.limits} onChange={(e) => setF({ ...f, limits: e.target.value })} /><PresetChips options={chips('l', [...PRESETS.limits, 'None'])} value={f.limits} onChange={(v) => setF({ ...f, limits: v })} disabled={!run} />{moreBtn('l', [...PRESETS.limits, 'None'])}</Field>
        <details><summary className="small" style={{ cursor: 'pointer' }}>Optional: complimentary services</summary>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Complimentary services"><input disabled={!run} value={f.complimentary} onChange={(e) => setF({ ...f, complimentary: e.target.value })} /></Field>
          </div></details>
      </Sec>
      <Sec n={3} title="Sign">
        <div className="form-grid">
          <Field label="Client name" required><input disabled={!run} value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} /></Field>
          <Field label="TopMop team leader" required><input disabled={!run} value={f.tm_name} onChange={(e) => setF({ ...f, tm_name: e.target.value })} /></Field>
        </div>
      {run && <div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>TopMop team leader signature</div><SignaturePad value={tsig} onChange={setTsig} /></div>}
      {run && <Confirm checked={ok} onChange={setOk}>The work and findings above were reviewed with the client.</Confirm>}
      {run && <div className="alert info">Next: hand the tablet to the client. They will answer a short rating on its own page, then review the final bill and sign.</div>}
      {run && <button className="btn primary lg" disabled={!ok || !!block || !tsig || !f.scope.trim() || !f.findings.trim() || !f.recs.trim() || !f.limits.trim() || !f.client_name.trim()} onClick={() => setStage('rate')}>Hand tablet to the client →</button>}
      </Sec>
      {stage && (
        <div className="pcwin clientpage" role="dialog" aria-modal="true" aria-label="Client">
          <div className="pcwin-h"><div style={{ flex: 1 }}><b>TopMop Window Cleaning Solutions Corp.</b><div className="small muted">{job.number} · {site?.name}</div></div><button className="btn" onClick={() => setStage(null)}>← Team Leader</button></div>
          <div className="pcwin-b">
            {stage === 'rate' && <>
              <h2 style={{ margin: '4px 0' }}>How was our service today?</h2>
              <div className="muted">Thank you for choosing TopMop. It takes less than a minute.</div>
              <SatisfactionCheck value={sat} onChange={setSat} clientMode />
            </>}
            {stage === 'tl' && <>
              <h2 style={{ margin: '4px 0' }}>Thank you for your feedback</h2>
              <div className="muted">Please hand the tablet back to the Team Leader for a moment.</div>
              <IssuePicker value={sat} onChange={setSat} />
            </>}
            {stage === 'sign' && <>
              <h2 style={{ margin: '4px 0' }}>Please review and sign</h2>
              <div className="card" style={{ padding: 12 }}><div className="small muted">Work completed</div><div style={{ whiteSpace: 'pre-wrap' }}>{f.scope}</div>{f.findings && <><div className="small muted" style={{ marginTop: 8 }}>Findings</div><div style={{ whiteSpace: 'pre-wrap' }}>{f.findings}</div></>}</div>
              <div className="card" style={{ padding: 12 }}><div className="small muted" style={{ marginBottom: 6 }}>Final bill</div><FinalSummary sm={sm} /></div>
              <Field label="Your name" required><input value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} /></Field>
              <div><div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Your signature</div><SignaturePad value={csig} onChange={setCsig} /></div>
            </>}
          </div>
          <div className="pcwin-f">
            <span className="small muted">{stage === 'rate' ? 'Step 1 of 2 · Your rating' : stage === 'tl' ? 'Team Leader' : 'Step 2 of 2 · Review & sign'}</span>
            {stage === 'rate' && <button className="btn primary lg" disabled={!sat.rating || !SAT_REQ(sat)} onClick={() => setStage(needsFollowUp(sat) && !sat.issue_category ? 'tl' : 'sign')}>Continue →</button>}
            {stage === 'tl' && <button className="btn primary lg" disabled={!sat.issue_category} onClick={() => setStage('sign')}>Hand back to the client →</button>}
            {stage === 'sign' && <button className="btn primary lg" disabled={!csig || !f.client_name.trim() || !satisfactionComplete(sat)} onClick={() => { if (attempt(() => signServiceReport(wf.id, { ...f, client_sig: csig, tm_sig: tsig, satisfaction: sat as SatisfactionInput }), 'Handover signed — Work Completed')) setStage(null); }}>Sign &amp; complete</button>}
          </div>
        </div>
      )}
    </div>
  );
}
