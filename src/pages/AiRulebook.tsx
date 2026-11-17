// AI Rulebook: the customer-service rules of the chat as versioned data. Edit a draft, run the conversation tests, publish; old versions can be restored (rollback).
// The rates and the booking rules are NOT here: they live in Admin → Pricing and Admin → Settings. This holds the policies and wording the AI follows.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, Field, Modal, PageHead, attempt, toast } from '@/components/ui';
import { useAuth } from '@/lib/store';
import { CLOUD } from '@/lib/cloud';
import { diffSections, joinRulebook, slug, splitRulebook, validateRulebook, type RulebookVersion, type Section } from '@/lib/rulebook';
import { runRulebookTests, type TestResult } from '@/lib/rulebooktests';
import { rulebookApi } from '@/lib/rulebookapi';
import { fmtStamp } from '@/lib/util';

const api = rulebookApi();
export default function AiRulebook() {
  const { can } = useAuth(); const allowed = can('admin.settings');
  const [versions, setVersions] = useState<RulebookVersion[]>([]); const [loaded, setLoaded] = useState(false);
  const [sections, setSections] = useState<Section[]>([]); const [title, setTitle] = useState('TopMop AI Customer Service Rulebook'); const [note, setNote] = useState('');
  const [draftId, setDraftId] = useState<number | null>(null); const [dirty, setDirty] = useState(false); const [tests, setTests] = useState<TestResult[] | null>(null); const [open, setOpen] = useState<string | null>(null);
  const [modal, setModal] = useState<'import' | 'export' | null>(null); const [paste, setPaste] = useState(''); const [view, setView] = useState<RulebookVersion | null>(null);

  const published = versions.find((v) => v.status === 'published'); const draft = versions.find((v) => v.status === 'draft');
  const load = useCallback(async () => { try { const v = await api.list(); setVersions(v); const d = v.find((x) => x.status === 'draft') ?? v.find((x) => x.status === 'published'); if (d) { setSections(d.sections); setTitle(d.title); setNote(d.status === 'draft' ? d.change_note ?? '' : ''); setDraftId(d.status === 'draft' ? d.id : null); } setDirty(false); setTests(null); } catch (e) { toast((e as Error).message, 'err'); } setLoaded(true); }, []);
  useEffect(() => { void load(); }, [load]);
  const problems = useMemo(() => validateRulebook(sections), [sections]);
  const edit = (next: Section[]) => { setSections(next); setDirty(true); setTests(null); };
  const set = (i: number, patch: Partial<Section>) => edit(sections.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= sections.length) return; const n = [...sections]; [n[i], n[j]] = [n[j], n[i]]; edit(n); };
  const add = () => { const keys = new Set(sections.map((s) => s.key)); let k = 'new-section', n = 2; while (keys.has(k)) k = `new-section-${n++}`; edit([...sections, { key: k, title: 'New section', body: '' }]); setOpen(k); };

  const save = () => attempt(async () => { const id = await api.saveDraft(sections, title, note); setDraftId(id); await load(); toast('Draft saved. Run the tests next.', 'ok'); });
  const runTests = () => attempt(async () => {
    if (dirty || !draftId) { toast('Save the draft first, then run the tests.', 'err'); return; }
    const r = runRulebookTests(); const bad = r.filter((x) => !x.ok); setTests(r);
    if (problems.length || bad.length) { toast(`${problems.length + bad.length} problem(s) to fix before this can be published.`, 'err'); return; }
    await api.testsPassed(draftId, { passed: r.length, at: new Date().toISOString() }); await load(); setTests(r); toast('All tests passed. You can publish this version.', 'ok');
  });
  const publish = () => attempt(async () => { if (!draftId) return; if (!confirm('Publish this version? It becomes the rulebook the chat follows; the current one is kept in the history.')) return; await api.publish(draftId); await load(); toast('Published.', 'ok'); });
  const restore = (v: RulebookVersion) => attempt(async () => { if (draft && !confirm('You have a draft. Restoring replaces it with this version.')) return; await api.restore(v.id); await load(); toast(`Version ${v.version} is now the draft. Test it and publish it to roll back.`, 'ok'); });
  const doImport = () => { const r = splitRulebook(paste); if (!r.sections.length) { toast('No "## " headings found in the pasted text.', 'err'); return; } edit(r.sections); if (r.title) setTitle(r.title); setModal(null); setPaste(''); toast(`${r.sections.length} sections imported. Save the draft to keep them.`, 'ok'); };

  if (!allowed) return <div className="content"><div className="alert warn">Only the Owner / Admin can open the AI Rulebook.</div></div>;
  const diff = published && draft ? diffSections(published.sections, sections) : null; const ready = !!draft?.tests_passed_at && !dirty && !problems.length;
  return (
    <div className="stack">
      <PageHead title="AI Rulebook" sub={CLOUD ? 'The rules the customer-service AI follows. Versioned: edit a draft, test it, publish it.' : 'Demo: kept in this browser only.'} />
      <Card title="Status"><div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span><b>Published:</b> {published ? <>version {published.version} · {fmtStamp(published.published_at ?? published.created_at)}</> : 'none yet'}</span>
        <span><b>Draft:</b> {draft ? <>version {draft.version} {draft.tests_passed_at ? <Badge tone="green">tests passed</Badge> : <Badge tone="amber">not tested</Badge>}{dirty && <Badge tone="amber">unsaved changes</Badge>}</> : dirty ? <Badge tone="amber">unsaved changes</Badge> : 'none'}</span>
        {diff && (diff.added.length + diff.removed.length + diff.changed.length > 0) && <span className="muted small">Draft vs published: {diff.changed.length} changed, {diff.added.length} added, {diff.removed.length} removed</span>}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>The rates and the booking rules (Sunday closed, 2 jobs a day …) are not here: they stay in Admin → Pricing and Admin → Settings, so a rule can never be changed by editing wording. This is the policy and the wording.</p></Card>

      <Card title="The rulebook" actions={<div className="row" style={{ gap: 6 }}><button className="b" onClick={() => setModal('import')}>Import from Markdown</button><button className="b" onClick={() => setModal('export')}>Export</button><button className="b" onClick={add}>+ Add section</button></div>}>
        <div className="form-grid"><Field label="Title"><input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></Field><Field label="What did you change? (kept with the version)"><input value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} placeholder="e.g. Added the rain policy" /></Field></div>
        {!loaded ? <p className="muted">Loading…</p> : sections.length === 0 ? <p className="muted">No sections yet. Use “Import from Markdown” to paste your rulebook, or add sections one by one.</p> : (
          <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>{sections.map((s, i) => (
            <li key={s.key} className="card" style={{ padding: 10 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}><button className="b" aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>{open === s.key ? '▾' : '▸'}</button><b style={{ flex: 1 }}>{s.title || '(no title)'}</b><span className="muted small">{s.body.length.toLocaleString()} characters</span>
                <button className="b" aria-label="Move up" onClick={() => move(i, -1)}>↑</button><button className="b" aria-label="Move down" onClick={() => move(i, 1)}>↓</button><button className="b" aria-label="Remove section" onClick={() => confirm(`Remove “${s.title}”?`) && edit(sections.filter((_, k) => k !== i))}>✕</button></div>
              {open === s.key && <div className="stack" style={{ marginTop: 8 }}><Field label="Section title"><input value={s.title} onChange={(e) => set(i, { title: e.target.value, key: s.key.startsWith('new-section') ? slug(e.target.value) || s.key : s.key })} /></Field><Field label="Text"><textarea rows={10} value={s.body} onChange={(e) => set(i, { body: e.target.value })} /></Field></div>}
            </li>))}</ol>)}
        {problems.length > 0 && sections.length > 0 && <div className="alert warn" style={{ marginTop: 10 }}><b>Before this can be published:</b><ul style={{ margin: '4px 0 0 18px' }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="b primary" disabled={!sections.length} onClick={save}>Save draft</button>
          <button className="b" disabled={!draftId || dirty} onClick={runTests}>Run the tests</button>
          <button className="b primary" disabled={!ready} onClick={publish}>Publish this version</button>
          {!ready && <span className="muted small">Order: save the draft → run the tests (all must pass) → publish.</span>}
        </div>
      </Card>

      {tests && <Card title={`Conversation tests · ${tests.filter((t) => t.ok).length}/${tests.length} passed`}><ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{tests.map((t) => <li key={t.name} style={{ padding: '4px 0' }}>{t.ok ? '✅' : '❌'} {t.name}{!t.ok && <div className="muted small" style={{ marginLeft: 22 }}>{t.detail}</div>}</li>)}</ul><p className="muted small">These check the parts of the chat that are code: prices, dates, closed days, the waiver, Taglish and the wording rules. A change to a rate or a rule that breaks one cannot be published.</p></Card>}

      <Card title="History (kept for rollback)"><table className="tbl compact"><thead><tr><th>Version</th><th>Status</th><th>When</th><th>Note</th><th /></tr></thead><tbody>{versions.map((v) => (
        <tr key={v.id}><td><b>{v.version}</b></td><td><Badge tone={v.status === 'published' ? 'green' : v.status === 'draft' ? 'amber' : 'grey'}>{v.status}</Badge></td><td>{fmtStamp(v.published_at ?? v.created_at)}</td><td>{v.change_note ?? ''}</td><td className="row" style={{ gap: 6 }}><button className="b" onClick={() => setView(v)}>View</button>{v.status !== 'draft' && <button className="b" onClick={() => restore(v)}>Restore as draft</button>}</td></tr>))}
        {versions.length === 0 && <tr><td colSpan={5} className="muted">No versions yet.</td></tr>}</tbody></table></Card>

      {modal === 'import' && <Modal title="Import from Markdown" onClose={() => setModal(null)} size="wide" footer={<><button className="b" onClick={() => setModal(null)}>Cancel</button><button className="b primary" onClick={doImport} disabled={!paste.trim()}>Replace the draft with this</button></>}>
        <p className="muted small">Paste the whole rulebook. Each line starting with “## ” becomes a section; a line starting with “# ” is the title. Nothing is saved until you press “Save draft”.</p><textarea rows={16} value={paste} onChange={(e) => setPaste(e.target.value)} style={{ width: '100%' }} /></Modal>}
      {modal === 'export' && <Modal title="Export as Markdown" onClose={() => setModal(null)} size="wide" footer={<button className="b" onClick={() => { void navigator.clipboard?.writeText(joinRulebook(sections, title)); toast('Copied.', 'ok'); }}>Copy</button>}><textarea readOnly rows={18} value={joinRulebook(sections, title)} style={{ width: '100%' }} /></Modal>}
      {view && <Modal title={`Version ${view.version} · ${view.status}`} onClose={() => setView(null)} size="wide" footer={<button className="b" onClick={() => setView(null)}>Close</button>}>
        {published && view.id !== published.id && (() => { const d = diffSections(published.sections, view.sections); return <p className="muted small">Compared with the published version: {d.changed.length} changed ({d.changed.join(', ') || 'none'}), {d.added.length} added, {d.removed.length} removed.</p>; })()}
        {view.sections.map((s) => <div key={s.key} style={{ marginBottom: 12 }}><b>{s.title}</b><pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', font: 'inherit' }}>{s.body}</pre></div>)}</Modal>}
    </div>
  );
}
