// Telegram: photos and videos the crew send in the company Telegram group are saved to the right job and client automatically.
// This page connects the bot, links each employee's Telegram account, and shows what came in lately.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Card, PageHead, attempt } from '@/components/ui';
import { CLOUD, supabase } from '@/lib/cloud';
import { callFn } from '@/lib/fnclient';
import { fmtDateTime } from '@/lib/util';

interface Status { ok: boolean; configured: boolean; hint?: string; bot?: string; connected?: boolean; last_error?: string | null; pending?: number }
interface LinkRow { telegram_user_id: number; employee_id: string; telegram_name: string | null; linked_at: string }
interface Recent { id: string; job_id: string | null; sent_by_employee_id: string | null; media: string; kind: string; created_at: string }

export default function Telegram() {
  const { db } = useAuth();
  const [st, setSt] = useState<Status>(); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<LinkRow[]>([]); const [recent, setRecent] = useState<Recent[]>([]); const [unsorted, setUnsorted] = useState(0);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const emp = useMemo(() => new Map(db.employees.map((e) => [e.id, e])), [db.employees]);
  const field = useMemo(() => db.employees.filter((e) => !e.deleted_at && e.status !== 'inactive').sort((a, b) => a.full_name.localeCompare(b.full_name)), [db.employees]);

  const check = useCallback(async (connect = false) => {
    setBusy(true); setErr('');
    try { setSt(await callFn<Status>('telegram-webhook', { action: connect ? 'connect' : 'status' })); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach the Telegram function'); } finally { setBusy(false); }
  }, []);
  const reload = useCallback(async () => {
    const sb = supabase();
    const [l, r, u] = await Promise.all([
      sb.from('telegram_links').select('*'),
      sb.from('job_photos').select('id, job_id, sent_by_employee_id, media, kind, created_at').eq('source', 'telegram').is('deleted_at', null).order('created_at', { ascending: false }).limit(15),
      sb.from('job_photos').select('id', { count: 'exact', head: true }).eq('source', 'telegram').is('job_id', null).is('deleted_at', null),
    ]);
    setLinks((l.data ?? []) as LinkRow[]); setRecent((r.data ?? []) as Recent[]); setUnsorted(u.count ?? 0);
  }, []);
  useEffect(() => { if (CLOUD) { void check(); void reload(); } }, [check, reload]);

  const code = (id: string) => attempt(async () => { const { data, error } = await supabase().rpc('telegram_new_code', { p_employee: id }); if (error) throw new Error(error.message); setCodes((c) => ({ ...c, [id]: String(data) })); }, 'Code made');
  const unlink = (uid: number) => attempt(async () => { const { error } = await supabase().from('telegram_links').delete().eq('telegram_user_id', uid); if (error) throw new Error(error.message); await reload(); }, 'Unlinked');
  const linked = new Map(links.map((l) => [l.employee_id, l]));

  return (
    <>
      <PageHead icon="✈️" title="Telegram" sub="Crew send photos and videos in the Telegram group. They land in the Photo Library on the right job and client, with the sender's name." />
      {!CLOUD && <div className="alert info">Telegram works on the live site only.</div>}
      {CLOUD && (<>
        <Card title="1 · Connect the bot" actions={st?.configured ? <Badge tone={st.connected ? 'green' : 'amber'}>{st.connected ? 'Connected' : 'Not connected yet'}</Badge> : <Badge tone="gray">Not set up</Badge>}>
          <div className="stack">
            {err && <div className="alert warn">{err}</div>}
            {st && !st.configured && <div className="alert warn">The bot is not set up yet. Create it with <b>@BotFather</b> in Telegram (/newbot), then run these in your computer's terminal in the project folder (the token is typed there, never into this chat): <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{`supabase.cmd secrets set TELEGRAM_BOT_TOKEN=<token from BotFather>\nsupabase.cmd secrets set TELEGRAM_WEBHOOK_SECRET=<any long random letters and numbers>\nsupabase.cmd functions deploy telegram-webhook --no-verify-jwt`}</pre></div>}
            {st?.configured && <div className="small">Bot: <b>@{st.bot}</b>{typeof st.pending === 'number' && st.pending > 0 ? ` · ${st.pending} waiting` : ''}{st.last_error ? <span style={{ color: 'var(--red)' }}> · Telegram says: {st.last_error}</span> : null}</div>}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" disabled={busy || !st?.configured} onClick={() => void check(true)}>{st?.connected ? 'Re-connect' : 'Connect to Telegram'}</button>
              <button className="btn" disabled={busy} onClick={() => void check()}>Check again</button>
            </div>
            <div className="small muted">Then add the bot to your crew group and, in @BotFather, turn <b>Group Privacy</b> off (Bot Settings → Group Privacy → Turn off) so it can see the photos. Remove and re-add the bot after changing that.</div>
          </div>
        </Card>

        <div style={{ height: 14 }} />
        <Card title="2 · Link each person" actions={<span className="small muted">{links.length} linked</span>}>
          <div className="small muted" style={{ marginBottom: 8 }}>Press <b>Make code</b> for a person, then they send <b>/link THE-CODE</b> to the bot (in the group or privately). The code works once, for 15 minutes. This is how a photo knows who sent it.</div>
          <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>Employee</th><th>Telegram</th><th></th></tr></thead><tbody>
            {field.map((e) => { const l = linked.get(e.id); return <tr key={e.id}>
              <td><b>{e.full_name}</b><div className="small muted">{e.position}</div></td>
              <td>{l ? <><Badge tone="green">Linked</Badge> <span className="small muted">{l.telegram_name ?? ''} · {fmtDateTime(l.linked_at)}</span></> : codes[e.id] ? <span>Tell them to send <b className="mono">/link {codes[e.id]}</b></span> : <span className="muted small">Not linked</span>}</td>
              <td style={{ textAlign: 'right' }}>{l ? <button className="btn sm" onClick={() => void unlink(l.telegram_user_id)}>Unlink</button> : <button className="btn sm" onClick={() => void code(e.id)}>Make code</button>}</td></tr>; })}
          </tbody></table></div>
        </Card>

        <div style={{ height: 14 }} />
        <Card title="3 · How the crew uses it" actions={unsorted ? <Link className="btn sm" to="/photos">{unsorted} Unsorted to file →</Link> : undefined}>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Send photos or videos in the group as usual. They go to <b>the job the sender is on today</b> and the bot replies “✅ Saved to JOB-… (Client)”.</li>
            <li>On two or more jobs the same day, the bot asks with buttons which job. One tap files every photo sent just before.</li>
            <li>To choose yourself, put the job number in the caption (<b>JOB-2026-0012 before</b>), or send <b>/job JOB-2026-0012</b> first (good for 30 minutes).</li>
            <li>Not on a job that day? The photo goes to <b>Unsorted</b> in the Photo Library, where the office files it to a job.</li>
            <li>Telegram lets a bot fetch files up to <b>20 MB</b>. Longer videos must be uploaded in the app. Telegram bots cannot see old messages: only what is sent after the bot joins.</li>
          </ul>
        </Card>

        <div style={{ height: 14 }} />
        <Card title="Latest from Telegram" actions={<Link className="btn sm" to="/photos">Open Photo Library</Link>}>
          <div className="tbl-wrap"><table className="tbl compact"><thead><tr><th>When</th><th>From</th><th>What</th><th>Job</th></tr></thead><tbody>
            {recent.map((r) => { const j = db.jobs.find((x) => x.id === r.job_id); return <tr key={r.id}><td>{fmtDateTime(r.created_at)}</td><td>{emp.get(r.sent_by_employee_id ?? '')?.full_name ?? '—'}</td><td>{r.media === 'video' ? '🎬 Video' : '📷 Photo'} · {r.kind}</td><td>{j ? `${j.number} · ${db.clients.find((c) => c.id === j.client_id)?.name ?? ''}` : <Badge tone="amber">Unsorted</Badge>}</td></tr>; })}
            {!recent.length && <tr><td colSpan={4} className="muted">Nothing yet.</td></tr>}
          </tbody></table></div>
        </Card>
      </>)}
    </>
  );
}
