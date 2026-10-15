// Service reports: a simplified Service Accomplishment Report tagged to a booking, with template text for every service and photos that arrange themselves.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card, Field, Modal, PageHead, attempt, toast } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { LOGO_SMALL_URL } from '@/lib/logo';
import { FREQUENCIES, SECTION_TITLES, arrangePhotos, buildSections, createServiceReport, parseBody, setReportStatus, updateServiceReport } from '@/lib/servicereport';
import { addJobPhoto, photoDataUrls, photoUrls } from '@/lib/photos';
import { buildServiceReportPdf, serviceReportFilename } from '@/lib/servicereportpdf';
import { fmtDate } from '@/lib/util';
import type { ReportPhoto, ReportSection, ServiceReport } from '@/lib/types';

const GROUPS: ReportPhoto['group'][] = ['Before', 'After', 'Detail'];

export default function ServiceReports() {
  const { id } = useParams();
  return id ? <ReportEditor id={id} /> : <ReportList />;
}

function ReportList() {
  const { db, can } = useAuth(); const nav = useNavigate(); const [pick, setPick] = useState(false); const [job, setJob] = useState('');
  const reports = (db.service_reports ?? []).filter((r) => !r.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const jobs = useMemo(() => db.jobs.filter((j) => !j.deleted_at && j.status !== 'Cancelled').sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 300), [db.jobs]);
  const label = (jid: string) => { const j = db.jobs.find((x) => x.id === jid); return j ? `${j.number} · ${db.clients.find((c) => c.id === j.client_id)?.name ?? ''} · ${fmtDate(j.start_at.slice(0, 10))}` : jid; };
  const start = () => { const r = attempt(() => createServiceReport(job), 'Service report started') as ServiceReport | undefined; if (r?.id) nav(`/service-reports/${r.id}`); };
  return (
    <>
      <PageHead title="Service Reports" sub="A report for each booking: scope, findings, recommendations and photos — filled from a template for every service.">
        {(can('jobs.all') || can('dispatch.run')) && <button className="btn primary" onClick={() => setPick(true)}>New service report</button>}
      </PageHead>
      <Card flush>
        <DataTable<ServiceReport> rows={reports} rowKey={(r) => r.id} onRow={(r) => nav(`/service-reports/${r.id}`)} exportTitle="Service reports" initialSort={{ key: 'created', dir: -1 }}
          searchText={(r) => `${r.number} ${r.title} ${label(r.job_id)} ${r.location}`}
          cols={[
            { key: 'number', header: 'Report', value: (r) => r.number, render: (r) => <b>{r.number}</b> },
            { key: 'job', header: 'Booking', value: (r) => label(r.job_id) },
            { key: 'title', header: 'Service', value: (r) => r.title },
            { key: 'date', header: 'Service date', value: (r) => r.service_date ?? '', render: (r) => (r.service_date ? fmtDate(r.service_date) : '—') },
            { key: 'photos', header: 'Photos', num: true, value: (r) => r.photos.length },
            { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={r.status === 'Final' ? 'green' : 'amber'}>{r.status}</Badge> },
            { key: 'created', header: 'Created', value: (r) => r.created_at, render: (r) => fmtDate(r.created_at.slice(0, 10)) },
          ]} empty="No service reports yet. Start one from a booking." />
      </Card>
      {pick && (
        <Modal title="New service report" onClose={() => setPick(false)} footer={<><button className="btn" onClick={() => setPick(false)}>Cancel</button><button className="btn primary" disabled={!job} onClick={start}>Start report</button></>}>
          <Field label="Booking this report belongs to" required hint="Client, location, services and team are filled in from the booking.">
            <select value={job} onChange={(e) => setJob(e.target.value)}><option value="">— choose a booking —</option>{jobs.map((j) => <option key={j.id} value={j.id}>{label(j.id)}</option>)}</select>
          </Field>
        </Modal>
      )}
    </>
  );
}

function ReportEditor({ id }: { id: string }) {
  const { db, can } = useAuth(); const nav = useNavigate();
  const saved = (db.service_reports ?? []).find((r) => r.id === id && !r.deleted_at);
  const [r, setR] = useState<ServiceReport | undefined>(saved); const [dirty, setDirty] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({}); const [group, setGroup] = useState<ReportPhoto['group']>('Before'); const [busy, setBusy] = useState<string>();
  const [preview, setPreview] = useState(false);
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  useEffect(() => { if (saved && !dirty) setR(saved); }, [saved, dirty]);
  useEffect(() => { if (r) photoUrls(r.photos).then(setUrls); }, [r?.photos.map((p) => p.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!saved || !r) return <div className="alert warn">Service report not found. <Link to="/service-reports">Back to reports</Link></div>;
  const job = db.jobs.find((j) => j.id === r.job_id); const client = db.clients.find((c) => c.id === r.client_id);
  const locked = r.status === 'Final'; const mayEdit = !!job && (can('jobs.all') || can('dispatch.run'));
  const set = (p: Partial<ServiceReport>) => { setR({ ...r, ...p }); setDirty(true); };
  const save = () => { if (attempt(() => updateServiceReport(r.id, { title: r.title, location: r.location, team: r.team, service_date: r.service_date, frequency: r.frequency, service_codes: r.service_codes, sections: r.sections, photos: r.photos }), 'Report saved')) setDirty(false); };
  const setSec = (key: string, body: string) => set({ sections: r.sections.map((s) => (s.key === key ? { ...s, body } : s)) });
  const resetSec = (key: string) => { const t = buildSections(r.service_codes, r.frequency).find((s) => s.key === key); if (t) setSec(key, t.body); };
  const rebuild = () => { if (!confirm('Replace all section texts with the template for the selected services? Your edits to the sections will be lost.')) return; set({ sections: buildSections(r.service_codes, r.frequency) as ReportSection[] }); };
  const toggleSvc = (code: string) => set({ service_codes: r.service_codes.includes(code) ? r.service_codes.filter((c) => c !== code) : [...r.service_codes, code] });
  const upload = async (files: FileList | null) => {
    if (!files?.length || !job) return; let done = 0; const added: ReportPhoto[] = [];
    for (const f of Array.from(files)) {
      setBusy(`Adding photo ${++done} of ${files.length}…`);
      try { const p = await addJobPhoto(f, { jobId: job.id, clientId: job.client_id, kind: group === 'Detail' ? 'During' : group }); added.push({ id: p.id, path: p.path, data: p.data, group, caption: '' }); } catch (e) { toast(`${f.name}: ${(e as Error).message}`, 'err'); }
    }
    setBusy(undefined); if (added.length) set({ photos: [...r.photos, ...added] });
  };
  const download = () => attempt(async () => {
    const images = await photoDataUrls(r.photos); const blob = await buildServiceReportPdf(r, { company: db.settings.company, clientName: client?.name ?? '', images });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = serviceReportFilename(r); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });
  const arr = arrangePhotos(r.photos);
  return (
    <>
      <PageHead title={<>{r.number} <Badge tone={locked ? 'green' : 'amber'}>{r.status}</Badge></>} sub={<>{job ? `${job.number} · ` : ''}{client?.name}{dirty ? ' · unsaved changes' : ''}</>}>
        <Link to="/service-reports" className="btn">← Reports</Link>
        <button className="btn" onClick={() => setPreview((v) => !v)}>{preview ? 'Edit' : 'Preview'}</button>
        <button className="btn" onClick={download}>Download PDF</button>
        {mayEdit && !locked && <button className="btn primary" disabled={!dirty} onClick={save}>Save</button>}
        {mayEdit && !locked && <button className="btn navy" onClick={() => { if (dirty) save(); attempt(() => setReportStatus(r.id, 'Final'), 'Report marked final'); }}>Mark final</button>}
        {mayEdit && locked && can('jobs.all') && <button className="btn" onClick={() => attempt(() => setReportStatus(r.id, 'Draft'), 'Report reopened')}>Reopen</button>}
      </PageHead>
      {preview ? <ReportPreview r={r} client={client?.name ?? ''} urls={urls} company={db.settings.company} /> : (
        <div className="stack">
          <Card title="Project information">
            <div className="form-grid">
              <Field label="Client"><input disabled value={client?.name ?? ''} /></Field>
              <Field label="Project / service"><input disabled={locked} value={r.title} onChange={(e) => set({ title: e.target.value })} /></Field>
              <Field label="Location" className="full"><input disabled={locked} value={r.location} onChange={(e) => set({ location: e.target.value })} /></Field>
              <Field label="Service date"><input type="date" disabled={locked} value={r.service_date ?? ''} onChange={(e) => set({ service_date: e.target.value || undefined })} /></Field>
              <Field label="Maintenance frequency"><select disabled={locked} value={r.frequency} onChange={(e) => set({ frequency: e.target.value })}>{FREQUENCIES.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Team assigned" className="full"><input disabled={locked} value={r.team} onChange={(e) => set({ team: e.target.value })} /></Field>
              <Field label="Services in this report" className="full" hint="The section texts come from a template for each service. Change the services, then use “Rebuild sections”.">
                <div className="chips" role="group">{db.services.filter((s) => !s.deleted_at).map((s) => <button key={s.code} type="button" disabled={locked} className={r.service_codes.includes(s.code) ? 'on' : ''} onClick={() => toggleSvc(s.code)}>{s.name}</button>)}</div>
              </Field>
            </div>
            {!locked && <button className="btn sm" onClick={rebuild}>Rebuild sections from the template</button>}
          </Card>
          <Card title="Photos" actions={<span className="small muted">{r.photos.length} photo{r.photos.length === 1 ? '' : 's'} · they arrange themselves in the report</span>}>
            {!locked && (
              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
                <div className="chips" role="group" aria-label="Photo group">{GROUPS.map((g) => <button key={g} type="button" className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>)}</div>
                <input ref={cam} type="file" accept="image/*" capture="environment" multiple className="hide" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
                <input ref={gal} type="file" accept="image/*" multiple className="hide" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
                <button className="btn primary" disabled={!!busy} onClick={() => cam.current?.click()}>Take a photo</button>
                <button className="btn" disabled={!!busy} onClick={() => gal.current?.click()}>Choose photos</button>
                {busy && <span className="small muted">{busy}</span>}
              </div>
            )}
            <div className="photogrid">
              {r.photos.map((p) => (
                <div key={p.id} className="photocell" style={{ aspectRatio: 'auto', display: 'block', cursor: 'default' }}>
                  <div style={{ aspectRatio: '1', display: 'grid', placeItems: 'center' }}>{urls[p.id] ? <img src={urls[p.id]} alt={p.caption || p.group} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="small muted">Loading…</span>}</div>
                  <div style={{ padding: 6, display: 'grid', gap: 4 }}>
                    <select disabled={locked} value={p.group} onChange={(e) => set({ photos: r.photos.map((x) => (x.id === p.id ? { ...x, group: e.target.value as ReportPhoto['group'] } : x)) })}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
                    <input disabled={locked} placeholder="Caption" value={p.caption} maxLength={120} onChange={(e) => set({ photos: r.photos.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)) })} />
                    {!locked && <button className="btn sm danger" onClick={() => set({ photos: r.photos.filter((x) => x.id !== p.id) })}>Remove</button>}
                  </div>
                </div>
              ))}
            </div>
            {!r.photos.length && <div className="muted small">Add Before and After photos and they are placed side by side in the report, with the Detail photos below them.</div>}
            {arr.pairs.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>{arr.pairs.length} before / after pair{arr.pairs.length === 1 ? '' : 's'}{arr.rest.length ? ` · ${arr.rest.length} more photo${arr.rest.length === 1 ? '' : 's'} in the grid` : ''}</div>}
          </Card>
          {r.sections.map((s) => (
            <Card key={s.key} title={s.title || SECTION_TITLES[s.key]} actions={!locked && <button className="btn sm" onClick={() => resetSec(s.key)}>Reset to template</button>}>
              <textarea rows={Math.min(14, Math.max(4, s.body.split('\n').length + 1))} style={{ width: '100%' }} disabled={locked} value={s.body} onChange={(e) => setSec(s.key, e.target.value)} />
              <div className="small muted">A blank line starts a new paragraph. A line starting with “- ” becomes a bullet.</div>
            </Card>
          ))}
          {mayEdit && !locked && <div className="row"><button className="btn primary" disabled={!dirty} onClick={save}>Save</button><button className="btn" onClick={() => nav('/service-reports')}>Close</button></div>}
        </div>
      )}
    </>
  );
}

function ReportPreview({ r, client, urls, company }: { r: ServiceReport; client: string; urls: Record<string, string>; company: { name: string; tagline: string; address: string; phone: string; email: string } }) {
  const body = (b: string) => parseBody(b).map((x, i) => (x.kind === 'p' ? <p key={i}>{x.text}</p> : <ul key={i} className="pd-list">{x.items.map((t, k) => <li key={k}>{t}</li>)}</ul>));
  const arr = arrangePhotos(r.photos); let n = 1;
  const fig = (p: ReportPhoto, label?: boolean) => <figure key={p.id} style={{ margin: 0 }}>{urls[p.id] ? <img src={urls[p.id]} alt={p.caption || p.group} style={{ width: '100%', borderRadius: 6 }} /> : null}{(label || p.caption) && <figcaption className="pd-small" style={{ textAlign: 'center' }}>{label ? <b>{p.group.toUpperCase()}</b> : null}{label && p.caption ? ' · ' : ''}{p.caption}</figcaption>}</figure>;
  const sec = (key: string) => r.sections.find((s) => s.key === key);
  const show = (key: string) => { const s = sec(key); return s?.body.trim() ? <div key={key}><div className="pd-h">{++n}. {s.title}</div>{body(s.body)}</div> : null; };
  return (
    <div className="jopage-sheet"><div className="pd">
      <div className="pd-head">
        <div className="pd-brand"><img src={LOGO_SMALL_URL} alt="TopMop" width={58} height={58} /><div><div className="pd-co">{company.name}</div><div className="s">{company.tagline}</div><div className="s">{company.phone} · {company.email}</div></div></div>
        <div className="pd-title"><div className="t1">SERVICE ACCOMPLISHMENT REPORT</div><div className="no">{r.number}</div><div className="s">{fmtDate(r.report_date)}</div></div>
      </div>
      <div className="pd-h">1. Project information</div>
      <div className="pd-card"><dl className="kv"><dt>Client</dt><dd>{client}</dd><dt>Project</dt><dd>{r.title}</dd><dt>Location</dt><dd>{r.location || '—'}</dd><dt>Service date</dt><dd>{r.service_date ? fmtDate(r.service_date) : '—'}</dd><dt>Team</dt><dd>{r.team || '—'}</dd></dl></div>
      {['scope', 'prework', 'method', 'findings', 'limits', 'recs', 'equipment', 'safety'].map(show)}
      {r.photos.length > 0 && <div><div className="pd-h">{++n}. Photo documentation</div>
        <div style={{ display: 'grid', gap: 12 }}>
          {arr.pairs.map(([b, a]) => <div key={b.id + a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{fig(b, true)}{fig(a, true)}</div>)}
          {arr.rest.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>{arr.rest.map((p) => fig(p))}</div>}
        </div></div>}
      {show('completion')}
      <div className="pd-foot"><span>{r.number} · {company.name}</span><span>Prepared by {r.prepared_by ?? ''}</span></div>
    </div></div>
  );
}
